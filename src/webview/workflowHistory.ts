import type { AgentId } from '../types.js';
import type { AgentMessage, DispatchChangeSetSummary, SessionMessage, UserMessage } from '../shared/protocol.js';
import type { VeyraWorkflowCommand } from '../workflowPrompts.js';
import type { WebviewState } from './state.js';
import { parseWorkflowArtifactBlocks } from './workflowArtifacts.js';
import type { WorkflowReplaySummary } from './workflowReplay.js';
import { agentLabel } from './agentLabel.js';

export type WorkflowHistoryCompletionStatus = 'complete' | 'cancelled' | 'errored';
export type WorkflowHistoryVerificationState = 'passed' | 'failed' | 'unknown';

export type WorkflowHistoryEntry = {
  command: VeyraWorkflowCommand;
  prompt: string;
  sourceMessageId: string;
  timestamp: number;
  participatingAgents: AgentId[];
  artifactHeadings: string[];
  pendingChangeCount: number;
  checkpointCount: number;
  verificationState: WorkflowHistoryVerificationState | null;
  completionStatus: WorkflowHistoryCompletionStatus;
};

export type WorkflowHistorySnapshot = {
  entries: WorkflowHistoryEntry[];
};

const RAW_WORKFLOW_RE = /^\s*(?:@veyra\s+)?\/(review|debate|consensus|implement)\b(?:\s+([\s\S]*?))?\s*$/iu;
const ROUTED_WORKFLOW_RE = /(?:^|\n)Workflow:\s*(review|debate|consensus|implement)\b/iu;
const REPLAY_BLOCK_RE = /\s*\[Workflow replay\][\s\S]*?\[\/Workflow replay\]\s*/giu;
const INACTIVE_CHANGE_STATUSES = new Set(['accepted', 'rejected', 'resolved', 'stale']);

type ParsedWorkflowMessage = Pick<WorkflowHistoryEntry, 'command' | 'prompt'>;

export function buildWorkflowHistorySnapshot(state: WebviewState, limit = 5): WorkflowHistorySnapshot {
  const messages = state.session.messages;
  const workflowStarts = workflowMessageIndexes(messages);
  const entries: WorkflowHistoryEntry[] = [];

  for (let position = workflowStarts.length - 1; position >= 0 && entries.length < limit; position--) {
    const startIndex = workflowStarts[position];
    const message = messages[startIndex];
    if (message.role !== 'user') continue;
    const parsed = parseWorkflowUserMessage(message);
    if (!parsed) continue;

    const endIndex = workflowStarts[position + 1] ?? messages.length;
    const window = messages.slice(startIndex + 1, endIndex);
    const agentMessages = window.filter((candidate): candidate is AgentMessage => candidate.role === 'agent');
    if (agentMessages.length === 0) continue;

    entries.push({
      ...parsed,
      sourceMessageId: message.id,
      timestamp: message.timestamp,
      participatingAgents: participatingAgents(agentMessages),
      artifactHeadings: latestArtifactHeadings(agentMessages),
      pendingChangeCount: pendingChangeCount(window),
      checkpointCount: checkpointCount(window),
      verificationState: verificationState(window),
      completionStatus: completionStatus(agentMessages),
    });
  }

  return { entries };
}

export function workflowHistoryEntryToReplaySummary(entry: WorkflowHistoryEntry): WorkflowReplaySummary {
  return {
    command: entry.command,
    prompt: entry.prompt,
    sourceMessageId: entry.sourceMessageId,
    timestamp: entry.timestamp,
    participatingAgents: entry.participatingAgents,
  };
}

export function workflowHistoryPromptPreview(entry: WorkflowHistoryEntry, maxLength = 88): string {
  const prompt = stripReplayBlock(entry.prompt).replace(/\s+/gu, ' ').trim();
  if (!prompt) return 'No prompt text captured';
  return prompt.length > maxLength ? `${prompt.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...` : prompt;
}

export function workflowHistoryAgentLabel(entry: WorkflowHistoryEntry): string {
  if (entry.participatingAgents.length === 0) return 'None recorded';
  return entry.participatingAgents.map(agentLabel).join(', ');
}

export function buildWorkflowHistorySummary(entry: WorkflowHistoryEntry): string {
  return [
    '# Veyra Workflow Summary',
    '',
    `Command: /${entry.command}`,
    `Prompt: ${workflowHistoryPromptPreview(entry, 160)}`,
    `Agents: ${workflowHistoryAgentLabel(entry)}`,
    `Artifact headings: ${entry.artifactHeadings.length > 0 ? entry.artifactHeadings.join(', ') : 'None recorded'}`,
    `Pending changes: ${plural(entry.pendingChangeCount, 'file')}`,
    `Checkpoints: ${entry.checkpointCount} available`,
    `Verification: ${entry.verificationState ?? 'not recorded'}`,
    `Completion: ${entry.completionStatus}`,
    '',
    'Replay guardrails:',
    '- Replay is manual and only prepares a visible composer draft.',
    '- no hidden dispatches',
    '- no terminal execution',
    '- no Git or GitHub actions',
    '- no network calls',
    '- no old tool-call replay',
  ].join('\n');
}

function workflowMessageIndexes(messages: SessionMessage[]): number[] {
  const indexes: number[] = [];
  messages.forEach((message, index) => {
    if (message.role === 'user' && parseWorkflowUserMessage(message)) indexes.push(index);
  });
  return indexes;
}

function parseWorkflowUserMessage(message: UserMessage): ParsedWorkflowMessage | null {
  const rawMatch = message.text.match(RAW_WORKFLOW_RE);
  if (rawMatch) {
    return {
      command: rawMatch[1].toLowerCase() as VeyraWorkflowCommand,
      prompt: stripReplayBlock(rawMatch[2]?.trim() ?? ''),
    };
  }

  const routedMatch = message.text.match(ROUTED_WORKFLOW_RE);
  if (!routedMatch) return null;
  return {
    command: routedMatch[1].toLowerCase() as VeyraWorkflowCommand,
    prompt: stripReplayBlock(extractRoutedWorkflowPrompt(message.text)),
  };
}

function extractRoutedWorkflowPrompt(text: string): string {
  const withoutReplay = stripReplayBlock(text);
  const templateEnd = withoutReplay.lastIndexOf('[/Veyra workflow template]');
  if (templateEnd !== -1) {
    return withoutReplay.slice(templateEnd + '[/Veyra workflow template]'.length).trim();
  }
  const blocks = withoutReplay.split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean);
  return blocks[blocks.length - 1] ?? '';
}

function participatingAgents(messages: AgentMessage[]): AgentId[] {
  const seen = new Set<AgentId>();
  const agents: AgentId[] = [];
  for (const message of messages) {
    if (seen.has(message.agentId)) continue;
    seen.add(message.agentId);
    agents.push(message.agentId);
  }
  return agents;
}

function latestArtifactHeadings(messages: AgentMessage[]): string[] {
  for (const message of [...messages].reverse()) {
    const parsed = parseWorkflowArtifactBlocks(message.text);
    if (!parsed.hasArtifacts) continue;
    return parsed.blocks
      .filter((block) => block.kind === 'section')
      .map((block) => block.title);
  }
  return [];
}

function pendingChangeCount(messages: SessionMessage[]): number {
  return messages.reduce((total, message) => {
    if (message.role !== 'system' || message.kind !== 'change-set' || !message.changeSet) return total;
    return total + pendingFiles(message.changeSet);
  }, 0);
}

function pendingFiles(changeSet: DispatchChangeSetSummary): number {
  if (changeSet.readOnly || INACTIVE_CHANGE_STATUSES.has(changeSet.status)) return 0;
  const pending = changeSet.files.filter((file) => !file.status || !INACTIVE_CHANGE_STATUSES.has(file.status));
  return changeSet.files.length > 0 ? pending.length : changeSet.fileCount;
}

function checkpointCount(messages: SessionMessage[]): number {
  return messages.filter((message) =>
    message.role === 'system'
    && message.kind === 'checkpoint'
    && message.checkpoint?.status === 'available'
  ).length;
}

function verificationState(messages: SessionMessage[]): WorkflowHistoryVerificationState | null {
  const latest = [...messages].reverse().find((message) =>
    message.role === 'user'
    && message.text.includes('Source: Approved Veyra verification command')
    && /Exit status:/iu.test(message.text)
  );
  if (!latest || latest.role !== 'user') return null;
  const match = latest.text.match(/Exit status:\s*([^\r\n]+)/iu);
  const status = match?.[1]?.trim().toLowerCase();
  if (!status || status === 'unknown') return 'unknown';
  return status === '0' ? 'passed' : 'failed';
}

function completionStatus(messages: AgentMessage[]): WorkflowHistoryCompletionStatus {
  if (messages.some((message) => message.status === 'errored')) return 'errored';
  if (messages.some((message) => message.status === 'cancelled')) return 'cancelled';
  return 'complete';
}

function stripReplayBlock(text: string): string {
  return text.replace(REPLAY_BLOCK_RE, '').trim();
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

import type { AgentId } from '../types.js';
import type { AgentMessage, SessionMessage, UserMessage } from '../shared/protocol.js';
import type { WebviewState } from './state.js';
import type { VeyraWorkflowCommand } from '../workflowPrompts.js';

export type WorkflowReplaySummary = {
  command: VeyraWorkflowCommand;
  prompt: string;
  sourceMessageId: string;
  timestamp: number;
  participatingAgents: AgentId[];
};

export type WorkflowReplaySnapshot = {
  latestWorkflow: WorkflowReplaySummary | null;
};

const RAW_WORKFLOW_RE = /^\s*(?:@veyra\s+)?\/(review|debate|consensus|implement)\b(?:\s+([\s\S]*?))?\s*$/iu;
const ROUTED_WORKFLOW_RE = /(?:^|\n)Workflow:\s*(review|debate|consensus|implement)\b/iu;
const REPLAY_BLOCK_RE = /\s*\[Workflow replay\][\s\S]*?\[\/Workflow replay\]\s*/giu;

export function buildWorkflowReplaySnapshot(state: WebviewState): WorkflowReplaySnapshot {
  const messages = state.session.messages;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const parsed = parseWorkflowUserMessage(message);
    if (!parsed) continue;
    return {
      latestWorkflow: {
        ...parsed,
        sourceMessageId: message.id,
        timestamp: message.timestamp,
        participatingAgents: participatingAgentsAfter(messages, index),
      },
    };
  }
  return { latestWorkflow: null };
}

export function buildWorkflowReplayDraft(workflow: WorkflowReplaySummary): string {
  const prompt = stripReplayBlock(workflow.prompt);
  const firstLine = `@veyra /${workflow.command}${prompt ? ` ${prompt}` : ''}`;
  return [
    firstLine,
    '',
    '[Workflow replay]',
    'Source: Manual Veyra workflow replay',
    `Original workflow: /${workflow.command}`,
    `Original turn timestamp: ${new Date(workflow.timestamp).toISOString()}`,
    `Agents observed last time: ${formatAgents(workflow.participatingAgents)}`,
    'Replay against the current workspace and current Git state.',
    'Use the prior transcript only as context; verify current files before relying on earlier conclusions.',
    '[/Workflow replay]',
  ].join('\n');
}

export function workflowReplayPromptPreview(workflow: WorkflowReplaySummary, maxLength = 96): string {
  const prompt = stripReplayBlock(workflow.prompt).replace(/\s+/gu, ' ').trim();
  if (!prompt) return 'No prompt text captured';
  return prompt.length > maxLength ? `${prompt.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...` : prompt;
}

export function workflowReplayAgentLabel(workflow: WorkflowReplaySummary): string {
  return formatAgents(workflow.participatingAgents);
}

function parseWorkflowUserMessage(message: UserMessage): Pick<WorkflowReplaySummary, 'command' | 'prompt'> | null {
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

function participatingAgentsAfter(messages: SessionMessage[], workflowIndex: number): AgentId[] {
  const seen = new Set<AgentId>();
  const agents: AgentId[] = [];
  for (const message of messages.slice(workflowIndex + 1)) {
    if (message.role === 'user') break;
    if (message.role !== 'agent') continue;
    if (seen.has(message.agentId)) continue;
    seen.add(message.agentId);
    agents.push(message.agentId);
  }
  return agents;
}

function stripReplayBlock(text: string): string {
  return text.replace(REPLAY_BLOCK_RE, '').trim();
}

function formatAgents(agentIds: AgentId[]): string {
  if (agentIds.length === 0) return 'None recorded';
  return agentIds.map(agentLabel).join(', ');
}

function agentLabel(agentId: AgentMessage['agentId']): string {
  if (agentId === 'claude') return 'Claude';
  if (agentId === 'codex') return 'Codex';
  return 'Gemini';
}

import type { AgentId } from '../types.js';
import type { AgentMessage, SessionMessage, SystemMessage, ToolEvent } from '../shared/protocol.js';
import type { WebviewState } from './state.js';

export type MissionControlStageState = 'waiting' | 'queued' | 'active' | 'complete' | 'failed' | 'cancelled';
export type MissionControlMode = 'idle' | 'workflow' | 'direct';

export type MissionControlStage = {
  agentId: AgentId;
  label: string;
  state: MissionControlStageState;
};

export type MissionControlSnapshot = {
  mode: MissionControlMode;
  label: string;
  floorHolder: AgentId | null;
  stages: MissionControlStage[];
  recentTool: { agentId: AgentId; name: string } | null;
  pendingChangeCount: number;
  availableCheckpointCount: number;
  verificationState: 'passed' | 'failed' | 'unknown' | null;
};

const AGENTS: AgentId[] = ['claude', 'codex', 'gemini'];
const WORKFLOW_RE = /(?:^|\s)(?:@veyra\s+)?\/(review|debate|consensus|implement)\b/iu;

export function buildMissionControlSnapshot(state: WebviewState): MissionControlSnapshot {
  const latestUser = latestUserMessage(state.session.messages);
  const workflow = latestUser ? workflowLabel(latestUser.text) : null;
  const since = latestUser?.timestamp ?? -Infinity;
  const agentMessages = state.session.messages
    .filter((message): message is AgentMessage => message.role === 'agent' && message.timestamp >= since);
  const inProgressMessages = Array.from(state.inProgress.values())
    .filter((message) => message.timestamp >= since);
  const participated = new Set<AgentId>([
    ...agentMessages.map((message) => message.agentId),
    ...inProgressMessages.map((message) => message.agentId),
    ...(state.floorHolder ? [state.floorHolder] : []),
  ]);
  const mode: MissionControlMode = workflow ? 'workflow' : participated.size > 0 ? 'direct' : 'idle';
  const primaryAgent = inProgressMessages[0]?.agentId
    ?? state.floorHolder
    ?? agentMessages[0]?.agentId
    ?? null;

  return {
    mode,
    label: labelForMode(mode, workflow, primaryAgent),
    floorHolder: state.floorHolder,
    stages: AGENTS.map((agentId) => ({
      agentId,
      label: agentLabel(agentId),
      state: stageState(agentId, mode, state.floorHolder, agentMessages, inProgressMessages, participated),
    })),
    recentTool: recentTool(agentMessages, inProgressMessages),
    pendingChangeCount: pendingChangeCount(state.session.messages),
    availableCheckpointCount: availableCheckpointCount(state.session.messages),
    verificationState: verificationState(state.session.messages),
  };
}

function latestUserMessage(messages: SessionMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user') ?? null;
}

function workflowLabel(text: string): string | null {
  const match = text.match(WORKFLOW_RE);
  return match ? `/${match[1].toLowerCase()}` : null;
}

function labelForMode(mode: MissionControlMode, workflow: string | null, primaryAgent: AgentId | null): string {
  if (mode === 'idle') return 'Idle';
  if (mode === 'workflow' && workflow) return workflow;
  return `${primaryAgent ? agentLabel(primaryAgent) : 'Agent'} direct`;
}

function stageState(
  agentId: AgentId,
  mode: MissionControlMode,
  floorHolder: AgentId | null,
  agentMessages: AgentMessage[],
  inProgressMessages: Array<{ agentId: AgentId }>,
  participated: Set<AgentId>,
): MissionControlStageState {
  if (inProgressMessages.some((message) => message.agentId === agentId)) return 'active';

  const latest = latestAgentMessage(agentMessages, agentId);
  if (floorHolder === agentId && latest?.status !== 'errored' && latest?.status !== 'cancelled') return 'active';
  if (latest?.status === 'errored') return 'failed';
  if (latest?.status === 'cancelled') return 'cancelled';
  if (latest?.status === 'complete') return 'complete';
  if (mode === 'workflow') return 'queued';
  return participated.has(agentId) ? 'queued' : 'waiting';
}

function latestAgentMessage(messages: AgentMessage[], agentId: AgentId): AgentMessage | null {
  return messages
    .filter((message) => message.agentId === agentId)
    .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

function recentTool(
  agentMessages: AgentMessage[],
  inProgressMessages: Array<{ agentId: AgentId; toolEvents: ToolEvent[]; timestamp: number }>,
): { agentId: AgentId; name: string } | null {
  const candidates = [
    ...agentMessages.flatMap((message) => message.toolEvents.map((tool) => ({ agentId: message.agentId, tool }))),
    ...inProgressMessages.flatMap((message) => message.toolEvents.map((tool) => ({ agentId: message.agentId, tool }))),
  ];
  const latest = candidates.sort((a, b) => b.tool.timestamp - a.tool.timestamp)[0];
  return latest ? { agentId: latest.agentId, name: latest.tool.name } : null;
}

function pendingChangeCount(messages: SessionMessage[]): number {
  const latestById = new Map<string, NonNullable<SystemMessage['changeSet']>>();
  for (const message of messages) {
    if (message.role === 'system' && message.kind === 'change-set' && message.changeSet) {
      latestById.set(message.changeSet.id, message.changeSet);
    }
  }
  return Array.from(latestById.values()).reduce((count, changeSet) => {
    if (changeSet.status === 'accepted' || changeSet.status === 'rejected' || changeSet.status === 'resolved') {
      return count;
    }
    return count + changeSet.files.filter((file) =>
      file.status !== 'accepted'
      && file.status !== 'rejected'
      && file.status !== 'resolved'
    ).length;
  }, 0);
}

function availableCheckpointCount(messages: SessionMessage[]): number {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role === 'system' && message.kind === 'checkpoint' && message.checkpoint?.status === 'available') {
      ids.add(message.checkpoint.id);
    }
  }
  return ids.size;
}

function verificationState(messages: SessionMessage[]): MissionControlSnapshot['verificationState'] {
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

function agentLabel(agentId: AgentId): string {
  if (agentId === 'claude') return 'Claude';
  if (agentId === 'codex') return 'Codex';
  return 'Gemini';
}

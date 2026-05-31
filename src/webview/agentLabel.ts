import type { AgentId } from '../types.js';

export function agentLabel(agentId: AgentId): string {
  if (agentId === 'claude') return 'Claude';
  if (agentId === 'codex') return 'Codex';
  if (agentId === 'gemini') return 'Gemini';
  return agentId;
}

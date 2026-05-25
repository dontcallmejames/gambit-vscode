import type { AgentId, AgentStatus } from './types.js';
import { runClaudeCli } from './claudeCli.js';

const ROUTING_ERROR = 'Routing unavailable; please prefix with @claude / @codex / @gemini / @all or run Veyra: Check agent status.';
const NO_AGENTS_ERROR = 'No agents currently authenticated; run Veyra: Check agent status or Veyra: Show setup guide.';
const BUSY_AGENTS_ERROR = 'All ready agents are busy; wait for the current dispatch to finish or cancel it before sending more work.';

export type FacilitatorDecision =
  | { agent: AgentId; reason: string }
  | { error: string };

export type FacilitatorFn = (
  userMessage: string,
  availability: Record<AgentId, AgentStatus>,
  sharedContext?: string,
) => Promise<FacilitatorDecision>;

const PROFILES: Record<AgentId, string> = {
  claude: 'code reasoning, refactors, code review, planning, design discussion',
  codex: 'execution - running tests, scripts, terminal commands, file edits',
  gemini: 'research, current events, large-context document reading',
};

const FALLBACK_RULES: Array<{ agent: AgentId; reason: string; pattern: RegExp }> = [
  {
    agent: 'gemini',
    reason: 'fallback: research request',
    pattern: /\b(research|latest|current|docs?|documentation|web|summari[sz]e|large[- ]context|compare)\b/i,
  },
  {
    agent: 'claude',
    reason: 'fallback: reasoning request',
    pattern: /\b(review|refactor|design|plan|architecture|reason|explain|critique)\b/i,
  },
  {
    agent: 'codex',
    reason: 'fallback: execution request',
    pattern: /\b(implement|fix|edit|write|create|run|test|build|lint|compile|debug|terminal|shell|command)\b/i,
  },
];

export const chooseFacilitatorAgent: FacilitatorFn = async (
  userMessage,
  availability,
  sharedContext = '',
) => {
  const available = (Object.entries(availability) as Array<[AgentId, AgentStatus]>)
    .filter(([, status]) => status === 'ready')
    .map(([id]) => id);

  if (available.length === 0) {
    const hasBusyAgent = (Object.values(availability) as AgentStatus[]).some((status) => status === 'busy');
    if (hasBusyAgent) {
      return { error: BUSY_AGENTS_ERROR };
    }
    return { error: NO_AGENTS_ERROR };
  }

  const profileLines = available.map((id) => `- ${id}: ${PROFILES[id]}`).join('\n');

  const systemPromptParts = [
    "You are a routing assistant for a multi-agent chat tool. Pick the single best agent for the user's message and explain your choice in 4-8 words.",
    '',
    'Available agents:',
    profileLines,
    '',
  ];
  if (sharedContext.trim().length > 0) {
    systemPromptParts.push('Recent conversation context (for follow-up routing):');
    systemPromptParts.push(sharedContext);
    systemPromptParts.push('');
  }
  systemPromptParts.push('Respond with EXACTLY this JSON shape and nothing else:');
  systemPromptParts.push(
    '{ "agent": "<one of: ' + available.join(' | ') + '>", "reason": "<brief reason>" }',
  );

  const systemPrompt = systemPromptParts.join('\n');

  let responseText = '';
  try {
    const prompt = `${systemPrompt}\n\nUser message:\n${userMessage}`;
    for await (const chunk of runClaudeCli(prompt, { permissionMode: 'default' })) {
      if (chunk.type === 'text') {
        responseText += chunk.text;
      } else if (chunk.type === 'error') {
        return fallbackDecision(userMessage, availability);
      }
    }
  } catch {
    return fallbackDecision(userMessage, availability);
  }

  const cleaned = responseText
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return fallbackDecision(userMessage, availability);
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof (parsed as { agent?: unknown }).agent !== 'string' ||
    typeof (parsed as { reason?: unknown }).reason !== 'string'
  ) {
    return fallbackDecision(userMessage, availability);
  }

  const decision = parsed as { agent: string; reason: string };
  if (!available.includes(decision.agent as AgentId)) {
    return fallbackDecision(userMessage, availability);
  }

  return { agent: decision.agent as AgentId, reason: decision.reason };
};

function fallbackDecision(
  userMessage: string,
  availability: Record<AgentId, AgentStatus>,
): FacilitatorDecision {
  const readyAgents = (Object.entries(availability) as Array<[AgentId, AgentStatus]>)
    .filter(([, status]) => status === 'ready')
    .map(([id]) => id);

  if (readyAgents.length === 0) {
    return { error: ROUTING_ERROR };
  }

  for (const rule of FALLBACK_RULES) {
    if (readyAgents.includes(rule.agent) && rule.pattern.test(userMessage)) {
      return { agent: rule.agent, reason: rule.reason };
    }
  }

  for (const agent of ['codex', 'claude', 'gemini'] as AgentId[]) {
    if (readyAgents.includes(agent)) {
      return { agent, reason: 'fallback: available agent' };
    }
  }

  return { error: ROUTING_ERROR };
}

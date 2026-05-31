import { h } from 'preact';
import type { AgentId } from '../../types.js';
import { agentLabel } from '../agentLabel.js';

interface AgentMarkerProps {
  agentId: AgentId;
  /** Render the agent name after the dot. Default true. */
  showLabel?: boolean;
}

/**
 * Shared agent identity marker: a color dot (the agent's --veyra-agent-* token)
 * plus the agent name. Hook-free and purely presentational so it can render in
 * any context (and any test) without a preact/hooks mock. Identity is carried by
 * the name text; the dot color is reinforcement (acceptable to be color-only).
 */
export function AgentMarker({ agentId, showLabel = true }: AgentMarkerProps) {
  const label = agentLabel(agentId);
  // When the name is hidden, the dot is the only content and is aria-hidden, so
  // give the wrapper an accessible name; otherwise the visible label carries it.
  if (!showLabel) {
    return (
      <span class={`agent-marker agent-marker-${agentId}`} role="img" aria-label={label}>
        <span class="agent-marker-dot" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span class={`agent-marker agent-marker-${agentId}`}>
      <span class="agent-marker-dot" aria-hidden="true" />
      <span class="agent-marker-label">{label}</span>
    </span>
  );
}

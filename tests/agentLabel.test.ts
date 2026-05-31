import { describe, expect, it } from 'vitest';
import { agentLabel } from '../src/webview/agentLabel.js';

describe('agentLabel', () => {
  it('maps each agent id to its display name', () => {
    expect(agentLabel('claude')).toBe('Claude');
    expect(agentLabel('codex')).toBe('Codex');
    expect(agentLabel('gemini')).toBe('Gemini');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, dflt: unknown) =>
        vscodeMocks.values.has(key) ? vscodeMocks.values.get(key) : dflt
      ),
    })),
  },
}));

import { readAgentRoleOverrides, readWorkflowPromptOptions } from '../src/workflowSettings.js';

describe('workflow settings', () => {
  beforeEach(() => {
    vscodeMocks.values.clear();
  });

  it('reads the configured workflow template and normalizes unknown values', () => {
    vscodeMocks.values.set('workflow.template', 'security-review');
    expect(readWorkflowPromptOptions()).toEqual({ template: 'security-review' });

    vscodeMocks.values.set('workflow.template', 'surprise-me');
    expect(readWorkflowPromptOptions()).toEqual({ template: 'none' });
  });

  it('trims workspace role guidance and omits empty agent roles', () => {
    vscodeMocks.values.set('agentRoles.claude', '  Guard architecture boundaries.  ');
    vscodeMocks.values.set('agentRoles.codex', '   ');
    vscodeMocks.values.set('agentRoles.gemini', 'Challenge test blind spots.');

    expect(readAgentRoleOverrides()).toEqual({
      claude: 'Guard architecture boundaries.',
      codex: undefined,
      gemini: 'Challenge test blind spots.',
    });
  });
});

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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

import {
  createVeyraSessionService,
  createSmokeAgents,
  readVeyraSessionOptions,
  refreshVeyraSessionOptions,
  shouldUseSmokeAgents,
} from '../src/veyraRuntime.js';
import { veyraWorkflowPrompt } from '../src/workflowPrompts.js';

function makeSmokeWorkspace(prefix: string): string {
  const smokeRoot = join(process.cwd(), '.vscode-test');
  mkdirSync(smokeRoot, { recursive: true });
  return mkdtempSync(join(smokeRoot, prefix));
}

describe('Veyra runtime smoke agents', () => {
  beforeEach(() => {
    vscodeMocks.values.clear();
  });

  it('enables smoke agents only for the Extension Host smoke sentinel', () => {
    expect(shouldUseSmokeAgents({ VSCODE_VEYRA_SMOKE: '1' })).toBe(true);
    expect(shouldUseSmokeAgents({ VSCODE_VEYRA_SMOKE: 'true' })).toBe(false);
    expect(shouldUseSmokeAgents({})).toBe(false);
  });

  it('creates deterministic ready agents for no-paid Extension Host request smoke tests', async () => {
    const agents = createSmokeAgents();
    const chunks = [];

    for await (const chunk of agents.codex.send('Smoke prompt', { readOnly: true })) {
      chunks.push(chunk);
    }

    expect(await agents.claude.status()).toBe('ready');
    expect(await agents.codex.status()).toBe('ready');
    expect(await agents.gemini.status()).toBe('ready');
    expect(chunks).toEqual([
      {
        type: 'text',
        text: '[smoke:codex] read-only request reached Veyra provider.',
      },
      { type: 'done' },
    ]);
  });

  it('uses a shared smoke edit path for deterministic conflict validation requests', async () => {
    const workspace = makeSmokeWorkspace('veyra-smoke-conflict-');
    const agents = createSmokeAgents();

    try {
      for await (const _chunk of agents.claude.send(
        'Veyra conflict validation request. [veyra-smoke-conflict]',
        { cwd: workspace },
      )) {
        // Drain the smoke agent stream so its deterministic write runs.
      }

      expect(existsSync(join(workspace, 'src', 'veyra-smoke-conflict.ts'))).toBe(true);
      expect(existsSync(join(workspace, 'src', 'veyra-smoke-claude.ts'))).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('surfaces shared-context relay markers when later smoke agents see prior replies', async () => {
    const workspace = makeSmokeWorkspace('veyra-smoke-shared-context-');
    const service = createVeyraSessionService(workspace, undefined, createSmokeAgents());
    const chunks: string[] = [];

    try {
      await service.dispatch(
        {
          text: '@all Veyra shared context smoke request. [veyra-smoke-shared-context]',
          source: 'language-model',
          cwd: workspace,
          forcedTarget: 'veyra',
        },
        (event) => {
          if (event.kind === 'chunk' && event.chunk.type === 'text') {
            chunks.push(event.chunk.text);
          }
        },
      );
    } finally {
      await service.flush();
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(chunks).toContain('[smoke:codex] saw prior Claude reply in shared context.');
    expect(chunks).toContain('[smoke:gemini] saw prior Claude and Codex replies in shared context.');
  });

  it('relays shared context through the /implement workflow where Claude and Gemini are read-only', async () => {
    const workspace = makeSmokeWorkspace('veyra-shared-implement-');
    const service = createVeyraSessionService(workspace, undefined, createSmokeAgents());
    const chunks: string[] = [];

    try {
      await service.dispatch(
        {
          text: veyraWorkflowPrompt('implement', 'Veyra shared context smoke request. [veyra-smoke-shared-context]'),
          source: 'language-model',
          cwd: workspace,
          forcedTarget: 'veyra',
        },
        (event) => {
          if (event.kind === 'chunk' && event.chunk.type === 'text') {
            chunks.push(event.chunk.text);
          }
        },
      );
    } finally {
      await service.flush();
      rmSync(workspace, { recursive: true, force: true });
    }

    // Claude (read-only planner) and Gemini (read-only reviewer) still run and relay;
    // the relay markers must be mode-independent, not gated on write-capable replies.
    expect(chunks).toContain('[smoke:codex] saw prior Claude reply in shared context.');
    expect(chunks).toContain('[smoke:gemini] saw prior Claude and Codex replies in shared context.');
  });

  it('detects an edit conflict when a later single-agent write collides with a file edited earlier in the session', async () => {
    const workspace = makeSmokeWorkspace('veyra-conflict-xdispatch-');
    const service = createVeyraSessionService(workspace, undefined, createSmokeAgents());
    const conflictTexts: string[] = [];

    try {
      // Seed the conflict file with a prior Claude write (write-capable single agent).
      await service.dispatch(
        { text: '@claude Edit conflict setup. [veyra-smoke-conflict]', source: 'language-model', cwd: workspace },
        () => {},
      );
      // A later single Codex write to the same file must surface the cross-dispatch conflict.
      await service.dispatch(
        { text: '@codex Edit conflict smoke request. [veyra-smoke-conflict]', source: 'language-model', cwd: workspace },
        (event) => {
          if (event.kind === 'system-message' && event.message.kind === 'edit-conflict') {
            conflictTexts.push(event.message.text);
          }
        },
      );
    } finally {
      await service.flush();
      rmSync(workspace, { recursive: true, force: true });
    }

    expect(conflictTexts.some((text) =>
      text.includes('src/veyra-smoke-conflict.ts') && text.includes('already edited by Claude'),
    )).toBe(true);
  });

  it('does not treat stale shared-context smoke markers as the current validation request', async () => {
    const agents = createSmokeAgents();
    const chunks = [];

    for await (const chunk of agents.codex.send([
      '[Conversation so far]',
      'user: Veyra shared context smoke request. [veyra-smoke-shared-context]',
      'claude: [smoke:claude] write-capable request reached Veyra provider.',
      '[/Conversation so far]',
      'Current direct smoke request without the marker.',
    ].join('\n'))) {
      chunks.push(chunk);
    }

    expect(chunks).not.toContainEqual({
      type: 'text',
      text: '[smoke:codex] saw prior Claude reply in shared context.',
    });
  });

  it('surfaces VS Code request tool and model option context markers in smoke provider prompts', async () => {
    const agents = createSmokeAgents();
    const chunks = [];

    for await (const chunk of agents.codex.send([
      '[VS Code model options]',
      '{"temperature":0.2}',
      '[/VS Code model options]',
      '',
      '[VS Code request tools]',
      'Tool mode: auto',
      '- workspaceSearch: Search indexed workspace symbols.',
      '[/VS Code request tools]',
      '',
      'Veyra tool context smoke request. [veyra-smoke-tool-context]',
    ].join('\n'))) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: 'text',
      text: '[smoke:codex] saw VS Code request tool workspaceSearch in provider context.',
    });
    expect(chunks).toContainEqual({
      type: 'text',
      text: '[smoke:codex] saw VS Code model option temperature in provider context.',
    });
  });

  it('refreshes workspace context provider settings for existing services', () => {
    const service = {
      updateOptions: vi.fn(),
    };

    refreshVeyraSessionOptions(service as any, '/workspace');

    expect(service.updateOptions).toHaveBeenCalledWith(expect.objectContaining({
      workspaceContextProvider: expect.objectContaining({
        retrieve: expect.any(Function),
        invalidate: expect.any(Function),
      }),
      changeLedger: expect.objectContaining({
        captureBaseline: expect.any(Function),
        createChangeSet: expect.any(Function),
        listPendingChangeSets: expect.any(Function),
      }),
      checkpointLedger: expect.objectContaining({
        createCheckpoint: expect.any(Function),
        finalizeAutomaticCheckpoint: expect.any(Function),
        rollbackLatestCheckpoint: expect.any(Function),
      }),
    }));
  });

  it('reads workspace agent role customizations into session options', () => {
    vscodeMocks.values.set('agentRoles.claude', 'Guard public API compatibility.');
    vscodeMocks.values.set('agentRoles.codex', 'Prefer minimal TypeScript diffs with tests.');
    vscodeMocks.values.set('agentRoles.gemini', 'Probe edge cases and hidden assumptions.');

    expect(readVeyraSessionOptions().agentRoleOverrides).toEqual({
      claude: 'Guard public API compatibility.',
      codex: 'Prefer minimal TypeScript diffs with tests.',
      gemini: 'Probe edge cases and hidden assumptions.',
    });
  });

  it('does not surface codebase context smoke marker for diagnostics-only workspace context', async () => {
    const agents = createSmokeAgents();
    const chunks = [];

    for await (const chunk of agents.codex.send([
      '[Workspace context from @codebase]',
      '- No workspace files matched @codebase query.',
      '[/Workspace context]',
      '',
      'Veyra codebase context smoke request. [veyra-smoke-codebase]',
    ].join('\n'), { readOnly: true })) {
      chunks.push(chunk);
    }

    expect(chunks).not.toContainEqual({
      type: 'text',
      text: '[smoke:codex] saw @codebase workspace context.',
    });
  });

  it('surfaces codebase context smoke marker when selected fixture evidence is present', async () => {
    const agents = createSmokeAgents();
    const chunks = [];

    for await (const chunk of agents.codex.send([
      '[Workspace context from @codebase]',
      'Selected files:',
      '- src/codebase-context-smoke.ts',
      '',
      '```ts',
      'export const veyraSmokeCodebase = true;',
      '```',
      '[/Workspace context]',
      '',
      'Veyra codebase context smoke request. [veyra-smoke-codebase]',
    ].join('\n'), { readOnly: true })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: 'text',
      text: '[smoke:codex] saw @codebase workspace context.',
    });
  });

  it('routes smoke-mode orchestrator requests without calling the paid facilitator backend', async () => {
    const originalSmoke = process.env.VSCODE_VEYRA_SMOKE;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.VSCODE_VEYRA_SMOKE = '1';
    const tempRoot = join(process.cwd(), '.vscode-test');
    mkdirSync(tempRoot, { recursive: true });
    const workspace = mkdtempSync(join(tempRoot, 'veyra-runtime-smoke-'));
    const service = createVeyraSessionService(workspace, undefined, createSmokeAgents());
    const chunks: string[] = [];
    const visibleEdits: string[] = [];
    let smokeEditFileExists = false;

    try {
      await service.dispatch(
        {
          text: 'Veyra Extension Host smoke request for veyra-orchestrator.',
          source: 'language-model',
          cwd: workspace,
          forcedTarget: 'veyra',
        },
        (event) => {
          if (event.kind === 'chunk' && event.chunk.type === 'text') {
            chunks.push(event.chunk.text);
          }
          if (event.kind === 'file-edited') {
            visibleEdits.push(`${event.agentId}:${event.changeKind}:${event.path}`);
          }
        },
      );
      smokeEditFileExists = existsSync(join(workspace, 'src', 'veyra-smoke-codex.ts'));
    } finally {
      await service.flush();
      if (originalSmoke === undefined) {
        delete process.env.VSCODE_VEYRA_SMOKE;
      } else {
        process.env.VSCODE_VEYRA_SMOKE = originalSmoke;
      }
      rmSync(workspace, { recursive: true, force: true });
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(chunks).toContain('[smoke:codex] write-capable request reached Veyra provider.');
    expect(visibleEdits).toContain('codex:created:src/veyra-smoke-codex.ts');
    expect(smokeEditFileExists).toBe(true);
    expect(consoleError).not.toHaveBeenCalledWith('SessionStore write failed:', expect.anything());
    consoleError.mockRestore();
  });
});

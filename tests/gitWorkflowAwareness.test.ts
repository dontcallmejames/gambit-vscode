import { describe, expect, it, vi } from 'vitest';
import {
  collectGitWorkflowContext,
  collectPrPackageEvidence,
  formatGitWorkflowReviewPrompt,
  formatGitWorkflowPrompt,
  formatPrPackageDraftPrompt,
  PREPARE_PR_PACKAGE_DRAFT_COMMAND,
  REVIEW_CI_WORKFLOW_OUTPUT_COMMAND,
  registerGitWorkflowAwarenessCommands,
  SUMMARIZE_GIT_STATUS_COMMAND,
  type GitWorkflowApi,
  type GitWorkflowContext,
  type GitWorkflowCommandRunner,
} from '../src/gitWorkflowAwareness.js';

describe('git workflow awareness', () => {
  it('collects local branch, remote, latest commit, and dirty tree context with read-only git commands', async () => {
    const calls: string[][] = [];
    const runner: GitWorkflowCommandRunner = async (_workspacePath, args) => {
      calls.push(args);
      if (args.join(' ') === 'rev-parse --is-inside-work-tree') {
        return { stdout: 'true\n', stderr: '' };
      }
      if (args.join(' ') === 'status --short --branch') {
        return {
          stdout: [
            '## feature/ci...origin/feature/ci [ahead 1, behind 2]',
            ' M src/gitWorkflowAwareness.ts',
            'A  tests/gitWorkflowAwareness.test.ts',
            '?? docs/git.md',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (args.join(' ') === 'remote -v') {
        return {
          stdout: [
            'origin\thttps://token@example.com/owner/repo.git (fetch)',
            'origin\thttps://token@example.com/owner/repo.git (push)',
            'upstream\tgit@github.com:source/repo.git (fetch)',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (args.join(' ') === 'log -1 --oneline --decorate') {
        return { stdout: '96c4313 (HEAD -> feature/ci) feat: add approved verification runner\n', stderr: '' };
      }
      throw new Error(`unexpected git command: ${args.join(' ')}`);
    };

    const context = await collectGitWorkflowContext('/workspace', runner);

    expect(calls).toEqual([
      ['rev-parse', '--is-inside-work-tree'],
      ['status', '--short', '--branch'],
      ['remote', '-v'],
      ['log', '-1', '--oneline', '--decorate'],
    ]);
    expect(context).toMatchObject({
      branch: 'feature/ci',
      upstream: 'origin/feature/ci',
      ahead: 1,
      behind: 2,
      latestCommit: '96c4313 (HEAD -> feature/ci) feat: add approved verification runner',
      dirtySummary: '3 changed files: 1 added, 1 modified, 1 untracked',
    });
    expect(context?.remotes).toEqual([
      { name: 'origin', url: 'https://example.com/owner/repo.git', purposes: ['fetch', 'push'] },
      { name: 'upstream', url: 'git@github.com:source/repo.git', purposes: ['fetch'] },
    ]);
  });

  it('formats a read-only GitHub and CI follow-up prompt without approving network or destructive git actions', async () => {
    const prompt = formatGitWorkflowPrompt(cleanContext());

    expect(prompt).toContain('@veyra /review Review this GitHub and CI workflow context.');
    expect(prompt).toContain('[Git workflow context]');
    expect(prompt).toContain('Branch: main');
    expect(prompt).toContain('Upstream: origin/main');
    expect(prompt).toContain('Dirty tree: clean');
    expect(prompt).toContain('Latest commit: 96c4313');
    expect(prompt).toContain('Remote: origin https://github.com/owner/repo.git (fetch, push)');
    expect(prompt).toContain('Suggest PR and CI follow-up only');
    expect(prompt).toContain('Do not run git push, git pull, merge, rebase, reset, clean, or GitHub/CI network commands.');
    expect(prompt).toContain('[/Git workflow context]');
  });

  it('formats CI and PR output into PR readiness guidance with redaction and no-network guardrails', async () => {
    const prompt = formatGitWorkflowReviewPrompt(cleanContext(), [
      'pull_request: https://reviewer:secret@example.com/owner/repo/pull/12',
      'Authorization: Bearer ghp_secret1234567890',
      'FAIL src/parser.test.ts',
    ].join('\n'));

    expect(prompt).toContain('@veyra /review Review this GitHub PR and CI readiness context.');
    expect(prompt).toContain('[Git workflow context]');
    expect(prompt).toContain('[CI/PR context]');
    expect(prompt).toContain('Source: Explicit user-provided CI or PR output');
    expect(prompt).toContain('Branch: main');
    expect(prompt).toContain('Remote: origin https://github.com/owner/repo.git (fetch, push)');
    expect(prompt).toContain('FAIL src/parser.test.ts');
    expect(prompt).toContain('Draft PR summary');
    expect(prompt).toContain('PR readiness checklist');
    expect(prompt).toContain('Do not run git push, git pull, merge, rebase, reset, clean, GitHub CLI, API, or CI commands.');
    expect(prompt).toContain('recommend exact follow-up commands');
    expect(prompt).toContain('explicit approval');
    expect(prompt).not.toContain('secret');
    expect(prompt).not.toContain('ghp_secret1234567890');
    expect(prompt).toContain('https://example.com/owner/repo/pull/12');
  });

  it('formats a local-first PR package draft with trust evidence, optional CI output, and safe follow-ups', async () => {
    const prompt = formatPrPackageDraftPrompt(cleanDirtyContext(), {
      userProvidedOutput: [
        'GitHub check failed: https://reviewer:secret@example.com/owner/repo/actions/runs/1',
        'Authorization: token github_pat_secret1234567890',
        'npm run verify passed',
      ].join('\n'),
      evidence: {
        pendingChangeSets: [
          {
            id: 'change-set-1',
            agentId: 'codex',
            messageId: 'agent-1',
            timestamp: 10,
            readOnly: false,
            status: 'pending',
            fileCount: 2,
            files: [
              { path: 'src/parser.ts', changeKind: 'edited', status: 'pending' },
              { path: 'tests/parser.test.ts', changeKind: 'created', status: 'pending' },
            ],
          },
        ],
        checkpoints: [
          {
            id: 'checkpoint-1',
            timestamp: 20,
            source: 'automatic',
            label: 'Before Codex dispatch',
            promptSummary: 'implement parser tests',
            status: 'available',
            fileCount: 2,
          },
        ],
        verificationResults: [
          {
            command: 'npm run verify',
            exitStatus: '0',
            source: 'Approved Veyra verification command',
          },
        ],
      },
    });

    expect(prompt).toContain('@veyra /review Prepare a local-first GitHub PR package draft.');
    expect(prompt).toContain('## PR Summary');
    expect(prompt).toContain('## Changed File Explanation');
    expect(prompt).toContain('## Risk Checklist');
    expect(prompt).toContain('## Verification Evidence');
    expect(prompt).toContain('## Unresolved Blockers');
    expect(prompt).toContain('## Suggested Follow-up Commands');
    expect(prompt).toContain('[PR package context]');
    expect(prompt).toContain('Source: Explicit user-triggered local PR package draft');
    expect(prompt).toContain('[Git workflow context]');
    expect(prompt).toContain('- M src/parser.ts');
    expect(prompt).toContain('Pending change sets:');
    expect(prompt).toContain('- change-set-1 pending 2 files: src/parser.ts, tests/parser.test.ts');
    expect(prompt).toContain('Checkpoints:');
    expect(prompt).toContain('- checkpoint-1 available automatic "Before Codex dispatch" for 2 files');
    expect(prompt).toContain('Approved verification results:');
    expect(prompt).toContain('- npm run verify -> exit 0');
    expect(prompt).toContain('[CI/PR context]');
    expect(prompt).toContain('Source: Explicit user-provided CI or PR output');
    expect(prompt).toContain('npm run verify passed');
    expect(prompt).toContain('Use only local Git evidence, Veyra trust evidence, and explicit user-provided CI/PR output.');
    expect(prompt).toContain('Do not run git push, git pull, merge, rebase, reset, clean, GitHub CLI, API, CI commands, or create a PR.');
    expect(prompt).toContain('suggest exact follow-up commands and wait for explicit approval');
    expect(prompt).not.toContain('secret');
    expect(prompt).not.toContain('github_pat_secret1234567890');
    expect(prompt).toContain('https://example.com/owner/repo/actions/runs/1');
  });

  it('formats a PR package draft even when no CI or PR output is provided', () => {
    const prompt = formatPrPackageDraftPrompt(cleanContext(), {
      evidence: {
        pendingChangeSets: [],
        checkpoints: [],
        verificationResults: [],
      },
    });

    expect(prompt).toContain('[CI/PR context]');
    expect(prompt).toContain('Source: No user-provided CI or PR output');
    expect(prompt).toContain('No explicit CI or PR output was provided.');
    expect(prompt).toContain('Pending change sets: none recorded');
    expect(prompt).toContain('Checkpoints: none recorded');
    expect(prompt).toContain('Approved verification results: none recorded');
  });

  it('collects PR package trust evidence from Veyra ledgers and approved verification messages', async () => {
    const evidence = await collectPrPackageEvidence({
      listPendingChangeSets: vi.fn().mockResolvedValue([
        {
          id: 'change-set-1',
          agentId: 'codex',
          messageId: 'agent-1',
          timestamp: 10,
          readOnly: false,
          status: 'pending',
          fileCount: 1,
          files: [{ path: 'src/parser.ts', changeKind: 'edited', status: 'pending' }],
        },
      ]),
      listCheckpoints: vi.fn().mockResolvedValue([
        {
          id: 'checkpoint-1',
          timestamp: 20,
          source: 'manual',
          label: 'Before PR',
          promptSummary: 'manual checkpoint',
          status: 'available',
          fileCount: 3,
        },
      ]),
      loadSession: vi.fn().mockResolvedValue({
        version: 1,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            timestamp: 1,
            text: [
              '[Terminal context]',
              'Source: Approved Veyra verification command',
              'Command: npm run verify',
              'Exit status: 0',
              '[/Terminal context]',
            ].join('\n'),
          },
        ],
      }),
      dispatch: vi.fn(),
    });

    expect(evidence.pendingChangeSets.map((changeSet) => changeSet.id)).toEqual(['change-set-1']);
    expect(evidence.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(['checkpoint-1']);
    expect(evidence.verificationResults).toEqual([
      {
        command: 'npm run verify',
        exitStatus: '0',
        source: 'Approved Veyra verification command',
      },
    ]);
  });

  it('routes Git workflow context through the docked view when available', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks);
    const runner = cleanGitRunner();
    const dispatched: string[] = [];
    registerGitWorkflowAwarenessCommands(
      api,
      () => registration(),
      async () => undefined,
      async (text) => {
        dispatched.push(text);
        return true;
      },
      runner,
    );

    await callbacks.get(SUMMARIZE_GIT_STATUS_COMMAND)?.();

    expect(api.commands.registerCommand).toHaveBeenCalledWith(SUMMARIZE_GIT_STATUS_COMMAND, expect.any(Function));
    expect(api.commands.registerCommand).toHaveBeenCalledWith(REVIEW_CI_WORKFLOW_OUTPUT_COMMAND, expect.any(Function));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('[Git workflow context]');
    expect(dispatched[0]).toContain('Branch: main');
  });

  it('routes pasted CI and PR output with local git context through the docked view', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, { clipboardText: 'CI failed: npm test\nFAIL parser.test.ts' });
    const runner = cleanGitRunner();
    const dispatched: string[] = [];
    registerGitWorkflowAwarenessCommands(
      api,
      () => registration(),
      async () => undefined,
      async (text) => {
        dispatched.push(text);
        return true;
      },
      runner,
    );

    await callbacks.get(REVIEW_CI_WORKFLOW_OUTPUT_COMMAND)?.();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('[Git workflow context]');
    expect(dispatched[0]).toContain('[CI/PR context]');
    expect(dispatched[0]).toContain('Branch: main');
    expect(dispatched[0]).toContain('CI failed: npm test');
    expect(api.window.showInputBox).not.toHaveBeenCalled();
  });

  it('routes a PR package draft with local git and Veyra evidence through the docked view without requiring CI output', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, { clipboardText: '', inputText: undefined });
    const runner = cleanGitRunner();
    const service = {
      ...registration().service,
      listPendingChangeSets: vi.fn().mockResolvedValue([]),
      listCheckpoints: vi.fn().mockResolvedValue([]),
      loadSession: vi.fn().mockResolvedValue({ version: 1, messages: [] }),
    };
    const dispatched: string[] = [];
    registerGitWorkflowAwarenessCommands(
      api,
      () => ({ workspacePath: '/workspace', service }),
      async () => undefined,
      async (text) => {
        dispatched.push(text);
        return true;
      },
      runner,
    );

    await callbacks.get(PREPARE_PR_PACKAGE_DRAFT_COMMAND)?.();

    expect(api.commands.registerCommand).toHaveBeenCalledWith(PREPARE_PR_PACKAGE_DRAFT_COMMAND, expect.any(Function));
    expect(api.window.showInputBox).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Prepare PR package draft',
    }));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('[PR package context]');
    expect(dispatched[0]).toContain('No explicit CI or PR output was provided.');
    expect(dispatched[0]).toContain('Branch: main');
  });

  it('prepares PR package drafts with only the established read-only git commands', async () => {
    const calls: string[][] = [];
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, { clipboardText: 'CI passed' });
    const runner: GitWorkflowCommandRunner = async (_workspacePath, args) => {
      calls.push(args);
      return cleanGitRunner()(_workspacePath, args);
    };
    registerGitWorkflowAwarenessCommands(
      api,
      () => ({
        workspacePath: '/workspace',
        service: {
          ...registration().service,
          listPendingChangeSets: vi.fn().mockResolvedValue([]),
          listCheckpoints: vi.fn().mockResolvedValue([]),
          loadSession: vi.fn().mockResolvedValue({ version: 1, messages: [] }),
        },
      }),
      async () => undefined,
      async () => true,
      runner,
    );

    await callbacks.get(PREPARE_PR_PACKAGE_DRAFT_COMMAND)?.();

    expect(calls).toEqual([
      ['rev-parse', '--is-inside-work-tree'],
      ['status', '--short', '--branch'],
      ['remote', '-v'],
      ['log', '-1', '--oneline', '--decorate'],
    ]);
    expect(calls.map((args) => args.join(' ')).join('\n')).not.toMatch(
      /\b(?:push|pull|merge|rebase|reset|clean|gh|api)\b/i,
    );
  });

  it('falls back to explicit input when no CI or PR output is on the clipboard', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, { clipboardText: '', inputText: 'PR review: request changes on README' });
    const dispatched: string[] = [];
    registerGitWorkflowAwarenessCommands(
      api,
      () => registration(),
      async () => undefined,
      async (text) => {
        dispatched.push(text);
        return true;
      },
      cleanGitRunner(),
    );

    await callbacks.get(REVIEW_CI_WORKFLOW_OUTPUT_COMMAND)?.();

    expect(api.window.showInputBox).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review CI/PR output',
    }));
    expect(dispatched[0]).toContain('PR review: request changes on README');
  });

  it('does not dispatch CI or PR review when no output is provided', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, { clipboardText: '', inputText: '   ' });
    const service = registration().service;
    registerGitWorkflowAwarenessCommands(
      api,
      () => ({ workspacePath: '/workspace', service }),
      async () => undefined,
      async () => true,
      cleanGitRunner(),
    );

    await callbacks.get(REVIEW_CI_WORKFLOW_OUTPUT_COMMAND)?.();

    expect(service.dispatch).not.toHaveBeenCalled();
    expect(api.window.showInformationMessage).toHaveBeenCalledWith('No CI or PR output provided.');
  });

  it('does not dispatch when the workspace is not a git repository', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks);
    const runner: GitWorkflowCommandRunner = async () => ({ stdout: 'false\n', stderr: '' });
    const service = registration().service;
    registerGitWorkflowAwarenessCommands(
      api,
      () => ({ workspacePath: '/workspace', service }),
      async () => undefined,
      async () => true,
      runner,
    );

    await callbacks.get(SUMMARIZE_GIT_STATUS_COMMAND)?.();

    expect(service.dispatch).not.toHaveBeenCalled();
    expect(api.window.showInformationMessage).toHaveBeenCalledWith('No Git repository found for this workspace.');
  });
});

function cleanContext(): GitWorkflowContext {
  return {
    insideWorkTree: true,
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    dirtySummary: 'clean',
    dirtyFiles: [],
    latestCommit: '96c4313 (HEAD -> main, origin/main) feat: add approved verification runner',
    remotes: [{ name: 'origin', url: 'https://github.com/owner/repo.git', purposes: ['fetch', 'push'] }],
    rawStatus: '## main...origin/main',
  };
}

function cleanGitRunner(): GitWorkflowCommandRunner {
  return async (_workspacePath, args) => {
    if (args.join(' ') === 'rev-parse --is-inside-work-tree') return { stdout: 'true\n', stderr: '' };
    if (args.join(' ') === 'status --short --branch') return { stdout: '## main...origin/main\n', stderr: '' };
    if (args.join(' ') === 'remote -v') {
      return { stdout: 'origin\thttps://github.com/owner/repo.git (fetch)\norigin\thttps://github.com/owner/repo.git (push)\n', stderr: '' };
    }
    if (args.join(' ') === 'log -1 --oneline --decorate') {
      return { stdout: '96c4313 (HEAD -> main, origin/main) feat: add approved verification runner\n', stderr: '' };
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  };
}

function cleanDirtyContext(): GitWorkflowContext {
  return {
    ...cleanContext(),
    dirtySummary: '2 changed files: 1 created, 1 modified',
    dirtyFiles: [
      { status: 'M', path: 'src/parser.ts' },
      { status: '??', path: 'tests/parser.test.ts' },
    ],
    rawStatus: [
      '## main...origin/main',
      ' M src/parser.ts',
      '?? tests/parser.test.ts',
    ].join('\n'),
  };
}

function fakeApi(
  callbacks: Map<string, () => Promise<void>>,
  options: { clipboardText?: string; inputText?: string } = {},
): GitWorkflowApi & {
  env: { clipboard: { readText: ReturnType<typeof vi.fn> } };
  window: GitWorkflowApi['window'] & { showInputBox: ReturnType<typeof vi.fn> };
} {
  return {
    commands: {
      registerCommand: vi.fn((command: string, callback: () => Promise<void>) => {
        callbacks.set(command, callback);
        return { dispose: vi.fn() };
      }),
    },
    env: {
      clipboard: {
        readText: vi.fn().mockResolvedValue(options.clipboardText ?? ''),
      },
    },
    window: {
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showInputBox: vi.fn().mockResolvedValue(options.inputText),
      showWarningMessage: vi.fn(),
    },
  };
}

function registration() {
  return {
    workspacePath: '/workspace',
    service: {
      dispatch: vi.fn().mockResolvedValue(undefined),
    },
  };
}

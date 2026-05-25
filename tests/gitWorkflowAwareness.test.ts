import { describe, expect, it, vi } from 'vitest';
import {
  collectGitWorkflowContext,
  formatGitWorkflowReviewPrompt,
  formatGitWorkflowPrompt,
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

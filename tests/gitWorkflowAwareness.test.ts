import { describe, expect, it, vi } from 'vitest';
import {
  collectGitWorkflowContext,
  formatGitWorkflowPrompt,
  registerGitWorkflowAwarenessCommands,
  type GitWorkflowApi,
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
    const prompt = formatGitWorkflowPrompt({
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
    });

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

  it('routes Git workflow context through the docked view when available', async () => {
    const callbackRef: { current?: () => Promise<void> } = {};
    const api = fakeApi(callbackRef);
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

    await callbackRef.current?.();

    expect(api.commands.registerCommand).toHaveBeenCalledWith('veyra.summarizeGitStatus', expect.any(Function));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('[Git workflow context]');
    expect(dispatched[0]).toContain('Branch: main');
  });

  it('does not dispatch when the workspace is not a git repository', async () => {
    const callbackRef: { current?: () => Promise<void> } = {};
    const api = fakeApi(callbackRef);
    const runner: GitWorkflowCommandRunner = async () => ({ stdout: 'false\n', stderr: '' });
    const service = registration().service;
    registerGitWorkflowAwarenessCommands(
      api,
      () => ({ workspacePath: '/workspace', service }),
      async () => undefined,
      async () => true,
      runner,
    );

    await callbackRef.current?.();

    expect(service.dispatch).not.toHaveBeenCalled();
    expect(api.window.showInformationMessage).toHaveBeenCalledWith('No Git repository found for this workspace.');
  });
});

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

function fakeApi(callbackRef: { current?: () => Promise<void> }): GitWorkflowApi {
  return {
    commands: {
      registerCommand: vi.fn((_command: string, callback: () => Promise<void>) => {
        callbackRef.current = callback;
        return { dispose: vi.fn() };
      }),
    },
    window: {
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
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

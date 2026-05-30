import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  delete process.env.VEYRA_CODEX_CLI_PATH;
  delete process.env.VEYRA_ANTIGRAVITY_CLI_PATH;
  delete process.env.VEYRA_GEMINI_CLI_PATH;
  vi.doUnmock('node:child_process');
  vi.doUnmock('node:fs');
  vi.doUnmock('vscode');
  vi.resetModules();
});

function fakeProcess(stdoutChunks: string[] = []) {
  const proc: any = new EventEmitter();
  proc.stdout = Readable.from(stdoutChunks);
  proc.stderr = Readable.from([]);
  proc.kill = vi.fn();
  setImmediate(() => proc.emit('close', 0));
  return proc;
}

describe('agent CLI resolution failures', () => {
  it('CodexAgent uses veyra.codexCliPath before resolving the Windows npm bundle', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({
          get: (key: string, dflt: unknown) => key === 'codexCliPath'
            ? 'D:\\settings\\codex\\codex.js'
            : dflt,
        })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    for await (const _chunk of new CodexAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\settings\\codex\\codex.js']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('CodexAgent uses VEYRA_CODEX_CLI_PATH before resolving the Windows npm bundle', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_CODEX_CLI_PATH = 'D:\\tools\\codex\\codex.js';
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    for await (const _chunk of new CodexAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\tools\\codex\\codex.js']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
    delete process.env.VEYRA_CODEX_CLI_PATH;
  });

  it('CodexAgent spawns native executable overrides directly', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_CODEX_CLI_PATH = 'D:\\tools\\codex\\codex.exe';
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    for await (const _chunk of new CodexAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\tools\\codex\\codex.exe',
      expect.arrayContaining(['exec', '--json', '--skip-git-repo-check']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('CodexAgent uses a native codex.exe from PATH before resolving the Windows npm bundle', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe codex.exe') return 'D:\\tools\\codex\\codex.exe\r\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    for await (const _chunk of new CodexAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\tools\\codex\\codex.exe',
      expect.arrayContaining(['exec', '--json', '--skip-git-repo-check']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('CodexAgent uses a Windows npm codex.cmd shim from PATH before resolving npm root', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe codex.exe') throw new Error('native codex missing');
      if (command === 'where.exe codex.cmd') return 'D:\\npm\\codex.cmd\r\n';
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    for await (const _chunk of new CodexAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('CodexAgent ignores stale Windows npm PATH shims whose bundle target is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe codex.exe') throw new Error('native codex missing');
      if (command === 'where.exe codex.cmd') return 'D:\\stale-npm\\codex.cmd\r\n';
      if (command === 'where.exe codex.bat') throw new Error('stale codex bat missing');
      if (command === 'where.exe codex.ps1') throw new Error('stale codex ps1 missing');
      if (command === 'npm root -g') return 'C:\\npm-root\n';
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn((filePath: string) => {
        if (filePath.startsWith('D:\\stale-npm\\')) {
          const error = new Error(`missing ${filePath}`) as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
      }),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    for await (const _chunk of new CodexAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['C:\\npm-root\\@openai\\codex\\bin\\codex.js']),
      expect.anything(),
    );
    expect(execSync).toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('CodexAgent reports inaccessible native codex.exe from PATH instead of falling back to npm bundle probing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe codex.exe') return 'D:\\tools\\codex\\codex.exe\r\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn((filePath: string) => {
        const error = new Error(`cannot access ${filePath}`) as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    const chunks = [];
    for await (const chunk of new CodexAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Cannot inspect D:\\tools\\codex\\codex.exe. Check filesystem permissions or rerun outside the current sandbox.'),
      },
      { type: 'done' },
    ]);
  });

  it('CodexAgent resolves Windows npm command shim overrides to JS bundle paths', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_CODEX_CLI_PATH = 'D:\\npm\\codex.cmd';
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn((command: string) => {
        if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
        throw new Error('npm root should not be used');
      }),
    }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    const chunks = [];
    for await (const chunk of new CodexAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js']),
      expect.anything(),
    );
    expect(chunks).toEqual([{ type: 'done' }]);
  });

  it('CodexAgent rejects malformed CLI path overrides before spawning', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_CODEX_CLI_PATH = 'D:\\tools\\not-codex.exe';
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn((command: string) => {
        if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
        throw new Error('npm root should not be used');
      }),
    }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    const chunks = [];
    for await (const chunk of new CodexAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Codex CLI path override must point to codex.js, codex.exe, or codex.'),
      },
      { type: 'done' },
    ]);
  });

  it('CodexAgent emits an error chunk when the Codex CLI command cannot be resolved', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:child_process', () => ({
      spawn: vi.fn(),
      execSync: vi.fn(() => {
        throw new Error('npm root unavailable');
      }),
    }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    const chunks = [];
    for await (const chunk of new CodexAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'error', message: expect.stringContaining('npm root unavailable') },
      { type: 'done' },
    ]);
  });

  it('CodexAgent emits setup guidance when the Windows npm bundle is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(() => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn(() => 'C:\\npm-root\n'),
    }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    const chunks = [];
    for await (const chunk of new CodexAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Install it with `npm install -g @openai/codex`, then run `codex login`.'),
      },
      { type: 'done' },
    ]);
  });

  it('CodexAgent emits inaccessible guidance when the Windows npm bundle cannot be inspected', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(() => {
        const error = new Error('permission denied') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn(() => 'C:\\npm-root\n'),
    }));

    const { CodexAgent } = await import('../../src/agents/codex.js');

    const chunks = [];
    for await (const chunk of new CodexAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Cannot inspect C:\\npm-root\\@openai\\codex\\bin\\codex.js. Check filesystem permissions or rerun outside the current sandbox.'),
      },
      { type: 'done' },
    ]);
  });

  it('GeminiAgent emits an error chunk when the Gemini CLI command cannot be resolved', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:child_process', () => ({
      spawn: vi.fn(),
      execSync: vi.fn(() => {
        throw new Error('npm root unavailable');
      }),
    }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'error', message: expect.stringContaining('npm root unavailable') },
      { type: 'done' },
    ]);
  });

  it('GeminiAgent uses veyra.geminiCliPath before resolving the Windows npm bundle', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({
          get: (key: string, dflt: unknown) => key === 'geminiCliPath'
            ? 'D:\\settings\\gemini\\gemini.js'
            : dflt,
        })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\settings\\gemini\\gemini.js']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent prefers veyra.antigravityCliPath before legacy Gemini settings', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') throw new Error('legacy gemini should not be probed first');
      if (command === 'npm root -g') throw new Error('npm root should not be used');
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({
          get: (key: string, dflt: unknown) => {
            if (key === 'antigravityCliPath') return 'D:\\tools\\agy\\agy.exe';
            if (key === 'geminiCliPath') return 'D:\\legacy\\gemini\\gemini.js';
            return dflt;
          },
        })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi', { readOnly: true } as any)) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\tools\\agy\\agy.exe',
      expect.arrayContaining(['--print', 'hi']),
      expect.anything(),
    );
    const spawnCalls = spawn.mock.calls as unknown as Array<[string, string[], unknown]>;
    const args = spawnCalls.at(-1)?.[1] ?? [];
    expect(args).not.toContain('-o');
    expect(args).not.toContain('stream-json');
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent uses VEYRA_ANTIGRAVITY_CLI_PATH before legacy Gemini resolution', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    const spawn = vi.fn(() => fakeProcess(['done\n']));
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') throw new Error('legacy gemini should not be probed first');
      if (command === 'npm root -g') throw new Error('npm root should not be used');
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi', { readOnly: true } as any)) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\tools\\agy\\agy.exe',
      expect.arrayContaining(['--print', 'hi']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent falls back to legacy Gemini for prompts too large for Antigravity argv', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    process.env.VEYRA_GEMINI_CLI_PATH = 'D:\\tools\\gemini\\gemini.js';
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');
    const prompt = `large review\n${'x'.repeat(25_000)}`;

    for await (const _chunk of new GeminiAgent().send(prompt, { readOnly: true } as any)) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\tools\\gemini\\gemini.js', '-o', 'stream-json']),
      expect.anything(),
    );
    const spawnCalls = spawn.mock.calls as unknown as Array<[string, string[], unknown]>;
    expect(spawnCalls.at(-1)?.[1] ?? []).not.toContain(prompt);
  });

  it('GeminiAgent falls back to legacy Gemini when Antigravity hits an argv launch limit anyway', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    process.env.VEYRA_GEMINI_CLI_PATH = 'D:\\tools\\gemini\\gemini.js';
    const spawn = vi.fn((command: string) => {
      if (command === 'D:\\tools\\agy\\agy.exe') {
        const error = new Error('spawn ENAMETOOLONG') as NodeJS.ErrnoException;
        error.code = 'ENAMETOOLONG';
        throw error;
      }
      return fakeProcess();
    });
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');
    const prompt = `medium review\n${'x'.repeat(10_000)}`;

    for await (const _chunk of new GeminiAgent().send(prompt, { readOnly: true } as any)) {
      // drain
    }

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\tools\\gemini\\gemini.js', '-o', 'stream-json']),
      expect.anything(),
    );
    const spawnCalls = spawn.mock.calls as unknown as Array<[string, string[], unknown]>;
    expect(spawnCalls.at(-1)?.[1] ?? []).not.toContain(prompt);
  });

  it('GeminiAgent falls back to legacy Gemini (and errors when it is absent) after an Antigravity ENAMETOOLONG spawn', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    const spawn = vi.fn(() => {
      const error = new Error('spawn ENAMETOOLONG') as NodeJS.ErrnoException;
      error.code = 'ENAMETOOLONG';
      throw error;
    });
    const accessSync = vi.fn((path: string) => {
      if (/agy\.exe$/i.test(path)) return;
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') throw new Error('native gemini missing');
      if (command.startsWith('where.exe gemini.')) throw new Error('gemini shim missing');
      if (command === 'npm root -g') return 'D:\\npm\\node_modules\n';
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync,
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');
    const chunks = [];
    for await (const chunk of new GeminiAgent().send(`medium review\n${'x'.repeat(10_000)}`, { readOnly: true } as any)) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: 'text', text: expect.stringContaining('legacy Gemini CLI') });
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'error', message: expect.stringContaining('Unable to start Gemini CLI') }));
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('GeminiAgent errors with Gemini guidance when a too-large Antigravity prompt has no legacy fallback', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    const spawn = vi.fn(() => fakeProcess());
    const accessSync = vi.fn((path: string) => {
      if (/agy\.exe$/i.test(path)) return;
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') throw new Error('native gemini missing');
      if (command.startsWith('where.exe gemini.')) throw new Error('gemini shim missing');
      if (command === 'npm root -g') return 'D:\\npm\\node_modules\n';
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync,
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');
    const chunks = [];
    for await (const chunk of new GeminiAgent().send(`large review\n${'x'.repeat(25_000)}`, { readOnly: true } as any)) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'error', message: expect.stringContaining('Unable to start Gemini CLI') }));
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('GeminiAgent rejects malformed Antigravity CLI path overrides before spawning', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\not-agy.exe';
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn(() => {
        throw new Error('legacy gemini should not be used');
      }),
    }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Antigravity CLI path override must point to agy.exe or agy.'),
      },
      { type: 'done' },
    ]);
  });

  it('GeminiAgent uses VEYRA_GEMINI_CLI_PATH before resolving the Windows npm bundle', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_GEMINI_CLI_PATH = 'D:\\tools\\gemini\\gemini.js';
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\tools\\gemini\\gemini.js']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
    delete process.env.VEYRA_GEMINI_CLI_PATH;
  });

  it('GeminiAgent spawns native executable overrides directly', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_GEMINI_CLI_PATH = 'D:\\tools\\gemini\\gemini.exe';
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\tools\\gemini\\gemini.exe',
      expect.arrayContaining(['-o', 'stream-json']),
      expect.anything(),
    );
    const spawnCalls = spawn.mock.calls as unknown as Array<[string, string[], unknown]>;
    expect(spawnCalls.at(-1)?.[1] ?? []).not.toContain('hi');
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent uses a native gemini.exe from PATH before resolving the Windows npm bundle', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') return 'D:\\tools\\gemini\\gemini.exe\r\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\tools\\gemini\\gemini.exe',
      expect.arrayContaining(['-o', 'stream-json']),
      expect.anything(),
    );
    const spawnCalls = spawn.mock.calls as unknown as Array<[string, string[], unknown]>;
    expect(spawnCalls.at(-1)?.[1] ?? []).not.toContain('hi');
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent uses a Windows npm gemini.ps1 shim from PATH before resolving npm root', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') throw new Error('native gemini missing');
      if (command === 'where.exe gemini.ps1') return 'D:\\npm\\gemini.ps1\r\n';
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\npm\\node_modules\\@google\\gemini-cli\\bundle\\gemini.js']),
      expect.anything(),
    );
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent ignores stale Windows npm PATH shims whose bundle target is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') throw new Error('native gemini missing');
      if (command === 'where.exe gemini.cmd') throw new Error('stale gemini cmd missing');
      if (command === 'where.exe gemini.bat') throw new Error('stale gemini bat missing');
      if (command === 'where.exe gemini.ps1') return 'D:\\stale-npm\\gemini.ps1\r\n';
      if (command === 'npm root -g') return 'C:\\npm-root\n';
      if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
      throw new Error(`unexpected command: ${command}`);
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn((filePath: string) => {
        if (filePath.startsWith('D:\\stale-npm\\')) {
          const error = new Error(`missing ${filePath}`) as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
      }),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    for await (const _chunk of new GeminiAgent().send('hi')) {
      // drain
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['C:\\npm-root\\@google\\gemini-cli\\bundle\\gemini.js']),
      expect.anything(),
    );
    expect(execSync).toHaveBeenCalledWith('npm root -g', expect.anything());
  });

  it('GeminiAgent reports inaccessible native gemini.exe from PATH instead of falling back to npm bundle probing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    const execSync = vi.fn((command: string) => {
      if (command === 'where.exe gemini.exe') return 'D:\\tools\\gemini\\gemini.exe\r\n';
      throw new Error('npm root should not be used');
    });
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn((filePath: string) => {
        const error = new Error(`cannot access ${filePath}`) as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('node:child_process', () => ({ spawn, execSync }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalledWith('npm root -g', expect.anything());
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Cannot inspect D:\\tools\\gemini\\gemini.exe. Check filesystem permissions or rerun outside the current sandbox.'),
      },
      { type: 'done' },
    ]);
  });

  it('GeminiAgent resolves Windows npm command shim overrides to JS bundle paths', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_GEMINI_CLI_PATH = 'D:\\npm\\gemini.cmd';
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn((command: string) => {
        if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
        throw new Error('npm root should not be used');
      }),
    }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).toHaveBeenCalledWith(
      'D:\\node\\node.exe',
      expect.arrayContaining(['D:\\npm\\node_modules\\@google\\gemini-cli\\bundle\\gemini.js']),
      expect.anything(),
    );
    expect(chunks).toEqual([{ type: 'done' }]);
  });

  it('GeminiAgent rejects malformed CLI path overrides before spawning', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.VEYRA_GEMINI_CLI_PATH = 'D:\\tools\\not-gemini.js';
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(),
      existsSync: vi.fn(() => true),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn((command: string) => {
        if (command.startsWith('where node')) return 'D:\\node\\node.exe\n';
        throw new Error('npm root should not be used');
      }),
    }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Gemini CLI path override must point to gemini.js, gemini.exe, or gemini.'),
      },
      { type: 'done' },
    ]);
  });

  it('GeminiAgent emits setup guidance when the Windows npm bundle is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(() => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn(() => 'C:\\npm-root\n'),
    }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Install Antigravity CLI from https://antigravity.google/cli, or install legacy Gemini CLI with `npm install -g @google/gemini-cli`, then run `gemini` once to sign in.'),
      },
      { type: 'done' },
    ]);
  });

  it('GeminiAgent emits inaccessible guidance when the Windows npm bundle cannot be inspected', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const spawn = vi.fn(() => fakeProcess());
    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
      },
    }));
    vi.doMock('node:fs', () => ({
      accessSync: vi.fn(() => {
        const error = new Error('permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock('node:child_process', () => ({
      spawn,
      execSync: vi.fn(() => 'C:\\npm-root\n'),
    }));

    const { GeminiAgent } = await import('../../src/agents/gemini.js');

    const chunks = [];
    for await (const chunk of new GeminiAgent().send('hi')) {
      chunks.push(chunk);
    }

    expect(spawn).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Cannot inspect C:\\npm-root\\@google\\gemini-cli\\bundle\\gemini.js. Check filesystem permissions or rerun outside the current sandbox.'),
      },
      { type: 'done' },
    ]);
  });
});

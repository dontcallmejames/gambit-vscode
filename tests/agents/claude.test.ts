import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

type FakeStdin = { end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
type FakeChild = EventEmitter & {
  stdout: Readable;
  stderr: PassThrough;
  stdin: FakeStdin;
  kill: ReturnType<typeof vi.fn>;
};

function fakeStdin(): FakeStdin {
  return { end: vi.fn(), on: vi.fn() };
}

function fakeClaudeProcess(stdoutLines: unknown[], closeCode = 0, stderrText = ''): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Readable.from(stdoutLines.map((line) => `${JSON.stringify(line)}\n`));
  child.stderr = new PassThrough();
  child.stdin = fakeStdin();
  child.kill = vi.fn();
  return child;
}

function fakePendingClaudeProcess(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = fakeStdin();
  child.kill = vi.fn();
  return child;
}

async function importClaudeAgentWithCli(child: FakeChild, closeCode: number | null = 0, stderrText = '') {
  const spawn = vi.fn(() => {
    if (closeCode !== null) {
      queueMicrotask(() => {
        if (stderrText) child.stderr.end(stderrText);
        child.emit('close', closeCode);
      });
    }
    return child;
  });
  const execSync = vi.fn(() => 'C:\\Users\\jford\\.local\\bin\\claude.exe\r\n');
  vi.doMock('node:child_process', () => ({ spawn, execSync }));
  vi.doMock('vscode', () => ({
    workspace: {
      getConfiguration: vi.fn(() => ({ get: (_key: string, fallback: unknown) => fallback })),
    },
  }));
  const { ClaudeAgent } = await import('../../src/agents/claude.js');
  return { ClaudeAgent, spawn };
}

describe('ClaudeAgent', () => {
  afterEach(() => {
    vi.doUnmock('node:child_process');
    vi.doUnmock('vscode');
    vi.resetModules();
  });

  it('streams text events from Claude CLI directly', async () => {
    const child = fakeClaudeProcess([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hello ' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'world' }] } },
      { type: 'result', subtype: 'success' },
    ]);
    const { ClaudeAgent, spawn } = await importClaudeAgentWithCli(child);

    const agent = new ClaudeAgent();
    const chunks = [];
    for await (const chunk of agent.send('hi', { cwd: 'C:\\workspace' })) chunks.push(chunk);

    expect(spawn).toHaveBeenCalledWith(
      'C:\\Users\\jford\\.local\\bin\\claude.exe',
      ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'],
      { cwd: 'C:\\workspace', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    expect(child.stdin.end).toHaveBeenCalledWith('hi');
    expect(chunks).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
      { type: 'done' },
    ]);
  });

  it('attaches a stdin error listener so an EPIPE before the CLI reads cannot crash the host', async () => {
    const child = fakeClaudeProcess([{ type: 'result', subtype: 'success' }]);
    const { ClaudeAgent } = await importClaudeAgentWithCli(child);

    const agent = new ClaudeAgent();
    for await (const _chunk of agent.send('hi')) {
      // drain
    }

    // Without an 'error' listener a late EPIPE (CLI exits before reading stdin)
    // becomes an uncaughtException that can tear down the extension host.
    expect(child.stdin.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('surfaces a drift warning when Claude output parses to zero chunks on a clean exit', async () => {
    // Valid JSON the parser no longer recognizes (renamed event types), exit 0.
    const child = fakeClaudeProcess([
      { type: 'renamed_system', subtype: 'init' },
      { type: 'renamed_assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'renamed_result', subtype: 'success' },
    ]);
    const { ClaudeAgent } = await importClaudeAgentWithCli(child);

    const agent = new ClaudeAgent();
    const chunks = [];
    for await (const chunk of agent.send('hi')) chunks.push(chunk);

    const errorChunk = chunks.find((c) => c.type === 'error') as { type: 'error'; message: string } | undefined;
    expect(errorChunk).toBeTruthy();
    expect(errorChunk!.message).toContain('Veyra could not parse');
  });

  it('forbids the write tools for read-only sends and stays in default permission mode', async () => {
    const child = fakeClaudeProcess([{ type: 'result', subtype: 'success' }]);
    const { ClaudeAgent, spawn } = await importClaudeAgentWithCli(child);

    const agent = new ClaudeAgent();
    for await (const _chunk of agent.send('hi', { readOnly: true })) {
      // drain
    }

    // Read-only is enforced by removing the write tools from Claude's context
    // (--disallowedTools), NOT by plan mode (which persists a plan file via the
    // Write tool — that tripped the read-only violation detector in practice)
    // nor by 'default' alone (which only withholds auto-approval). Bash stays
    // available for read-only exploration that aids planning.
    const args = (spawn.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('default');
    expect(args).toContain('--disallowedTools');
    const disallowed = args[args.indexOf('--disallowedTools') + 1];
    expect(disallowed).toContain('Edit');
    expect(disallowed).toContain('Write');
    expect(disallowed).toContain('MultiEdit');
    expect(disallowed).toContain('NotebookEdit');
    expect(args).not.toContain('plan');
    expect(args).not.toContain('acceptEdits');
  });

  it('does not restrict tools for write-capable sends', async () => {
    const child = fakeClaudeProcess([{ type: 'result', subtype: 'success' }]);
    const { ClaudeAgent, spawn } = await importClaudeAgentWithCli(child);

    const agent = new ClaudeAgent();
    for await (const _chunk of agent.send('hi', {})) {
      // drain (no readOnly → write-capable; default writeApproval is 'auto-edit')
    }

    const args = (spawn.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
    expect(args).not.toContain('--disallowedTools');
  });

  it('maps tool-use and tool-result events with friendly names', async () => {
    const child = fakeClaudeProcess([
      { type: 'system', subtype: 'init' },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Looking at the file...' },
            { type: 'tool_use', id: 'tu_123', name: 'read_file', input: { path: 'a.ts' } },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tu_123', content: 'file contents...' },
          ],
        },
      },
      { type: 'result', subtype: 'success' },
    ]);
    const { ClaudeAgent } = await importClaudeAgentWithCli(child);

    const agent = new ClaudeAgent();
    const chunks = [];
    for await (const chunk of agent.send('hi')) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: 'text', text: 'Looking at the file...' },
      { type: 'tool-call', name: 'read_file', input: { path: 'a.ts' } },
      { type: 'tool-result', name: 'read_file', output: 'file contents...' },
      { type: 'done' },
    ]);
  });

  it('emits CLI exit errors and then done', async () => {
    const child = fakeClaudeProcess([]);
    const { ClaudeAgent } = await importClaudeAgentWithCli(child, 2, 'auth failed');

    const agent = new ClaudeAgent();
    const chunks = [];
    for await (const chunk of agent.send('hi')) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: 'error', message: 'Claude exited with exit code 2: auth failed' },
      { type: 'done' },
    ]);
  });

  it('kills the active Claude CLI process on cancel', async () => {
    const child = fakePendingClaudeProcess();
    const { ClaudeAgent } = await importClaudeAgentWithCli(child, null);
    const agent = new ClaudeAgent();
    const iterator = agent.send('long task')[Symbol.asyncIterator]();
    const firstChunk = iterator.next();

    await new Promise((resolve) => setImmediate(resolve));
    await agent.cancel();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    (child.stdout as PassThrough).end();
    child.emit('close', 0);
    await firstChunk;
  });

  it('exposes id "claude"', async () => {
    const child = fakeClaudeProcess([{ type: 'result', subtype: 'success' }]);
    const { ClaudeAgent } = await importClaudeAgentWithCli(child);

    expect(new ClaudeAgent().id).toBe('claude');
  });
});

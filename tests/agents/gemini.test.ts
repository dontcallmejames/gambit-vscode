import { afterEach, describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { GeminiAgent } from '../../src/agents/gemini.js';

const getConfigGet = vi.fn((_key: string, dflt: unknown) => dflt);
vi.mock('vscode', () => ({
  workspace: { getConfiguration: vi.fn(() => ({ get: getConfigGet })) },
}));

function setBackend(value: 'auto' | 'antigravity' | 'gemini') {
  getConfigGet.mockImplementation((key: string, dflt: unknown) =>
    key === 'gemini.backend' ? value : dflt);
}

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue('/fake/npm/root\n'),
}));

vi.mock('node:fs', () => ({
  accessSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

import { spawn } from 'node:child_process';
const mockedSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  delete process.env.VEYRA_ANTIGRAVITY_CLI_PATH;
  getConfigGet.mockImplementation((_k: string, dflt: unknown) => dflt);
  mockedSpawn.mockReset();
});

function fakeProcess(stdoutChunks: string[], exitCode = 0) {
  const proc: any = new EventEmitter();
  proc.stdout = Readable.from(stdoutChunks);
  proc.stderr = Readable.from([]);
  proc.stdinText = '';
  proc.stdin = new Writable({
    write(chunk, _encoding, callback) {
      proc.stdinText += String(chunk);
      callback();
    },
  });
  proc.kill = vi.fn();
  // Emit close once stdout is drained so the close event is never delivered
  // before the runner attaches its listener (e.g. after the Antigravity
  // first-output timeout delays consumption of a queued fallback process).
  let closed = false;
  const emitClose = () => {
    if (closed) return;
    closed = true;
    proc.emit('close', exitCode);
  };
  proc.stdout.once('end', () => setImmediate(emitClose));
  return proc;
}

function fakeProcessError(message: string) {
  const proc: any = new EventEmitter();
  proc.stdout = Readable.from([]);
  proc.stderr = Readable.from([]);
  proc.stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  proc.kill = vi.fn();
  setImmediate(() => {
    proc.emit('error', new Error(message));
    proc.emit('close', null);
  });
  return proc;
}

function fakeHangingProcess() {
  const { PassThrough } = require('node:stream');
  const proc: any = new EventEmitter();
  proc.stdout = new PassThrough();   // stays open; no data, no end
  proc.stderr = new PassThrough();
  proc.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
  // SIGTERM closes the process, ending stdout so the runner unblocks.
  proc.kill = vi.fn(() => { proc.stdout.end(); proc.emit('close', null); });
  return proc;
}

describe('GeminiAgent', () => {
  it('parses Gemini stream-json events into AgentChunks', async () => {
    // Real Gemini event shape from spike A4 (CLI invoked with -o stream-json):
    // init -> message(user echo) -> message(assistant, delta:true) -> result
    mockedSpawn.mockReturnValueOnce(
      fakeProcess([
        '{"type":"init"}\n',
        '{"type":"message","role":"user","content":"hi"}\n',
        '{"type":"message","role":"assistant","content":"ok","delta":true}\n',
        '{"type":"result","status":"success"}\n',
      ])
    );

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi')) chunks.push(c);

    expect(chunks).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'done' },
    ]);
  });

  it('parses tool_use event into a tool-call chunk for badge firing', async () => {
    // Real Gemini tool_use event shape from gemini-KXTGCWBT.js source analysis:
    //   { type: "tool_use", timestamp, tool_name, tool_id, parameters }
    // Emitted when the model requests a tool call. The parameters field is the
    // input object; for write_file it carries file_path which getEditedPath uses.
    mockedSpawn.mockReturnValueOnce(
      fakeProcess([
        '{"type":"init","timestamp":"2026-05-07T00:00:00Z","session_id":"s1","model":"gemini-3"}\n',
        '{"type":"message","role":"user","content":"write a file"}\n',
        '{"type":"tool_use","timestamp":"2026-05-07T00:00:01Z","tool_name":"write_file","tool_id":"call_abc","parameters":{"file_path":"/abs/scratch_spike.txt","content":"hello"}}\n',
        '{"type":"tool_result","timestamp":"2026-05-07T00:00:02Z","tool_id":"call_abc","status":"success","output":"Wrote 5 bytes"}\n',
        '{"type":"message","role":"assistant","content":"Done.","delta":true}\n',
        '{"type":"result","timestamp":"2026-05-07T00:00:03Z","status":"success","stats":{}}\n',
      ])
    );

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('write a file')) chunks.push(c);

    expect(chunks).toContainEqual({
      type: 'tool-call',
      name: 'write_file',
      input: { file_path: '/abs/scratch_spike.txt', content: 'hello' },
    });
    expect(chunks).toContainEqual({
      type: 'tool-result',
      name: 'write_file',
      output: 'Wrote 5 bytes',
    });
    expect(chunks).toContainEqual({ type: 'text', text: 'Done.' });
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('resolves tool_result name via tool_id → tool_name map', async () => {
    // tool_result events carry only tool_id; the parser tracks tool_id → tool_name
    // from the preceding tool_use event so the tool-result chunk gets a friendly name.
    mockedSpawn.mockReturnValueOnce(
      fakeProcess([
        '{"type":"tool_use","tool_name":"replace","tool_id":"call_xyz","parameters":{"file_path":"/abs/foo.ts"}}\n',
        '{"type":"tool_result","tool_id":"call_xyz","status":"success","output":"replaced"}\n',
        '{"type":"result","status":"success"}\n',
      ])
    );

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('edit file')) chunks.push(c);

    const toolResult = chunks.find((c) => c.type === 'tool-result');
    expect(toolResult).toEqual({ type: 'tool-result', name: 'replace', output: 'replaced' });
  });

  it('emits an error chunk on non-zero exit', async () => {
    mockedSpawn.mockReturnValueOnce(fakeProcess([], 2));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi')) chunks.push(c);

    expect(chunks).toContainEqual({
      type: 'error',
      message: expect.stringContaining('exit code 2'),
    });
  });

  it('emits an error chunk when the Gemini process cannot be spawned', async () => {
    mockedSpawn.mockImplementationOnce(() => {
      throw new Error('spawn failed');
    });

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi')) chunks.push(c);

    expect(chunks).toEqual([
      { type: 'error', message: 'Unable to start Gemini CLI: spawn failed' },
      { type: 'done' },
    ]);
  });

  it('emits an error chunk when the Gemini process emits an async startup error', async () => {
    mockedSpawn.mockReturnValueOnce(fakeProcessError('ENOENT gemini'));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi')) chunks.push(c);

    expect(chunks).toEqual([
      { type: 'error', message: 'Gemini process error: ENOENT gemini' },
      { type: 'done' },
    ]);
  });

  it('omits auto-edit approval args for read-only sends', async () => {
    mockedSpawn.mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n']));

    const agent = new GeminiAgent();
    for await (const _chunk of agent.send('review only', { readOnly: true } as any)) {
      // drain
    }

    const args = mockedSpawn.mock.calls.at(-1)?.[1] as string[];
    expect(args).toContain('-o');
    expect(args).not.toContain('--approval-mode');
    expect(args).not.toContain('auto_edit');
  });

  it('passes prompts over stdin instead of argv to avoid command-line length limits', async () => {
    const proc = fakeProcess(['{"type":"result","status":"success"}\n']);
    mockedSpawn.mockReturnValueOnce(proc);
    const prompt = `review this shared context\n${'x'.repeat(40_000)}`;

    const agent = new GeminiAgent();
    for await (const _chunk of agent.send(prompt, { readOnly: true } as any)) {
      // drain
    }

    const args = mockedSpawn.mock.calls.at(-1)?.[1] as string[];
    const options = mockedSpawn.mock.calls.at(-1)?.[2] as { stdio: string[] };
    expect(args).not.toContain('-p');
    expect(args).not.toContain(prompt);
    expect(options.stdio[0]).toBe('pipe');
    expect(proc.stdinText).toBe(prompt);
  });

  it('treats Antigravity --print output as plain assistant text', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    mockedSpawn.mockReturnValueOnce(fakeProcess(['plain answer\n']));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true } as any)) chunks.push(c);

    expect(mockedSpawn).toHaveBeenCalledWith(
      'D:\\tools\\agy\\agy.exe',
      expect.arrayContaining(['--print', 'hi']),
      expect.anything(),
    );
    const args = mockedSpawn.mock.calls.at(-1)?.[1] as string[];
    expect(args).not.toContain('-o');
    expect(args).not.toContain('stream-json');
    expect(chunks).toEqual([
      { type: 'text', text: 'plain answer\n' },
      { type: 'done' },
    ]);
  });

  it('omits the Antigravity auto-edit override (--dangerously-skip-permissions) for read-only sends', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    mockedSpawn.mockReturnValueOnce(fakeProcess(['plain answer\n']));

    const agent = new GeminiAgent();
    for await (const _c of agent.send('review only', { readOnly: true } as any)) {
      // drain
    }

    const args = mockedSpawn.mock.calls.at(-1)?.[1] as string[];
    expect(args).toContain('--print');
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('includes the Antigravity auto-edit override for write-capable sends (proves the read-only assertion discriminates)', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    mockedSpawn.mockReturnValueOnce(fakeProcess(['plain answer\n']));

    const agent = new GeminiAgent();
    for await (const _c of agent.send('edit something', {} as any)) {
      // drain (no readOnly → write-capable; default writeApproval is 'auto-edit')
    }

    const args = mockedSpawn.mock.calls.at(-1)?.[1] as string[];
    expect(args).toContain('--dangerously-skip-permissions');
  });

  it('exposes id "gemini"', () => {
    expect(new GeminiAgent().id).toBe('gemini');
  });

  it('auto: falls back to legacy Gemini with a notice when Antigravity yields no output', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('auto');
    mockedSpawn
      .mockReturnValueOnce(fakeProcess([], 0))
      .mockReturnValueOnce(fakeProcess(['{"type":"message","role":"assistant","content":"hi","delta":true}\n', '{"type":"result","status":"success"}\n']));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true } as any)) chunks.push(c);

    expect(mockedSpawn).toHaveBeenCalledTimes(2);
    expect(chunks).toContainEqual({ type: 'text', text: expect.stringContaining('legacy Gemini CLI') });
    expect(chunks).toContainEqual({ type: 'text', text: 'hi' });
    expect(chunks.at(-1)).toEqual({ type: 'done' });
    expect(chunks).not.toContainEqual(expect.objectContaining({ type: 'error' }));
  });

  it('auto: streams Antigravity output and does not fall back when it responds', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('auto');
    mockedSpawn.mockReturnValueOnce(fakeProcess(['plain answer\n']));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true } as any)) chunks.push(c);

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([{ type: 'text', text: 'plain answer\n' }, { type: 'done' }]);
  });

  it('auto: caches the headless failure and skips Antigravity on the next send', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('auto');
    mockedSpawn
      .mockReturnValueOnce(fakeProcess([], 0))
      .mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n']))
      .mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n']));

    const agent = new GeminiAgent();
    for await (const _c of agent.send('one', { readOnly: true } as any)) { /* drain */ }
    const before = mockedSpawn.mock.calls.length;
    const secondChunks = [];
    for await (const c of agent.send('two', { readOnly: true } as any)) secondChunks.push(c);

    expect(before).toBe(2);
    expect(mockedSpawn.mock.calls.length).toBe(3);
    // The fallback notice is paid once; the cached second send goes straight to Gemini.
    expect(secondChunks).not.toContainEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('legacy Gemini CLI') }));
  });

  it('forced antigravity: surfaces the real crash reason when it errors with no output', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('antigravity');
    mockedSpawn.mockReturnValueOnce(fakeProcessError('agy boom'));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true } as any)) chunks.push(c);

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'error', message: expect.stringContaining('agy boom') }));
    // Must NOT fall back to the generic "headless --print" message when there's a real error.
    expect(chunks).not.toContainEqual(
      expect.objectContaining({ type: 'error', message: expect.stringContaining('may not support headless') }));
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('forced antigravity: emits an error (no fallback) when it yields no output', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('antigravity');
    mockedSpawn.mockReturnValueOnce(fakeProcess([], 0));

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true } as any)) chunks.push(c);

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect(chunks).toContainEqual({ type: 'error', message: expect.stringContaining('veyra.gemini.backend') });
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('forced gemini: never spawns Antigravity even when agy is configured', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('gemini');
    mockedSpawn.mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n']));

    const agent = new GeminiAgent();
    for await (const _c of agent.send('hi', { readOnly: true } as any)) { /* drain */ }

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    const firstArg = mockedSpawn.mock.calls[0]?.[0] as string;
    expect(firstArg).not.toBe('D:\\tools\\agy\\agy.exe');
  });

  it('auto: first-output timeout kills a hung Antigravity and falls back', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('auto');
    const hung = fakeHangingProcess();
    mockedSpawn
      .mockReturnValueOnce(hung)
      .mockReturnValueOnce(fakeProcess(['{"type":"message","role":"assistant","content":"ok","delta":true}\n', '{"type":"result","status":"success"}\n']));

    const agent = new GeminiAgent({ antigravityFirstOutputTimeoutMs: 20 });
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true } as any)) chunks.push(c);

    expect(hung.kill).toHaveBeenCalled();
    expect(mockedSpawn).toHaveBeenCalledTimes(2);
    expect(chunks).toContainEqual({ type: 'text', text: 'ok' });
  });

  it('auto: a cancelled Antigravity dispatch does not fall back to legacy Gemini', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('auto');
    mockedSpawn.mockReturnValueOnce(fakeProcess([], 0));
    const ac = new AbortController();
    ac.abort();

    const agent = new GeminiAgent();
    const chunks = [];
    for await (const c of agent.send('hi', { readOnly: true, signal: ac.signal } as any)) chunks.push(c);

    // Cancelled mid-Antigravity: must not spawn a second (Gemini) backend.
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect(chunks).not.toContainEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('legacy Gemini CLI') }));
  });

  it('forced antigravity re-tries agy even after an auto fallback cached the failure', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    const agent = new GeminiAgent();

    // First: an auto run where Antigravity is empty caches headless-unusable and
    // falls back to legacy Gemini (2 spawns).
    setBackend('auto');
    mockedSpawn
      .mockReturnValueOnce(fakeProcess([], 0))
      .mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n']));
    for await (const _c of agent.send('one', { readOnly: true } as any)) { /* drain */ }
    expect(mockedSpawn).toHaveBeenCalledTimes(2);

    // Now the user forces antigravity in the same session: the cache must NOT
    // suppress it - agy is spawned again (3rd spawn), not skipped to Gemini.
    setBackend('antigravity');
    mockedSpawn.mockReturnValueOnce(fakeProcess(['real antigravity answer\n']));
    const chunks = [];
    for await (const c of agent.send('two', { readOnly: true } as any)) chunks.push(c);

    expect(mockedSpawn).toHaveBeenCalledTimes(3);
    expect(mockedSpawn.mock.calls[2]?.[0]).toBe('D:\\tools\\agy\\agy.exe');
    expect(chunks).toContainEqual({ type: 'text', text: 'real antigravity answer\n' });
  });
});

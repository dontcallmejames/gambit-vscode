import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentStatus } from '../src/types.js';

type FakeChild = EventEmitter & {
  stdout: Readable;
  stderr: PassThrough;
  stdin: { end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
};

function fakeClaudeProcess(text: string, closeCode = 0, stderrText = ''): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Readable.from([
    `${JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
    })}\n`,
    `${JSON.stringify({ type: 'result', subtype: closeCode === 0 ? 'success' : 'error', error: stderrText })}\n`,
  ]);
  child.stderr = new PassThrough();
  child.stdin = { end: vi.fn() };
  child.kill = vi.fn();
  return child;
}

async function importFacilitatorWithCli(child: FakeChild, closeCode = 0, stderrText = '') {
  const spawn = vi.fn(() => {
    queueMicrotask(() => {
      if (stderrText) child.stderr.end(stderrText);
      child.emit('close', closeCode);
    });
    return child;
  });
  const execSync = vi.fn(() => 'C:\\Users\\jford\\.local\\bin\\claude.exe\r\n');
  vi.doMock('node:child_process', () => ({ spawn, execSync }));
  const { chooseFacilitatorAgent } = await import('../src/facilitator.js');
  return { chooseFacilitatorAgent, spawn };
}

const allReady: Record<'claude' | 'codex' | 'gemini', AgentStatus> = {
  claude: 'ready',
  codex: 'ready',
  gemini: 'ready',
};

describe('chooseFacilitatorAgent', () => {
  afterEach(() => {
    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('returns parsed { agent, reason } from a Claude CLI JSON response', async () => {
    const child = fakeClaudeProcess('{"agent":"gemini","reason":"current events"}');
    const { chooseFacilitatorAgent, spawn } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent('what is the news?', allReady);

    expect(spawn).toHaveBeenCalledWith(
      'C:\\Users\\jford\\.local\\bin\\claude.exe',
      ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    expect(child.stdin.end.mock.calls[0][0]).toContain('what is the news?');
    expect(decision).toEqual({ agent: 'gemini', reason: 'current events' });
  });

  it('strips markdown code fences before parsing', async () => {
    const child = fakeClaudeProcess('```json\n{"agent":"claude","reason":"code review"}\n```');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent('review this', allReady);

    expect(decision).toEqual({ agent: 'claude', reason: 'code review' });
  });

  it('falls back to deterministic routing on malformed JSON', async () => {
    const child = fakeClaudeProcess('not even close to json');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent('run the tests', allReady);

    expect(decision).toMatchObject({ agent: 'codex', reason: expect.stringContaining('fallback') });
  });

  it('falls back to deterministic routing on invalid agent name', async () => {
    const child = fakeClaudeProcess('{"agent":"GPT-9000","reason":"ok"}');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent('review this design', allReady);

    expect(decision).toMatchObject({ agent: 'claude', reason: expect.stringContaining('fallback') });
  });

  it('does not offer busy agents to the routing prompt and falls back if one is selected', async () => {
    const child = fakeClaudeProcess('{"agent":"codex","reason":"run tests"}');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent(
      'review this design',
      { claude: 'ready', codex: 'busy', gemini: 'not-installed' },
    );

    const prompt = child.stdin.end.mock.calls[0][0];
    expect(prompt).toContain('- claude:');
    expect(prompt).not.toContain('- codex:');
    expect(decision).toMatchObject({ agent: 'claude', reason: expect.stringContaining('fallback') });
  });

  it('returns error without spawning Claude CLI when all agents are unavailable', async () => {
    const child = fakeClaudeProcess('{"agent":"claude","reason":"unused"}');
    const { chooseFacilitatorAgent, spawn } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent(
      'anything',
      { claude: 'unauthenticated', codex: 'unauthenticated', gemini: 'not-installed' },
    );

    expect(decision).toMatchObject({ error: expect.stringContaining('Veyra: Check agent status') });
    expect(decision).toMatchObject({ error: expect.stringContaining('Veyra: Show setup guide') });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('returns busy-specific guidance without spawning Claude CLI when every usable agent is busy', async () => {
    const child = fakeClaudeProcess('{"agent":"claude","reason":"unused"}');
    const { chooseFacilitatorAgent, spawn } = await importFacilitatorWithCli(child);

    const decision = await chooseFacilitatorAgent(
      'review this',
      { claude: 'busy', codex: 'busy', gemini: 'not-installed' },
    );

    expect(decision).toMatchObject({ error: expect.stringContaining('busy') });
    expect(decision).toMatchObject({ error: expect.stringContaining('wait') });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('falls back to deterministic routing when Claude CLI fails', async () => {
    const child = fakeClaudeProcess('');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child, 1, 'auth fail');

    const decision = await chooseFacilitatorAgent('implement the fix', allReady);

    expect(decision).toMatchObject({ agent: 'codex', reason: expect.stringContaining('fallback') });
  });

  it('passes shared context into the CLI routing prompt when provided', async () => {
    const child = fakeClaudeProcess('{"agent":"claude","reason":"r"}');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);
    const sharedContext = '[Conversation so far]\nuser: prior\n[/Conversation so far]';

    await chooseFacilitatorAgent('what next', allReady, sharedContext);

    const prompt = child.stdin.end.mock.calls[0][0];
    expect(prompt).toContain('Conversation so far');
    expect(prompt).toContain('user: prior');
    expect(prompt).toContain('what next');
  });

  it('omits shared-context block from the CLI routing prompt when sharedContext is empty', async () => {
    const child = fakeClaudeProcess('{"agent":"claude","reason":"r"}');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);

    await chooseFacilitatorAgent('hi', allReady, '');

    expect(child.stdin.end.mock.calls[0][0]).not.toContain('Recent conversation context');
  });

  it('keeps the facilitator CLI prompt ASCII-safe for extension-host logs', async () => {
    const child = fakeClaudeProcess('{"agent":"codex","reason":"run tests"}');
    const { chooseFacilitatorAgent } = await importFacilitatorWithCli(child);

    await chooseFacilitatorAgent('run the tests', allReady);

    const prompt = child.stdin.end.mock.calls[0][0];
    expect(prompt).toContain('codex: execution - running tests, scripts, terminal commands, file edits');
    expect(prompt).not.toMatch(/[^\x00-\x7F]/);
  });
});

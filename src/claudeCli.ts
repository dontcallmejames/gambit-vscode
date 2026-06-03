import { execSync, spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import type { AgentChunk } from './types.js';
import { DriftTracker } from './agents/driftWarning.js';
import { StderrTail } from './agents/stderrTail.js';

export interface ClaudeCliOptions {
  cwd?: string;
  permissionMode: 'default' | 'acceptEdits';
  /**
   * Tool names removed from Claude's context for this run (passed as
   * --disallowedTools). Used to enforce read-only by stripping the write tools,
   * so Claude cannot edit files at all rather than being asked not to.
   */
  disallowedTools?: string[];
  signal?: AbortSignal;
  onProcess?: (child: ChildProcess | null) => void;
}

export async function* runClaudeCli(
  prompt: string,
  opts: ClaudeCliOptions,
): AsyncIterable<AgentChunk> {
  let claudeCommand: { command: string; args: string[] };
  try {
    claudeCommand = resolveClaudeCommand();
  } catch (err) {
    yield { type: 'error', message: `Unable to start Claude CLI: ${errorMessage(err)}` };
    yield { type: 'done' };
    return;
  }

  let child: ChildProcess;
  try {
    const spawnOptions: SpawnOptions = { stdio: ['pipe', 'pipe', 'pipe'] };
    if (opts.cwd) spawnOptions.cwd = opts.cwd;
    child = spawn(
      claudeCommand.command,
      [
        ...claudeCommand.args,
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--permission-mode',
        opts.permissionMode,
        // Pass the disallowed tools as a single space-separated value so a
        // variadic parser can't swallow the flags that follow (there are none
        // here, but stay robust). A bare tool name removes it from context.
        ...(opts.disallowedTools && opts.disallowedTools.length > 0
          ? ['--disallowedTools', opts.disallowedTools.join(' ')]
          : []),
      ],
      spawnOptions,
    );
    opts.onProcess?.(child);
    // Guard against a late stdin EPIPE: if the CLI exits before reading the
    // prompt (early auth failure, a large prompt that fills the pipe while the
    // child dies), Node emits 'error' on the stdin stream. With no listener it
    // becomes an uncaughtException that can tear down the extension host. The
    // process exit is already surfaced via the close/error handlers below.
    child.stdin?.on('error', () => {});
    child.stdin?.end(prompt);
  } catch (err) {
    opts.onProcess?.(null);
    yield { type: 'error', message: `Unable to start Claude CLI: ${errorMessage(err)}` };
    yield { type: 'done' };
    return;
  }

  const onAbort = () => child.kill('SIGTERM');
  if (opts.signal) {
    if (opts.signal.aborted) child.kill('SIGTERM');
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  const exitPromise = new Promise<{ code: number | null; stderr: string; processError?: string }>((resolve) => {
    const stderr = new StderrTail();
    let settled = false;
    const finish = (code: number | null, processError?: string) => {
      if (settled) return;
      settled = true;
      resolve({ code, stderr: stderr.value(), processError });
    };
    child.stderr?.on('data', (d) => stderr.append(String(d)));
    child.on('error', (err) => finish(null, errorMessage(err)));
    child.on('close', (code) => finish(code));
  });

  const idToName = new Map<string, string>();
  let buffer = '';
  let sawDone = false;
  const drift = new DriftTracker();
  try {
    for await (const data of child.stdout!) {
      buffer += String(data);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        drift.observeLine(line);
        for (const chunk of parseClaudeJsonLine(line, idToName)) {
          drift.observeChunk();
          if (chunk.type === 'done') sawDone = true;
          yield chunk;
        }
      }
    }
    if (buffer.trim()) {
      drift.observeLine(buffer);
      for (const chunk of parseClaudeJsonLine(buffer, idToName)) {
        drift.observeChunk();
        if (chunk.type === 'done') sawDone = true;
        yield chunk;
      }
    }
  } catch (err) {
    yield { type: 'error', message: errorMessage(err) };
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const { code, stderr, processError } = await exitPromise;
  if (processError) {
    yield { type: 'error', message: `Claude process error: ${processError}` };
  } else if (code !== 0) {
    yield { type: 'error', message: `Claude exited with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}` };
  } else {
    const driftChunk = drift.driftChunk(true);
    if (driftChunk) yield driftChunk;
  }
  if (!sawDone) yield { type: 'done' };
  opts.onProcess?.(null);
}

function* mapClaudeEvent(event: unknown, idToName: Map<string, string>): Generator<AgentChunk> {
  if (typeof event !== 'object' || event === null) return;
  const e = event as {
    type: string;
    subtype?: string;
    message?: { content?: Array<Record<string, unknown>> };
    error?: string;
    text?: string;
    name?: string;
    input?: unknown;
    output?: unknown;
  };

  switch (e.type) {
    case 'system':
    case 'rate_limit_event':
      return;

    case 'assistant':
      for (const item of e.message?.content ?? []) {
        if (item.type === 'text' && typeof item.text === 'string') {
          yield { type: 'text', text: item.text };
        } else if (item.type === 'tool_use' && typeof item.name === 'string') {
          if (typeof item.id === 'string') {
            idToName.set(item.id, item.name);
          }
          yield { type: 'tool-call', name: item.name, input: item.input };
        }
      }
      return;

    case 'user':
      for (const item of e.message?.content ?? []) {
        if (item.type === 'tool_result') {
          const id = typeof item.tool_use_id === 'string' ? item.tool_use_id : '';
          const name = idToName.get(id) ?? id ?? 'unknown';
          yield { type: 'tool-result', name, output: item.content };
        }
      }
      return;

    case 'result':
      if (e.subtype === 'success') {
        yield { type: 'done' };
      } else if (e.subtype === 'error') {
        yield { type: 'error', message: e.error ?? 'Unknown error' };
        yield { type: 'done' };
      }
      return;

    case 'text':
      if (typeof e.text === 'string') yield { type: 'text', text: e.text };
      return;

    case 'tool-call':
      if (typeof e.name === 'string') yield { type: 'tool-call', name: e.name, input: e.input };
      return;

    case 'tool-result':
      if (typeof e.name === 'string') yield { type: 'tool-result', name: e.name, output: e.output };
      return;

    case 'error': {
      const msg = (event as { message?: unknown }).message;
      if (typeof msg === 'string') {
        yield { type: 'error', message: msg };
      }
      return;
    }

    case 'done':
      yield { type: 'done' };
      return;
  }
}

function* parseClaudeJsonLine(
  line: string,
  idToName: Map<string, string>,
): Generator<AgentChunk> {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    yield* mapClaudeEvent(JSON.parse(trimmed), idToName);
  } catch {
    return;
  }
}

function resolveClaudeCommand(): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command: 'claude', args: [] };
  }

  try {
    const output = execSync('where.exe claude.exe', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const command = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith('claude.exe'));
    if (command) return { command, args: [] };
  } catch {
    // fall through to a PATH lookup that can still work on non-standard installs
  }

  return { command: 'claude', args: [] };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

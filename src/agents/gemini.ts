import { spawn, execSync } from 'node:child_process';
import { accessSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import type { Agent, SendOptions } from './types.js';
import type { AgentChunk, AgentStatus } from '../types.js';
import { checkGemini } from '../statusChecks.js';
import { findNode } from '../findNode.js';
import { getAntigravityCliPathOverride, getGeminiCliPathOverride } from '../cliPathOverrides.js';
import { cliPathMisconfiguration, normalizeCliPathOverride, windowsNpmShimNames } from '../cliPathValidation.js';
import * as vscode from 'vscode';

type GoogleCliCommand =
  | { runtime: 'antigravity'; command: string; args: string[] }
  | { runtime: 'gemini'; command: string; args: string[] };

function resolveGoogleCommand(prompt: string): GoogleCliCommand {
  const antigravityCommand = resolveAntigravityCommand();
  if (!antigravityCommand) return { runtime: 'gemini', ...resolveGeminiCommand() };
  if (!isAntigravityPromptTooLargeForArgv(prompt)) return antigravityCommand;

  try {
    return { runtime: 'gemini', ...resolveGeminiCommand() };
  } catch (err) {
    throw new Error(antigravityArgvFailureMessage(prompt, err));
  }
}

function resolveAntigravityCommand(): GoogleCliCommand | null {
  const override = getAntigravityCliPathOverride();
  if (override) {
    assertCliPathAccessible(
      'antigravity',
      override,
      `Antigravity CLI path override not found at ${override}. Update VEYRA_ANTIGRAVITY_CLI_PATH or veyra.antigravityCliPath, or install Antigravity CLI from https://antigravity.google/cli.`,
    );
    return { runtime: 'antigravity', command: override, args: [] };
  }

  if (process.platform === 'win32') {
    const nativeCommand = resolveWindowsNativeExecutable('agy');
    if (nativeCommand) return { runtime: 'antigravity', ...nativeCommand };

    const installPath = resolveWindowsAntigravityInstallPath();
    if (!installPath) return null;
    const installStatus = inspectCliPath(installPath);
    if (installStatus === 'exists') return { runtime: 'antigravity', command: installPath, args: [] };
    if (installStatus === 'inaccessible') {
      throw new Error(`Cannot inspect ${installPath}. Check filesystem permissions or rerun outside the current sandbox.`);
    }
    return null;
  }

  if (commandExists('agy')) return { runtime: 'antigravity', command: 'agy', args: [] };
  const installPath = join(homedir(), '.local', 'bin', 'agy');
  const installStatus = inspectCliPath(installPath);
  if (installStatus === 'exists') return { runtime: 'antigravity', command: installPath, args: [] };
  if (installStatus === 'inaccessible') {
    throw new Error(`Cannot inspect ${installPath}. Check filesystem permissions or rerun outside the current sandbox.`);
  }
  return null;
}

// Spike A4: invoke `gemini -p '<prompt>' -o stream-json` for non-interactive JSONL.
//
// Windows quirk (worse than Codex): the npm shim `gemini.cmd` cannot be
// spawned cleanly on Node 20+ -- Node's DEP0190 mitigation rejects raw
// .cmd spawning, and shell:true introduces unsafe arg concatenation.
// The reliable approach is to invoke the bundle's JS entrypoint directly
// via the running Node executable, resolving the bundle path when a request
// starts so a missing CLI cannot break extension activation.
function resolveGeminiCommand(): { command: string; args: string[] } {
  const override = getGeminiCliPathOverride();
  if (override) {
    assertCliPathAccessible(
      'gemini',
      override,
      `Gemini CLI path override not found at ${override}. Update VEYRA_GEMINI_CLI_PATH or veyra.geminiCliPath, configure Antigravity with VEYRA_ANTIGRAVITY_CLI_PATH or veyra.antigravityCliPath, or install legacy Gemini CLI with \`npm install -g @google/gemini-cli\`, then run \`gemini\` once to sign in.`,
    );
    return cliPathCommand(override);
  }

  if (process.platform !== 'win32') {
    return { command: 'gemini', args: [] };
  }
  const nativeCommand = resolveWindowsNativeExecutable('gemini');
  if (nativeCommand) return nativeCommand;
  const shimCommand = resolveWindowsNpmShim('gemini');
  if (shimCommand) return shimCommand;

  const npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const bundle = join(npmRoot, '@google', 'gemini-cli', 'bundle', 'gemini.js');
  assertCliPathAccessible(
    'gemini',
    bundle,
    `Gemini CLI bundle not found at ${bundle}. Install Antigravity CLI from https://antigravity.google/cli, or install legacy Gemini CLI with \`npm install -g @google/gemini-cli\`, then run \`gemini\` once to sign in.`,
  );
  return { command: findNode(), args: [bundle] };
}

function resolveWindowsNpmShim(baseName: 'gemini'): { command: string; args: string[] } | null {
  for (const shimName of windowsNpmShimNames(baseName)) {
    let output: string;
    try {
      output = execSync(`where.exe ${shimName}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue;
    }

    const shimPath = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith(shimName));
    if (!shimPath) continue;

    const bundle = normalizeCliPathOverride(baseName, shimPath);
    const bundleStatus = inspectCliPath(bundle);
    if (bundleStatus === 'missing') continue;
    if (bundleStatus === 'inaccessible') {
      throw new Error(`Cannot inspect ${bundle}. Check filesystem permissions or rerun outside the current sandbox.`);
    }
    return { command: findNode(), args: [bundle] };
  }

  return null;
}

function resolveWindowsNativeExecutable(baseName: string): { command: string; args: string[] } | null {
  let output: string;
  try {
    output = execSync(`where.exe ${baseName}.exe`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }

  const expectedName = `${baseName}.exe`.toLowerCase();
  const command = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith(expectedName));
  if (!command) return null;
  const runtime = baseName === 'agy' ? 'antigravity' : 'gemini';
  assertCliPathAccessible(runtime, command, `${baseName}.exe not found at ${command}.`);
  return { command, args: [] };
}

function cliPathCommand(cliPath: string): { command: string; args: string[] } {
  if (/\.js$/i.test(cliPath)) {
    return { command: findNode(), args: [cliPath] };
  }
  return { command: cliPath, args: [] };
}

function assertCliPathAccessible(runtime: 'gemini' | 'antigravity', filePath: string, missingMessage: string): void {
  if (runtime === 'gemini' && isUnsupportedWindowsCommandShim(filePath)) {
    throw new Error('Windows npm command shim overrides are not supported; set VEYRA_GEMINI_CLI_PATH or veyra.geminiCliPath to the Gemini JS bundle or native executable instead.');
  }
  const misconfiguration = cliPathMisconfiguration(runtime, filePath);
  if (misconfiguration) {
    throw new Error(misconfiguration);
  }
  try {
    accessSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(`Cannot inspect ${filePath}. Check filesystem permissions or rerun outside the current sandbox.`);
    }
    throw new Error(missingMessage);
  }
}

function inspectCliPath(filePath: string): 'exists' | 'missing' | 'inaccessible' {
  try {
    accessSync(filePath);
    return 'exists';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') return 'inaccessible';
    return 'missing';
  }
}

function isUnsupportedWindowsCommandShim(filePath: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(filePath);
}

const GEMINI_BASE_ARGS = ['-o', 'stream-json'];
const GEMINI_AUTO_EDIT_ARGS = ['--approval-mode', 'auto_edit'];
const ANTIGRAVITY_PRINT_TIMEOUT_ARGS = ['--print-timeout', '5m0s'];
const ANTIGRAVITY_AUTO_EDIT_ARGS = ['--dangerously-skip-permissions'];
const ANTIGRAVITY_WINDOWS_PROMPT_ARG_LIMIT = 24_000;
const ANTIGRAVITY_UNIX_PROMPT_ARG_LIMIT = 120_000;

function geminiArgs(readOnly = false): string[] {
  const writeApproval = vscode.workspace.getConfiguration('veyra').get<string>('writeApproval', 'auto-edit');
  const extra = !readOnly && writeApproval === 'auto-edit' ? GEMINI_AUTO_EDIT_ARGS : [];
  return [...extra, ...GEMINI_BASE_ARGS];
}

function resolveWindowsAntigravityInstallPath(): string | null {
  try {
    const localAppData = execSync('powershell.exe -NoProfile -Command "[Environment]::GetFolderPath(\'LocalApplicationData\')"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!localAppData || !/[\\/]AppData[\\/]Local(?:[\\/]|$)/i.test(localAppData)) return null;
    return join(localAppData, 'agy', 'bin', 'agy.exe');
  } catch {
    return null;
  }
}

function antigravityArgs(prompt: string, readOnly = false): string[] {
  const writeApproval = vscode.workspace.getConfiguration('veyra').get<string>('writeApproval', 'auto-edit');
  const extra = !readOnly && writeApproval === 'auto-edit' ? ANTIGRAVITY_AUTO_EDIT_ARGS : [];
  return [...extra, ...ANTIGRAVITY_PRINT_TIMEOUT_ARGS, '--print', prompt];
}

function isAntigravityPromptTooLargeForArgv(prompt: string): boolean {
  const limit = process.platform === 'win32'
    ? ANTIGRAVITY_WINDOWS_PROMPT_ARG_LIMIT
    : ANTIGRAVITY_UNIX_PROMPT_ARG_LIMIT;
  return prompt.length > limit;
}

export class GeminiAgent implements Agent {
  readonly id = 'gemini' as const;
  private active: ChildProcess | null = null;

  async status(): Promise<AgentStatus> {
    return checkGemini();
  }

  async *send(prompt: string, opts: SendOptions = {}): AsyncIterable<AgentChunk> {
    let googleCommand: GoogleCliCommand;
    try {
      googleCommand = resolveGoogleCommand(prompt);
    } catch (err) {
      const message = errorMessage(err);
      yield {
        type: 'error',
        message: isAntigravityArgvFailureMessage(message) ? message : `Unable to start Gemini CLI: ${message}`,
      };
      yield { type: 'done' };
      return;
    }

    let child: ChildProcess;
    try {
      const runtimeArgs = googleCommand.runtime === 'antigravity'
        ? antigravityArgs(prompt, opts.readOnly)
        : geminiArgs(opts.readOnly);
      child = spawn(
        googleCommand.command,
        [...googleCommand.args, ...runtimeArgs],
        { cwd: opts.cwd, stdio: [googleCommand.runtime === 'antigravity' ? 'ignore' : 'pipe', 'pipe', 'pipe'] }
      );
      if (googleCommand.runtime === 'gemini') child.stdin?.end(prompt);
    } catch (err) {
      if (googleCommand.runtime === 'antigravity' && isArgvLaunchError(err)) {
        try {
          googleCommand = { runtime: 'gemini', ...resolveGeminiCommand() };
        } catch (fallbackErr) {
          yield { type: 'error', message: antigravityArgvFailureMessage(prompt, fallbackErr) };
          yield { type: 'done' };
          return;
        }
        try {
          child = spawn(
            googleCommand.command,
            [...googleCommand.args, ...geminiArgs(opts.readOnly)],
            { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] }
          );
          child.stdin?.end(prompt);
        } catch (fallbackStartErr) {
          yield { type: 'error', message: `Unable to start Gemini CLI: ${errorMessage(fallbackStartErr)}` };
          yield { type: 'done' };
          return;
        }
      } else {
        const label = googleCommand.runtime === 'antigravity' ? 'Antigravity CLI' : 'Gemini CLI';
        yield { type: 'error', message: `Unable to start ${label}: ${errorMessage(err)}` };
        yield { type: 'done' };
        return;
      }
    }
    this.active = child;

    const onAbort = () => child.kill('SIGTERM');
    if (opts.signal) {
      if (opts.signal.aborted) child.kill('SIGTERM');
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    const exitPromise = new Promise<{ code: number | null; stderr: string; processError?: string }>((resolve) => {
      let stderr = '';
      let settled = false;
      const finish = (code: number | null, processError?: string) => {
        if (settled) return;
        settled = true;
        resolve({ code, stderr, processError });
      };
      child.stderr?.on('data', (d) => (stderr += String(d)));
      child.on('error', (err) => finish(null, errorMessage(err)));
      child.on('close', (code) => finish(code));
    });

    if (googleCommand.runtime === 'antigravity') {
      try {
        for await (const data of child.stdout!) {
          const text = String(data);
          if (text) yield { type: 'text', text };
        }
      } catch (err) {
        yield { type: 'error', message: errorMessage(err) };
      } finally {
        opts.signal?.removeEventListener('abort', onAbort);
      }

      const { code, stderr, processError } = await exitPromise;
      if (processError) {
        yield { type: 'error', message: `Antigravity process error: ${processError}` };
      } else if (code !== 0) {
        yield { type: 'error', message: `Antigravity exited with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}` };
      }
      yield { type: 'done' };
      this.active = null;
      return;
    }

    let buffer = '';
    let sawDone = false;
    // Track tool_id → tool_name within this send() call so tool_result events
    // can resolve the friendly tool name (the tool_result event carries only tool_id).
    const toolNameById = new Map<string, string>();
    try {
      for await (const data of child.stdout!) {
        buffer += String(data);
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          for (const chunk of parseGeminiEvent(line, toolNameById)) {
            if (chunk.type === 'done') sawDone = true;
            yield chunk;
          }
        }
      }
      if (buffer.trim()) {
        for (const chunk of parseGeminiEvent(buffer, toolNameById)) {
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
      yield { type: 'error', message: `Gemini process error: ${processError}` };
    } else if (code !== 0) {
      yield { type: 'error', message: `Gemini exited with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}` };
    }
    if (!sawDone) yield { type: 'done' };
    this.active = null;
  }

  async cancel(): Promise<void> {
    this.active?.kill('SIGTERM');
  }
}

// Gemini stream-json event shapes from spike A4 + gemini-KXTGCWBT.js source analysis:
//   { type: 'init', timestamp, session_id, model }                            -> ignore
//   { type: 'message', role: 'user', content: '...' }                         -> ignore (user echo)
//   { type: 'message', role: 'assistant', content: '...', delta: true }       -> text chunk
//   { type: 'tool_use', timestamp, tool_name, tool_id, parameters }           -> tool-call chunk
//   { type: 'tool_result', timestamp, tool_id, status, output, error? }       -> tool-result chunk
//   { type: 'result', status: 'success', stats: {...} }                       -> done
//   { type: 'result', status: 'error', error: {...} }                         -> error (handled outside)
//   { type: 'error', severity, message }                                      -> non-fatal warning (ignore)
//
// Actual tool_use event shape captured from gemini-KXTGCWBT.js source:
//   {"type":"tool_use","timestamp":"...","tool_name":"write_file",
//    "tool_id":"call_abc123","parameters":{"file_path":"/abs/path/file.txt","content":"hello"}}
//
// Actual tool_result event shape:
//   {"type":"tool_result","timestamp":"...","tool_id":"call_abc123",
//    "status":"success","output":"Wrote 5 bytes"}
//
// Note: tool_result carries only tool_id (not tool_name). The toolNameById map
// is populated on tool_use and looked up here so the AgentChunk carries a
// friendly name consistent with what getEditedPath expects.
function* parseGeminiEvent(
  line: string,
  toolNameById: Map<string, string>,
): Generator<AgentChunk> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let event: {
    type?: string;
    role?: string;
    content?: string;
    delta?: boolean;
    status?: string;
    error?: unknown;
    // tool_use
    tool_name?: string;
    tool_id?: string;
    parameters?: unknown;
    // tool_result
    output?: unknown;
  };
  try {
    event = JSON.parse(trimmed);
  } catch {
    return; // ignore non-JSON lines (stderr warnings get filtered upstream)
  }
  switch (event.type) {
    case 'message':
      if (event.role === 'assistant' && typeof event.content === 'string') {
        yield { type: 'text', text: event.content };
      }
      return;
    case 'tool_use': {
      const name = typeof event.tool_name === 'string' ? event.tool_name : 'unknown_tool';
      const id = typeof event.tool_id === 'string' ? event.tool_id : '';
      if (id) toolNameById.set(id, name);
      yield { type: 'tool-call', name, input: event.parameters ?? {} };
      return;
    }
    case 'tool_result': {
      const id = typeof event.tool_id === 'string' ? event.tool_id : '';
      const name = toolNameById.get(id) ?? 'unknown_tool';
      yield { type: 'tool-result', name, output: event.output ?? null };
      return;
    }
    case 'result':
      if (event.status === 'success') {
        yield { type: 'done' };
      }
      return;
    default:
      return;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isArgvLaunchError(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code)
    : '';
  const message = errorMessage(err);
  return code === 'ENAMETOOLONG'
    || /\bENAMETOOLONG\b/iu.test(message)
    || /argument list too long/iu.test(message)
    || /command[- ]line.*too long/iu.test(message);
}

function antigravityArgvFailureMessage(prompt: string, fallbackError: unknown): string {
  return [
    `Antigravity CLI --print requires the prompt as a command-line argument and could not accept this prompt as a command-line argument (${prompt.length} characters).`,
    'Configure legacy Gemini CLI fallback with VEYRA_GEMINI_CLI_PATH or veyra.geminiCliPath, or shorten the request.',
    `Legacy Gemini fallback was unavailable: ${errorMessage(fallbackError)}`,
  ].join(' ');
}

function isAntigravityArgvFailureMessage(message: string): boolean {
  return message.startsWith('Antigravity CLI --print requires the prompt as a command-line argument');
}

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

const GEMINI_WRITE_TOOLS = new Set(['write_file', 'replace']);

export function getEditedPath(toolName: string, input: unknown): string | null {
  if (!GEMINI_WRITE_TOOLS.has(toolName)) return null;
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.file_path === 'string') return obj.file_path as string;
  if (typeof obj.path === 'string') return obj.path as string;
  return null;
}

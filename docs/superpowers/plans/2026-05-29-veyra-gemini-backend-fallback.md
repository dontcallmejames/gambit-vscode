# Resilient Gemini Backend Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Veyra's Gemini dispatch from silently stalling when it resolves to Antigravity (`agy`), which cannot be driven over a non-TTY pipe. Add a `veyra.gemini.backend` setting and make `auto` try Antigravity, detect zero streamed output, and transparently fall back to the legacy Gemini CLI.

**Architecture:** Refactor `GeminiAgent.send()` into a coordinator over two extracted async-generator runners — `runAntigravity` (plain-text `--print`, with a first-output watchdog that returns a `{producedOutput}` outcome via `yield*`) and `runGemini` (the existing `stream-json` path). The coordinator reads the setting and a per-instance "Antigravity unusable" cache, and on zero output either emits a text notice and falls back (auto) or emits an error (forced antigravity).

**Tech Stack:** TypeScript, Node `child_process.spawn`, Preact webview (unchanged), Vitest, VS Code extension manifest (`package.json` contributes).

**Branch:** `feat/gemini-backend-fallback` (already checked out; the design spec is committed there).

---

## File structure

- `src/geminiBackend.ts` — **new.** Reads the `veyra.gemini.backend` setting. One responsibility: resolve the backend preference.
- `src/agents/gemini.ts` — **modify.** Split `send()` into the coordinator + `runAntigravity` + `runGemini`; add the per-instance cache, the constructor timeout option, the notice/error constants, and the shortened `--print-timeout`.
- `src/statusChecks.ts` — **modify.** `checkGemini` honors the setting (`gemini` → legacy bundle/auth; `antigravity` → `agy`; `auto` → today's order).
- `package.json` — **modify.** Add the `veyra.gemini.backend` configuration property.
- `docs/user-guide.md`, `CHANGELOG.md` — **modify.** Document the setting (the manifest suite asserts documented settings).
- `tests/geminiBackend.test.ts` — **new.** Unit tests for the setting reader.
- `tests/agents/gemini.test.ts` — **modify.** Add fallback/coordinator tests; existing tests must stay green.
- `tests/statusChecks.test.ts` — **modify (or create if absent).** `checkGemini` honors the setting.
- `tests/manifest.test.ts` — **modify.** Assert the new setting + its docs.

---

## Task 1: Add the `veyra.gemini.backend` setting to the manifest

**Files:**
- Modify: `package.json` (`contributes.configuration.properties`)
- Test: `tests/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

Add this block inside the existing top-level `describe('extension manifest', ...)` in `tests/manifest.test.ts`:

```ts
  it('contributes the Gemini backend preference setting', () => {
    const properties = manifest.contributes.configuration.properties;
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');

    expect(properties['veyra.gemini.backend']).toMatchObject({
      type: 'string',
      enum: ['auto', 'antigravity', 'gemini'],
      default: 'auto',
    });
    expect(properties['veyra.gemini.backend'].description).toContain('Antigravity');
    expect(properties['veyra.gemini.backend'].description).toContain('legacy Gemini CLI');
    expect(userGuide).toContain('veyra.gemini.backend');
    expect(changelog).toContain('veyra.gemini.backend');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --environment node tests/manifest.test.ts -t "Gemini backend preference"`
Expected: FAIL (`properties['veyra.gemini.backend']` is `undefined`).

- [ ] **Step 3: Add the setting to `package.json`**

In `package.json`, inside `contributes.configuration.properties`, add this property next to the other `veyra.*` settings (alphabetical placement near `veyra.geminiCliPath` is fine):

```json
    "veyra.gemini.backend": {
      "type": "string",
      "enum": [
        "auto",
        "antigravity",
        "gemini"
      ],
      "default": "auto",
      "description": "Which CLI backs Veyra's Gemini agent. 'auto' tries Antigravity (agy) first and falls back to the legacy Gemini CLI when Antigravity returns no output (agy --print does not stream over a non-TTY pipe). 'antigravity' forces Antigravity only. 'gemini' forces the legacy Gemini CLI only."
    },
```

- [ ] **Step 4: Document the setting**

In `docs/user-guide.md`, in the `## Settings` section (find an existing `veyra.` setting bullet and add alongside it), add:

```markdown
- `veyra.gemini.backend` (`auto` | `antigravity` | `gemini`, default `auto`): which CLI backs the Gemini agent. `auto` tries Antigravity (`agy`) and falls back to the legacy Gemini CLI when Antigravity returns no output; `antigravity` and `gemini` force one backend.
```

In `CHANGELOG.md`, under the most recent/unreleased version heading, add a bullet:

```markdown
- Added `veyra.gemini.backend` so the Gemini agent falls back from Antigravity (`agy`, which cannot stream over a non-TTY pipe) to the legacy Gemini CLI instead of silently stalling.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --environment node tests/manifest.test.ts`
Expected: PASS (all manifest tests, including the new one).

- [ ] **Step 6: Commit**

```bash
git add package.json docs/user-guide.md CHANGELOG.md tests/manifest.test.ts
git commit -m "feat: contribute veyra.gemini.backend setting"
```

---

## Task 2: Add the backend-preference reader

**Files:**
- Create: `src/geminiBackend.ts`
- Test: `tests/geminiBackend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/geminiBackend.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('vscode', () => ({
  workspace: { getConfiguration: vi.fn(() => ({ get: getMock })) },
}));

import { getGeminiBackend } from '../src/geminiBackend.js';

afterEach(() => getMock.mockReset());

describe('getGeminiBackend', () => {
  it('defaults to auto when unset', () => {
    getMock.mockImplementation((_key: string, dflt: unknown) => dflt);
    expect(getGeminiBackend()).toBe('auto');
  });

  it('returns the configured value when valid', () => {
    getMock.mockReturnValue('gemini');
    expect(getGeminiBackend()).toBe('gemini');
    getMock.mockReturnValue('antigravity');
    expect(getGeminiBackend()).toBe('antigravity');
  });

  it('falls back to auto for an unrecognized value', () => {
    getMock.mockReturnValue('banana');
    expect(getGeminiBackend()).toBe('auto');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --environment node tests/geminiBackend.test.ts`
Expected: FAIL (`Cannot find module '../src/geminiBackend.js'`).

- [ ] **Step 3: Implement the reader**

Create `src/geminiBackend.ts`:

```ts
import * as vscode from 'vscode';

export type GeminiBackend = 'auto' | 'antigravity' | 'gemini';

export function getGeminiBackend(): GeminiBackend {
  try {
    const value = vscode.workspace.getConfiguration('veyra').get<string>('gemini.backend', 'auto');
    return value === 'antigravity' || value === 'gemini' ? value : 'auto';
  } catch {
    return 'auto';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --environment node tests/geminiBackend.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geminiBackend.ts tests/geminiBackend.test.ts
git commit -m "feat: add getGeminiBackend setting reader"
```

---

## Task 3: Add the constructor timeout option and per-instance cache (scaffolding)

This adds the new instance state without changing behavior yet, so the refactor in Task 5 has the fields it needs.

**Files:**
- Modify: `src/agents/gemini.ts`

- [ ] **Step 1: Add constants near the other module constants**

In `src/agents/gemini.ts`, find `const ANTIGRAVITY_PRINT_TIMEOUT_ARGS = ['--print-timeout', '5m0s'];` and replace the timeout value, and add the new constants below the existing arg constants:

```ts
const ANTIGRAVITY_PRINT_TIMEOUT_ARGS = ['--print-timeout', '1m30s'];
const ANTIGRAVITY_FIRST_OUTPUT_TIMEOUT_MS = 20_000;
const ANTIGRAVITY_EMPTY_OUTPUT_MESSAGE =
  'Antigravity produced no output; it may not support headless --print on this version. Set veyra.gemini.backend to "gemini" or "auto".';
const ANTIGRAVITY_FALLBACK_NOTICE =
  '_Antigravity produced no output; using the legacy Gemini CLI._\n\n';
```

- [ ] **Step 2: Add the import for the backend reader**

At the top of `src/agents/gemini.ts`, with the other local imports, add:

```ts
import { getGeminiBackend } from '../geminiBackend.js';
```

- [ ] **Step 3: Add the constructor option and instance fields**

Replace the class field/opening of `GeminiAgent`:

```ts
export class GeminiAgent implements Agent {
  readonly id = 'gemini' as const;
  private active: ChildProcess | null = null;
```

with:

```ts
export interface GeminiAgentOptions {
  /** First-output watchdog for Antigravity --print, in ms. Exposed for tests. */
  antigravityFirstOutputTimeoutMs?: number;
}

export class GeminiAgent implements Agent {
  readonly id = 'gemini' as const;
  private active: ChildProcess | null = null;
  /** null = untested this session, false = known unusable headless (skip it). */
  private antigravityHeadlessUsable: boolean | null = null;
  private readonly antigravityFirstOutputTimeoutMs: number;

  constructor(options: GeminiAgentOptions = {}) {
    this.antigravityFirstOutputTimeoutMs =
      options.antigravityFirstOutputTimeoutMs ?? ANTIGRAVITY_FIRST_OUTPUT_TIMEOUT_MS;
  }
```

- [ ] **Step 4: Verify it still compiles and existing tests pass**

Run: `npm run typecheck`
Expected: PASS (no type errors).
Run: `npx vitest run --environment node tests/agents/gemini.test.ts`
Expected: PASS (all existing Gemini tests; behavior unchanged — `send()` is untouched so far).

- [ ] **Step 5: Commit**

```bash
git add src/agents/gemini.ts
git commit -m "refactor: add GeminiAgent timeout option and headless cache field"
```

---

## Task 4: Write the failing coordinator/fallback tests

These tests describe the Task 5 behavior. They fail now because `send()` has no fallback. The existing tests in this file must keep passing.

**Files:**
- Modify: `tests/agents/gemini.test.ts`

- [ ] **Step 1: Expose the `getConfiguration` mock so tests can set the backend**

At the top of `tests/agents/gemini.test.ts`, replace the existing vscode mock:

```ts
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get: (_k: string, dflt: unknown) => dflt })),
  },
}));
```

with a controllable version:

```ts
const getConfigGet = vi.fn((_key: string, dflt: unknown) => dflt);
vi.mock('vscode', () => ({
  workspace: { getConfiguration: vi.fn(() => ({ get: getConfigGet })) },
}));

function setBackend(value: 'auto' | 'antigravity' | 'gemini') {
  getConfigGet.mockImplementation((key: string, dflt: unknown) =>
    key === 'gemini.backend' ? value : dflt);
}
```

Then add `getConfigGet.mockImplementation((_k, dflt) => dflt);` to the existing `afterEach` so each test starts at the `auto` default:

```ts
afterEach(() => {
  delete process.env.VEYRA_ANTIGRAVITY_CLI_PATH;
  getConfigGet.mockImplementation((_k: string, dflt: unknown) => dflt);
});
```

- [ ] **Step 2: Add a fake-process helper that never closes on its own (for the timeout path)**

Add below the existing `fakeProcessError` helper in `tests/agents/gemini.test.ts`:

```ts
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
```

- [ ] **Step 3: Add the coordinator tests**

Add these tests inside `describe('GeminiAgent', ...)`:

```ts
  it('auto: falls back to legacy Gemini with a notice when Antigravity yields no output', async () => {
    process.env.VEYRA_ANTIGRAVITY_CLI_PATH = 'D:\\tools\\agy\\agy.exe';
    setBackend('auto');
    // 1st spawn = Antigravity, empty + exit 0; 2nd spawn = legacy Gemini with a response.
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
      .mockReturnValueOnce(fakeProcess([], 0)) // 1st send: antigravity empty
      .mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n'])) // 1st send: gemini
      .mockReturnValueOnce(fakeProcess(['{"type":"result","status":"success"}\n'])); // 2nd send: gemini only

    const agent = new GeminiAgent();
    for await (const _c of agent.send('one', { readOnly: true } as any)) { /* drain */ }
    const before = mockedSpawn.mock.calls.length; // 2 (antigravity + gemini)
    for await (const _c of agent.send('two', { readOnly: true } as any)) { /* drain */ }

    expect(before).toBe(2);
    // Second send spawns only once (gemini); antigravity skipped via cache.
    expect(mockedSpawn.mock.calls.length).toBe(3);
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run --environment node tests/agents/gemini.test.ts`
Expected: the six new tests FAIL (current `send()` has no coordinator/fallback — e.g., it spawns once, never falls back). Existing tests still pass.

---

## Task 5: Refactor `send()` into a coordinator + `runAntigravity` + `runGemini`

**Files:**
- Modify: `src/agents/gemini.ts`

- [ ] **Step 1: Add the Antigravity resolution helper**

In `src/agents/gemini.ts`, add this helper next to `resolveGoogleCommand` (it reuses the existing `resolveAntigravityCommand` and `isAntigravityPromptTooLargeForArgv`):

```ts
// Returns the Antigravity command when it is available and the prompt fits in
// argv for --print; otherwise null (caller decides: fall back or error).
// Throws only when an Antigravity path override is present but inaccessible.
function resolveAntigravityForPrompt(prompt: string): GoogleCliCommand | null {
  const command = resolveAntigravityCommand();
  if (!command) return null;
  if (isAntigravityPromptTooLargeForArgv(prompt)) return null;
  return command;
}
```

- [ ] **Step 2: Replace `send()` with the coordinator**

Replace the entire current `async *send(prompt, opts = {}) { ... }` method body (from `async *send` through its closing brace, before `async cancel()`) with:

```ts
  async *send(prompt: string, opts: SendOptions = {}): AsyncIterable<AgentChunk> {
    const backend = getGeminiBackend();
    const considerAntigravity = backend !== 'gemini' && this.antigravityHeadlessUsable !== false;

    if (considerAntigravity) {
      let antigravityCommand: GoogleCliCommand | null;
      try {
        antigravityCommand = resolveAntigravityForPrompt(prompt);
      } catch (err) {
        if (backend === 'antigravity') {
          yield { type: 'error', message: `Unable to start Antigravity CLI: ${errorMessage(err)}` };
          yield { type: 'done' };
          return;
        }
        antigravityCommand = null; // auto: treat as unavailable and fall through to legacy Gemini
      }

      if (antigravityCommand) {
        const outcome = yield* this.runAntigravity(antigravityCommand, prompt, opts);
        if (outcome.producedOutput) {
          yield { type: 'done' };
          return;
        }
        this.antigravityHeadlessUsable = false;
        if (backend === 'antigravity') {
          yield { type: 'error', message: outcome.error ?? ANTIGRAVITY_EMPTY_OUTPUT_MESSAGE };
          yield { type: 'done' };
          return;
        }
        yield { type: 'text', text: ANTIGRAVITY_FALLBACK_NOTICE };
      } else if (backend === 'antigravity') {
        yield { type: 'error', message: ANTIGRAVITY_EMPTY_OUTPUT_MESSAGE };
        yield { type: 'done' };
        return;
      }
    }

    yield* this.runGemini(prompt, opts);
  }

  private async *runAntigravity(
    command: GoogleCliCommand,
    prompt: string,
    opts: SendOptions,
  ): AsyncGenerator<AgentChunk, { producedOutput: boolean; error?: string }> {
    let child: ChildProcess;
    try {
      child = spawn(
        command.command,
        [...command.args, ...antigravityArgs(prompt, opts.readOnly)],
        { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      return { producedOutput: false, error: `Unable to start Antigravity CLI: ${errorMessage(err)}` };
    }
    this.active = child;

    const onAbort = () => child.kill('SIGTERM');
    if (opts.signal) {
      if (opts.signal.aborted) child.kill('SIGTERM');
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    let producedOutput = false;
    let firstOutputTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!producedOutput) child.kill('SIGTERM');
    }, this.antigravityFirstOutputTimeoutMs);
    const clearFirstOutputTimer = () => {
      if (firstOutputTimer) {
        clearTimeout(firstOutputTimer);
        firstOutputTimer = null;
      }
    };

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

    try {
      for await (const data of child.stdout!) {
        const text = String(data);
        if (text) {
          producedOutput = true;
          clearFirstOutputTimer();
          yield { type: 'text', text };
        }
      }
    } catch (err) {
      if (producedOutput) yield { type: 'error', message: errorMessage(err) };
    } finally {
      clearFirstOutputTimer();
      opts.signal?.removeEventListener('abort', onAbort);
    }

    const { code, stderr, processError } = await exitPromise;
    this.active = null;

    if (producedOutput) {
      if (processError) {
        yield { type: 'error', message: `Antigravity process error: ${processError}` };
      } else if (code !== 0) {
        yield { type: 'error', message: `Antigravity exited with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}` };
      }
      return { producedOutput: true };
    }
    return { producedOutput: false };
  }
```

- [ ] **Step 3: Add `runGemini` by moving the existing legacy-Gemini code**

The old `send()` had a legacy-Gemini branch: resolve the gemini command, `spawn` with `stdio: ['pipe','pipe','pipe']`, `child.stdin?.end(prompt)`, then the `let buffer = ''; let sawDone = false; const toolNameById = ...` streaming loop that calls `parseGeminiEvent`, ending with `if (!sawDone) yield { type: 'done' }; this.active = null;`. Move that logic verbatim into a new private method below `runAntigravity`:

```ts
  private async *runGemini(prompt: string, opts: SendOptions): AsyncGenerator<AgentChunk> {
    let command: { command: string; args: string[] };
    try {
      command = resolveGeminiCommand();
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
      child = spawn(
        command.command,
        [...command.args, ...geminiArgs(opts.readOnly)],
        { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      child.stdin?.end(prompt);
    } catch (err) {
      yield { type: 'error', message: `Unable to start Gemini CLI: ${errorMessage(err)}` };
      yield { type: 'done' };
      return;
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

    let buffer = '';
    let sawDone = false;
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
```

- [ ] **Step 4: Remove now-dead code**

The old `send()` body is gone. Confirm these are no longer referenced anywhere in the file and delete them if unused: `resolveGoogleCommand` (replaced by `resolveAntigravityForPrompt` + the coordinator), the argv-relaunch `try/catch` that re-spawned gemini, and `antigravityArgvFailureMessage`/`isArgvLaunchError` **only if** they are no longer referenced. Keep `isAntigravityArgvFailureMessage` (used by `runGemini`). Run `npm run typecheck` and remove whatever it flags as unused (`noUnusedLocals`).

- [ ] **Step 5: Run the Gemini tests**

Run: `npx vitest run --environment node tests/agents/gemini.test.ts`
Expected: PASS — all existing tests AND the six Task 4 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/agents/gemini.ts tests/agents/gemini.test.ts
git commit -m "feat: Antigravity->legacy Gemini fallback with zero-output detection"
```

---

## Task 6: Make `checkGemini` honor the setting

**Files:**
- Modify: `src/statusChecks.ts`
- Test: `tests/statusChecks.test.ts` (add to it if it exists; otherwise create it)

- [ ] **Step 1: Write the failing test**

If `tests/statusChecks.test.ts` does not exist, create it with this skeleton; if it exists, add the `describe` block and reuse its existing mocks (it will already mock `vscode`, `node:child_process`, `node:fs`). Skeleton:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const getConfigGet = vi.fn((_key: string, dflt: unknown) => dflt);
vi.mock('vscode', () => ({
  workspace: { getConfiguration: vi.fn(() => ({ get: getConfigGet })) },
}));
vi.mock('node:child_process', () => ({ execSync: vi.fn(() => '') }));
vi.mock('node:fs', () => ({ accessSync: vi.fn() }));

import { checkGemini, clearStatusCache } from '../src/statusChecks.js';
import { execSync } from 'node:child_process';
const mockedExecSync = execSync as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  clearStatusCache();
  getConfigGet.mockImplementation((_k: string, dflt: unknown) => dflt);
  mockedExecSync.mockReset();
});

describe('checkGemini backend preference', () => {
  it('skips Antigravity when backend is forced to gemini', async () => {
    getConfigGet.mockImplementation((key: string, dflt: unknown) =>
      key === 'gemini.backend' ? 'gemini' : dflt);
    // where.exe agy.exe would resolve agy, but the forced gemini path must ignore it.
    mockedExecSync.mockImplementation((cmd: string) => {
      if (/agy\.exe/i.test(cmd)) return 'C:/agy/bin/agy.exe\n';
      throw new Error('not found');
    });

    const status = await checkGemini();
    // With agy ignored and no legacy gemini bundle resolvable, status must not be the
    // optimistic Antigravity "ready"; it reflects the legacy path (not-installed here).
    expect(status).toBe('not-installed');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --environment node tests/statusChecks.test.ts -t "backend preference"`
Expected: FAIL (`checkGemini` returns `'ready'` because it resolves `agy` regardless of the setting).

- [ ] **Step 3: Implement**

In `src/statusChecks.ts`, add the import at the top:

```ts
import { getGeminiBackend } from './geminiBackend.js';
```

In `checkGemini`, change the start of the memoized callback so the Antigravity branch is gated on the setting:

```ts
export async function checkGemini(): Promise<AgentStatus> {
  return memoize('gemini', async () => {
    const backend = getGeminiBackend();
    if (backend !== 'gemini') {
      const antigravity = resolveAntigravityCli();
      if (antigravity !== null) {
        if (antigravity) {
          if (cliPathMisconfiguration('antigravity', antigravity)) return 'misconfigured';
          const antigravityStatus = inspectPath(antigravity);
          if (antigravityStatus === 'inaccessible') return 'inaccessible';
          if (antigravityStatus === 'missing') return 'not-installed';
        }
        return 'ready';
      }
      if (backend === 'antigravity') return 'not-installed';
    }

    const bundle = resolveGeminiBundle();
    // ... unchanged legacy-Gemini checks below ...
```

Leave the rest of the function (the `resolveGeminiBundle()` block through the `oauth_creds.json` auth check) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --environment node tests/statusChecks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/statusChecks.ts tests/statusChecks.test.ts
git commit -m "feat: checkGemini honors veyra.gemini.backend"
```

---

## Task 7: Full verify and manual confirmation

**Files:** none (verification only)

- [ ] **Step 1: Run the full verification**

Run: `npm run verify`
Expected: PASS (typecheck, unit tests, build, package dry-run 20 files, integration tests, `git diff --check`). Fix any fallout before continuing.

- [ ] **Step 2: Manual Extension Host check (with `agy` enabled on PATH)**

Press F5 to launch the Extension Host. Open the demo workspace `C:\Users\jford\Projects\veyra-demo`. Send `@all give one sentence on input validation`.
Expected: Gemini no longer silently stalls. With `veyra.gemini.backend` at its `auto` default, Gemini shows the italic notice `Antigravity produced no output; using the legacy Gemini CLI.` followed by a real response. Set `veyra.gemini.backend` to `gemini` and resend; Gemini responds with no notice and no `agy` spawn.

- [ ] **Step 3: Final commit if any verify fixups were needed**

```bash
git add -A
git commit -m "chore: verify resilient Gemini backend fallback"
```

---

## Self-review

**Spec coverage:**
- Setting `veyra.gemini.backend` (auto/antigravity/gemini, default auto) → Task 1.
- Zero-output signal (first-output timeout OR empty exit) → Task 5 `runAntigravity` (`firstOutputTimer` + `producedOutput` checked after exit).
- 20s constant + per-session cache + `--print-timeout` 90s (`1m30s`) → Tasks 3 & 5.
- Coordinator + `runAntigravity`/`runGemini` split → Task 5.
- auto fallback notice (text) vs forced-antigravity error → Task 5 coordinator; tests in Task 4.
- `checkGemini` honors the setting → Task 6.
- Tests with fake spawn → Tasks 4 & 6. Docs (user-guide + changelog) → Task 1.

**Deviation from spec (intentional):** the spec described the fallback notice as "a system message at info/warning severity." `GeminiAgent` only yields `AgentChunk`s and cannot emit a `SystemMessage` directly, so the notice ships as a `text` chunk (a visible italic note prepended to the legacy-Gemini response) and the forced-antigravity failure as an `error` chunk. Same user-visible outcome, no protocol/webview changes. Flag this to the reviewer.

**Placeholder scan:** none — every code step contains complete code or a precise move instruction with the exact source.

**Type consistency:** `GeminiBackend` ('auto'|'antigravity'|'gemini') is used in `geminiBackend.ts`, `gemini.ts`, and `statusChecks.ts`. `runAntigravity` returns `{ producedOutput: boolean; error?: string }`, consumed by `send()` via `yield*`. `antigravityHeadlessUsable` and `antigravityFirstOutputTimeoutMs` are defined in Task 3 and used in Task 5. `GeminiAgentOptions` is the constructor type used in the Task 4 timeout test.

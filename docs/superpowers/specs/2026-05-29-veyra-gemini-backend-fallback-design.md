# Veyra Resilient Gemini Backend — Design

## Goal & Non-Goals

**Goal:** Stop Veyra's Gemini dispatch from silently stalling when it resolves to a backend that cannot be driven headlessly. Add a `veyra.gemini.backend` preference and make `auto` try Antigravity, detect when it produces no output, and fall back to the legacy Gemini CLI, replacing the silent stall with a clear notice.

**Non-Goals:**
- Fixing Antigravity (`agy`) itself. It is a closed Google binary; its `--print` mode not emitting to a non-TTY pipe is an upstream limitation.
- Spawning `agy` inside a pseudo-terminal (ConPTY/node-pty). That would add a native dependency and require screen-scraping a redrawing TUI instead of parsing a clean stream. Out of scope.
- Changing how Claude or Codex resolve or run.

## Background: the root cause

On Windows, `resolveGoogleCommand` in `src/agents/gemini.ts` prefers Antigravity (`agy.exe`) whenever it resolves, and only reaches the legacy `gemini` CLI when Antigravity is absent. Veyra spawns the backend with plain pipes (`stdio: ['ignore', 'pipe', 'pipe']` for Antigravity) and reads `child.stdout`.

`agy --print "<prompt>"` produces no output when stdout is a non-TTY pipe — it blocks at startup and never even writes its `--log-file`. This reproduces on both `agy` 1.0.2 and 1.0.3, so it is not a version regression; `agy` needs a real console/PTY. The legacy `gemini` CLI streams `stream-json` line by line over a pipe and works headlessly.

Two failure modes compound today:
1. **No early detection.** The 60s hang watchdog in `src/veyraService.ts` only emits a warning; it never cancels, so a dead backend ties up the floor.
2. **Empty exit treated as success.** When `agy` exits `0` with no output, `GeminiAgent` yields `done` with no error, so Gemini shows "complete" but blank.

The result: anyone whose Gemini resolves to Antigravity gets a silent, unexplained stall.

## The setting

`veyra.gemini.backend`, enum, default `"auto"`:

- `"auto"` — try Antigravity; if it produces no output, fall back to the legacy Gemini CLI.
- `"antigravity"` — use Antigravity only. No fallback.
- `"gemini"` — use the legacy Gemini CLI only. Never spawn `agy`.

`auto` is the default so existing installs self-heal without configuration. The forced values are escape hatches: `gemini` for users who want to skip `agy` outright, `antigravity` for users who drive `agy` through a terminal that does provide a console.

## The failure signal: zero output

An Antigravity run counts as failed when it produces **zero output chunks** — no `text`, `tool-call`, or `tool-result` (the `init` and `done` events do not count) — under either condition:

1. **First-output timeout.** No output chunk arrives within `ANTIGRAVITY_FIRST_OUTPUT_TIMEOUT_MS` (a constant, starting at 20000ms).
2. **Empty exit.** The process exits having emitted zero output chunks.

Zero-output is the correct signal because it is side-effect-safe: a backend that emits nothing also edits nothing, so re-running on the legacy CLI cannot duplicate work or changes. If Antigravity emits any output chunk, Veyra never falls back. The run is working, just possibly slow, and the existing 60s hang warning still applies.

The 20s timeout is deliberately generous: `agy` is agentic and can take a while before its first token, so a shorter value risks falling back on a slow but working run. The per-session cache (below) means only the first Gemini call in a session ever waits the full timeout.

`agy`'s `--print-timeout` drops from `5m0s` to `90s` so a genuinely hung process cannot linger for five minutes.

## Resolution and coordination

Refactor `GeminiAgent.send()` (currently one large method) into a coordinator over two extracted per-runtime runners. This keeps each runner focused and independently testable.

- `runAntigravity(command, prompt, opts)` — async generator, the current Antigravity branch lifted out, plus a first-output timeout that aborts the child (`SIGTERM`) and reports a zero-output outcome.
- `runGemini(command, prompt, opts)` — async generator, the current legacy-Gemini branch lifted out.
- `GeminiAgent.send()` — coordinator that reads `veyra.gemini.backend` and the per-session cache, then:
  - **auto:** resolve Antigravity. A resolution throw means an explicitly-configured Antigravity override is broken, so surface the error in both auto and forced modes and stop, letting the user fix their config rather than silently falling back. Auto falls back to the legacy Gemini CLI only when Antigravity is cleanly unavailable (resolution returns null) or produces no output. When resolution returns null, run `runGemini`. Otherwise run `runAntigravity`; if it returns the zero-output outcome, emit a fallback notice, set the per-session flag `antigravityHeadlessUsable = false`, and run `runGemini` with the same prompt and options. If Antigravity produced output, stream it through unchanged.
  - **antigravity:** run `runAntigravity` only. On zero-output, emit a clear error (below). No fallback.
  - **gemini:** run `runGemini` only. `agy` is never spawned.

**Per-session cache.** Once `antigravityHeadlessUsable` is `false`, later `send()` calls in the same `GeminiAgent` instance (one per session) skip Antigravity entirely, so the 20s wait is paid at most once per session. A window reload resets it.

`resolveGoogleCommand` gains the backend preference and the cache flag as inputs so it can short-circuit to the legacy CLI when forced or when Antigravity is already known-unusable.

## Error and notice UX

These replace today's silent "complete but blank":

- **auto fallback** → a system message at `info`/`warning` severity: *"Antigravity produced no output within 20s — falling back to the legacy Gemini CLI."* Work continues on the legacy CLI; this is not an error.
- **forced antigravity, empty** → a system `error`: *"Antigravity produced no output; it may not support headless `--print` on this version. Set `veyra.gemini.backend` to `gemini` or `auto`."*

## Status check

`checkGemini` in `src/statusChecks.ts` honors the setting:

- `gemini` → check the legacy bundle and auth; skip `agy`.
- `antigravity` → check `agy` presence.
- `auto` → current behavior (`agy` if present, else legacy). Status stays optimistic because headless-usability cannot be determined without running the binary; the runtime fallback is the safety net.

## Testing

Unit tests with a fake spawn (no real CLI):

- auto + Antigravity yields zero output → `runGemini` is invoked, a fallback notice is emitted, and the per-session flag is set so a second call skips `agy`.
- auto + Antigravity yields output → no fallback; output streams through.
- forced antigravity + zero output → error emitted, no fallback.
- forced gemini → `agy` is never spawned.
- `resolveGoogleCommand` honors each setting value and the cache flag.

The existing `parseGeminiEvent` stream-json tests stay as-is. Add a `manifest.test.ts` assertion for the new setting, and the user-guide and changelog lines the manifest suite already requires for documented settings.

## Out of scope

- Fixing or PTY-wrapping `agy` (see Non-Goals). An upstream bug report to Antigravity is a separate, optional follow-up.
- A user-configurable first-output timeout. The constant is tunable in code; promote it to a setting only if a real need appears.
- Probing headless-usability from `checkGemini` by running `agy`. Too slow and side-effecting for a status check.

## Verification

`npm run verify` green (typecheck, unit + integration, build, package dry-run, `git diff --check`). The live path (Antigravity resolving, stalling, and falling back to a working legacy Gemini response) is confirmed manually in the Extension Host with `agy` on PATH.

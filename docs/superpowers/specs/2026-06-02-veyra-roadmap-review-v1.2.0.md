# Veyra Roadmap Review — v1.2.0 (multi-agent audit)

**Date:** 2026-06-02
**Method:** Five independent reviewers (security, architecture, competitive, UX/product, reliability) audited the codebase + product in parallel, then a synthesis lead consolidated and re-verified headline claims against source.
**Status:** Findings + proposed direction. Not a commitment; input for sequencing the next cycles.

## Executive summary

Veyra v1.2.0 is a genuinely well-built product with a clear, defensible identity — neutral cross-vendor orchestration of Claude / Codex / Gemini / Antigravity, fully local, no telemetry — and a real moat single-vendor competitors structurally cannot copy: `/debate` and `/consensus` "model council" across three different vendors. The code has good bones: argv-only spawning (no `shell:true` anywhere in `src/`), a strict nonce-gated webview CSP, no egress code, a typed extension↔webview protocol, a disciplined CSS token system, and an unusually careful process layer. 906 tests back it.

This is **not** a "fix the foundations or it falls over" situation. It is a maturing product with a small set of sharp, mostly-confirmed gaps. The honest tension is between the product's two strongest reviewers: Competitive Research wants to lean into multi-agent ambition and ship a flashier blind-consensus feature, while Security and Reliability flag that the very surfaces that make Veyra powerful (spawning filesystem/shell-capable CLIs, write-capable agents fed repo-controlled content, full-workspace snapshotting) currently run with no Workspace Trust gate, detect-after-the-fact read-only enforcement, and a stdin error path that can crash the extension host. For a local-first/trust-branded tool, the right call is to spend the next cycle hardening the trust + robustness story — that *is* the competitive positioning — and ship the blind-consensus feature on top of a hardened base, not instead of it.

## Cross-cutting observations

1. **The same four files are the security surface, the reliability surface, AND the maintainability problem.** `src/agents/codex.ts`, `src/agents/gemini.ts`, `src/claudeCli.ts`, and `src/statusChecks.ts` are where read-only enforcement lives (Security), where the stdin-EPIPE and schema-drift bugs live (Reliability), and the 2–3×-duplicated launch layer (Architecture). That convergence is the strongest argument for a shared `cliRuntime` extraction: every near-term fix lands there, so consolidating first means each fix lands once instead of four times — and the status path stops being able to disagree with the launch path.

2. **"Detect-after-the-fact" is a recurring philosophy that Security and Reliability both flag as the core weakness.** Read-only violations, schema drift, and corruption are all noticed post-hoc (workspace diffing, silent event-drop, catch-and-reset) rather than prevented or surfaced at the moment of failure. The unifying remedy is the same shape everywhere — convert silent post-hoc detection into either prevention (positive read-only flags, Workspace Trust gate) or a visible signal (parsed-0-chunks warning, corrupt-file backup).

3. **The things done right erode silently without tests.** argv-only spawning, the strict nonce CSP, zero egress, the typed protocol, the token system, the Antigravity watchdog — these are invariants worth locking in with CI assertions, which pairs naturally with the (missing) CI work.

---

## Risk register (most serious findings, all source-verified)

| # | Risk | Evidence | Severity |
|---|------|----------|----------|
| R1 | **Extension-host crash via unhandled stdin EPIPE** — all three write-to-stdin agents call `child.stdin?.end(prompt)` with no `error` listener, and there is no global `uncaughtException`/`unhandledRejection` handler anywhere in `src/`. A CLI that dies before reading a large prompt (auth fail, big `/implement` prompt filling the pipe buffer) becomes an uncaught exception that can tear down the host or wedge the dispatch. | `src/claudeCli.ts:55`, `src/agents/codex.ts:173`, `src/agents/gemini.ts:399`; no global handler (grep) | **High** |
| R2 | **No Workspace Trust gating** — `package.json` declares no `capabilities.untrustedWorkspaces`; `isTrusted` is read only in the diagnostic report. Opening a malicious repo + sending any prompt spawns filesystem/shell CLIs, and onboarding auto-reads/appends `.gitignore` and creates `veyra.md`. | no `untrustedWorkspaces` in `package.json`; `isTrusted` at `src/extension.ts:426-428` only | **High** |
| R3 | **Read-only is detect-after-the-fact for everyone but Claude** — only Claude prevents writes (strips Edit/Write/MultiEdit/NotebookEdit via `--disallowedTools`). Codex/Gemini/Antigravity merely omit a write flag and rely on the third-party CLI default; the only backstop is a post-hoc workspace diff that fires a notice *after* a write lands. `withSuppressedWrites`/`rollback` only trims the in-memory message log, not workspace files. | `src/agents/claude.ts:24-29`; `codex.ts:140-145`; `gemini.ts:206-210,225-229`; `veyraService.ts:1028-1057`; `sessionStore.ts:29,88` | **High** |
| R4 | **Silent CLI schema drift** — every parser drops unknown events and returns nothing on `JSON.parse` failure, so a vendor renaming a field produces a "complete but blank" turn with no error and no diagnostic. The same failure class the Antigravity fallback fixed, now latent for Codex/Claude. The live tests that would catch it are opt-in and not in any CI. | `parseCodexEvent` `codex.ts:266`; `parseGeminiEvent` `gemini.ts:480`; `mapClaudeEvent` `claudeCli.ts:119` | **High** |
| R5 | **Full-workspace double-walk on every write dispatch, `.gitignore` ignored** — both `checkpoints` and `diffPreview` default true, so `/implement` triggers two independent full-tree walks + hash + copy before the agent emits a token. Hardcoded exclusions (`.git`, `node_modules`, `dist`, `.vscode/veyra`) miss `build/`, `target/`, `.next/`, `venv/`, media. Multi-second-to-minute freeze on a large repo, on the flagship workflow. | `veyraService.ts:570,582`; `changeLedger.ts:70,533`; `checkpointLedger.ts:87,430` | **High** |
| R6 | **Prompt-injection-to-write path** — repo-controlled content (`veyra.md`, `@file`, `@codebase`, other agents' output) flows unfenced into the write-capable Codex turn in `/implement`. No provenance fencing beyond bracket labels. Combined with no Trust gate and shell staying available, a malicious repo has a plausible "open + prompt → disk mutation" path. | `readWorkspaceRules`/`composePrompt`; `fileMentions.ts` `embedFiles`; `veyraService.ts:388` | **Medium** |
| R7 | **Bash/shell stays available in every read-only mode** — `echo > file`, `sed -i`, `git checkout`, curl-exfil bypass the write-tool stripping; Codex `command_execution` is excluded from write-tracking and Gemini's write set is only `{write_file, replace}`, so a shell-driven write is neither blocked nor counted by the violation detector. | `claude.ts:24-29`; `codex.ts:309-312,337`; `gemini.ts:563` | **Medium** |

---

## Findings by lens

### Security & Trust

Strong baseline: every spawn uses argv arrays (no `shell:true` in `src/`), CLI path overrides are validated against expected basenames and Windows `.cmd`/`.bat`/`.ps1` shims are explicitly rejected, the webview CSP is strict (`default-src 'none'`, nonce-gated, no `connect-src`), and there is no outbound network/telemetry code — **the local-first/no-upload claim holds up against the code.** Weak spots:

- **No Workspace Trust gating** (R2). *Rec:* declare `capabilities.untrustedWorkspaces: { supported: 'limited' }` and short-circuit dispatch + verification + commit-hook install + onboarding writes when `!isTrusted`. Clearest enterprise gate. **(M)**
- **Read-only is detect-after-the-fact** (R3). *Rec:* pass explicit positive read-only flags (e.g. Codex `--sandbox read-only`); treat a detected violation as a hard cancel, not a notice. **(M)**
- **Bash stays available in read-only** (R7). *Rec:* strip/deny the shell tool for read-only dispatches, or feed `command_execution` events into the violation detector. **(M)**
- **Verification runner executes script bodies the approval modal never shows** — the modal shows `npm test`, but the package.json script body (`node ./exfil.js && curl ...`) passes the narrow deny-list regex. *Rec:* show the resolved `hint.script` body in the modal; prefer allow-list; skip in untrusted workspaces. `terminalAwareness.ts:225-289,314,442` **(S)**
- **Antigravity read-only relies on a flag being *absent*** — no affirmative read-only/plan flag. *Rec:* pass a positive read-only flag; add a regression test asserting it. `gemini.ts:197,225-229` **(S)**
- **Prompt-injection surface** (R6). *Rec:* untrusted-content fencing (mark embedded file/@codebase/git/other-agent content as data, not instructions). **(M)**
- **Interpreter resolution shells `where.exe`/`powershell.exe` and launches PATH-derived executables** — not injectable (constant args, name-guarded), residual PATH-hijack risk. *Rec:* prefer `where.exe`-returned absolute paths; Workspace Trust mitigates in practice. `gemini.ts:212-223`, `findNode.ts:33-45` **(S, low)**
- **Positive controls worth locking in with CI tests** — argv-only spawning, strict nonce CSP, no egress, but path checks are not symlink-aware (a symlink inside the workspace pointing out could let a write/restore escape). *Rec:* CI assertions (no `shell:true`, CSP has no `connect-src`, no net client imported); `realpath`-check before ledger write/restore. **(S, idea)**

### Architecture & Codebase Health

~18k-line TS extension with good bones (clean `Agent` interface, typed protocol, token system, immutable reducer). Risk concentrates in two areas:

- **No CI, no linter, no formatter** for a shipped Marketplace extension with 906 tests — the full `npm run verify` pipeline runs only manually on the author's machine. *Rec:* GitHub Actions running `npm ci + typecheck + test + build + verify:package` on push/PR (scripts already exist); add typescript-eslint + Prettier. **Single highest-leverage health change. (M)**
- **CLI-launch logic duplicated 2–3×** across `codex.ts`/`gemini.ts`/`statusChecks.ts`/`claudeCli.ts` (shim/native/bundle resolution, stdout line-buffering, exit-watching, `errorMessage`). Highest drift risk. *Rec:* extract `src/agents/cliRuntime.ts` (resolution, `commandExists`, `watchProcessExit`, `streamJsonlLines` generator); Codex/Gemini are ~85% identical → a shared `JsonlCliAgent` base. **(L)**
- **`veyraService.ts` is a god-object** (1357 lines); `runDispatchInner` is a ~370-line method owning prompt assembly, snapshots, checkpoints, change-sets, hang detection, read-only enforcement, event emission. *Rec:* split into `PromptComposer` + `DispatchTrustPipeline` + orchestrator. **(L)**
- **JSONL parsers coupled to undocumented CLI shapes with orphaned golden fixtures** (R4) — `tests/agents/fixtures/codex-sample.txt`/`gemini-sample.txt` are referenced by **zero tests**. *Rec:* wire fixtures as golden inputs; add an "unknown event shape" counter. **(M)**
- **Agent unit tests assert spawn args against deep mocks** — `cliResolution.test.ts` is 1165 lines bound to exact call sequence; raises the cost of the very refactors needed. *Rec:* test resolution through one pure seam (`resolveCliCommand(runtime, env, fsProbe)`), table-driven. **(M)**
- **`agentLabel`/display-name/strengths tables reimplemented in 4+ modules.** *Rec:* one `src/agents/registry.ts` declaring per-agent metadata. **(M, low)**
- **`extension.ts` mixes activation wiring with large inline Markdown + CLI-config UX** (721 lines). *Rec:* move guide Markdown to `docs/`; extract the CLI-path wizard; keep `activate()` to registration. **(M, low)**
- **Strong foundations to preserve:** `tokens.css`, `protocol.ts`, the reducer, the esbuild config. *Rec:* treat them as the architectural template; add an `ARCHITECTURE.md`. **(S, idea)**

### Competitive Research (2026)

> Note: this lens returned only 2 findings (thinner than the others). A deeper competitive-only pass is worth running if this becomes a priority.

- **Multi-agent-in-one-view is commoditized per-vendor — pivot to CROSS-vendor.** Wrapped CLIs ship native orchestration (Claude Agent Teams, Codex/Gemini subagents); Copilot shipped multi-agent at Build 2026; Roo Code has Boomerang. *None mix different vendors as peers in one loop* — that's Veyra's real moat. *Rec:* rewrite thesis/Marketplace copy to lead with cross-vendor orchestration; position as the neutral cross-vendor referee. Sources: infoq.com/news/2026/04/subagents-gemini-cli/, docs.roocode.com/features/boomerang-tasks. **(S)**
- **Model Council moment — `/debate` and `/consensus` are the sharpest, least-commoditized weapon.** Perplexity Model Council (2026) runs Claude+GPT+Gemini blind then synthesizes agreements/divergences; debate-judge research shows it cuts hallucinations. Veyra already has this across three real vendors — impossible for single-vendor Copilot/Cursor/Cline — but its flow is serial, not blind-then-synthesize. *Rec:* add a blind-then-synthesize consensus variant with a visual agreement/divergence map; market `/debate` as "Model Council for your repo, fully local." Source: faros.ai/blog/best-ai-model-for-coding-2026. **(M)**

### UX & Product

Activation funnel and discoverability are the weaknesses, not the surface (which the v0.2 polish just addressed).

- **No first-run walkthrough** — `package.json` has no `walkthroughs`/`viewsWelcome`; first success needs the hidden Secondary Side Bar, palette commands, and three CLI installs. *Rec:* `contributes.walkthroughs` + `viewsWelcome` for `veyra.chatView`. **(High)**
- **UI hidden in Secondary Side Bar**, collapsed by default, can't be re-summoned. *Rec:* auto-show or default to Primary Side Bar; add a keybinding. `package.json:95-103`, `veyraView.ts:82-84` **(High)**
- **Workflow choice unexplained** — read-only-vs-write only in docs; agent roles are a two-word description. *Rec:* per-workflow badges + an agent legend in Mission Control. **(High)**
- **Features/settings hidden or risky** — Trust Center buttons hide until urgent; ~30 flat settings; `writeApproval: 'ask'` silently fails writes; `localModels` diagnostics-only. *Rec:* a Tools affordance; group settings as advanced; reframe onboarding "one agent first." **(Medium)**

### Reliability & Operational Robustness

More careful than most multi-agent extensions (spawn-failure handling, AbortSignal wiring, the floor-hold watchdog, the well-designed Antigravity first-output watchdog + fallback cache). Exposure is around the edges:

- **Unhandled stdin EPIPE can crash the host** (R1). *Rec:* `child.stdin?.on('error', ...)` in all three agents + a top-level `process.on('uncaughtException'|'unhandledRejection')` guard logging to the output channel. **(High, S)** — *Implemented as the stdin listeners only. The global process-handler half was dropped: a process-wide `uncaughtException` listener that merely logs suppresses **other** extensions' fatal errors host-wide (Node stops crashing once any such listener exists) and is redundant once the EPIPE is handled at its source. Flagged P1 in code review.*
- **Checkpoint + diff-preview baseline walk the whole workspace on every write dispatch** (R5). *Rec:* honor `.gitignore` (or `workspace.findFiles`), run the walk once and share, add file-count/byte cap with a "snapshot skipped" notice, prefer git-based change detection. **(High, M)**
- **No detection of upstream CLI schema drift** (R4). *Rec:* per-dispatch "parsed 0 chunks from >0 non-empty lines" warning; pin tested CLI versions in diagnostics; wire live tests into scheduled CI. **(High, M)**
- **Synchronous CLI resolution blocks the event loop** — `execSync('npm root -g')`, sync `powershell.exe`, `where.exe` on the dispatch path; agent-side `resolve*Command` is not cached. *Rec:* memoize per session (invalidate on config change); move heavy probes to async `execFile`. `findNode.ts:33`, `gemini.ts:91,213`, `codex.ts:38` **(Medium, M)**
- **Windows tree-kill gap** — `SIGTERM` is emulated as `TerminateProcess` and doesn't reach grandchildren; `agy.exe`/npm-bundle CLIs spawn helpers, so orphans can survive. *Rec:* `taskkill /T /F` on Windows + SIGTERM→SIGKILL escalation + a hard ceiling on the stdout read loop. `gemini.ts:326,333` **(Medium, M)**
- **Ledger/checkpoint desync if killed mid-write** — read-only dispatches can persist change-set/checkpoint JSON referencing a `messageId` rolled back from the transcript; orphaned snapshot dirs are never GC'd. *Rec:* reconcile ledgers against the persisted session on load; startup sweep for orphaned snapshots; serialize ledger writes. `veyraService.ts:347`, `checkpointLedger.ts:163-164` **(Medium, M)**
- **Corruption recovery resets the session but doesn't back up the unparseable file** — the next debounced write permanently destroys a recoverable transcript (acute in OneDrive/Dropbox-synced folders). *Rec:* copy to `sessions.corrupt-<timestamp>.json` before overwrite; mention the path. `sessionStore.ts:50-65` **(Low, S)**
- **Floor watchdog is wall-clock, not idle-based** — a live-but-slow 6-minute `/implement` gets guillotined at 5 min mid-stream, discarding partial work. The hang notice tracks liveness but never acts; the killer ignores liveness. *Rec:* make the floor watchdog idle-based (reset on each chunk), or split "no output for N min → cancel" vs a larger absolute ceiling. `messageRouter.ts:164`, `veyraService.ts:459` **(Low, S)**
- **Facilitator routing depends on Claude being installed** — silently falls back to keyword regex with no user signal; spawns a full extra Claude process per ambiguous prompt with `permissionMode:'default'` (nominally write-capable). *Rec:* run the routing probe read-only; surface a one-time "LLM router unavailable" notice; fast local heuristic first. `facilitator.ts:83,87,90` **(Low, S)**
- **Unbounded per-dispatch stderr** — `stderr += String(d)` with no cap; long verbose runs grow memory and produce enormous error messages. *Rec:* cap to a tail/ring buffer; truncate in surfaced errors. `codex.ts:195`, `claudeCli.ts:77`, `gemini.ts:548` **(Low, S)**

---

## Proposed roadmap

Priority is **now / next / later** by user-facing risk, not by effort. Within "later," the CI piece is a quick win that should jump ahead.

### NOW — Stop crashes & silent failures (operational robustness)
*Correctness-under-failure, not features. Low effort, high impact; undermines the reliability the brand implies.*
- R1 stdin error guards + global host crash handler
- R4 "parsed 0 chunks" drift warning
- Corrupt-session backup before overwrite
- stderr tail-cap
- **First deliverable:** one small PR for the stdin guards + global handler; a second PR for the drift counter + corrupt-session backup + stderr cap.

### NOW — Make the trust story real (Workspace Trust + prevention-based read-only)
*Where Security and Reliability converge; where the "trust" branding is currently aspirational.*
- R2 `untrustedWorkspaces: limited` + gate dispatch/verification/hooks/onboarding on `isTrusted`
- R3 positive read-only flags per CLI; violation = hard cancel
- R7 strip shell in read-only (or count shell writes)
- Antigravity positive read-only flag + regression test
- R6 untrusted-content fencing (fast-follow)
- **First deliverable (M):** the Workspace Trust gate (also mitigates R6/PATH-hijack in practice). **Follow-on (M):** positive read-only flags + hard-cancel + regression tests.

### NEXT — Snapshot performance (don't freeze on `/implement`)
*Degrades the headline feature; most likely "why did VS Code freeze" report.*
- R5 `.gitignore`-aware, single shared walk, file-count cap, git-based detection
- Memoize CLI resolution off the hot path
- Windows tree-kill; idle-based floor watchdog

### NEXT — Close the activation funnel (first-run UX & discoverability)
*Cheapest way to convert installs into activated users; amplifies every other investment.*
- `walkthroughs` + `viewsWelcome` + keybinding; move view out of the collapsed secondary sidebar
- Per-workflow badges + agent legend
- "One agent first" onboarding; group settings as advanced

### LATER — Refactor the seams that drift + add the CI net
*Every robustness/trust fix touches the duplicated files; consolidate so fixes land once.*
- **Quick win first:** GitHub Actions CI + ESLint/Prettier (+ the Security CI assertions)
- Extract `cliRuntime.ts` / `JsonlCliAgent` base; wire golden fixtures; `registry.ts`; split `veyraService.ts`

### LATER — Sharpen the moat (cross-vendor positioning + blind model council)
*The one place competitive ambition pulls against the now-priority hardening. Sequence after the base so hardening becomes the proof behind the marketing, not a liability under it.*
- **Immediate, zero-code:** reposition copy to lead with cross-vendor orchestration / "Model Council for your repo, fully local"
- **After hardening (M):** blind-then-synthesize `/consensus` variant + agreement/divergence map; keep write capability scoped to Codex only

---

## Quick wins (low effort, high value)

1. stdin `error` listeners + global host crash handler — removes the worst crash vector for ~10 lines. (R1)
2. GitHub Actions CI — scripts already exist; puts a net under 906 tests + a shipped extension.
3. Reposition Marketplace/README copy to lead with cross-vendor orchestration — zero code, sharpens the one thing competitors can't copy.
4. Corrupt-session `.bak` before overwrite — cheap insurance for a tool run in synced folders.
5. Show the resolved script body in the verification approval modal.
6. `contributes.walkthroughs` + `viewsWelcome` + keybinding for `veyra.chatView`.
7. Cap retained per-dispatch stderr to a tail.
8. Wire the orphaned `codex-sample.txt`/`gemini-sample.txt` fixtures into parser tests.

---

*Generated from a six-agent review (security, architecture, competitive, UX, reliability + synthesis). Headline claims independently re-verified against source by the synthesis pass. Severities and efforts are the reviewers' estimates, not commitments.*

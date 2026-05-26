# Veyra

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dontcallmejames.veyra-vscode) | [Source on GitHub](https://github.com/dontcallmejames/veyra-vscode) | [Report an issue](https://github.com/dontcallmejames/veyra-vscode/issues)

Veyra is a local-first VS Code extension for developers who want Claude, Codex, and Gemini to work together on one project without losing the thread. It keeps the shared conversation, retrieved context, file edits, verification evidence, and handoffs visible in a docked view.

Veyra is not a hosted agent service. It uses the local CLIs you already authenticate, and it does not run hidden commands, does not upload your repository, and does not approve destructive follow-up work on its own.

## Quickstart

1. Install or update Veyra, then run `Developer: Reload Window`.
2. Open a real project folder in VS Code.
3. Run `Veyra: Open View` to reveal the docked view.
4. Run `Veyra: Check agent status` and confirm the local Claude CLI, Codex CLI, and Gemini provider path are ready.
5. If Codex or Gemini needs path recovery on Windows, run `Veyra: Configure Codex/Gemini CLI paths`.
6. Send `@veyra are you here?` in VS Code Chat. Veyra should answer locally without contacting paid backends.
7. Start read-only with `@veyra /review @codebase inspect this change for risk`, `/debate`, or `/consensus`; use `/implement` only when you want write-capable agent work.
8. Inspect write-capable results with `Veyra: Open Pending Changes`, then accept or reject the pending change set.

For a repeatable walkthrough covering setup, read-only workflows, implementation, diff preview, checkpoints, and verification, see `docs/preview-demo-script.md`.

Use `@veyra` in VS Code Chat for lightweight native-chat workflows, or use the docked Veyra view for the full orchestration UI with statuses, checkpoints, Trust Center actions, workflow history, and pending changes.

## Feature Overview

- Multi-agent workflows route `@veyra`, `@claude`, `@codex`, and `@gemini` through `/review`, `/debate`, `/consensus`, and `/implement`.
- Docked Mission Control, Trust Center, workflow history, replay, and artifact cards keep orchestration visible without turning the transcript into a control panel.
- Local workspace context comes from `@codebase`, `@file` mentions, terminal selections, project command hints, Git/CI context, browser/test notes, and retrieval feedback.
- Edit trust controls cover diff preview, pending changes, per-file accept/reject, file badges, edit conflicts, checkpoints, rollback, verification evidence, and commit attribution.
- Provider routing uses the local Claude CLI, Codex CLI, and Antigravity CLI, with legacy Gemini CLI fallback for existing Google-provider setups.
- Discovery surfaces include docked composer autocomplete, manual inline suggestions, the `Veyra` Language Model provider, setup checks, and diagnostic reports.

## Requirements

Veyra shells out through the local agent CLIs/adapters already configured on your machine:

- Node.js with the `node` command on PATH, required when Veyra launches JS bundle paths from the VS Code extension host.
- Claude through the local Claude CLI (`npm install -g @anthropic-ai/claude-code`, then run `claude` or `claude /login` to authenticate).
- Codex through the local Codex CLI integration (`npm install -g @openai/codex`, then `codex login`).
- Gemini through the Google provider path. New consumer setups should use Antigravity CLI (`agy`) from https://antigravity.google/cli; legacy Gemini CLI (`npm install -g @google/gemini-cli`, then run `gemini` once) remains a fallback for existing/API-key users.

Use the account, API key, or subscription setup required by each vendor's CLI. Veyra does not replace those credentials; it coordinates the agents inside VS Code.

## Troubleshooting

If `Veyra: Open View` reports `command 'veyra.openPanel' not found`, first confirm Veyra is installed and up to date, then run `Developer: Reload Window`. The compatibility command id `veyra.openPanel` remains available; it reveals the Veyra view instead of opening a separate editor panel. If the command still fails, disable and re-enable Veyra from the Extensions view and retry in a normal workspace folder. A successful run reveals the Veyra view in the VS Code Secondary Side Bar with other agent views such as Codex and Claude.

For any tester report, please include:

- OS and VS Code version.
- Veyra version from the Extensions view.
- Whether `Veyra: Open View`, `Veyra: Check agent status`, and `@veyra are you here?` worked.
- The copied output from `Veyra: Copy Diagnostic Report`, if the command is available.
- The exact prompt or command that failed.
- Logs from `Developer: Show Logs...` -> `Extension Host` around the failure.

## Development

```powershell
npm install
npm run build
```

Open the folder in VS Code, then press `F5` or run the `Run Extension` launch configuration from `.vscode/launch.json`. The launch config builds first with `npm: build`, then starts an Extension Development Host from `dist/extension.js`. If you package a VSIX with your preferred VS Code extension workflow, build first; the package `files` allowlist keeps the VSIX focused on the bundled runtime instead of local source, tests, scripts, or `node_modules/`.

## Using Native Chat

Open VS Code Chat and mention a participant:

```text
@veyra /review check this migration plan for risk
@veyra /review @codebase inspect the auth flow for correctness risks
@veyra /debate choose the safest way to refactor the auth layer
@veyra /consensus decide whether to ship the compatibility layer now
@veyra /implement add tests for the parser and fix failures
@claude review the architecture in src/server.ts
@codex implement the failing test
@gemini compare these two API designs
```

When no direct agent is chosen, `@veyra` asks the facilitator to route the work based on agent availability, prompt content, and recent shared context.

### Composer Discovery

Type `@` in the docked Veyra composer to mention Claude, Codex, Gemini, or all agents.

Type `/` in the docked Veyra composer to discover workflow shortcuts and common command-palette actions, including `/review`, `/debate`, `/consensus`, `/implement`, `Veyra: Open Pending Changes`, `Veyra: Run Verification Command`, `Veyra: Review Browser/Test Output`, `Veyra: Summarize Git Status`, `Veyra: Review CI/PR Output`, `Veyra: Prepare PR Package Draft`, `Veyra: Create Checkpoint`, `Veyra: Roll Back Latest Checkpoint`, `Veyra: Check agent status`, and `Veyra: Copy Diagnostic Report`.

### Inline Autocomplete

Inline Autocomplete v0.1 is off by default. Set `veyra.inlineAutocomplete.enabled` to `true`, then use VS Code's manual inline suggestion trigger when you want Veyra to propose a short editor ghost-text insert.

The provider ignores automatic inline completion triggers, so it does not compete with normal typing or other autocomplete extensions. A manual inline suggestion sends a small local editor context window to the configured direct Veyra agent as a read-only direct-agent request. The prompt asks for insert-only text and forbids command execution, file edits, Markdown wrapping, and explanations.

Tune it with `veyra.inlineAutocomplete.agent`, `veyra.inlineAutocomplete.maxContextLines`, `veyra.inlineAutocomplete.maxSuggestionChars`, and `veyra.inlineAutocomplete.minPrefixChars`.

### Workflow Modes

- `/review`, `/debate`, and `/consensus` are read-only. Veyra tells agents not to edit files and suppresses automatic edit approval for those dispatches.
- `/review` asks each agent for `Summary`, `Blocking issues`, `Advisory risks`, `Missing tests`, and `Follow-up suggestions`; empty categories use `None found`.
- Gemini ends `/review` with a `Veyra Synthesis` covering recommendation, blocking issues, advisory risks, missing tests, follow-up suggestions, and next action.
- `/debate` compares approaches and ends with a `Recommended approach`.
- `/consensus` turns competing positions into a concrete decision.
- `/implement` is the write-capable workflow: Claude frames the approach, Codex changes code and tests, then Gemini reviews the result and ends with a `Handoff Summary`. If verification did not run, the handoff says `Not run`.

Workflow prompts tell agents to use their available model and CLI capabilities while still following read-only or edit-permitted instructions. Broad implementation requests should proceed from reasonable assumptions instead of becoming brainstorming or approval checkpoints; agents should stop only for unsafe or impossible next actions.

Structured Workflow Artifact Cards render sections such as blocking issues, advisory risks, missing tests, follow-up suggestions, Veyra Synthesis, and Handoff Summary as readable docked-view cards instead of raw transcript blocks.

### Context And Tuning

- Use `@codebase` when you want Veyra to retrieve relevant workspace files without naming them explicitly. The first version uses local lexical search over workspace files and project metadata; it does not upload or build a cloud index.
- Retrieval Quality and Embedding Readiness v0.1 adds a retrieval-quality block to `@codebase` prompts. It names the local lexical method, query terms, selected-file evidence, prompt budget, omitted matching files, why files were selected, and where lexical retrieval may have missed context.
- Retrieval Feedback v0.2 surfaces the latest `@codebase` result as a compact docked-view panel. It can prepare a visible refined `@codebase` draft, prepare an explicit `@file` mention draft, or copy a local retrieval report; it does not silently send prompts, run commands, upload code, or create hidden memory.
- The `@codebase` embedding readiness is inactive. Veyra performs no cloud indexing, no paid embedding calls, and no background repository scans. Refine `@codebase` query terms or attach known files with `@file` when lexical search misses something obvious.
- Set `veyra.workflow.template` when a workspace wants an extra reusable lens such as `architecture-review`, `security-review`, `test-improvement`, `refactor-plan`, or `implementation-with-review`.
- Use `veyra.agentRoles.claude`, `veyra.agentRoles.codex`, and `veyra.agentRoles.gemini` for workspace role customization. Non-empty values are appended to that agent's Veyra role preamble only.

Example workspace settings:

```json
{
  "veyra.workflow.template": "security-review",
  "veyra.agentRoles.claude": "Focus on architecture boundaries and product risk.",
  "veyra.agentRoles.codex": "Focus on TypeScript implementation details and regression tests.",
  "veyra.agentRoles.gemini": "Focus on edge cases, abuse paths, and assumptions the first two agents may miss."
}
```

### Terminal And Verification Context

- Terminal selections from VS Code Chat are passed to agents as labelled terminal context.
- Run `Veyra: Diagnose Terminal Output` to diagnose copied or pasted terminal output in the docked Veyra view. VS Code does not expose arbitrary terminal scrollback to extensions, so Veyra does not read terminal scrollback directly.
- Veyra detects project command hints from local package metadata, such as `npm test`, `npm run typecheck`, or `npm run build`.
- For `/implement`, Veyra adds post-implement verification suggestions so agents can recommend a likely follow-up command after edits.
- Run `Veyra: Run Verification Command` to choose a detected test, typecheck, lint, build, check, or verify command, approve the exact command, then route the captured output (stdout/stderr as rendered by the terminal) and exit status back into Veyra as terminal context.
- Do not run suggested commands unless the user explicitly asks or approves. Agents must ask the user to approve the exact command before running verification.

### Browser And Frontend Test Context

- Run `Veyra: Review Browser/Test Output` after copying Playwright, Cypress, Vitest UI, browser console, network, screenshot-note, URL-note, or reproduction output.
- Veyra treats this as explicit user-provided browser/test evidence plus local project command hints. It does not launch a browser, scrape pages, rerun tests, edit files, or inspect network activity on its own.
- The review asks agents for `Browser/Test Summary`, `Reproduction Evidence`, `User-Visible Risk`, `Likely Cause`, `Verification Gaps`, and `Suggested Follow-up Commands` so the docked view can render the result as workflow artifact cards.
- Follow-up commands are suggestions only. Veyra waits for explicit approval before any test, browser, Git, or terminal command can run.

### GitHub And CI Workflow Context

- Run `Veyra: Summarize Git Status` to send a read-only Git workflow context block into the docked Veyra view.
- Veyra uses read-only Git commands to summarize branch/upstream state, sanitized remotes, dirty-tree files, and the latest commit.
- Run `Veyra: Review CI/PR Output` after copying CI logs, PR review notes, GitHub status text, or check output. Veyra combines that explicit user-provided output with the same local Git context.
- The CI/PR review asks agents for a draft PR summary, PR readiness checklist, CI findings, and exact follow-up command suggestions.
- Run `Veyra: Prepare PR Package Draft` when you want a fuller local-first PR package. It asks for a draft PR summary, changed-file explanation, risk checklist, verification evidence, unresolved blockers, and exact follow-up commands.
- The PR package draft uses optional copied or pasted CI/PR output, local Git state, pending-change and checkpoint signals, and any approved verification results Veyra can read from the current workspace session.
- These flows can help agents suggest GitHub PR and CI follow-up, but there is no hidden network automation and no automatic pushes.
- Veyra does not run `git push`, `git pull`, merge, rebase, reset, clean, GitHub CLI, API, or CI commands from these flows.

### Setup Checks

Run `Veyra: Check agent status` before starting an autonomous workflow. If Codex or Gemini is missing, inaccessible, or misconfigured, the status warning offers CLI path configuration directly.

On Windows, `Veyra: Configure Codex/Gemini CLI paths` can detect native CLI executables, PATH npm shims, npm global CLI bundles, and the standard Antigravity install. It saves `veyra.codexCliPath`, `veyra.antigravityCliPath`, and the legacy `veyra.geminiCliPath` workspace settings when available. If a backend reports `Node.js missing`, install Node.js so the `node` command is on PATH, or point Codex/Gemini at native executable paths instead of JS bundle paths.

### Output And Provider Transparency

- Veyra renders agent Markdown safely in the docked view, so headings, lists, code blocks, blockquotes, links, and tables become readable prose while arbitrary HTML remains escaped as text.
- Veyra does not hardcode vendor model promises. Claude, Codex, and Gemini use local CLI/provider defaults unless a provider exposes reliable backend model metadata or a stable local override setting.
- `Veyra: Copy Diagnostic Report` includes provider transparency for Claude CLI, Codex CLI, Antigravity CLI or legacy Gemini fallback, and CLI/provider versions where available.
- Local Model Support v0.1 is diagnostics only for local/self-hosted targets. Set `veyra.localModels.mode` to `informational`, then fill `veyra.localModels.provider`, `veyra.localModels.endpoint`, and `veyra.localModels.model` to include the target in diagnostic reports.
- Local Model Support v0.1 does not replace Claude, Codex, or Gemini routing. Veyra performs no automatic model downloads, no hidden server launches, and no background network probing.

## Using Veyra As A Language Model

The extension contributes a `veyra` language model provider with these local model IDs:

- `veyra-orchestrator`
- `veyra-review`
- `veyra-debate`
- `veyra-consensus`
- `veyra-implement`
- `veyra-claude`
- `veyra-codex`
- `veyra-gemini`

Other extensions can request these models through VS Code's Language Model Chat API. The workflow models run the same all-agent review, debate, consensus, and implementation prompt shapes exposed in native chat. Responses stream back through the same Veyra session service used by native chat and the Veyra view.

## Edit Coordination

Veyra keeps a single dispatch pipeline for all surfaces:

- Each agent turn gets the recent shared conversation.
- Later agents in an `@all` sequence see prior agent replies and edited-file summaries.
- Prompts include an edit coordination block when another agent has already touched relevant files.
- Tool-reported writes and workspace diff snapshots both become `file-edited` events.
- If an agent edits a file previously touched by another agent, Veyra emits an `edit-conflict` notice.
- The optional commit hook uses `.vscode/veyra/active-dispatch` to add commit attribution.

Install the commit hook from the command palette with `Veyra: Install commit hook`. Use `Veyra: Show commit hook snippet` if your repository uses another hook manager.

### Diff Preview And Pending Changes

When an agent edits files, Veyra records a pending change set. Use `Veyra: Open Pending Changes` to inspect the files in VS Code's diff editor, `Veyra: Accept Pending Changes` to mark the whole change set as kept, or `Veyra: Reject Pending Changes` to restore the whole pre-dispatch file state. Use `Veyra: Accept Pending Change File` or `Veyra: Reject Pending Change File` when you want to resolve individual files first.

Reject refuses to overwrite files that changed after the agent edit. In that case, inspect the file manually before continuing.

### Trust Center

The docked Veyra view includes a compact Trust Center above the transcript. It is part of the Presentation Layer and derives from the same session messages as the inline notices, so it does not create a second source of truth.

- Mission Control timeline shows Claude, Codex, and Gemini as queued, active, complete, failed, cancelled, and waiting while keeping the top of the view compact.
- Presentation Density v0.1 keeps Trust Center collapsed by default when there are no urgent actions, while Mission Control chips keep the trust summary and checkpoint count visible.
- Trust Center opens automatically for urgent actionable signals such as pending changes, edit conflicts, or failed approved verification.
- Pending changes show the same open diff, accept, reject, and per-file actions as the inline change-set notice.
- Checkpoints expose manual checkpoint creation and latest-checkpoint rollback.
- Verification status is shown only after an explicitly approved Veyra verification command reports an exit status.
- Git, CI/PR, PR package, and browser/test context appears only when you run the explicit Veyra Git, CI/PR review, PR package draft, or browser/test review commands.
- File edits and edit conflicts remain visible and open the related workspace file.

### Workflow Replay

The docked Veyra view can prepare a replay draft for the latest `/review`, `/debate`, `/consensus`, or `/implement` workflow in the session. Replay lives in the collapsible Workflows panel with recent workflow history, so it stays available without permanently taking transcript space. Replay is manual: Veyra fills the composer with a fresh visible request, notes the original workflow and agents observed last time, and waits for you to edit or send it.

Replay uses the current workspace and Git state. Prior agent replies remain transcript context; they are not treated as proof that files, tests, or risks are unchanged.

### Workflow Artifact History

Workflow Artifact History v0.1 keeps a compact list of recent completed Veyra workflows in the collapsible Workflows panel. Each entry summarizes the workflow command, original prompt, participating agents, final artifact headings, pending-change signals, checkpoint signals, approved verification result when present, and completion status.

History is local-only and derived from the existing session messages Veyra already stores, with no separate source of truth. It does not rerun old workflows, replay tool calls, execute commands, edit files, perform Git/GitHub actions, or make network calls. Use `Prepare replay` when you want a visible manual composer draft for a past workflow against the current workspace state.

### Checkpoints And Rollback

Veyra can save checkpoints before write-capable dispatches and on demand. Use `Veyra: Create Checkpoint` before an experiment, `Veyra: List Checkpoints` to inspect recent recovery points, and `Veyra: Roll Back Latest Checkpoint` to restore the latest safe checkpoint.

Rollback refuses when automatic checkpoint files changed after the agent dispatch or when files are too large to restore safely. Manual checkpoint rollback is explicit: Veyra shows the changed file count before restoring files to the manual checkpoint state.

## Settings

- `veyra.toolCallRenderStyle`: `verbose`, `compact`, or `hidden` for tool call/result details in the Veyra view, native chat, and Language Model provider. Compact mode groups noisy provider activity into one expandable summary; file edit references still stay visible.
- `veyra.hangDetectionSeconds`: seconds without output before a waiting notice appears.
- `veyra.watchdogMinutes`: maximum time an agent may hold the dispatch floor.
- `veyra.fileEmbedMaxLines`: max lines embedded for `@file` mentions.
- `veyra.workspaceContext.maxFiles`: max files selected for `@codebase` context.
- `veyra.workspaceContext.maxSnippetLines`: max snippet lines per selected `@codebase` file.
- `veyra.workspaceContext.maxFileBytes`: max file size considered during `@codebase` retrieval.
- `veyra.diffPreview.enabled`: capture pending agent change sets for diff preview and safe rejection.
- `veyra.diffPreview.maxFileBytes`: max file size snapshotted for diff preview and rejection.
- `veyra.checkpoints.enabled`: capture automatic and manual Veyra checkpoints.
- `veyra.checkpoints.maxFileBytes`: max file size snapshotted for checkpoint rollback.
- `veyra.checkpoints.maxCount`: max checkpoint count before pruning older snapshots.
- `veyra.codexCliPath`: optional absolute path to the Codex CLI JS bundle, native executable, or Windows npm shim. Paths ending in `codex.cmd`, `codex.bat`, or `codex.ps1` are resolved to the underlying JS bundle before launch.
- `veyra.antigravityCliPath`: optional absolute path to the Antigravity CLI native executable, usually `agy.exe` on Windows or `agy` on macOS/Linux.
- `veyra.geminiCliPath`: optional legacy fallback path to the Gemini CLI JS bundle, native executable, or Windows npm shim. Paths ending in `gemini.cmd`, `gemini.bat`, or `gemini.ps1` are resolved to the underlying JS bundle before launch.
- `veyra.localModels.mode`: `disabled` or `informational` for diagnostics-only local/self-hosted provider target reporting.
- `veyra.localModels.provider`: optional local/self-hosted provider label for diagnostic reports.
- `veyra.localModels.endpoint`: optional `http://` or `https://` local/self-hosted endpoint for diagnostic reports.
- `veyra.localModels.model`: optional local/self-hosted model name for diagnostic reports.
- `veyra.sharedContextWindow`: number of recent messages sent to later agents.
- `veyra.workflow.template`: optional prompt lens for `/review`, `/debate`, `/consensus`, `/implement`, and the matching Language Model workflow entries.
- `veyra.agentRoles.claude`, `veyra.agentRoles.codex`, `veyra.agentRoles.gemini`: optional workspace role customization appended to the matching agent's Veyra role preamble.
- `veyra.inlineAutocomplete.enabled`: enable opt-in manual editor ghost-text suggestions.
- `veyra.inlineAutocomplete.agent`: direct Veyra agent used for manual inline autocomplete suggestions.
- `veyra.inlineAutocomplete.maxContextLines`: max editor context lines sent with a manual inline suggestion request.
- `veyra.inlineAutocomplete.maxSuggestionChars`: max characters inserted for one inline autocomplete suggestion.
- `veyra.inlineAutocomplete.minPrefixChars`: minimum non-whitespace prefix characters before requesting a suggestion.
- `veyra.fileBadges.enabled`: enable file explorer badges for recent agent edits.
- `veyra.commitSignature.enabled`: write the active dispatch sentinel for commit attribution.
- `veyra.writeApproval`: whether agent write requests are automatic or delegated to each CLI.

## Verification

```powershell
npm run verify
```

To run the non-paid completion gate, including local verification, the automated Extension Development Host smoke test, and live-backend readiness checks:

```powershell
npm run verify:completion
```

To run the full goal-completion verifier, including the paid live integration suite, opt in explicitly first:

```powershell
$env:VEYRA_RUN_LIVE = '1'
npm run verify:goal
Remove-Item Env:\VEYRA_RUN_LIVE -ErrorAction SilentlyContinue
```

To run only the automated Extension Development Host smoke test against the local VS Code CLI:

```powershell
npm run test:vscode-smoke
```

The smoke test uses deterministic no-paid agents. Write-capable smoke requests create harmless files in the isolated `.vscode-test` workspace and must surface those edits as native chat file references and Language Model provider workspace links.

Live vendor smoke tests are opt-in because they use real local credentials and subscription quota:

Inside VS Code, run `Veyra: Show live validation guide` from the command palette for the same readiness and live-test commands.

```powershell
npm run verify:live-ready
$env:VEYRA_RUN_LIVE = '1'
npm run test:integration:live
Remove-Item Env:\VEYRA_RUN_LIVE -ErrorAction SilentlyContinue
```

The live suite checks each backend individually, runs a read-only all-agent Veyra handoff with shared-context relay through Claude, Codex, and Gemini, and runs a disposable write-capable implementation validation that must surface a visible file edit.
The npm script first refuses to run unless `VEYRA_RUN_LIVE=1` is set, then runs `verify:live-ready` before any paid prompts. The `.live.test.ts` suites repeat the readiness guard internally so direct Vitest live-test invocations stop before prompt execution when readiness is incomplete.
In PowerShell, `$env:VEYRA_RUN_LIVE = '1'` stays set for the current terminal session until you remove it or close the shell.

If Windows npm global package paths are inaccessible from the VS Code extension host, Veyra first uses direct native `codex.exe`, `agy.exe`, or `gemini.exe` executables found on PATH, then the standard Antigravity install, then recognized PATH npm shims such as `codex.cmd` and `gemini.ps1`. Veyra skips stale PATH shims whose derived JS bundle targets are missing and falls back to `npm root -g`. If those are not available, point Veyra at explicit JS bundle, native executable, or npm shim paths in settings:

```text
Veyra: Configure Codex/Gemini CLI paths
```

If auto-detection cannot inspect the package tree, set the paths manually:

Use the underlying JS bundle paths, native executables, or Windows npm shim paths such as `codex.cmd` and `gemini.ps1`. Veyra resolves recognized npm shim paths to the underlying JS bundle before readiness and runtime launch, and still rejects malformed override paths instead of treating an arbitrary accessible file as a usable CLI.

```json
{
  "veyra.codexCliPath": "C:\\Users\\<you>\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
  "veyra.antigravityCliPath": "C:\\Users\\<you>\\AppData\\Local\\agy\\bin\\agy.exe",
  "veyra.geminiCliPath": "C:\\Users\\<you>\\AppData\\Roaming\\npm\\node_modules\\@google\\gemini-cli\\bundle\\gemini.js"
}
```

For shell readiness and live-test commands, either keep those workspace settings in `.vscode/settings.json` or use environment variables:

```powershell
$env:VEYRA_CODEX_CLI_PATH = 'C:\Users\<you>\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js'
$env:VEYRA_ANTIGRAVITY_CLI_PATH = 'C:\Users\<you>\AppData\Local\agy\bin\agy.exe'
$env:VEYRA_GEMINI_CLI_PATH = 'C:\Users\<you>\AppData\Roaming\npm\node_modules\@google\gemini-cli\bundle\gemini.js'
```

For the real VS Code Extension Development Host checklist, see `docs/vscode-smoke-test.md`.

For the current prompt-to-artifact completion audit and remaining live-backend gate, see `docs/goal-completion-audit.md`.

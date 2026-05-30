# Changelog

## 1.1.0 - 2026-05-30

- Adds Enterprise Polish v0.1, a VS Code-native visual pass: a token-driven theme that maps every color to VS Code theme variables and stays readable across Light+, Dark+, and High Contrast; a flat row-based message layout in place of chat bubbles; a shared PanelSection component with packaged `@vscode/codicons` icons; a status bar item showing idle and per-agent dispatching state; a denser docked layout where agent stages are single lines, panel headers double as collapse toggles, and Mission Control no longer restates other panels' summaries; first-launch empty-state guidance in the conversation; and Marketplace screenshots.
- Adds Workflow Professionalism v0.1: per-target read-only enforcement so only Codex is write-capable during `/implement`, structured workflow-state notices, and reviewer-edit trust handling.
- Adds `veyra.gemini.backend` (`auto` | `antigravity` | `gemini`). In `auto`, the Gemini agent tries Antigravity (`agy`) and falls back to the legacy Gemini CLI when it returns no output (`agy --print` cannot stream over a non-TTY pipe), replacing the previous silent stall with a visible notice; forced modes surface clear errors and a forced switch is honored mid-session.

## 1.0.21 - 2026-05-27

- Adds Retrieval Quality v0.4 with visible/manual missed-context feedback in Retrieval Feedback. Users can mark Known missing files, draft explicit file mentions, and include that evidence in copyable retrieval reports while lexical ranking gains file-name, symbol, test, and import signals; the loop remains local-only with no embeddings, no uploads, no background indexing, no hidden memory, and no automatic dispatch.

## 1.0.20 - 2026-05-27

- Adds Retrieval Feedback v0.3, preserving the originating Veyra workflow command in visible retrieval follow-up drafts, adding explicit open-file actions for selected `@codebase` files, and keeping reports local-only with no hidden dispatches, command execution, uploads, embeddings, background indexing, or hidden memory.
- Adds Workflow Artifact History v0.2, letting users copy a local summary for each recent workflow with command, prompt, agents, artifact headings, trust signals, completion status, and manual replay guardrails.
- Adds Antigravity provider hardening v0.2, falling back to legacy Gemini when Antigravity hits command-line prompt limits, improving readiness diagnostics for the selected Google provider path, and surfacing backend-reported model metadata without hardcoded model promises.

## 1.0.19 - 2026-05-26

- Adds Retrieval Feedback v0.2 as a compact local-only docked panel for the latest `@codebase` run, with visible refined-query drafts, explicit file-mention drafts, and copyable retrieval reports for future batched release notes.
- Adds README/Marketplace Description Diet v0.1, moving the README front door to product story -> quickstart -> compact feature overview, tightening the Marketplace description, and keeping detailed setup, safety, and command docs available below.
- Adds README/Docs Split v0.1, keeping README as the Marketplace-friendly front door while moving detailed user workflow and developer verification guidance into packaged docs.

## 1.0.18 - 2026-05-26

- Adds Presentation Density v0.1 for the docked Veyra view, keeping Mission Control always visible while Trust Center and Workflows open from compact chips, combining replay/history into one capped Workflows panel, and auto-opening Trust Center for urgent pending-change, conflict, or failed-verification signals.

## 1.0.17 - 2026-05-26

- Adds Workflow Artifact History v0.1 in the docked Veyra view, deriving local-only summaries of recent completed workflows from existing session messages with command, prompt, participating agents, artifact headings, pending-change/checkpoint/verification signals, completion status, no separate source of truth, and manual replay preparation.

## 1.0.16 - 2026-05-25

- Adds Inline Autocomplete v0.1 as an opt-in manual VS Code inline completion provider. It responds only to explicit inline suggestion invocation, sends a small editor context window to a configured direct Veyra agent as a read-only request, and returns short insert-only ghost text without command execution, file edits, or Markdown explanations.

## 1.0.15 - 2026-05-25

- Adds Retrieval Quality and Embedding Readiness v0.1 for `@codebase retrieval`, making local lexical context blocks and diagnostic reports explain why files were selected, which budget limits may omit matches, and why embedding/vector readiness remains inactive: no cloud indexing, no paid embedding calls, and no background repository scans.

## 1.0.14 - 2026-05-25

- Adds Local Model Support v0.1 as a conservative diagnostics-only configuration surface for local/self-hosted provider targets. Users can record a provider label, endpoint, and model for diagnostic reports while Veyra keeps Claude, Codex, and Gemini routing unchanged, with no automatic model downloads, no hidden server launches, and no background network probing.

## 1.0.13 - 2026-05-25

- Adds Browser Testing Awareness v0.1 with `Veyra: Review Browser/Test Output`, a local-first browser/frontend test review prompt for pasted Playwright, Cypress, Vitest UI, console, network, screenshot-note, URL-note, and reproduction evidence. It produces browser/test artifact-card headings while preserving explicit approval semantics: no hidden browser launch, network scraping, test reruns, file edits, Git operations, or command execution.

## 1.0.12 - 2026-05-25

- Adds GitHub/PR Workflow Awareness v0.2 with `Veyra: Prepare PR Package Draft`, a local-first PR package prompt that combines read-only Git context, pending-change and checkpoint evidence, approved verification evidence when recorded, and optional CI/PR output into structured artifact-card sections without hidden network calls or automatic Git/GitHub actions.

## 1.0.11 - 2026-05-25

- Adds Workflow Replay v0.1 in the docked Veyra view, letting users prepare a visible composer draft for the latest `/review`, `/debate`, `/consensus`, or `/implement` workflow with prior agent participation noted while keeping reruns manual.

## 1.0.10 - 2026-05-25

- Adds Trust Center v0.1 to the docked Veyra view, deriving pending changes, checkpoints, edit conflicts, file edits, approved verification status, and Git/CI context from the existing session stream while reusing the same diff, accept/reject, checkpoint, verification, Git, CI, and diagnostics actions as inline notices.
- Refreshes the packaged Marketplace icon with the new Veyra multi-agent sigil artwork.

## 1.0.9 - 2026-05-25

- Adds Structured Workflow Artifact Cards v0.1 in the docked Veyra view, rendering known workflow sections such as Veyra Synthesis, Recommendation, Blocking issues, Missing tests, Next action, and Handoff Summary as dense expandable cards while preserving safe Markdown fallback.

## 1.0.8 - 2026-05-25

- Collapses compact provider tool activity into one expandable summary so busy agents no longer fill the transcript with repeated command cards, while keeping verbose raw tool cards available for debugging.

## 1.0.7 - 2026-05-25

- Adds a compact Presentation Layer Mission Control timeline to the docked Veyra view, showing Claude, Codex, and Gemini workflow stages plus current floor, recent tool, pending-change, checkpoint, and approved-verification indicators.

## 1.0.6 - 2026-05-25

- Migrates Claude routing and direct Claude dispatch to the local Claude CLI runtime and removes the Anthropic Agent SDK dependency.
- Renders agent Markdown safely in the docked Veyra view while keeping tool-call cards, file-edit notices, checkpoints, and pending-change actions structured.
- Adds provider transparency to diagnostics for Claude CLI, Codex CLI, and the Google provider path through Antigravity CLI or legacy Gemini fallback, including CLI/provider versions where safely available without hardcoded model promises.

## 1.0.5 - 2026-05-25

- Adds `Veyra: Review CI/PR Output` for local-first PR readiness guidance from copied CI or PR output plus sanitized Git context.

## 1.0.4 - 2026-05-25

- Documents and verifies workspace workflow template and per-agent role customization across Veyra surfaces.

## 1.0.3 - 2026-05-25

- Adds docked composer autocomplete for slash workflows and common Veyra command-palette actions.
- Tightens Workflow Intelligence v0.1 prompts so `/review` uses stable finding categories and Gemini ends with a fuller `Veyra Synthesis`.

## 1.0.2 - 2026-05-25

- Adds `Veyra: Run Verification Command` for approved, visible verification runs with captured terminal output routed back into Veyra.
- Adds `Veyra: Summarize Git Status` for local branch, remote, dirty-tree, and latest-commit context with GitHub PR and CI follow-up guidance.

## 1.0.1

- Adds `Veyra: Diagnose Terminal Output` for routing copied or pasted terminal output into a read-only Veyra diagnosis prompt.
- Keeps terminal diagnosis explicit: Veyra does not read terminal scrollback directly and still requires user approval before any suggested command can run.
- Improves the README and Marketplace overview by making the native chat workflow section easier to scan.

## 1.0.0

- Promotes Veyra from Marketplace preview metadata to the v1.0 stable release package.
- Adds workflow templates and workspace role customization for Claude, Codex, and Gemini prompts.
- Adds post-implement verification suggestions with explicit user approval semantics before any command can run.
- Treats slow-agent hang notices as warnings so delayed Gemini responses do not mark an otherwise completed workflow as failed.
- Uses direct file-specific native chat buttons for one-file pending change sets.
- Refreshes docked-view pending change notices after accept/reject actions so resolved file actions disappear immediately.
- Routes docked-view `/review`, `/debate`, `/consensus`, and `/implement` commands through the same all-agent workflow prompts as native Chat.
- Includes the v1.0 stabilization pass over release metadata, changelog, package verification, smoke docs, and completion-audit guidance.

## 0.0.11

- Adds per-file pending change controls so individual agent-edited files can be accepted or rejected before resolving the whole change set.
- Keeps stale pending-change files visible and actionable without overwriting user edits made after an agent edit.
- Renames the command palette entry to `Veyra: Open View` while keeping the `veyra.openPanel` command id for compatibility.

## 0.0.10

- Moves the rich Veyra webview into the VS Code Secondary Side Bar alongside agent views such as Codex and Claude.
- Preserves `Veyra: Open Panel` as the compatibility command while revealing the docked Veyra view.
- Updates smoke validation and docs to verify Secondary Side Bar manifest evidence instead of bottom Panel or editor-tab placement.

## 0.0.9

- Answers low-intent `@veyra` heartbeat prompts locally in both VS Code Chat and the Veyra panel.
- Prevents fresh-session panel heartbeats from dispatching a write-capable fallback agent or triggering onboarding file prompts.
- Adds regression coverage for panel heartbeat handling and local response persistence.

## 0.0.8

- Adds `Veyra: Copy Diagnostic Report` for external tester reports.
- Includes command registration, extension version, workspace trust, backend status, and optional surface evidence in the copied report.
- Extends VS Code smoke coverage and tester docs for diagnostic report collection.

## 0.0.7

- Adds a tester quickstart and troubleshooting checklist to the Marketplace/GitHub README.
- Adds an external tester checklist to the VS Code smoke-test documentation.

## 0.0.6

- Keeps the legacy Veyra panel command usable if optional native chat or language model provider registration fails during activation.
- Adds regression coverage for activation failures that previously could surface as `command 'veyra.openPanel' not found`.

## 0.0.5

- Fixes native chat transcript parsing so PowerShell-style arrays such as `@("package.json", "README.md")` are not surfaced as bogus file mention errors before agent output.
- Records the final manual Extension Development Host smoke pass for `/debate`, `/review`, `/consensus`, and `/implement` after the native chat fix.

## 0.0.4

- Adds Marketplace, source, and issue-tracker links to the README rendered by both GitHub and the Marketplace listing.
- Publishes the current preview docs and workflow surface, including `/consensus`, diff preview, checkpoints, terminal context, and the hardened preview quickstart.

## 0.0.3

- Makes the Veyra icon corners transparent for cleaner Marketplace display.

## 0.0.2

- Replaces the preview icon with the Veyra cyber-sigil app icon.

## 0.0.1

- Initial preview release candidate for Veyra.
- Adds VS Code Chat participants for `@veyra`, `@claude`, `@codex`, and `@gemini`.
- Adds `/review`, `/debate`, and `/implement` all-agent workflows.
- Adds the Veyra Language Model provider, shared context relay, visible file edit events, edit-conflict notices, and live-readiness checks.

# Changelog

## Unreleased

- Adds Trust Center v0.1 to the docked Veyra view, deriving pending changes, checkpoints, edit conflicts, file edits, approved verification status, and Git/CI context from the existing session stream while reusing the same diff, accept/reject, checkpoint, verification, Git, CI, and diagnostics actions as inline notices.

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

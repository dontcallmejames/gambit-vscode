# Veyra GitHub/PR Workflow Awareness v0.2 Design

## Purpose

GitHub/PR Workflow Awareness v0.2 gives users a local-first PR package draft without granting Veyra hidden authority over GitHub, CI, or destructive Git operations.

The command is for the moment right before a user wants to open or update a PR: "What should the PR say, what changed, what risks remain, what evidence do I have, and what exact commands should I consider next?"

## User Flow

1. The user runs `Veyra: Prepare PR Package Draft` from the command palette, Trust Center, or docked composer autocomplete.
2. Veyra optionally reads copied CI/PR output from the clipboard. If none is available, it offers an optional paste box and still proceeds when blank.
3. Veyra collects the same read-only local Git context used by `Veyra: Summarize Git Status`: branch, upstream, ahead/behind counts, dirty tree, changed files, latest commit, and sanitized remotes.
4. Veyra adds local trust evidence when available: pending change sets, checkpoints, and approved verification results recorded in the workspace session.
5. Veyra dispatches a read-only `/review` prompt into the docked view with labelled blocks:
   - `[Git workflow context]`
   - `[PR package context]`
   - `[CI/PR context]`

## Artifact Shape

The prompt asks agents to produce these Markdown headings so the docked view can render artifact cards:

- `PR Summary`
- `Changed File Explanation`
- `Risk Checklist`
- `Verification Evidence`
- `Unresolved Blockers`
- `Suggested Follow-up Commands`

## Guardrails

- No hidden network calls.
- No GitHub API writes.
- No automatic PR creation.
- No CI reruns.
- No automatic push, pull, merge, rebase, reset, clean, or destructive Git commands.
- If follow-up would help, agents may recommend the exact command and wait for explicit user approval.
- Remote URLs and common CI/PR tokens are redacted before prompt dispatch.

## Test Coverage

- Formatter tests cover PR package sections, redaction, no-network guardrails, trust evidence, and missing-output behavior.
- Command tests cover optional clipboard/input handling, read-only Git collection, docked-view dispatch, and forbidden-action non-execution.
- Webview tests cover command allowlisting, Trust Center surfacing, composer autocomplete, and artifact-card parsing.
- Manifest/docs tests cover command contribution, activation event, README, changelog, smoke checklist, roadmap, and completion audit coverage.

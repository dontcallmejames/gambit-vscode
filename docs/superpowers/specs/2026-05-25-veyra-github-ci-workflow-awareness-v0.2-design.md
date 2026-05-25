# Veyra GitHub/CI Workflow Awareness v0.2 Design

## Purpose

GitHub/CI Workflow Awareness v0.1 gave Veyra a local-only Git status summary. Version 0.2 keeps that guardrail and adds one explicit user-provided input path: copied CI logs, PR review notes, GitHub status text, or check output.

The feature helps users ask Veyra, "Is this ready for a PR, and what should I do next?" without giving the extension hidden authority over GitHub, CI, or destructive Git operations.

## User Flow

1. The user copies CI or PR output from a terminal, browser, GitHub page, or review comment.
2. The user runs `Veyra: Review CI/PR Output` from the command palette or docked composer autocomplete.
3. Veyra reads the clipboard. If it is empty, Veyra asks the user to paste the output into an input box.
4. Veyra collects the same read-only local Git context used by `Veyra: Summarize Git Status`: branch, upstream, ahead/behind counts, dirty tree, latest commit, and sanitized remotes.
5. Veyra dispatches a read-only `/review` prompt into the docked view with two labelled blocks:
   - `[Git workflow context]`
   - `[CI/PR context]`

## Prompt Shape

The prompt asks agents to produce:

- Draft PR summary.
- PR readiness checklist.
- CI findings.
- Suggested follow-up commands.

Agents are told to use only local Git evidence and explicit user-provided CI/PR output. They must not claim live remote PR or CI state unless the pasted output contains it.

## Guardrails

- No hidden network automation.
- No automatic push, pull, merge, rebase, reset, or clean.
- No GitHub CLI, GitHub API, or CI command execution from this flow.
- If a follow-up command would help, agents may recommend the exact command and wait for explicit user approval.
- Remote URLs and common CI/PR tokens are redacted before prompt dispatch.

## Test Coverage

- Formatter tests cover PR readiness sections, redaction, and no-network command guardrails.
- Command tests cover clipboard input, explicit input fallback, empty input cancellation, Git context collection, and docked-view dispatch.
- Manifest/docs tests cover command contribution, activation event, README, and smoke-test documentation.
- Composer tests cover autocomplete discovery and webview command allowlisting.

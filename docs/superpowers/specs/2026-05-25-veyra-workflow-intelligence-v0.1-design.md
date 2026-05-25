# Veyra Workflow Intelligence v0.1 Design

**Date:** 2026-05-25
**Status:** Implemented in this slice
**Author:** Codex

## Goal

Workflow Intelligence v0.1 should make Veyra's existing serial workflows easier to scan and act on without adding a new orchestrator, paid facilitator pass, or dispatch path.

## Scope

This slice keeps the current `@all` workflow path and tightens the prompt contract in `src/workflowPrompts.ts`.

### Review

Each agent must use the same Markdown outline:

- Summary
- Blocking issues
- Advisory risks
- Missing tests
- Follow-up suggestions

Agents use `None found` for empty categories and ground findings in file paths, lines, commands, or observed behavior when available.

Gemini still runs last and must end with a `Veyra Synthesis` containing:

- Recommendation
- Blocking issues
- Advisory risks
- Missing tests
- Follow-up suggestions
- Next action

### Implement

The implementation workflow remains write-capable. Gemini's final `Handoff Summary` now has a stable outline:

- What changed
- Verification status
- Remaining risks
- Follow-up suggestions
- Recommended next action

If verification did not run, the handoff says `Not run`.

## Non-Goals

- No new workflow command.
- No new backend/facilitator synthesis request.
- No custom workflow renderer.
- No change to agent order, read-only enforcement, checkpoints, diff preview, or rollback.

## Verification

- Prompt contract tests cover the review outline, synthesis outline, and implementation handoff.
- Manifest documentation tests keep README language aligned with the workflow output shape.
- Full verification remains the completion gate.

# Veyra Command Autocomplete Discovery v0.1 Design

**Date:** 2026-05-25
**Status:** Implemented in this slice
**Author:** Codex

## Goal

Help users discover the Veyra commands they need from the docked Veyra composer while they are already typing.

## Scope

This slice extends the existing composer autocomplete rather than adding a separate help panel or onboarding page.

### Triggers

- `@` keeps the existing agent mention autocomplete for Claude, Codex, Gemini, and all agents.
- `/` opens workflow and command discovery.

### Workflow Suggestions

Workflow suggestions insert text into the composer:

- `/review`
- `/debate`
- `/consensus`
- `/implement`

### Command Actions

Command-palette suggestions execute whitelisted Veyra commands directly from the webview:

- `Veyra: Open Pending Changes`
- `Veyra: Run Verification Command`
- `Veyra: Summarize Git Status`
- `Veyra: Create Checkpoint`
- `Veyra: Roll Back Latest Checkpoint`
- `Veyra: Check agent status`
- `Veyra: Copy Diagnostic Report`

The extension host validates the command id against an allowlist before calling `vscode.commands.executeCommand`.

## UX Notes

- Keyboard navigation remains ArrowUp/ArrowDown, Enter, and Escape.
- Mouse picking remains supported.
- Descriptions stay short so the composer does not become a second documentation surface.

## Verification

- Autocomplete tests cover item order, filtering, insertion, command action ids, and rendering.
- Composer tests cover slash-token routing into the autocomplete popover.
- Panel/controller tests cover whitelisted command execution and unknown command rejection.
- README tests keep user-facing command discovery documentation in sync.

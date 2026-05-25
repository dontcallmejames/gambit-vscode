# Veyra Terminal Awareness v0.2 Design

## Goal

Terminal Awareness v0.2 adds an approved verification runner. Users can choose a likely project verification command, approve the exact command text, watch it run in a visible VS Code terminal, and send the bounded result back into Veyra as read-only terminal context.

## Context

v0.1 already detects project command hints and tells agents not to run them without explicit approval. It also lets users diagnose copied or pasted terminal output. v0.2 connects those pieces: Veyra may run a detected verification command only after the user picks it and confirms the exact command.

## User Flow

1. The user runs `Veyra: Run Verification Command`.
2. Veyra reads local package metadata and offers safe verification-oriented scripts such as `verify`, `test`, `typecheck`, `lint`, `build`, or `check`.
3. Veyra asks for modal approval of the exact command line.
4. Veyra opens a visible terminal and runs the command through VS Code shell integration so stdout/stderr output and exit status can be captured.
5. Veyra bounds the captured output, strips ANSI escape codes, and routes a read-only `/review` prompt with `[Terminal context]` back into the docked view.

## Guardrails

- No command runs from prompt hints alone.
- No command runs without exact-command approval.
- Destructive-looking package scripts are filtered out of the runner choices.
- If VS Code shell integration is unavailable, Veyra refuses the run instead of falling back to hidden execution without output or exit status.
- The verification result is context, not an instruction to run more commands.

## Testing

- Unit tests cover verification-result prompt formatting, approval gating, destructive-script filtering, terminal output capture, ANSI stripping, and Veyra context dispatch.
- Extension and manifest tests cover the new command-palette contribution.
- Existing project-command, workflow, and service tests continue to cover command hints and post-implement suggestion semantics.

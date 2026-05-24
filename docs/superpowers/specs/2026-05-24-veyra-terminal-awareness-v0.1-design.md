# Veyra Terminal Awareness v0.1 Design

## Goal

Terminal Awareness v0.1 gives users a command-palette flow for asking Veyra to diagnose terminal output without hidden terminal scraping or automatic command execution.

## Constraints

VS Code's stable terminal API exposes active terminals and shell-integration execution streams, but it does not expose arbitrary terminal selection or scrollback to extensions. Shell-integration `read()` only captures output after an extension starts or observes a command execution. For v0.1, terminal output must therefore be explicit user-provided text.

## User Flow

1. The user selects terminal output and copies it, or runs the command and pastes the output when prompted.
2. The user runs `Veyra: Diagnose Terminal Output`.
3. Veyra reads copied clipboard text when available; otherwise it asks the user to paste terminal output.
4. Veyra bounds large output and routes a read-only diagnosis prompt into the Veyra panel.
5. The prompt includes a labelled `[Terminal context]` block and tells agents not to run commands unless the user approves the exact command.

## Architecture

- Add a focused `terminalAwareness.ts` module for prompt formatting, output bounding, and command registration.
- Register `veyra.diagnoseTerminalOutput` from `extension.ts` beside other command-palette commands.
- Reuse the active `VeyraSessionService` registration and `revealVeyraView()` so terminal diagnosis appears in the docked Veyra view.
- Dispatch the diagnosis as `readOnly: true` and `source: "panel"` to preserve non-mutating behavior.

## Error Handling

- If no workspace is open, show the existing workspace-required error style.
- If clipboard text is empty and the paste prompt is cancelled or empty, do not dispatch.
- If output is longer than the bound, keep the tail because terminal failures usually appear near the end and include a truncation note.
- If service dispatch fails, show a warning with the error text.

## Testing

- Unit-test terminal prompt formatting and truncation.
- Extension-test command registration, clipboard capture, paste fallback, empty cancellation, workspace guard, read-only dispatch, and panel reveal.
- Manifest-test command contribution and activation event.


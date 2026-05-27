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

## Detailed Guides

- [User Guide](https://github.com/dontcallmejames/veyra-vscode/blob/main/docs/user-guide.md): native chat commands, composer discovery, workflow modes, context and retrieval tuning, trust controls, Language Model provider usage, checkpoints, and settings.
- [Developer And Verification Guide](https://github.com/dontcallmejames/veyra-vscode/blob/main/docs/developer-verification.md): local development, package verification, smoke tests, live readiness, live validation, and CLI path troubleshooting.

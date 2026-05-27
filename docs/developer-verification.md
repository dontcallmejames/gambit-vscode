# Veyra Developer And Verification Guide

This guide contains the development, packaging, CLI-path, and verification details that are too deep for the Marketplace README but still need to ship with the VSIX.

## Development

```powershell
npm install
npm run build
```

Open the folder in VS Code, then press `F5` or run the `Run Extension` launch configuration from `.vscode/launch.json`. The launch config builds first with `npm: build`, then starts an Extension Development Host from `dist/extension.js`. If you package a VSIX with your preferred VS Code extension workflow, build first; the package `files` allowlist keeps the VSIX focused on the bundled runtime instead of local source, tests, scripts, or `node_modules/`.

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

`npm run verify:live-ready` prints the selected Google provider path in its readiness context. When Antigravity is selected, any configured legacy Gemini path remains a large-prompt runtime fallback but is not used to decide Antigravity readiness.

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

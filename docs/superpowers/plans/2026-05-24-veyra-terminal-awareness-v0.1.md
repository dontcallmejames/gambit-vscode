# Veyra Terminal Awareness v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a command-palette terminal diagnosis flow that routes explicit user-provided terminal output into Veyra with read-only, approval-preserving prompt context.

**Architecture:** Create `src/terminalAwareness.ts` for prompt construction and command registration. Wire it from `src/extension.ts`, contribute the command in `package.json`, and document the explicit copy/paste terminal-output flow.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, existing Veyra session dispatch pipeline.

---

### Task 1: Terminal Prompt Formatting

**Files:**
- Create: `src/terminalAwareness.ts`
- Test: `tests/terminalAwareness.test.ts`

- [x] **Step 1: Write failing formatting tests**

Add tests that import `formatTerminalDiagnosisPrompt` and `prepareTerminalOutputForPrompt`. Assert that terminal output is wrapped in `[Terminal context]`, asks for diagnosis, preserves command-approval semantics, trims whitespace, and truncates long output with a note while keeping the tail.

- [x] **Step 2: Run formatting tests red**

Run: `npx vitest run --environment node tests/terminalAwareness.test.ts`
Expected: fail because `src/terminalAwareness.ts` does not exist yet.

- [x] **Step 3: Implement prompt helpers**

Create `src/terminalAwareness.ts` with exported helpers:
- `prepareTerminalOutputForPrompt(output: string, maxChars?: number): string`
- `formatTerminalDiagnosisPrompt(output: string): string`

- [x] **Step 4: Run formatting tests green**

Run: `npx vitest run --environment node tests/terminalAwareness.test.ts`
Expected: pass.

### Task 2: Command Registration And Dispatch

**Files:**
- Modify: `src/terminalAwareness.ts`
- Modify: `src/extension.ts`
- Test: `tests/extension.test.ts`

- [x] **Step 1: Write failing extension tests**

Add tests that expect `veyra.diagnoseTerminalOutput` to be registered, read clipboard text, reveal the Veyra view, dispatch a read-only panel request containing terminal context, fall back to `showInputBox` when clipboard is empty, and skip dispatch when no text is provided.

- [x] **Step 2: Run extension tests red**

Run: `npx vitest run --environment node tests/extension.test.ts tests/terminalAwareness.test.ts`
Expected: fail because the command is not registered.

- [x] **Step 3: Implement command registration**

Add `registerTerminalAwarenessCommands(context, getRegistration)` in `src/terminalAwareness.ts`, call it from `activate()` in `src/extension.ts`, and route dispatch through the existing Veyra service with `readOnly: true`.

- [x] **Step 4: Run extension tests green**

Run: `npx vitest run --environment node tests/extension.test.ts tests/terminalAwareness.test.ts`
Expected: pass.

### Task 3: Manifest And Docs

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `tests/manifest.test.ts`

- [x] **Step 1: Write or update manifest tests**

Assert that `package.json` contributes `veyra.diagnoseTerminalOutput`, activates on it, and docs mention `Veyra: Diagnose Terminal Output`.

- [x] **Step 2: Run manifest test red if needed**

Run: `npx vitest run --environment node tests/manifest.test.ts`
Expected before manifest/docs edits: fail for missing command/docs evidence.

- [x] **Step 3: Update manifest and docs**

Add the command contribution and activation event. Document explicit copied/pasted terminal output, read-only diagnosis, and no automatic command execution. Add an Unreleased changelog entry.

- [x] **Step 4: Run targeted tests**

Run: `npx vitest run --environment node tests/terminalAwareness.test.ts tests/extension.test.ts tests/manifest.test.ts tests/projectCommands.test.ts tests/workflowPrompts.test.ts tests/nativeChat.test.ts`
Expected: pass.

### Task 4: Verification

**Files:**
- No new files.

- [x] **Step 1: Run full verification**

Run: `npm run verify`
Expected: typecheck, unit tests, build, package dry-run, integration tests, and `git diff --check` pass.

- [x] **Step 2: Inspect final diff**

Run: `git status --short` and `git diff --stat`
Expected: only Terminal Awareness implementation, docs, tests, and existing untracked live validation guide.


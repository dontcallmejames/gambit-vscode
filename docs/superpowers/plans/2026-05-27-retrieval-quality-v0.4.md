# Retrieval Quality v0.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible, local-only missed-context loop for `@codebase` retrieval feedback and harden local lexical ranking with file-name, symbol, test, and import signals.

**Architecture:** Keep missed-context marks in webview-only state keyed to the latest retrieval summary. Keep retrieval scoring inside `src/workspaceContext.ts` and expose every new signal through selected-file reasons. Do not add persistence, embeddings, uploads, background indexing, hidden memory, automatic dispatch, or new extension-host protocol messages.

**Tech Stack:** TypeScript, Preact, Vitest, VS Code extension webview state, existing Veyra retrieval feedback and workspace context modules.

---

## File Structure

- Modify `src/webview/retrievalFeedback.ts`: add marked-missing helpers and include marked paths in drafts and reports.
- Modify `src/webview/components/RetrievalFeedbackPanel.tsx`: render the "Known missing files" UI through pure props.
- Modify `src/webview/App.tsx`: keep marked-missing state local to the webview and reset it when `sourceMessageId` changes.
- Modify `src/webview/styles.css`: add compact styles for the new input/list controls.
- Modify `src/workspaceContext.ts`: add explainable scoring helpers for exact file-name/path segments, symbol declarations, test paths, and imports.
- Modify `tests/retrievalFeedback.test.tsx`: cover helper behavior and panel actions.
- Modify `tests/workspaceContext.test.ts`: cover ranking-signal behavior and selected reasons.
- Modify `tests/manifest.test.ts`: keep packaged docs expectations aligned.
- Modify `CHANGELOG.md`, `docs/user-guide.md`, `docs/goal-completion-audit.md`, and `docs/superpowers/specs/2026-05-11-veyra-v1-roadmap-design.md`: document the feature and verification evidence.

### Task 1: Missed-Context Helper Tests

**Files:**
- Modify: `tests/retrievalFeedback.test.tsx`
- Modify: `src/webview/retrievalFeedback.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that `normalizeMarkedMissingFilePath(' @src/auth/session.ts ')` returns `src/auth/session.ts`, invalid blank input returns `null`, duplicate marked paths are deduped, `buildMissingFileDraft(summary, ['src/auth/session.ts'])` includes `@src/auth/session.ts`, and `buildRetrievalFeedbackReport(summary, ['src/auth/session.ts'])` records the known missing file.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/retrievalFeedback.test.tsx`

Expected: FAIL because the helpers and optional report/draft parameters are not implemented yet.

- [ ] **Step 3: Implement helpers**

Add exported helpers in `src/webview/retrievalFeedback.ts`: `normalizeMarkedMissingFilePath`, `addMarkedMissingFile`, `buildMissingFileDraft`, and optional `markedMissingFiles` parameters for existing draft/report builders.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/retrievalFeedback.test.tsx`

Expected: PASS.

### Task 2: Missed-Context Panel State

**Files:**
- Modify: `tests/retrievalFeedback.test.tsx`
- Modify: `src/webview/components/RetrievalFeedbackPanel.tsx`
- Modify: `src/webview/App.tsx`
- Modify: `src/webview/styles.css`

- [ ] **Step 1: Write failing panel tests**

Extend the panel test to pass `markedMissingFiles`, `missingFileInput`, `onMissingFileInput`, and `onMarkMissingFile`. Assert that the expanded panel shows "Known missing files", calls `onMarkMissingFile('src/auth/middleware.ts')`, drafts marked files, and copies reports including marked missing evidence.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/retrievalFeedback.test.tsx`

Expected: FAIL because the panel props and controls do not exist yet.

- [ ] **Step 3: Implement panel and webview state**

Add pure props to `RetrievalFeedbackPanel`, render the input/list/buttons, and in `App` keep `{ sourceMessageId, input, files }` with a reset effect for new retrieval summaries.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/retrievalFeedback.test.tsx`

Expected: PASS.

### Task 3: Lexical Ranking Signals

**Files:**
- Modify: `tests/workspaceContext.test.ts`
- Modify: `src/workspaceContext.ts`

- [ ] **Step 1: Write failing ranking tests**

Add tests proving symbol declarations beat generic content, exact test paths beat non-test files for testing queries, and import-path matches beat unrelated content-only files. Assert visible reasons such as `symbol:paymentprocessor`, `test-path`, and `import:session`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/workspaceContext.test.ts`

Expected: FAIL because the new ranking reasons are not emitted yet.

- [ ] **Step 3: Implement scorer helpers**

In `src/workspaceContext.ts`, add helpers that tokenize path segments and basenames, extract declaration symbols, extract import specifiers/paths, identify testing queries and test paths, and add weighted reasons into `scoreFile`.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/workspaceContext.test.ts`

Expected: PASS.

### Task 4: Docs And Manifest Expectations

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/user-guide.md`
- Modify: `docs/goal-completion-audit.md`
- Modify: `docs/superpowers/specs/2026-05-11-veyra-v1-roadmap-design.md`
- Modify: `tests/manifest.test.ts`

- [ ] **Step 1: Write or update docs tests**

Update `tests/manifest.test.ts` so packaged docs must mention Retrieval Quality v0.4, visible/manual missed-context feedback, no hidden memory, no embeddings, no background indexing, and file-name/symbol/test/import lexical signals.

- [ ] **Step 2: Run manifest tests and confirm failure**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/manifest.test.ts`

Expected: FAIL until docs are updated.

- [ ] **Step 3: Update docs**

Document Retrieval Quality v0.4 in changelog, user guide, goal-completion audit, and roadmap implementation notes. Include verification evidence after commands are run.

- [ ] **Step 4: Run focused docs tests and confirm pass**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/manifest.test.ts`

Expected: PASS.

### Task 5: Final Verification And Audit

**Files:**
- Inspect: current worktree and test output
- Modify if needed: files above

- [ ] **Step 1: Run focused regression set**

Run: `npx vitest run --environment node --exclude ".vscode-test/**" tests/retrievalFeedback.test.tsx tests/workspaceContext.test.ts tests/veyraService.test.ts tests/manifest.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 3: Audit every objective requirement**

Inspect current code, tests, docs, and command output. Confirm each explicit objective item has direct evidence: missed-context marking/drafting, report evidence, ranking-signal hardening, visible/manual semantics, prohibited features absent, docs/changelog, and verification evidence.

- [ ] **Step 4: Commit the completed implementation**

Run:

```bash
git add src tests docs CHANGELOG.md
git commit -m "feat: add retrieval quality v0.4"
```

Expected: Commit succeeds with the implementation and documentation.

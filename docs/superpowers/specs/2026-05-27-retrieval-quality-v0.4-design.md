# Retrieval Quality v0.4 Design

**Date:** 2026-05-27
**Status:** Approved for implementation
**Author:** Codex

## Summary

Retrieval Quality v0.4 improves `@codebase` without changing Veyra's local-first trust model. The feature adds a visible missed-context feedback loop to the Retrieval Feedback panel and strengthens local lexical ranking so file names, symbol declarations, test files, and import paths can outweigh weaker generic content matches.

The feedback loop is intentionally manual. Users can mark known missing file paths in the current Retrieval Feedback panel, draft an explicit follow-up using those paths, and copy a retrieval report that records the marked files as evidence. Veyra does not persist these marks as hidden memory, silently rerun retrieval, send prompts, create background indexes, upload code, or call embeddings.

## User Experience

After an `@codebase` request, the expanded Retrieval Feedback panel adds a "Known missing files" section. It shows the currently marked paths, an input for a workspace-relative path, and buttons to mark the typed path or draft the marked files. The global "Refine @codebase query" and "Copy retrieval report" actions include the same marked paths.

The marks live only in the docked webview state for the latest retrieval-feedback source message. When a new retrieval summary arrives, the input and marked list reset. This makes the evidence visible and reversible during the current review without creating a separate ranking store.

## Architecture

The implementation stays within existing modules:

- `src/webview/retrievalFeedback.ts` owns pure helpers for normalizing marked paths, deduping them, and including them in drafts and reports.
- `src/webview/App.tsx` owns webview-only state keyed by `sourceMessageId` so marks reset on the next retrieval result.
- `src/webview/components/RetrievalFeedbackPanel.tsx` stays a pure component that receives marked paths and callbacks from `App`.
- `src/workspaceContext.ts` keeps retrieval local and lexical while adding explainable scoring reasons for exact file-name/path segments, symbol declarations, test paths, and import paths.

No extension-host persisted session schema changes are required. No `FromWebview` protocol message is required for marked missing paths because they do not need to cross into the extension host until the user explicitly sends a prepared composer draft.

## Ranking Signals

The lexical scorer should remain simple and explainable:

- Existing content matches still count.
- File path and basename matches gain stronger exact segment and basename-stem signals.
- TypeScript/JavaScript-like symbols from `class`, `function`, `interface`, `type`, `enum`, `const`, `let`, and `var` declarations add `symbol:<term>` reasons.
- Import specifiers and imported paths add `import:<term>` reasons.
- Queries that include testing terms such as `test`, `tests`, `spec`, `coverage`, or `regression` boost files in `tests/`, `__tests__/`, or files named `.test.*` / `.spec.*`.

The scorer still reads only candidate files chosen from the existing workspace inventory and `git grep` path/content prefilter. It does not create a background index.

## Guardrails

- No embeddings, vector calls, paid embedding calls, uploads, cloud indexing, or background indexing.
- No hidden dispatch, hidden workflow replay, hidden terminal command, or automatic prompt send.
- No hidden memory or persisted missed-file feedback store.
- Marked paths are copied into visible drafts and reports only.
- Marked paths are treated as user-supplied hints, not proof that the files exist or should be opened automatically.

## Testing

Focused tests should prove:

- Marked missing paths normalize and dedupe safely.
- Refine drafts, missing-file drafts, and copied reports include marked missing evidence.
- The Retrieval Feedback panel exposes the input, marked list, mark action, draft action, and report action without dispatching.
- The lexical scorer ranks exact file names, symbol declarations, test paths, and import paths ahead of weaker content-only matches, with reasons visible in selected-file evidence.
- Docs and changelog describe the manual local-only loop and ranking-signal hardening.

## Verification

Run focused Vitest coverage for retrieval feedback, workspace context, service routing, and manifest/docs expectations, then run `npm run verify`. Record the verification commands and outcomes in `docs/goal-completion-audit.md`.

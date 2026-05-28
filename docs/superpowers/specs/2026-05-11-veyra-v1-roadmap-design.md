# Veyra Current Roadmap

**Originally drafted:** 2026-05-11
**Updated:** 2026-05-28
**Current release:** 1.0.21
**Status:** Living roadmap
**Author:** Codex

This file keeps the original roadmap path so older implementation plans and audits keep linking to one source of truth. The content is now current to the 1.0.21 release instead of preserving the stale May 11 milestone ladder.

## 1. Product Thesis

Veyra's strongest position is still:

> The safest way to coordinate multiple strong coding agents inside the editor you already use.

The May 11 roadmap framed this as a **Context + Trust Spine**:

1. Give agents enough workspace context to be useful on real repositories.
2. Show every meaningful change they make.
3. Let the user inspect, accept, reject, or roll back work before trust is lost.
4. Make multi-agent review, debate, consensus, and implementation visible as an engineering workflow, not just chat.

That spine is now substantially shipped. The live roadmap should therefore focus less on "reach v1.0 parity" and more on making the shipped system easier to trust, easier to validate, and less noisy during real project work.

Veyra should continue to avoid full competitor sprawl. Inline autocomplete, local models, browser context, GitHub/PR context, workflow replay, and retrieval feedback all matter, but they are useful because they strengthen the local, inspectable multi-agent loop. They should not turn Veyra into a hidden autonomous editor or a remote workflow bot.

## 2. What Changed Since The Original Roadmap

The original roadmap described a future v1.0. Since then, the product shipped the core spine and several later-parity candidates:

| Original area | Current state |
| --- | --- |
| Preview hardening | Shipped through setup checks, diagnostic reports, README cleanup, smoke docs, live-readiness gates, package verification, and marketplace-focused copy. |
| Workspace context | Shipped `@codebase`, `@file`, local lexical retrieval, prompt budgeting, retrieval evidence, retrieval feedback, and stronger ranking signals. |
| Diff preview | Shipped pending-change ledgers, open diff, whole-dispatch accept/reject, per-file accept/reject, and file badges. |
| Checkpoints and rollback | Shipped automatic/manual checkpoints, checkpoint listing, rollback commands, and overwrite warnings. |
| Workflow intelligence | Shipped `/review`, `/debate`, `/consensus`, `/implement`, role customization, workflow templates, stronger workflow prompts, and structured outputs. |
| Terminal awareness | Shipped terminal diagnosis, approved verification commands, project command hints, Git summary, CI/PR output review, and PR package drafts. |
| Provider migration | Shipped Claude CLI, Codex CLI, Antigravity-first Google provider hardening, legacy Gemini fallback, readiness diagnostics, and provider transparency. |
| Output polish | Shipped safe Markdown rendering, provider transparency, and clearer diagnostic reports. |
| Presentation layer | Shipped Mission Control timeline, Structured Workflow Artifact Cards, Trust Center, Presentation Density v0.1, Workflow Replay, and Workflow Artifact History. |
| Later parity candidates | Shipped conservative versions of Inline Autocomplete, Browser Testing Awareness, Local Model Support, GitHub/PR Workflow Awareness, retrieval measurement, and workflow replay. |

The roadmap's center of gravity is now evidence quality: how Veyra proves which context was used, what changed, which actions are user-approved, and when the next larger capability is actually justified.

## 3. Shipped Foundation At 1.0.21

### Multi-agent workflow core

Veyra coordinates Claude, Codex, and the Google agent path through a shared session service used by the docked view, native chat, and Language Model provider. The core workflows are:

- `/review` for multi-agent code and risk review.
- `/debate` for contrasting agent opinions.
- `/consensus` for a facilitator synthesis and recommended next action.
- `/implement` for write-capable implementation with visible trust controls.

The workflow layer now supports role customization, workflow templates, stronger handoff summaries, artifact headings, and manual replay preparation. These are still intentionally user-directed. Veyra should not silently replay workflows, rerun terminal work, mutate a transcript, or create hidden long-term learning state.

### Workspace context and retrieval

`@codebase` is no longer just a concept. It uses local lexical retrieval, workspace inventory, query terms, selected-file evidence, omitted-match/budget notes, and prompt-budget controls to make context inspectable. Retrieval Quality and Embedding Readiness v0.1 established the core guardrails: no cloud indexing, no paid embedding calls, and no background repository scans.

Retrieval Feedback v0.3 added the docked-view feedback panel for the latest `@codebase` turn. It shows selected files, omitted match counts, budget notes, and local lexical rationale. Its actions can open selected files, prepare visible refined `@codebase` drafts, prepare explicit `@file` mention drafts, and copy local retrieval reports. The guardrails remain explicit: these actions do not silently dispatch prompts, execute commands, call embeddings, upload code, create background indexes, or persist hidden memory.

Retrieval Quality v0.4 added visible/manual missed-context feedback. Users can mark Known missing files, draft explicit file mentions, and copy reports that include marked evidence. Local lexical ranking now records file-name, symbol, test, and import signals. It does not add embeddings, uploads, background indexing, hidden memory, or automatic dispatch; the short guardrail remains no embeddings, no background indexing, and no hidden memory.

### Change trust and rollback

The trust layer now includes pending-change capture, built-in VS Code diff views, whole-dispatch accept/reject, per-file accept/reject, file badges, edit-conflict detection, commit attribution, automatic and manual checkpoints, checkpoint lists, rollback commands, and warnings when rollback would overwrite later user edits.

This remains the product's central moat. Veyra can coordinate multiple agents because it gives the user a place to see what happened and decide what is allowed to stick.

### Presentation Layer

The docked view now has a real workflow surface:

- Mission Control timeline shows agent stages, current floor, queued/active/complete/failed/cancelled/waiting state, pending file counts, checkpoint availability, verification state, and compact section controls.
- Structured Workflow Artifact Cards render sections such as Veyra Synthesis, Recommendation, Blocking issues, Advisory risks, Missing tests, Follow-up suggestions, Next action, and Handoff Summary while keeping safe Markdown fallback for unknown or malformed prose.
- Trust Center consolidates pending changes, checkpoints, file edits, edit conflicts, approved verification state, Git/CI context, PR-package actions, diagnostics, and rollback affordances through the same command paths used by inline notices.
- Presentation Density v0.1 keeps Mission Control always visible, moves Trust Center and Workflows behind compact chips, combines Workflow Replay and Workflow Artifact History into one capped Workflows panel, persists expanded/collapsed panel state, and auto-opens Trust Center for urgent actionable signals.

Workflow Artifact History v0.2 derives a compact local-only history from existing session messages and creates no separate source of truth. It does not perform hidden terminal execution, file edits, Git/GitHub actions, network calls, automatic workflow reruns, or automatic replay.

### Explicit external context

Veyra has conservative local-first slices for context outside the immediate chat:

- Browser Testing Awareness v0.1 accepts user-provided Playwright, Cypress, Vitest UI, browser console, network, screenshot-note, URL-note, and reproduction text, then asks agents for structured browser/test analysis. It does not launch browsers, scrape pages, rerun tests, edit files, or execute commands without separate approval.
- GitHub/PR Workflow Awareness v0.2 adds `Veyra: Prepare PR Package Draft` from read-only Git state, pending-change evidence, checkpoint evidence, approved verification evidence, and optional user-provided CI/PR output. It does not make hidden network calls, perform GitHub API writes, create PRs, rerun CI, or run push/pull/merge/rebase/reset/clean actions.
- Terminal diagnosis and approved verification commands bring build/test output into the agent loop without hidden shell execution.

### Provider and runtime transparency

Veyra now exposes Claude CLI, Codex CLI, and Antigravity CLI or legacy Gemini CLI fallback diagnostics without hardcoded model promises. Safe Markdown rendering and provider transparency are treated as trust features, not cosmetic polish. Diagnostics should continue to distinguish configured CLI paths, detected readiness, backend-reported model metadata when available, and what Veyra can or cannot prove.

Local Model Support v0.1 is diagnostics-only. Users can record a local/self-hosted provider label, endpoint, and model for diagnostic reports, but Veyra keeps Claude, Codex, and Gemini routing unchanged. It performs no automatic model downloads, no hidden server launches, and no background network probing.

### Inline assistance

Inline Autocomplete v0.1 is conservative and opt-in. It responds only to manual inline suggestion invocation when enabled, sends a small editor context window to one configured direct Veyra agent as a read-only request, and accepts only short insert-only ghost text. It should remain subordinate to Veyra's multi-agent trust surface unless usage data proves it deserves more investment.

## 4. Current Guardrails

These guardrails define what keeps Veyra distinct:

- **Local-first evidence:** workspace context comes from the local project unless the user explicitly supplies external text or configures a local/self-hosted diagnostic target.
- **Visible drafts before action:** retrieval refinements, explicit file mentions, replay requests, PR packages, browser/test reviews, and verification follow-ups should prepare visible drafts or require explicit command approval.
- **No hidden authority:** no hidden terminal execution, no hidden browser launches, no hidden Git/GitHub writes, no hidden network calls, no background indexes, no persisted hidden retrieval memory, and no automatic dispatch from feedback controls.
- **One source of truth:** Mission Control, Trust Center, Workflows, file badges, inline notices, and diagnostics should derive from the same session events, change sets, checkpoint metadata, and command handlers.
- **Evidence beats agent confidence:** badges and summaries should distinguish "agent said this" from "Veyra observed this file diff, checkpoint, terminal result, Git state, or CI/PR text."

When a proposed feature weakens these guardrails, it should either be redesigned as an explicit local action or deferred.

## 5. Active Roadmap

### 5.1 Retrieval Quality v0.5

**Goal:** Turn the v0.4 missed-context loop into better day-to-day retrieval decisions without adding embeddings or hidden memory prematurely.

**Ship:**

- A lightweight retrieval review flow that compares selected files, omitted files, marked Known missing files, and draft follow-up files across a single session.
- Copyable report sections that make retrieval misses easier to paste into an issue, changelog note, or follow-up prompt.
- Ranking diagnostics that explain whether file-name, symbol, test, import, or content signals dominated a result.
- A focused set of dogfood examples from this repository, especially roadmap/docs, webview, manifest, retrieval, and workflow-history tasks.
- Test coverage that proves the feedback loop remains visible/manual and does not silently dispatch, persist hidden memory, call embeddings, upload code, or create background indexes.

**Non-goals:**

- No embedding service.
- No vector database.
- No background repository indexing.
- No cross-session hidden ranking store.
- No automatic prompt rerun when a user marks a missing file.

**Success criteria:**

- A user can tell why retrieval picked each file and what it likely missed.
- A missed-context report can be used to improve a follow-up prompt without manual reconstruction.
- Dogfood reports produce enough evidence to decide whether lexical tuning is still enough or vector retrieval is justified.

### 5.2 Roadmap and docs consolidation

**Goal:** Keep public docs, user docs, release notes, smoke docs, goal audits, and roadmap promises aligned now that the product has moved quickly past the original v1.0 plan.

**Ship:**

- Keep this roadmap as the live strategy document.
- Keep README compact and product-focused.
- Keep `docs/user-guide.md` as the feature-detail home.
- Keep `CHANGELOG.md` as the release-by-release history.
- Keep `docs/goal-completion-audit.md` as the verification/audit trail.
- Keep manifest tests checking that shipped capabilities are documented in the right places without pinning stale implementation-note prose.

**Success criteria:**

- A new user can read README first, then the user guide for depth, without falling into stale release archaeology.
- A maintainer can read this roadmap and know what is shipped, active, deferred, and still undecided.

### 5.3 Provider adapter hardening v0.3

**Goal:** Make the provider path boring and inspectable, especially around Antigravity and legacy Gemini fallback.

**Ship:**

- Stronger readiness diagnostics for Antigravity CLI prompt limits, stdin fallback, configured paths, and backend-reported metadata.
- Clearer docs around why the visible Google agent identity may remain Gemini while Antigravity powers the runtime path.
- Tests around prompt-length fallback guidance and model/provider metadata wording.
- A removal decision point for legacy Gemini CLI fallback after real tester evidence says Antigravity covers the needed non-interactive contract.

**Non-goals:**

- No hardcoded vendor model claims.
- No visible rename from `@gemini` to `@antigravity` until user-facing clarity beats continuity.
- No local-model runtime replacement in this pass.

### 5.4 Trust and workflow surface polish

**Goal:** Reduce noise now that Mission Control, Trust Center, Workflows, artifact cards, replay, and retrieval feedback all share the top of the docked view.

**Ship:**

- Better prioritization for urgent Trust Center states versus quiet historical signals.
- Tighter Workflows panel copy for replay/history entries.
- Clearer differentiation between pending changes, accepted changes, rejected changes, checkpoint availability, and rollback risk.
- Artifact-card improvements where structured headings are stable, while unknown prose stays safe Markdown.
- Accessibility and theme checks for dense controls in light, dark, and high-contrast modes.

**Non-goals:**

- No second source of truth for trust state.
- No hidden verification loop.
- No automatic rollback.

### 5.5 Manual validation loop

**Goal:** Make it easier to prove releases with the real extension host and real local CLIs.

**Ship:**

- A smaller manual validation checklist for `/review`, `/debate`, `/consensus`, `/implement`, retrieval feedback, pending changes, checkpoints, rollback, Trust Center, and diagnostics.
- Better copy/paste capture points for live tester evidence.
- Continued separation between no-paid local verification, live-readiness checks, opt-in paid live tests, and residual manual Extension Host checks.

**Success criteria:**

- A release pass can identify which behaviors were covered by automated tests, which were covered by local CLI readiness, and which still require a human Extension Host run.

## 6. Deferred Bets

### Embedding or vector retrieval

Still valuable, but only after v0.4/v0.5 missed-context evidence proves lexical retrieval is the bottleneck. The trigger should be repeated real misses that file-name, symbol, test, import, and content ranking cannot fix. Any vector plan must preserve local-first expectations and make indexing, storage, cost, and deletion behavior explicit.

### Deeper GitHub/GitLab writes

Creating PRs, mutating issues, rerunning CI, or pushing branches would be useful for teams, but those actions cross an authority boundary. Keep local PR package drafts and pasted CI/PR output first. Remote writes should wait until Trust Center provenance, approvals, and audit trails are stronger.

### Cost and token meters

Useful for enterprise budgeting, but provider CLIs still do not expose consistent, comparable usage metadata. Do not block retrieval, trust, or workflow polish on this.

### Auto-rollback on verification failure

Useful in theory and scary in practice. Rollback should remain explicit until Veyra can prove verification provenance, file ownership, user edits after checkpoint, and Trust Center state with very high confidence.

### Local model runtime routing

Diagnostics-only local/self-hosted support is enough for now. Runtime replacement should wait until provider adapter boundaries are cleaner and users can understand exactly when a local endpoint is receiving code.

### Browser automation

Browser Testing Awareness is intentionally paste-in/context-in. Hidden browser launch, screenshot capture, network inspection, and automatic reruns should remain out of scope unless the product explicitly chooses a web-app testing lane.

### Parallel worktrees and autonomous project management

Multi-worktree execution could become a powerful Veyra-native capability, but it would multiply trust, rollback, Git, and verification complexity. It should wait until the single-workspace trust surface is mature and boring.

## 7. Decisions Still Open

- What missed-context evidence is strong enough to start an embedding/vector retrieval design.
- Whether the visible Google agent label should stay `@gemini`, shift to `@antigravity`, or expose both provider identity and runtime identity.
- Which backend-reported model metadata is reliable enough to label as "actual model used" rather than configured/default/provider-reported.
- Whether workflow templates should remain VS Code settings, move into a workspace file, or support both.
- How much Trust Center detail belongs in the docked view versus a separate contributed VS Code view if the surface keeps growing.
- What the next named product promise should be after the v1.0 trust spine: retrieval quality, provider reliability, workflow evidence, or team handoff.
- Which manual Extension Host checks are mandatory before publishing versus acceptable as post-release dogfood.

## 8. Decisions Retired By Implementation

These no longer need to appear as open product questions:

- `@codebase` has a local lexical first implementation with explainable ranking and budget evidence.
- Diff preview uses workspace snapshots, pending-change ledgers, and VS Code diff views rather than a custom diff renderer.
- Rollback uses Veyra-managed checkpoints and warns before overwriting later user edits.
- Diff, checkpoint, rollback, Git, CI/PR, diagnostic, and verification commands now have contributed command names.
- Safe Markdown rendering is in place for agent prose, with structured cards layered above it.
- Mission Control, Trust Center, Workflows, retrieval feedback, and artifact cards live in the docked Veyra view and derive from existing session state.
- Workflow Replay is manual draft preparation, not automatic rerun.
- Local Model Support is diagnostics-only, not runtime routing.

## 9. Recommended Sequence

1. Finish this roadmap cleanup and keep tests aligned with the new document shape.
2. Dogfood Retrieval Quality v0.4 on real Veyra maintenance tasks and capture concrete misses.
3. Implement Retrieval Quality v0.5 only from that evidence.
4. Run provider adapter hardening v0.3 while the Google provider transition is still fresh.
5. Polish Trust Center, Workflows, retrieval feedback, and artifact-card density where the docked view feels crowded.
6. Reassess embedding/vector retrieval after v0.5 reports show whether lexical retrieval still misses important context.
7. Choose the next named product promise for the post-v1.0 roadmap.

## 10. Risks

### Retrieval quality may plateau before embeddings

Mitigation: keep missed-context evidence visible and copyable, tune local ranking with real examples, and define a clear threshold for adding vector retrieval instead of treating embeddings as inevitable infrastructure.

### Docked-view surfaces may become too crowded

Mitigation: keep Mission Control compact, open Trust Center only for urgent actionable signals, cap Workflow Artifact History, and prefer progressive disclosure over additional always-open panels.

### Provider CLI contracts may shift

Mitigation: isolate adapter parsing by provider, keep readiness diagnostics explicit, test prompt-length fallback paths, and avoid hardcoded model promises.

### Users may overtrust agent-written summaries

Mitigation: continue separating agent claims from Veyra-observed evidence such as diffs, checkpoints, terminal output, Git state, CI/PR text, and approved verification results.

### Documentation may drift again

Mitigation: keep manifest/docs tests focused on current source-of-truth coverage rather than stale implementation-note phrases, and update this roadmap during release passes when product direction changes.

## 11. Definition Of The Next Stable Phase

The next stable phase should be considered healthy when:

- Retrieval feedback produces actionable missed-context evidence without hidden memory or background indexing.
- Provider diagnostics make the active Claude, Codex, and Google runtime paths clear to users.
- Trust Center and Workflows feel dense but not crowded during real `/review`, `/debate`, `/consensus`, and `/implement` runs.
- README, user guide, changelog, smoke docs, goal audit, and roadmap agree on what is shipped versus deferred.
- Automated verification and manual Extension Host validation tell a coherent release story.

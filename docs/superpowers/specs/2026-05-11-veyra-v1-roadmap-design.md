# Veyra v1.0 Roadmap Design

**Date:** 2026-05-11
**Status:** Draft for review
**Author:** Codex

## 1. Summary

Veyra v1.0 should optimize for professional parity without losing the product's core identity. It should not try to beat Copilot at inline autocomplete or Cursor at being a full AI-native editor. The v1.0 target is narrower and sharper:

> Veyra understands enough of the workspace to route useful multi-agent work, shows every meaningful change, and lets the user inspect or roll back before trust is lost.

This roadmap uses a **Context + Trust Spine**:

1. Add enough workspace context for real repositories.
2. Add diff and checkpoint controls so multi-agent edits feel safe.
3. Deepen Veyra's unique multi-agent review, debate, and implementation workflows once context and trust are in place.
4. Make the orchestration visible enough that Veyra feels like a professional workflow surface, not just a transcript.

Inline autocomplete, browser testing, local models, deep Git hosting workflows, cost meters, auto-rollback, and workflow replay are deferred until after this spine and presentation layer are useful.

## 2. Product Positioning

Veyra's strongest position is not "another AI assistant inside VS Code." Its strongest position is:

> The safest way to coordinate multiple strong coding agents inside the editor you already use.

The differentiator is multi-agent collaboration:

- Claude, Codex, and Gemini share conversation context.
- Workflows route agents through review, debate, and implementation roles.
- Agent file edits are visible through chat, panel state, file badges, session summaries, and commit attribution.
- Cross-agent edit conflicts are surfaced instead of hidden.

The v1.0 roadmap should make that differentiator usable on real projects by adding workspace understanding and stronger user control around edits.

## 3. Roadmap Principles

### Trust before breadth

Veyra asks users to let several agents reason about and sometimes modify a workspace. That is inherently higher-trust than single-response chat. Diff preview, checkpoints, and rollback are therefore core v1.0 features, not polish.

### Context before autonomy

More autonomy is only valuable if agents receive the right repo context. Veyra should first make context retrieval predictable, inspectable, and cheap enough for daily use.

### Use simple retrieval first

Start with lexical and metadata-backed workspace retrieval before adding embeddings. Most near-term value can come from file inventory, symbol names, ripgrep-style search, package/test metadata, and prompt budgeting. Vector search should be introduced only when simpler retrieval stops being good enough.

### Preserve existing architecture

New roadmap work should reuse the current extension-host service path where possible:

- `VeyraSessionService` remains the shared dispatch pipeline.
- Native chat, the Language Model provider, and the panel should keep using one service path.
- Existing file-edited events, workspace change detection, file badges, edit-conflict notices, and commit attribution should become inputs to the trust features instead of being replaced.

### Do not chase every competitor feature for v1.0

Inline autocomplete, browser automation, local models, and PR workflows are real product opportunities. They are not required for the v1.0 promise unless the product strategy changes from "multi-agent trust and orchestration" to "full daily AI coding assistant replacement."

## 4. Milestone 0: Preview Hardening

### Goal

Make the current preview easy to understand, install, verify, and demo.

### Ship

- Marketplace-ready README copy focused on Veyra's multi-agent promise.
- Screenshot and demo script showing `/review`, `/debate`, and `/implement`.
- Clean setup flow for Claude, Codex, Gemini, Node, and CLI path readiness.
- First-run guidance that explains what Veyra is good for and what it is not trying to do yet.
- Continued verification for native chat, Language Model provider, file edit visibility, smoke tests, packaging, and live readiness.

### Non-goals

- No new AI capability.
- No new indexing, diff, checkpoint, or terminal feature in this milestone.

### Success criteria

- A new user can understand Veyra's purpose from the README and first-run experience.
- The extension can still pass the current local, smoke, package, and live-readiness gates.
- Demo materials show the current differentiator without implying unbuilt features.

## 5. Milestone 1: Workspace Context

### Goal

Make Veyra useful on repositories larger than toy projects.

### Ship

- Lightweight workspace inventory:
  - tracked and untracked source files
  - common ignored directories
  - language and framework hints
  - package manager and test command hints
  - important project metadata files
- `@codebase` mention for retrieval over workspace files.
- Lexical search-backed retrieval using file names, symbols, and content matches.
- Context budgeter that chooses snippets, summaries, recent session context, and attached files predictably.
- Per-workspace cache invalidated by file changes.
- Context section in prompts that clearly names why files were selected.

### Non-goals

- No embeddings in the first version.
- No background cloud indexing.
- No attempt to read entire repositories into prompts.

### Success criteria

- Users can ask broad questions such as "review the auth flow" or "where should this parser change go?" and Veyra can retrieve relevant files without explicit `@file` mentions.
- Later agents in `/review`, `/debate`, and `/implement` see the same retrieved context and prior replies.
- Retrieval is fast enough for normal VS Code use on medium repositories.

### Design notes

The first implementation should prefer explicit, explainable retrieval over opaque ranking. A response should make it possible to tell which files informed the agent. This matters because Veyra's product promise depends on trust, not just answer quality.

## 6. Milestone 2: Diff Preview

### Goal

Make agent changes inspectable before they feel risky.

### Ship

- Pending change ledger for each write-capable dispatch.
- Command to open a diff view from:
  - native chat file-edited references
  - the panel
  - file badge or session surfaces where practical
- Accept or reject a whole dispatch in the first version.
- Later extension to accept or reject individual files or hunks.
- Setting for diff behavior, likely one of:
  - automatic edit with visible diff
  - preview before final accept
  - delegate approval to the underlying CLI where supported

### Non-goals

- No custom diff renderer if VS Code's built-in diff editor is sufficient.
- No per-hunk apply in the first version unless it falls out cheaply from the chosen implementation.

### Success criteria

- After an agent changes files, the user can inspect the exact workspace diff from Veyra surfaces.
- The user can accept or reject the full dispatch change set.
- Diff state is associated with the agent, workflow, timestamp, and changed files.

### Design notes

This milestone should reuse existing workspace change detection and `file-edited` events. The product surface should feel like a natural expansion of current invisible-change prevention rather than a separate subsystem.

## 7. Milestone 3: Checkpoints And Rollback

### Goal

Give users an escape hatch for multi-agent workflows.

### Ship

- Auto-checkpoint before every write-capable dispatch.
- Manual checkpoint command.
- Rollback latest checkpoint.
- Checkpoint list with:
  - timestamp
  - workflow or participant source
  - participating agents
  - changed files
  - short user prompt summary
- Warning when rollback would overwrite user edits made after the checkpoint.

### Non-goals

- No cross-branch history browser.
- No automatic commit creation.
- No remote backup system.

### Success criteria

- A user can run `/implement`, inspect the result, and roll back to the pre-dispatch state.
- Rollback avoids silently overwriting unrelated user changes.
- Checkpoint metadata makes it clear what is being restored.

### Design notes

Checkpointing should be implemented as a trust feature, not as source-control replacement. Git remains the durable history tool. Veyra checkpoints cover local experimentation between user commits.

## 8. Milestone 4: Workflow Intelligence

### Goal

Make Veyra's unique multi-agent workflows more useful after workspace context and trust controls exist.

### Ship

- Enhanced `/debate` or new `/consensus` workflow that produces a facilitator synthesis after agents respond.
- Role customization for Claude, Codex, and Gemini at the workspace level.
- Workflow templates for common use cases:
  - architecture review
  - security review
  - test improvement
  - refactor plan
  - implementation with review
- Review output categories:
  - blocking issue
  - advisory risk
  - missing test
  - follow-up suggestion
- Better cross-agent handoff summaries.

### Non-goals

- No fully autonomous project manager.
- No parallel worktree execution in v1.0.
- No cross-agent long-term learning system.

### Success criteria

- `/review` produces clearer, more actionable findings.
- `/debate` or `/consensus` ends with a concrete recommended next action.
- `/implement` makes better use of prior agents' reasoning and retrieved context.

### Design notes

This milestone is where Veyra's moat becomes louder. It should not land before context and trust features, because more intelligent workflows without inspectable context and rollback would increase perceived risk.

## 9. Milestone 5: Terminal Awareness

### Goal

Support realistic build, test, and debug loops from inside VS Code.

### Ship

- Capture selected terminal output and recent terminal errors.
- Agent-visible project command metadata from workspace inventory.
- Suggested commands with explicit approval.
- Optional verification step after implementation workflows.
- Clear handling for failed tests, lint errors, and compiler output.

### Non-goals

- No default destructive command automation.
- No hidden terminal command execution.
- No shell history scraping beyond explicit selected or recent bounded output.

### Success criteria

- A user can ask Veyra to diagnose selected terminal output.
- `/implement` can recommend or run a verification command with clear approval semantics.
- Test and lint failures can be brought into follow-up prompts without manual copy/paste.

### Design notes

The current agent CLIs can already run commands in some flows. This milestone is specifically about native VS Code terminal ergonomics and safer user control.

## 10. Milestone 6: Provider Adapter Migration

### Goal

Keep Veyra aligned with the agent CLIs the user actually wants to trust: Claude CLI for Claude, Codex CLI for Codex, and Antigravity CLI as the successor path for Gemini.

### Ship

- Replace Claude's primary `@anthropic-ai/claude-agent-sdk` path with a Claude CLI-first adapter.
- Remove the Anthropic agent SDK dependency once Claude CLI streaming, tool events, edit detection, cancellation, and write-approval behavior are covered by tests.
- Keep Claude CLI command resolution simple and explicit:
  - prefer `claude` / `claude.exe` on PATH
  - add a `VEYRA_CLAUDE_CLI_PATH` / `veyra.claudeCliPath` override only if real tester environments need it
  - keep `claude -p --output-format stream-json --verbose --permission-mode ...` as the initial non-interactive contract
- Introduce an Antigravity CLI adapter to replace the Gemini CLI runtime path while preserving the existing Veyra agent identity as `gemini` unless product naming changes later.
- Detect Antigravity CLI before Gemini CLI during transition, with a clear fallback and warning while Gemini CLI still works.
- Rename settings, diagnostics, and setup guidance carefully:
  - add Antigravity-specific path/settings support
  - keep temporary compatibility for `VEYRA_GEMINI_CLI_PATH` / `veyra.geminiCliPath`
  - update readiness guidance so users know Gemini CLI consumer access stops serving requests after Google's published transition date
- Capture and surface backend-reported model metadata where Antigravity exposes it, especially the Gemini 3.5 Flash default.

### Non-goals

- No attempt to preserve the Anthropic SDK as a parallel default once the Claude CLI path is proven stable.
- No claim that Antigravity CLI is a drop-in Gemini CLI replacement until its non-interactive JSON/streaming contract is verified.
- No rename from `@gemini` to `@antigravity` in the first migration unless user testing shows that the visible label is misleading.
- No automatic migration of user config files outside Veyra's own VS Code settings.

### Success criteria

- Claude dispatches use Claude CLI only, with no package dependency on `@anthropic-ai/claude-agent-sdk`.
- Antigravity CLI can run the third-agent review role with streamed text, tool calls/results, edit detection, cancellation, and read-only/write-capable behavior equivalent to the current Gemini adapter.
- Existing Veyra workflows still route through Claude, Codex, and the Google agent path without changing the user's common prompts.
- Diagnostics clearly distinguish Claude CLI, Codex CLI, Antigravity CLI, and legacy Gemini CLI fallback.
- The README, setup guide, smoke docs, live readiness, and Marketplace copy no longer point new users at deprecated Gemini CLI setup as the primary path.

### Design notes

This is now a near-term maintenance and trust milestone, not a later parity feature. The current Claude code already contains a CLI fallback, so the Claude change is mostly deleting the SDK-first branch, removing dependency surface, and strengthening CLI tests. The Google change is riskier: Antigravity CLI needs a verified non-interactive mode and event stream before it can replace Gemini CLI safely.

## 11. Milestone 7: Output Polish And Provider Transparency

### Goal

Make Veyra's output easier to read during large reviews and make the underlying agent model choices visible enough that users know what they are trusting.

### Ship

- Render Markdown in the docked Veyra view instead of showing raw `#`, `*`, table, and code-fence syntax as plain text.
- Preserve important coding affordances while rendering:
  - fenced code blocks
  - inline code
  - headings
  - bullets and numbered lists
  - tables where practical
  - links and workspace file references
- Keep tool-call cards, file-edit notices, checkpoints, and pending-change actions visually distinct from rendered agent prose.
- Add model/provider transparency:
  - document that Claude, Codex, and Gemini currently use their local CLI or SDK defaults unless Veyra passes an explicit model option
  - show CLI/provider versions in diagnostics where available
  - surface any reported model name from backend stream metadata when the CLI exposes it
  - add optional model override settings only where the underlying provider supports a stable non-interactive flag or setting

### Non-goals

- No arbitrary HTML rendering from agent output.
- No custom Markdown dialect beyond common GitHub-style Markdown affordances unless needed for VS Code compatibility.
- No hardcoded vendor model promises when Veyra cannot prove the actual model selected by the local CLI.
- No local-model runtime in this milestone; this is transparency over the existing Claude, Codex, and Gemini paths.

### Success criteria

- Large `/review`, `/debate`, `/consensus`, and `/implement` responses are scan-friendly in the docked Veyra view.
- Users no longer see raw Markdown control characters when the agent meant headings, lists, or code blocks.
- Diagnostics and docs clearly explain whether Veyra is using local CLI defaults, a configured override, or a backend-reported model.
- The same response remains safe to display even when an agent outputs malformed Markdown or untrusted link text.

### Design notes

This should be treated as a trust and comprehension feature, not cosmetic polish. Veyra's multi-agent reviews can become long quickly; raw Markdown makes good reasoning look noisy and unprofessional. The renderer should be conservative and safe, but the default reading experience should feel like a real review document.

Model transparency belongs in the same milestone because output quality and user trust are linked. Users should not have to guess whether a provider is using a default, a workspace override, or a backend-selected model.

Implementation note: this provider transparency pass renders agent Markdown safely and reports Claude CLI, Codex CLI, and Antigravity CLI or legacy Gemini CLI fallback diagnostics without hardcoded model promises.

## 12. Milestone 8: Presentation Layer And Mission Control

### Goal

Turn Veyra's docked view from a chat transcript into a visible engineering workflow dashboard. Users should be able to see what the agents are doing, what artifact they produced, and what trust controls are available without scrolling through every bubble.

### Ship

- Mission Control timeline:
  - show the workflow lane for Claude, Codex, and Gemini
  - show queued, active, completed, failed, cancelled, and waiting states
  - show current floor holder, recent tool activity, pending change count, checkpoint state, and verification state where available
  - derive the first version from existing webview/session events instead of adding a separate orchestration pipeline
- Structured workflow artifact cards:
  - render known Veyra sections such as `Veyra Synthesis`, `Recommendation`, `Blocking issues`, `Advisory risks`, `Missing tests`, `Follow-up suggestions`, `Next action`, and `Handoff Summary` as polished cards
  - use severity chips, collapsible sections, and file/workspace links where the output already contains trustworthy references
  - keep the raw rendered Markdown available as fallback and avoid treating parsed headings as authoritative facts
- Trust Center:
  - consolidate pending changes, checkpoints, file edits, edit conflicts, verification suggestions, and CI/PR review actions into one persistent inspectable surface
  - route accept, reject, open diff, rollback, and verification actions through the same command paths already used by inline notices
  - distinguish "agent said this is safe" from "Veyra observed this test/check/result"
- Theme and accessibility polish:
  - ensure the timeline, cards, and Trust Center work in dark, light, and high-contrast themes
  - reuse contributed agent colors and VS Code theme variables instead of hardcoded tints
  - keep the docked view dense and work-focused rather than marketing-styled

### Non-goals

- No cost or token meters until the provider CLIs expose reliable, comparable usage data.
- No hidden terminal execution or fully autonomous verification loop. The Trust Center should build on the existing explicit verification runner and approval semantics.
- No auto-rollback on verification failure in the first version. Rollback should remain explicit because restoring files is high-trust behavior.
- No workflow replay in the first version. It is a good v1.1 candidate after sessions and artifact cards have a stable shape.
- No second source of truth for pending changes, checkpoints, or conflicts. The new surface must derive from existing session state and command handlers.

### Success criteria

- A user can glance at the docked view during `/review`, `/debate`, `/consensus`, or `/implement` and understand which agent is active, which agents are queued or complete, and what trust actions are pending.
- Final workflow outputs feel like professional engineering artifacts rather than long chat bubbles.
- Pending changes, checkpoints, conflicts, and verification follow-up are discoverable from one place without removing the inline notices.
- Light theme and high-contrast users can read and operate the same controls.
- Existing smoke, package, local verification, and live-readiness gates remain covered.

### Design notes

This is the next "wow factor" milestone because it makes Veyra's core differentiator visible. The underlying value is already present: multi-agent sequencing, floor changes, streamed tool activity, checkpoint notices, pending change ledgers, verification commands, and CI/PR context. The first implementation should be mostly webview-side derivation over those streams.

The order should be: Mission Control timeline first, structured artifact cards second, Trust Center third. Timeline has the smallest blast radius and the biggest immediate perceived value. Artifact cards build naturally on the safe Markdown renderer from Milestone 7. Trust Center is larger and should reuse the visual language established by the first two slices.

Implementation note: the first Presentation Layer slice adds the compact Mission Control timeline, derived from existing webview/session events. The second slice adds Structured Workflow Artifact Cards v0.1 for known Veyra output sections while preserving safe Markdown fallback for malformed or unknown prose. The third slice adds Trust Center v0.1 as a persistent docked-view surface derived from existing session messages, change-set summaries, checkpoint summaries, approved verification context, and explicit Git/CI context, while reusing the same command paths as inline notices.

## 13. Milestone 9: Later Parity Candidates

These features are valuable but should be deferred until after the v1.0 spine and presentation layer are useful.

### Inline autocomplete

Useful for daily coding parity, but it is expensive to make good and does not directly strengthen Veyra's multi-agent trust promise.

### Browser testing

Useful for frontend workflows, especially visual debugging, but not core to v1.0 unless Veyra narrows its target market to web app development.

Implementation note: Browser Testing Awareness v0.1 keeps the feature local-first by adding `Veyra: Review Browser/Test Output`. It accepts explicit user-provided Playwright, Cypress, Vitest UI, browser console, network, screenshot-note, URL-note, and reproduction text, combines it with local project command hints, and asks agents for Browser/Test Summary, Reproduction Evidence, User-Visible Risk, Likely Cause, Verification Gaps, and Suggested Follow-up Commands. It forbids hidden browser launches, page scraping, network inspection, automatic test reruns, file edits, Git operations, and command execution unless the user separately approves an exact command.

### Local model support

Useful for privacy-sensitive teams and cost control. It should come after the adapter and workflow surfaces stabilize.

### GitHub and GitLab workflows

Useful for teams, but Veyra already has a local editor-first story. PR generation, CI inspection, and issue integration can follow once local change safety is mature.

Implementation note: GitHub/PR Workflow Awareness v0.2 keeps the feature local-first by adding `Veyra: Prepare PR Package Draft` instead of creating or mutating remote PRs. It combines read-only Git state, pending-change and checkpoint evidence, approved verification evidence when Veyra can read it, and optional user-provided CI/PR output. The expected artifact sections are PR Summary, Changed File Explanation, Risk Checklist, Verification Evidence, Unresolved Blockers, and Suggested Follow-up Commands. It still forbids hidden network calls, GitHub API writes, automatic PR creation, CI reruns, and push/pull/merge/rebase/reset/clean actions.

### Embedding or vector retrieval

Useful if lexical retrieval cannot find the right context often enough. It should be measured against real failures before becoming required infrastructure.

### Workflow replay

Useful for rerunning `/review`, `/consensus`, or `/implement` against a later commit to compare how the agents' opinion changed. It should wait until structured artifacts and session summaries have a stable persisted shape.

Implementation note: Workflow Replay v0.1 is the first manual version. It derives the latest workflow from existing session messages, summarizes the original workflow command, prompt, and agents that participated, then prepares a fresh docked composer draft. It does not silently dispatch agents, execute terminal work, replay old tool calls, or mutate the original transcript.

### Cost and token meters

Useful for enterprise budgeting, but provider CLIs do not expose consistent enough token and cost metadata today. Do not block the presentation layer on this.

### Auto-rollback on verification failure

Useful in theory, but too easy to make scary. It should stay out of the roadmap until rollback warnings, Trust Center state, and verification result provenance are very mature.

## 14. Sequencing

Recommended order:

1. Preview hardening.
2. Workspace context.
3. Diff preview.
4. Checkpoints and rollback.
5. Workflow intelligence.
6. Terminal awareness.
7. Provider adapter migration.
8. Output polish and provider transparency.
9. Presentation layer and Mission Control.
10. Later parity candidates.

The first three implementation plans should be separate:

1. Workspace context and `@codebase`.
2. Diff preview and pending change ledger.
3. Checkpoints and rollback.

Splitting them keeps each plan reviewable and reduces the risk of changing too many extension surfaces at once.

## 15. Risks

### Retrieval quality may disappoint without embeddings

Mitigation: make retrieval explainable, support manual `@file` override, and log missed-context feedback before adding vector search.

### Diff preview may conflict with underlying CLI approval models

Mitigation: define Veyra's diff model around workspace snapshots and VS Code diff views, then map CLI approval behavior into settings where possible.

### Checkpoints can overwrite user work if implemented carelessly

Mitigation: compare current workspace state against checkpoint metadata before rollback and warn when files changed after the checkpoint.

### Multi-agent workflows can become noisy

Mitigation: add facilitator synthesis and structured review categories instead of simply increasing agent output.

### Provider CLI contracts may shift under Veyra

Mitigation: prefer documented non-interactive streaming modes, keep adapter parsing isolated per provider, and add focused live-readiness checks before replacing Gemini CLI with Antigravity CLI by default.

### Long reviews may be hard to read if Markdown is not rendered

Mitigation: render agent Markdown safely in the docked Veyra view while keeping tool calls, file edits, and action controls as structured UI elements.

### Users may assume Veyra chose exact vendor models

Mitigation: document that current providers use local CLI or SDK defaults unless an explicit override is configured, and surface backend-reported model metadata when available.

### Presentation polish could add UI complexity without adding trust

Mitigation: keep Mission Control, artifact cards, and Trust Center dense, work-focused, and derived from existing evidence. Avoid decorative chrome that does not answer "what is happening, what changed, and what can I do safely?"

### Structured artifact cards may misrepresent agent prose

Mitigation: treat parsed Markdown sections as view hints only. Keep the raw rendered Markdown available, tolerate malformed sections, and never execute actions based solely on an agent heading or badge.

### Trust Center could duplicate or drift from inline notices

Mitigation: derive Trust Center state from the same system messages, change-set summaries, checkpoint summaries, and command handlers as the current inline controls.

### Roadmap may drift into full competitor parity

Mitigation: use the v1.0 thesis as a scope guard. Features that do not improve workspace context, edit trust, or multi-agent workflow quality move out of v1.0.

## 16. Open Product Decisions

These decisions should be made during implementation planning, not blocked here:

- Exact `@codebase` retrieval ranking formula.
- Whether diff preview stores patch files, workspace snapshots, or both.
- Whether the first rollback implementation uses Git where available or a Veyra-managed snapshot format everywhere.
- Final names for diff and checkpoint commands.
- Whether workflow templates live in VS Code settings, a `veyra.md` section, or a separate workspace config file.
- Whether the visible Google agent label stays `@gemini` while Antigravity CLI powers it, or whether Veyra eventually exposes `@antigravity`.
- Whether legacy Gemini CLI fallback should be kept after the consumer cutoff or removed completely.
- Which Markdown renderer should be used in the webview, and how tightly it should sanitize links and generated HTML.
- Which provider model metadata is reliable enough to expose as "actual model used" versus "configured/default model."
- What the Mission Control timeline should show in its compact default state versus expanded detail state.
- Which workflow artifact sections should become structured cards first, and how much malformed or extra Markdown should remain plain prose.
- Whether Trust Center should be an expandable header section inside the existing Veyra view or a separate contributed VS Code view.
- What evidence is strong enough for Trust Center verification badges, especially when output comes from agents versus observed terminal/CI results.

## 17. Definition Of v1.0

Veyra is ready to call v1.0 when:

- It can retrieve relevant workspace context without explicit file mentions.
- It can show a user what changed during an agent dispatch.
- It can roll back a write-capable dispatch safely.
- Its multi-agent workflows produce clearer final recommendations than a single-agent chat loop.
- Current native chat, Language Model provider, panel, file badge, edit-conflict, commit attribution, packaging, smoke, and live readiness gates remain covered.

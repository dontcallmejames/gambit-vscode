# Veyra UI/UX Polish v0.2 — Design ("Veyra Instrument")

## Goal & Non-Goals

**Goal:** A second polish pass on the docked webview that raises perceived quality from "clean and themed" to "intentionally designed." Enterprise Polish v0.1 made the surface flat, tokenized, and VS Code-native. This round gives it a type and spacing system, a coherent per-agent identity, calm purposeful motion, and refined composer/state treatments.

**Aesthetic direction:** a quiet, precise instrument cluster that belongs inside VS Code. The memorable quality is not a distinctive palette; it is that three AI agents become legible at a glance. Identity is expressed as a consistent visual system, state feels alive without being noisy, and everything stays native to the editor.

**Non-Goals:**
- No from-scratch redesign. The flat layout, `<PanelSection>`, tokens, codicons, and status bar from v0.1 stay.
- No new color literals outside `tokens.css`. No CDN fonts or assets (CSP). No raw `#`/`rgb()` in components.
- No functional changes to agent routing, workflows, or session handling.
- No bundled custom display font. VS Code controls the UI font; we work within `--vscode-font-family` and the editor font for code.

## Constraints (carry over from v0.1)

- Every color resolves through `--veyra-*` tokens (VS Code theme var, then system-color/documented fallback). The raw-color gate over `src/webview/` excluding `tokens.css` must stay clean.
- Readable across Light+, Dark+, Dark High Contrast, Light High Contrast. State must never be encoded by color alone (HC requirement).
- Motion respects `prefers-reduced-motion`: all entrance/transition animation is disabled or reduced to opacity under that query.
- `npm run verify` stays green at every phase; phases ship as independent PRs.

## Problems this addresses (observed in current code)

1. **Cramped microlabels.** Every kicker is `text-transform: uppercase; letter-spacing: 0` at 11px. Uppercase with zero tracking reads unfinished. (`.panel-section-kicker`, `.mission-control-kicker`, `.workflow-*-kicker`.)
2. **No type scale.** Almost everything is 11px; kicker, panel label, agent name, and body text share one size, so there is no hierarchy.
3. **Ad-hoc spacing.** Values of 4/5/6/7/8/10/12/14px appear with no underlying scale.
4. **Fragmented agent identity.** Each agent has a token color, but it surfaces inconsistently: a 2px stripe in one place, a colored name in another, while the Mission Control dot encodes *state* rather than *agent*. A single agent cannot be tracked across the surface.
5. **Tonal mismatch.** The streaming state uses random verbs ("cooking", "digging") and per-agent braille spinners, which fight the professional direction.
6. **Absent motion.** Panels pop open instantly, messages appear with no entrance, streaming has no settled affordance.
7. **Token/inline debt.** Inline `style=` remains in `AgentBubble.tsx` and `Composer.tsx` (`opacity:0.6`, `color:var(--error-color)`, `flex:1`).

## Design system additions (`tokens.css`)

These are non-color primitives, added to `tokens.css` alongside the color tokens so there is one source of truth.

### Spacing scale
```
--veyra-space-1: 4px;
--veyra-space-2: 6px;
--veyra-space-3: 8px;
--veyra-space-4: 12px;
--veyra-space-5: 16px;
```
Sweep the scattered px paddings/gaps/margins in `styles.css` onto these. No value outside the scale unless a row documents why.

### Type scale
A three-step scale layered on the VS Code font size, expressed in `em` so it tracks the user's editor font size:
```
--veyra-text-micro: 0.85em;   /* kickers, meta, chip text */
--veyra-text-body:  1em;      /* message text, panel body */
--veyra-text-label: 1em;      /* panel labels, agent names (weight carries emphasis, not size) */
```
The hierarchy comes from weight + color + tracking, not from many sizes. Body stays at the VS Code size for legibility.

### Microlabel treatment
One shared rule for every kicker/meta label:
```
.veyra-microlabel {
  font-size: var(--veyra-text-micro);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--veyra-fg-muted);
}
```
Applied to `.panel-section-kicker`, `.mission-control-kicker`, and the workflow/retrieval kickers. The +0.06em tracking is the single highest-leverage change in this round.

### Motion tokens
```
--veyra-motion-fast: 120ms;
--veyra-motion-base: 200ms;
--veyra-ease: cubic-bezier(0.2, 0, 0, 1);   /* standard ease-out */
```
All transitions reference these. A global `@media (prefers-reduced-motion: reduce)` block neutralizes transforms and shortens durations to near-zero.

## Phase A — Foundations: type + space scale

The highest-impact, lowest-risk phase. No structural/markup change beyond class application.

- Add the spacing, type, microlabel, and motion tokens to `tokens.css`.
- Replace scattered px spacing in `styles.css` with `--veyra-space-*`.
- Route all kickers through `.veyra-microlabel` (the existing per-kicker rules collapse into it).
- Remove inline `style=` in `AgentBubble.tsx` (`[Cancelled]`, errored message) and `Composer.tsx` (`flex:1` spacer) in favor of classed rules using tokens.
- Re-baseline any snapshot tests after visual review.

**Acceptance:** raw-color gate clean; no inline `style=` color/spacing in the two components; one shared microlabel rule; spacing values all on the scale; verify green.

## Phase B — Agent identity system

The differentiation. Make Claude / Codex / Gemini trackable at a glance.

- **`<AgentMarker>` component** (`src/webview/components/AgentMarker.tsx`): renders a small fixed-size marker for an `agentId` — a color dot using `--veyra-agent-<id>`, optionally with a codicon and the agent name. One component, used identically in Mission Control stages, message rows (`.msg-role`), and Trust Center attributions, so identity is consistent everywhere.
- **Separate identity from state in Mission Control.** Today `.mission-stage-dot` encodes state via color (active/complete/failed/queued). Split the two signals:
  - *Agent identity* = the `<AgentMarker>` color (left stripe + dot use the agent color).
  - *State* = a distinct **shape/icon** per state (queued, active, complete, failed, cancelled) that is legible in High Contrast without relying on color. Active keeps the existing pulse.
- Keep the existing per-agent accent stripe but source it from the same agent-color token the marker uses, so a stripe and a marker never disagree.

**Acceptance:** the same agent reads identically across Mission Control, messages, and Trust Center; state is distinguishable in Dark HC with color removed; verify green; component tests for `<AgentMarker>` (renders correct token class per agent; decorative aria handling).

## Phase C — Composer & states polish

Where users spend their time. (Sequenced before motion because structure should settle before animation.)

- **Composer refinement:** a clear focus ring on the textarea using `--veyra-border-focus`; send/cancel hierarchy (primary send, secondary cancel) via existing button tokens; refined file-chip row and autocomplete popover spacing on the new scale.
- **Floor-held affordance:** when an agent holds the floor, the composer shows which agent (reuse `<AgentMarker>`) so the working agent is obvious from where the user is typing.
- **Cohesive state set:** unify empty (first-launch, already shipped), loading, errored, and no-agents-ready states with shared structure and the microlabel/spacing system. The HealthStrip's unavailable-agent messaging aligns with this.

**Acceptance:** focus ring visible in all four themes; clear send/cancel hierarchy; floor-held shows the agent; states share one visual structure; verify green.

## Phase D — Motion & live state

Calm and professional (chosen tone). Motion is subtle and purposeful, never decorative.

- **Message entrance:** new rows fade+rise in over `--veyra-motion-base`, staggered slightly when several arrive together. Opacity-only under reduced-motion.
- **Panel expand/collapse:** animate height + opacity with `--veyra-ease` instead of instant show/hide in `<PanelSection>`.
- **Streaming affordance (replaces random verbs):** retire `THINKING_VERBS` and per-agent braille spinners. While streaming, the agent's `<AgentMarker>` shows a settled pulse and the row carries one thin progress shimmer. One cohesive treatment for all agents, calm by default.
- **Status transitions:** the existing Mission Control active-dot pulse is kept and brought under the motion tokens; state changes cross-fade rather than snap.

**Acceptance:** all motion honors `prefers-reduced-motion`; no random-verb text remains; streaming reads as calm and consistent across agents; verify green.

## Sequencing

A → B → C → D. A and B carry most of the perceived-quality gain and are low-risk; C settles the structure users touch most; D (highest taste-risk) lands last on a solid base. Each phase is an independent PR following the v0.1 cadence, verified with `npm run verify` and a visual pass across the four themes before snapshot re-baseline.

## Testing & verification

- **Per phase:** `npm run verify` green; manual visual review across Light+, Dark+, Dark HC, Light HC; reduced-motion check for Phase D.
- **Component tests:** `<AgentMarker>` (Phase B) for per-agent token class and decorative/aria behavior; existing component tests updated where markup moves.
- **Gates retained from v0.1:** raw-color scan clean; `<PanelSection>` still owns panel chrome; no CDN assets.
- **Snapshots:** re-baseline only after visual review confirms each phase; snapshot diffs are evidence, not the review.

## Risks & mitigations

1. **Motion feels busy / distracts from a tool.** Mitigated by the calm tone, motion tokens with short durations, and a strict reduced-motion path. Phase D ships last so it can be tuned or dropped without blocking A–C.
2. **HC regressions from the identity/state split.** Mitigated by the color-independent state shapes and an HC cell in every phase's visual pass.
3. **Snapshot churn hiding regressions.** Mitigated by per-phase PRs and manual visual review before re-baseline (same discipline as v0.1).
4. **Scope creep into a redesign.** Mitigated by the Non-Goals: this is polish on the existing structure, not new layout.

## Out of scope for v0.2

- Bundled custom fonts or icon sets beyond codicons.
- New panels, new commands, or layout restructuring.
- Settings to toggle individual motion/identity treatments (revisit only if requested).

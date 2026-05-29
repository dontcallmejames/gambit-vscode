# Veyra Panel Density Consolidation — Design

**Date:** 2026-05-29
**Status:** Proposed
**Context:** Follow-on polish during Enterprise Polish v0.1 Phase 3, before marketplace screenshots.

## Problem

The top of the docked Veyra view wastes space and states the same facts in multiple
places:

1. **Provider/stage cards** are two lines tall and full-width; they dominate the panel.
2. **Panel titles are stated twice** — once as the kicker (e.g. "TRUST CENTER") and again
   in the toggle button ("Open Trust Center").
3. **Summaries are duplicated** between the Mission Control action-chip row and the panel
   headers below it: `9 pending files` / `23 checkpoints` (chips + Trust Center header),
   `Replay /implement` (chip + Workflows label), `History 5` (chip + Workflows summary).
   "Idle" also appears twice in the Mission Control header.

Root cause: the Mission Control **action-chip row** (`buildPresentationDensityChips`) and the
always-visible **panel headers** both do the same job — show a summary and open a panel.

## Goal

One unified information architecture with no fact shown twice:

- **Mission Control** = what the agents are doing (stages + floor state). Nothing else.
- **Each panel header** = that panel's own one-line summary + a click-to-open chevron.

## Changes

### 1. Compact agent stages (Issue #1)

Collapse the two-line provider cards to **one line each**, keeping the 3-column grid and the
per-agent accent stripe. Agent name and state render inline on a single row.

- File: `src/webview/components/MissionControlTimeline.tsx` (Stage markup), `styles.css`
  (`.mission-stage*` — single-line grid, drop the stacked label/state rows).
- Before: `▎● Claude` / `waiting` (two lines). After: `▎● Claude  waiting` (one line).

### 2. Header is the toggle (Issue #2)

Make the `PanelSection` header itself the collapse control: the chevron + clickable header
row toggle the panel. Remove the separate "Open/Collapse <name>" button so each panel name
appears once (as the kicker title).

- File: `src/webview/components/PanelSection.tsx` — make the header row a clickable control:
  `role="button"`, `tabindex=0`, `aria-expanded`, `aria-controls`, `onClick` and an
  `onKeyDown` handling Enter/Space, with the chevron `<Icon>` at the left of the kicker. Use
  a clickable row (not a native `<button>`) so it can contain the kicker/label/summary flow
  content without invalid nesting. Drop the trailing toggle button and its `Open/Collapse`
  text. `styles.css` `.panel-section-head` gets button affordances (cursor: pointer, hover,
  `:focus-visible` ring); the `.panel-section-toggle` rule is removed.
- Non-collapsible panels (Mission Control, when it adopts `PanelSection` later) render the
  header as a plain row with no chevron/role/handlers.
- The three panels (Trust Center, Workflows, Retrieval Feedback) need no changes — they go
  through `PanelSection`. Accessibility: the header keeps `aria-expanded`/`aria-controls`.

### 3. Remove the redundant Mission Control chip/indicator row (Issue #3)

Drop the Mission Control action-chip row **and** the indicator fallback row entirely. Each
summary now lives only in its own panel header. The panel headers (now click-to-open) are
the open affordance the chips used to provide.

- File: `src/webview/components/MissionControlTimeline.tsx` — remove the
  `actionChips`/`indicators` block; Mission Control renders only the head (kicker + floor
  state) and the stages. Drop the duplicated "Idle" (keep it once, on the right summary).
- File: `src/webview/App.tsx` — stop building/passing `actionChips`/`onOpenPanel` to
  `MissionControlTimeline`.
- File: `src/webview/presentationDensity.ts` — remove `buildPresentationDensityChips` and
  `MissionControlActionChip` (now unused). **Keep** the density state (expand/collapse
  persistence) and the auto-open-Trust-Center-on-urgent behavior — those are unchanged.

## Preserved behavior

- Panel collapse/expand state still persists via `presentationDensity` state.
- Trust Center still auto-opens on urgent signals (pending files, edit conflicts, failed
  verification); urgency is shown by the Trust Center header accent.
- The flat message layout, tokens, and codicons from Phases 1–2 are untouched.

## Testing

- `missionControlTimeline.test.ts`: assert no chip/indicator row; stages render one line;
  floor state shown once.
- `panelSection` behavior (via `trustCenter`/`retrievalFeedback`/`presentationDensity`
  tests): the header toggles on click (`aria-expanded` flips); the panel name appears once;
  no separate "Open/Collapse" button text.
- `presentationDensity.test.tsx`: drop `buildPresentationDensityChips` assertions; keep the
  expand/collapse + urgency-auto-open tests.
- Color-token gate and full `npm run verify` stay green.

## Acceptance

- No summary fact (pending files, checkpoints, history, replay command) is shown in more
  than one place.
- Each panel name appears once; the chevron/header is the only open control.
- Agent stages occupy one line each.
- Visually reviewed in Dark+, Light+, and Dark High Contrast.

## Out of scope

- Pending-files/error states on the status bar item (separate follow-up).
- Marketplace screenshots (manual, after this lands).

# UI/UX Polish v0.2 — Phase A (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the docked webview a type/spacing/motion token system and one shared microlabel treatment, adopt it in the panel + mission chrome, and remove the surviving inline `style=` attributes — without any visual regression across the four themes.

**Architecture:** Non-color design tokens are added to `src/webview/tokens.css` (the single source of truth, already imported before `styles.css` in `main.tsx`). `styles.css` references them via `var(--veyra-*)`. A shared `.veyra-microlabel` rule plus a grouped kicker selector applies one treatment to every kicker. Two components drop inline styles for classed rules.

**Tech Stack:** plain CSS custom properties, Preact (`h`/JSX), esbuild bundle, Vitest. No preprocessor, no new dependencies.

**Branch:** `design/ui-ux-polish-v0.2` (already checked out; the design spec is committed there).

**Key guardrails (from `tests/webviewStyles.test.ts`, which runs under `npm test`):**
- Raw color literals (`#…`, `rgb(`, `rgba(`) may live ONLY in `tokens.css`. Every other `.css`/`.tsx` under `src/webview/` is scanned. `var(--token)` is fine (not a raw literal).
- Every `var(--veyra-…)` referenced in `styles.css` MUST be defined in `tokens.css`, or the "defines every Veyra token" test fails. So define tokens before referencing them.
- Workflow-state chip classes must keep existing rules. Don't touch `mission-control-workflow-chip*` / `trust-workflow-warning*`.

**Design note baked into this plan (kicker size):** kickers render inside `.panel-section { font-size: 11px }` (and `.mission-control { font-size: 11px }`). Giving `.veyra-microlabel` an `em` font-size would shrink them (~9px). The spec calls letter-spacing "the single highest-leverage change," so the microlabel rule sets `text-transform`, `letter-spacing`, `font-weight`, and `color` but NOT `font-size` — kickers keep their inherited 11px and just gain tracking/weight/muted color. The `--veyra-text-*` tokens are still defined for body-context use and later phases.

---

## File structure

- `src/webview/tokens.css` — add non-color token groups (spacing, type, motion) + a global `prefers-reduced-motion` block. Still the only file allowed raw literals.
- `src/webview/styles.css` — add `.veyra-microlabel` + grouped kicker rule; convert panel/mission chrome spacing to tokens; fix the toggle-hover kicker rule; add `.msg-cancelled` / `.msg-error` / `.composer-spacer` rules.
- `src/webview/components/AgentBubble.tsx` — replace two inline `style=` with classes.
- `src/webview/components/Composer.tsx` — replace the `flex:1` spacer inline style with a class.
- `tests/webviewStyles.test.ts` — extend with assertions for the new tokens, the microlabel rule, the reduced-motion block, and that kickers no longer carry `letter-spacing: 0`.

---

## Task 1: Add non-color design tokens to tokens.css

**Files:**
- Modify: `src/webview/tokens.css` (insert before the closing `}` of the `:root {` block, after the `--veyra-agent-*` group at lines 48-50)
- Test: `tests/webviewStyles.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to the END of `tests/webviewStyles.test.ts` (after the last `});` on line 76):

```ts
describe('webview styles: non-color design tokens (v0.2 Phase A)', () => {
  const tokens = fs.readFileSync(path.join(repoRoot, 'src', 'webview', 'tokens.css'), 'utf8');

  const REQUIRED_TOKENS = [
    '--veyra-space-1', '--veyra-space-2', '--veyra-space-3', '--veyra-space-4', '--veyra-space-5',
    '--veyra-text-micro', '--veyra-text-body', '--veyra-text-label',
    '--veyra-motion-fast', '--veyra-motion-base', '--veyra-ease',
  ];

  it.each(REQUIRED_TOKENS)('defines %s in tokens.css', (token) => {
    const re = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`);
    expect(re.test(tokens)).toBe(true);
  });

  it('includes a prefers-reduced-motion block', () => {
    expect(tokens.includes('prefers-reduced-motion')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --environment node tests/webviewStyles.test.ts -t "non-color design tokens"`
Expected: FAIL (tokens not defined; no reduced-motion block).

- [ ] **Step 3: Add the token groups to tokens.css**

In `src/webview/tokens.css`, find these lines (48-51):

```css
  --veyra-agent-claude: var(--vscode-veyra-claudeColor, #d97757);
  --veyra-agent-codex: var(--vscode-veyra-codexColor, #10a37f);
  --veyra-agent-gemini: var(--vscode-veyra-geminiColor, #4a8df0);

```

Insert immediately after the `--veyra-agent-gemini` line (before the blank line and the "Transitional legacy aliases" comment):

```css

  /* Spacing scale (non-color; v0.2 Phase A). Use these for padding/gap/margin. */
  --veyra-space-1: 4px;
  --veyra-space-2: 6px;
  --veyra-space-3: 8px;
  --veyra-space-4: 12px;
  --veyra-space-5: 16px;

  /* Type scale, em-based so it tracks the VS Code editor font size. Hierarchy
     comes from weight + color + tracking, not many sizes; body stays at the
     VS Code size for legibility. */
  --veyra-text-micro: 0.85em;
  --veyra-text-body: 1em;
  --veyra-text-label: 1em;

  /* Motion (non-color; v0.2 Phase A). */
  --veyra-motion-fast: 120ms;
  --veyra-motion-base: 200ms;
  --veyra-ease: cubic-bezier(0.2, 0, 0, 1);
```

- [ ] **Step 4: Add the global reduced-motion block to tokens.css**

At the very END of `src/webview/tokens.css` (after the final closing brace of the `body.vscode-dark, body.vscode-high-contrast { color-scheme: dark }` block), append:

```css

/*
 * Respect the user's reduced-motion preference globally. v0.2 motion (message
 * entrance, panel expand, streaming affordance) is added in later phases; this
 * block neutralizes transitions/animations up front so every later rule
 * inherits the safe default.
 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS (all groups, including the new one).

- [ ] **Step 6: Commit**

```bash
git add src/webview/tokens.css tests/webviewStyles.test.ts
git commit -m "feat(webview): add spacing/type/motion tokens + reduced-motion (v0.2 Phase A)"
```

---

## Task 2: Add the shared microlabel treatment and reroute kickers

**Files:**
- Modify: `src/webview/styles.css` (the four kicker rules at lines 48, 122, 373, 443; the toggle-hover rule at 93)
- Test: `tests/webviewStyles.test.ts`

- [ ] **Step 1: Write the failing test**

Add these two `it` blocks INSIDE the `describe('webview styles: non-color design tokens (v0.2 Phase A)', ...)` block you created in Task 1 (before its closing `});`):

```ts
  it('defines a shared .veyra-microlabel rule with letter-spacing', () => {
    const block = styles.match(/\.veyra-microlabel[^{]*\{[^}]*\}/);
    expect(block, 'no .veyra-microlabel rule found').not.toBeNull();
    expect(block![0]).toMatch(/letter-spacing:\s*0\.06em/);
  });

  it('no kicker rule keeps the old letter-spacing: 0', () => {
    for (const kicker of [
      'panel-section-kicker', 'mission-control-kicker',
      'workflow-replay-kicker', 'workflow-history-kicker',
    ]) {
      const re = new RegExp(`\\.${kicker}[^{]*\\{[^}]*letter-spacing:\\s*0;`);
      expect(re.test(styles), `${kicker} still has letter-spacing: 0`).toBe(false);
    }
  });
```

Note: `styles` is already read at the top of the test file (line 7).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --environment node tests/webviewStyles.test.ts -t "Phase A"`
Expected: FAIL (no `.veyra-microlabel`; kickers still have `letter-spacing: 0`).

- [ ] **Step 3: Add the shared microlabel rule grouping all kickers**

In `src/webview/styles.css`, find the `.panel-section-kicker` rule (lines 48-52):

```css
.panel-section-kicker {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 0;
}
```

Replace it with the shared rule (this becomes the canonical microlabel treatment and applies to every kicker at once):

```css
.veyra-microlabel,
.panel-section-kicker,
.mission-control-kicker,
.workflow-replay-kicker,
.workflow-history-kicker {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--veyra-fg-muted);
}
```

- [ ] **Step 4: Strip the now-duplicated declarations from the other three kicker rules**

Find `.mission-control-kicker` (lines 122-127):

```css
.mission-control-kicker {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-right: 6px;
}
```

Replace with (keep only its unique margin, now tokenized):

```css
.mission-control-kicker {
  margin-right: var(--veyra-space-2);
}
```

Find `.workflow-replay-kicker` (lines 373-378):

```css
.workflow-replay-kicker {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-right: 6px;
}
```

Replace with:

```css
.workflow-replay-kicker {
  margin-right: var(--veyra-space-2);
}
```

Find `.workflow-history-kicker` (lines 443-448):

```css
.workflow-history-kicker {
  opacity: 0.65;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-right: 6px;
}
```

Replace with:

```css
.workflow-history-kicker {
  margin-right: var(--veyra-space-2);
}
```

- [ ] **Step 5: Fix the toggle-hover rule (kickers moved from opacity to muted color)**

Find `.panel-section-toggle:hover .panel-section-kicker` (lines 93-95):

```css
.panel-section-toggle:hover .panel-section-kicker {
  opacity: 1;
}
```

Replace with (brighten the muted color on hover instead of opacity, which no longer applies):

```css
.panel-section-toggle:hover .panel-section-kicker {
  color: var(--veyra-fg-default);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS (microlabel rule found with `0.06em`; no kicker keeps `letter-spacing: 0`).

- [ ] **Step 7: Commit**

```bash
git add src/webview/styles.css tests/webviewStyles.test.ts
git commit -m "feat(webview): shared microlabel treatment for all kickers (v0.2 Phase A)"
```

---

## Task 3: Adopt the spacing scale in the panel + mission chrome

Bounded, deliberate sweep of the chrome regions (the "frame" users read), with exact conversions. Remaining panel-body spacing is converted incrementally in later phases as those areas are touched — this keeps the diff reviewable for visual regressions, matching the per-phase visual-review discipline.

**Files:**
- Modify: `src/webview/styles.css` (panel-section, mission-control, mission-stage chrome)

- [ ] **Step 1: Convert `.panel-section` spacing**

Find (lines 16-24):

```css
.panel-section {
  padding: 7px 10px;
  border-bottom: 1px solid var(--veyra-border-default);
  background: var(--veyra-bg-panel);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
}
```

Replace the `padding` and `gap` lines so the rule reads:

```css
.panel-section {
  padding: var(--veyra-space-2) var(--veyra-space-3);
  border-bottom: 1px solid var(--veyra-border-default);
  background: var(--veyra-bg-panel);
  display: flex;
  flex-direction: column;
  gap: var(--veyra-space-2);
  font-size: 11px;
}
```

(Note: `7px` maps to the nearest scale step `--veyra-space-2` (6px); this 1px tightening is intentional rhythm alignment.)

- [ ] **Step 2: Convert `.panel-section-head` and `.panel-section-heading` gaps**

Find (lines 35-47):

```css
.panel-section-head {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-section-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
```

Replace the two `gap` values:

```css
.panel-section-head {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--veyra-space-3);
}
.panel-section-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--veyra-space-2);
}
```

- [ ] **Step 3: Convert `.mission-control` and head spacing**

Find (lines 107-120):

```css
.mission-control {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--veyra-bg-panel);
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 11px;
}
.mission-control-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}
```

Replace the spacing values:

```css
.mission-control {
  padding: var(--veyra-space-3) var(--veyra-space-3);
  border-bottom: 1px solid var(--border);
  background: var(--veyra-bg-panel);
  display: flex;
  flex-direction: column;
  gap: var(--veyra-space-2);
  font-size: 11px;
}
.mission-control-head {
  display: flex;
  justify-content: space-between;
  gap: var(--veyra-space-3);
  align-items: baseline;
}
```

(`10px` horizontal padding maps to `--veyra-space-3` (8px) to match `.panel-section`; `7px` gap → `--veyra-space-2`.)

- [ ] **Step 4: Convert `.mission-control-summary` and `.mission-control-stages` gaps**

Find (lines 131-142):

```css
.mission-control-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  opacity: 0.72;
}
.mission-control-stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
```

Replace the two `gap` values with `var(--veyra-space-2)` (leave everything else, including `opacity: 0.72`, untouched):

```css
.mission-control-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--veyra-space-2);
  opacity: 0.72;
}
.mission-control-stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--veyra-space-2);
}
```

- [ ] **Step 5: Convert `.mission-stage` spacing**

Find (lines 143-152):

```css
.mission-stage {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--veyra-bg-card);
}
```

Replace the `gap` and `padding`:

```css
.mission-stage {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--veyra-space-2);
  padding: var(--veyra-space-1) var(--veyra-space-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--veyra-bg-card);
}
```

(`7px` horizontal padding → `--veyra-space-2` (6px).)

- [ ] **Step 6: Verify tokens resolve and gate stays green**

Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS — including "defines every Veyra token referenced in styles.css" (all `--veyra-space-*` now referenced are defined from Task 1) and the raw-color gate (no literals added).

- [ ] **Step 7: Commit**

```bash
git add src/webview/styles.css
git commit -m "refactor(webview): adopt spacing scale in panel + mission chrome (v0.2 Phase A)"
```

---

## Task 4: Remove inline styles from AgentBubble and Composer

**Files:**
- Modify: `src/webview/components/AgentBubble.tsx` (lines 177-178)
- Modify: `src/webview/components/Composer.tsx` (line 163)
- Modify: `src/webview/styles.css` (add three rules)

- [ ] **Step 1: Add the classed rules to styles.css**

Append to the END of `src/webview/styles.css`:

```css

/* Message status lines + composer spacer (v0.2 Phase A: replacing inline styles). */
.msg-cancelled {
  font-style: italic;
  color: var(--veyra-fg-muted);
  margin-top: var(--veyra-space-1);
}
.msg-error {
  color: var(--veyra-status-error);
  margin-top: var(--veyra-space-1);
}
.composer-spacer {
  flex: 1;
}
```

- [ ] **Step 2: Replace the inline styles in AgentBubble.tsx**

In `src/webview/components/AgentBubble.tsx`, find (lines 177-178):

```tsx
      {status === 'cancelled' && <div style="font-style:italic;opacity:0.6;margin-top:4px">[Cancelled]</div>}
      {status === 'errored' && error && <div style="color:var(--error-color);margin-top:4px">{error}</div>}
```

Replace with:

```tsx
      {status === 'cancelled' && <div class="msg-cancelled">[Cancelled]</div>}
      {status === 'errored' && error && <div class="msg-error">{error}</div>}
```

- [ ] **Step 3: Replace the inline spacer in Composer.tsx**

In `src/webview/components/Composer.tsx`, find (line 163):

```tsx
        <div style="flex:1" />
```

Replace with:

```tsx
        <div class="composer-spacer" />
```

- [ ] **Step 4: Verify the raw-color gate and typecheck**

Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS — the AgentBubble/Composer `.tsx` files now contain no inline `style=` color/spacing (the gate already passed since they used a var, but this keeps them clean).
Run: `npm run typecheck`
Expected: PASS (class attributes are valid; no type changes).

- [ ] **Step 5: Commit**

```bash
git add src/webview/components/AgentBubble.tsx src/webview/components/Composer.tsx src/webview/styles.css
git commit -m "refactor(webview): replace inline styles with token classes (v0.2 Phase A)"
```

---

## Task 5: Full verification and visual review

**Files:** none (verification only)

- [ ] **Step 1: Run the full verification**

Run: `npm run verify`
Expected: PASS (typecheck, all unit tests incl. `webviewStyles.test.ts`, build, package dry-run, integration, `git diff --check`). The build refreshes `dist/` so the Extension Host picks up the CSS.

- [ ] **Step 2: Manual visual review across the four themes**

Press F5 to launch the Extension Host; open a workspace with a Veyra view (e.g. `C:\Users\jford\Projects\veyra-demo`). Check in each of Light+, Dark+, Dark High Contrast, Light High Contrast (`Ctrl+K Ctrl+T`):
- Kickers (Mission Control, Trust Center, Workflows, Retrieval) read as tracked, muted uppercase labels — not cramped, still legible in HC.
- Toggle hover brightens the panel kicker.
- Panel/mission spacing rhythm looks even; nothing visibly shifted or clipped.
- A cancelled message shows italic muted "[Cancelled]"; an errored message shows the error in the error color.
Expected: consistent, intentional spacing and labels in all four themes; no regression.

- [ ] **Step 3: Re-baseline snapshots only if needed**

If any snapshot test reported a diff during Step 1 AND Step 2 confirms the new rendering is correct, re-baseline:
Run: `npx vitest run -u`
Then re-run `npm run verify` to confirm green. (If no snapshot diffs appeared, skip this step.)

- [ ] **Step 4: Push the branch**

```bash
git push -u origin design/ui-ux-polish-v0.2
```

---

## Self-review

**Spec coverage (Phase A items from the v0.2 spec):**
- Spacing scale `--veyra-space-1..5` → Task 1; adopted in chrome → Task 3.
- Em-based type scale `--veyra-text-micro/body/label` → Task 1 (defined; kickers intentionally don't force size — see the design note; tokens available for body-context/later phases).
- Shared `.veyra-microlabel` + reroute all kickers → Task 2.
- Motion tokens `--veyra-motion-fast/base` + `--veyra-ease` → Task 1.
- `prefers-reduced-motion` block → Task 1.
- Remove inline `style=` in AgentBubble + Composer → Task 4.
- Raw-color gate clean / HC-safe / verify green → guarded by `webviewStyles.test.ts` each task and Task 5.

**Scoping note (defensible deviation):** the spec says "sweep the scattered px values onto the scale." A full-file sweep of ~50 occurrences across 1351 lines in one PR would be a large, hard-to-review diff with real visual-regression risk. Task 3 converts the panel + mission chrome (the highest-visibility "frame") with exact conversions; remaining panel-body px are converted incrementally as Phases B–D touch those areas. This matches the per-phase visual-review discipline and keeps the diff reviewable. Flag for the reviewer.

**Placeholder scan:** none — every code step has exact before/after.

**Consistency:** token names (`--veyra-space-1..5`, `--veyra-text-micro/body/label`, `--veyra-motion-fast/base`, `--veyra-ease`) are defined in Task 1 and referenced identically in Tasks 2-4. Class names (`.veyra-microlabel`, `.msg-cancelled`, `.msg-error`, `.composer-spacer`) are defined in CSS and applied in the same task/their components. The microlabel rule deliberately omits `font-size` (documented in the design note) so kickers keep their inherited 11px.

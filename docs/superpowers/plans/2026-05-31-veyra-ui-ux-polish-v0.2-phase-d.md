# UI/UX Polish v0.2 — Phase D (Motion & live state) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the random-verb / braille-spinner streaming affordance with one calm, cohesive treatment (pulsing agent marker + a single thin shimmer), add gentle message-entrance and panel expand/collapse motion using the v0.2 motion tokens, and bring the Mission Control status pulse + state changes under that same motion system — all honoring `prefers-reduced-motion`.

**Architecture:** Motion is expressed through the existing `--veyra-motion-*` tokens (Phase A defined them; Phase D is their first consumer). Continuous/ambient loops (pulse, shimmer) keep literal durations, matching the already-shipped `pulse 1.6s` precedent; one-shot *transitions* (message entrance, panel slide, state cross-fade) reference `--veyra-motion-base` + `--veyra-motion-ease`. A global `@media (prefers-reduced-motion: reduce)` block already lives in `tokens.css` and neutralizes every animation/transition duration, so each new motion inherits the safe path automatically. The only markup changes are: gut `AgentBubble`'s streaming branch, and keep `PanelSection`'s collapsible body mounted (so it can slide both ways) behind a CSS grid-rows animation.

**Tech Stack:** Preact (webview), TypeScript (ESM/NodeNext, `.js` import extensions), esbuild bundle, Vitest (function-call component tests with `findByClass`/`collectText` walkers — NOT @testing-library), design tokens in `tokens.css`.

**Design decisions (made with the maintainer):**
- **Streaming affordance:** *Pulse + shimmer* — the agent's marker dot pulses while streaming, and one thin shimmer bar runs under the working row. Replaces both the per-agent braille spinner and the random "thinking verbs", and the blinking block cursor.
- **Panel expand/collapse:** *True height slide* — the collapsible body stays mounted and animates a CSS grid row `0fr ↔ 1fr` + opacity both ways (open AND close slide). Requires a small `PanelSection` markup change with focus/AT handling for the collapsed-but-mounted body.

**TEST CONVENTION (critical — NOT @testing-library):** Component tests call the component as a plain function (e.g. `AgentBubble({...})`) after `vi.mock('preact/hooks', …)`, and walk the returned vnode with local `findByClass`/`findByType`/`collectText` helpers (these recurse into function components by invoking `vnode.type(vnode.props)`). See `tests/agentBubble.test.ts` for the exact pattern. CSS-only changes (entrance, MC cross-fade) are verified by the human visual pass, not unit tests — animations aren't unit-testable here.

**Reconnaissance (verbatim current state — trust this over assumptions):**
- `AgentBubble.tsx` holds `SPINNER_FRAMES`, `THINKING_VERBS`, `pickRandom`, and a `BrailleSpinner` subcomponent. The hooks import is `import { useEffect, useMemo, useState } from 'preact/hooks';`. After this phase removes the spinner (`useEffect`/`useState`) and the `verb` memo (`useMemo`), **none** of those hooks remain used in this file → remove the whole hooks import line (tsc errors on unused imports here).
- `isThinking = streaming && message.text === '' && message.toolEvents.length === 0`. The thinking branch renders `<div class="thinking-line">{verb} <BrailleSpinner …/></div>`; otherwise `<WorkflowArtifactCards …/>`.
- The agent marker is rendered as `<div class="msg-role"><AgentMarker agentId={message.agentId} /></div>`. `AgentMarker` renders `<span class="agent-marker …"><span class="agent-marker-dot" …/>…</span>`. So a streaming pulse targets `.msg.streaming .agent-marker-dot`.
- CSS today (line numbers approximate): `.msg.streaming::after { content:'\2588'; … animation: blink 1s steps(2) infinite; }` (block cursor), `.msg.thinking::after { display:none; }`, `.thinking-line { font-style:italic; opacity:.7; display:inline-flex; align-items:center; gap:4px; }`, `.braille-spinner { … width:1ch; }`, `@keyframes blink { to { opacity:0; } }`. `@keyframes pulse { … }` is consumed only by `.mission-stage-active .agent-marker-dot { animation: pulse 1.6s infinite; }`.
- `.message-list { … display:flex; flex-direction:column; gap:6px; }` — message rows (`.msg`, user bubble, `.system-notice`) are its **direct children**; there is no `.message-row` wrapper. So entrance targets `.message-list > *`.
- `styles.css` has **no** `@media (prefers-reduced-motion …)` and **no** `transition:` rules; `tokens.css` lines ~107–114 has the global reduced-motion block that zeroes `animation-duration`/`transition-duration`/`animation-iteration-count`. `--veyra-motion-fast/base/ease` are defined in `tokens.css` (~lines 67–69), currently unreferenced anywhere.
- `PanelSection.tsx`: `collapsible = collapsed !== undefined`; `showBody = !collapsible || !collapsed`; body is rendered only `{showBody && <div id={bodyId} class="panel-section-body …">…</div>}`, i.e. **unmounted when collapsed**. The toggle button has `aria-expanded={expanded}` and `aria-controls={bodyId}`. Mission Control passes no `collapsed` (static, never animates); Trust/Workflows/Retrieval are collapsible.

**Branch:** `design/ui-ux-polish-v0.2-phase-d` (already created off `main`).

**Gates that must stay green every task:**
- `tests/webviewStyles.test.ts`: (a) no raw color literals (`#`/`rgb(`/`rgba(`) outside `tokens.css`; (b) every `var(--veyra-*)` in `styles.css` is defined in `tokens.css`; (c) workflow-chip class existence. The shimmer must use only existing tokens (`--veyra-border-default`, `--veyra-status-info`) — no gradient color literals.
- `npm run verify` green (unit + integration + esbuild + package dry-run).
- All new motion honors `prefers-reduced-motion` (inherited via the global tokens.css block).

---

## File Structure

**Modify:**
- `src/webview/components/AgentBubble.tsx` — remove verbs/spinner/blink; render the calm streaming affordance.
- `tests/agentBubble.test.ts` — assert the new affordance; assert verbs/spinner gone.
- `src/webview/components/PanelSection.tsx` — keep collapsible body mounted inside a slide wrapper.
- `src/webview/styles.css` — `.streaming-shimmer` + `@keyframes shimmer-slide`; streaming marker pulse; remove `.braille-spinner`/`@keyframes blink`/`.msg.streaming::after`; message-entrance keyframes on `.message-list > *`; `.panel-section-collapse*` slide rules; MC state cross-fade.
- Possibly `tests/*` for any PanelSection collapse assertions that change (Task 3 Step 1 greps for them).

No new files; no new tokens (uses the existing `--veyra-motion-*` + color tokens).

---

## Task 1: Calm streaming affordance (retire verbs + braille spinner)

**Files:**
- Modify: `src/webview/components/AgentBubble.tsx`, `tests/agentBubble.test.ts`, `src/webview/styles.css`

- [ ] **Step 1: Write the failing tests**

In `tests/agentBubble.test.ts`, add a new describe block (the `findByClass`/`collectText` helpers already exist at the bottom of the file):

```ts
describe('AgentBubble streaming affordance', () => {
  it('shows a calm shimmer while thinking (no text, no tools) and no random verb', () => {
    const vnode = AgentBubbleModule.AgentBubble({
      message: { id: 'm1', role: 'agent', agentId: 'claude', text: '', toolEvents: [], timestamp: 1 },
      streaming: true,
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });
    const text = collectText(vnode);
    expect(findByClass(vnode, 'streaming-shimmer')).toHaveLength(1);
    // none of the retired thinking verbs leak through
    for (const verb of ['thinking', 'pondering', 'considering', 'weighing', 'compiling', 'parsing', 'processing', 'cooking', 'researching', 'searching', 'looking up', 'digging']) {
      expect(text).not.toContain(verb);
    }
    expect(findByClass(vnode, 'braille-spinner')).toHaveLength(0);
  });

  it('shows a shimmer on a streaming row that already has text', () => {
    const vnode = AgentBubbleModule.AgentBubble({
      message: { id: 'm2', role: 'agent', agentId: 'codex', text: 'Working on it', toolEvents: [], timestamp: 1 },
      streaming: true,
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });
    expect(findByClass(vnode, 'streaming-shimmer')).toHaveLength(1);
    expect(collectText(vnode)).toContain('Working on it');
  });

  it('shows no shimmer once the message is finalized (not streaming)', () => {
    const vnode = AgentBubbleModule.AgentBubble({
      message: { id: 'm3', role: 'agent', agentId: 'gemini', text: 'Done.', toolEvents: [], editedFiles: [], timestamp: 1, status: 'complete' },
      streaming: false,
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });
    expect(findByClass(vnode, 'streaming-shimmer')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agentBubble.test.ts`
Expected: FAIL — `streaming-shimmer` not found; verbs still present.

- [ ] **Step 3: Rewrite the streaming parts of `AgentBubble.tsx`**

Remove these top-of-file declarations entirely: `SPINNER_FRAMES`, `THINKING_VERBS`, `pickRandom`, and the `BrailleSpinner` function. Remove the hooks import line `import { useEffect, useMemo, useState } from 'preact/hooks';` (none remain used).

In the `AgentBubble` function, delete the `verb` memo:

```tsx
  const verb = useMemo(
    () => pickRandom(THINKING_VERBS[message.agentId] ?? THINKING_VERBS.claude),
    [message.agentId],
  );
```

Replace the return body's thinking/streaming markup. The current return is:

```tsx
  return (
    <div class={classes.join(' ')}>
      <div class="msg-role"><AgentMarker agentId={message.agentId} /></div>
      {isThinking ? (
        <div class="thinking-line">{verb} <BrailleSpinner agentId={message.agentId} /></div>
      ) : (
        <WorkflowArtifactCards text={message.text} send={send} />
      )}
      {message.toolEvents.length > 0 && <ToolEvents events={message.toolEvents} renderStyle={settings.toolCallRenderStyle} />}
      <EditedFilesRow editedFiles={editedFiles} send={send} />
      {status === 'cancelled' && <div class="msg-cancelled">[Cancelled]</div>}
      {status === 'errored' && error && <div class="msg-error">{error}</div>}
    </div>
  );
```

Replace it with (thinking shows the shimmer as its content with a `role="status"` accessible name; a streaming row that already has text gets a bottom shimmer; the pulsing marker is driven by the `streaming` class in CSS):

```tsx
  return (
    <div class={classes.join(' ')}>
      <div class="msg-role"><AgentMarker agentId={message.agentId} /></div>
      {isThinking ? (
        <div class="thinking-line" role="status" aria-label="Working">
          <span class="streaming-shimmer" aria-hidden="true" />
        </div>
      ) : (
        <WorkflowArtifactCards text={message.text} send={send} />
      )}
      {message.toolEvents.length > 0 && <ToolEvents events={message.toolEvents} renderStyle={settings.toolCallRenderStyle} />}
      <EditedFilesRow editedFiles={editedFiles} send={send} />
      {streaming && !isThinking && <span class="streaming-shimmer" aria-hidden="true" />}
      {status === 'cancelled' && <div class="msg-cancelled">[Cancelled]</div>}
      {status === 'errored' && error && <div class="msg-error">{error}</div>}
    </div>
  );
```

The `classes`/`isThinking`/`status`/`error`/`editedFiles` lines above the return are unchanged (the `if (streaming) classes.push('streaming')` and `if (isThinking) classes.push('thinking')` stay).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agentBubble.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Update `styles.css` — remove the old streaming motion, add the shimmer + marker pulse**

Remove these rules entirely: `.msg.streaming::after { … blink … }`, `.msg.thinking::after { display:none; }`, `.braille-spinner { … }`, and `@keyframes blink { to { opacity:0; } }`.

Repurpose `.thinking-line` (drop the italic/opacity that styled the old verb text) and add the shimmer + a streaming marker pulse. Put these where `.thinking-line`/`.braille-spinner` were:

```css
.thinking-line {
  display: flex;
  align-items: center;
  min-height: 1.2em;
}

/* One thin progress shimmer: a faint track with a single accent segment that
   sweeps across while a row is streaming. Decorative (aria-hidden); the
   working state is announced via role="status" on the thinking row. Colors are
   token-only so the raw-color gate stays clean; under prefers-reduced-motion
   the global tokens.css block freezes the sweep to a static partial bar. */
.streaming-shimmer {
  position: relative;
  display: block;
  width: 100%;
  max-width: 160px;
  height: 2px;
  margin-top: var(--veyra-space-1);
  border-radius: 1px;
  background: var(--veyra-border-default);
  overflow: hidden;
}
.streaming-shimmer::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 40%;
  border-radius: 1px;
  background: var(--veyra-status-info);
  animation: shimmer-slide 1.6s var(--veyra-motion-ease) infinite;
}
@keyframes shimmer-slide {
  from { transform: translateX(-120%); }
  to { transform: translateX(320%); }
}

/* The agent's identity marker pulses calmly while its row streams (reuses the
   Mission Control pulse keyframes). */
.msg.streaming .agent-marker-dot {
  animation: pulse 1.6s infinite;
}
```

> The `@keyframes pulse` block stays (Mission Control still uses it). `--veyra-border-default`, `--veyra-status-info`, `--veyra-motion-ease`, `--veyra-space-1` are all defined in `tokens.css`.

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: PASS. Confirm no straggler references: `git grep -n "braille-spinner\|THINKING_VERBS\|BrailleSpinner\|SPINNER_FRAMES\|keyframes blink\|\.streaming::after" -- src tests` → no matches.

- [ ] **Step 7: Commit**

```bash
git add src/webview/components/AgentBubble.tsx tests/agentBubble.test.ts src/webview/styles.css
git commit -m "feat(webview): calm streaming affordance — pulse + shimmer, retire verbs/braille (v0.2 Phase D)"
```

---

## Task 2: Message entrance (fade + rise)

**Files:** Modify `src/webview/styles.css` only. CSS-only; verified by the human visual pass (entrance animation isn't unit-testable here).

New message rows fade and rise in over `--veyra-motion-base`. Because rows are appended as messages arrive (Preact keys by message id, so existing rows are not re-created), only newly-inserted rows animate — they naturally stagger in time without an artificial per-index delay (which would cause a long cascade when a whole history loads at once). Under `prefers-reduced-motion`, the global tokens.css block zeroes the duration → rows just appear.

- [ ] **Step 1: Add the entrance animation**

In `src/webview/styles.css`, near the `.message-list { … }` rule, add:

```css
/* New rows fade + rise in. Only freshly-inserted nodes animate (Preact reuses
   keyed rows), so streaming updates don't re-trigger it. Honors reduced-motion
   via the global block in tokens.css (duration → ~0, rows appear instantly). */
.message-list > * {
  animation: message-enter var(--veyra-motion-base) var(--veyra-motion-ease) both;
}
@keyframes message-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm run verify`
Expected: PASS. `--veyra-motion-base`/`--veyra-motion-ease` are defined in tokens.css; no raw color added.

- [ ] **Step 3: Commit**

```bash
git add src/webview/styles.css
git commit -m "feat(webview): gentle message-entrance fade+rise on new rows (v0.2 Phase D)"
```

---

## Task 3: Panel expand/collapse — true height slide

**Files:**
- Modify: `src/webview/components/PanelSection.tsx`, `src/webview/styles.css`
- Modify: any test asserting collapsed-panel body unmount (found in Step 1)

The collapsible body must stay mounted to slide both ways. Animate a CSS grid row `1fr ↔ 0fr` + opacity; flip `visibility` at the collapsed end-state so the hidden body leaves the tab order and the accessibility tree (otherwise its buttons stay focusable while collapsed). Mission Control (non-collapsible/static) is unaffected.

**Behavior change (decided with the maintainer):** a slide-*closed* animation is only possible if the body stays mounted. So collapsed bodies move from "unmounted" to "mounted but `visibility:hidden` + grid-row `0fr`" — present in the DOM, removed from the tab order and a11y tree by CSS. This flips exactly three existing assertions that encoded the old unmount contract (already located by grep):
- `tests/presentationDensity.test.tsx` ~L90–91 (TrustCenter collapsed): `expect(text).not.toContain('Pending Changes')` and `expect(text).not.toContain('Run verification')`.
- `tests/presentationDensity.test.tsx` ~L115 (WorkflowPanel collapsed): `expect(flattenText(collapsed)).not.toContain('Latest replay')`.
- `tests/retrievalFeedback.test.tsx` ~L182 (RetrievalFeedbackPanel collapsed): `expect(collapsedText).not.toContain('Selected files')`.
These are updated in Step 4 (after the markup change exists) to assert the collapsed *state* structurally instead of body absence. The positive summary `.toContain(...)` assertions in those same tests stay — they still validate the collapsed panel shows its summary chips.

- [ ] **Step 1: Confirm the three flipped assertions (no code change yet)**

Run: `git grep -n "not.toContain" -- tests/presentationDensity.test.tsx tests/retrievalFeedback.test.tsx`
Confirm the three lines above are the collapsed-body assertions. (Other `.not.toContain` lines in those files assert *expanded*-panel exclusions or unrelated text — leave those alone.) No other test asserts collapsed-body absence (`tests/trustCenter.test.ts`, `tests/workflowReplay.test.ts`, `tests/workflowHistory.test.ts` do not).

- [ ] **Step 2: Rewrite the body render in `PanelSection.tsx`**

The current body render is:

```tsx
      {showBody && (
        <div id={bodyId} class={bodyClass ? `panel-section-body ${bodyClass}` : 'panel-section-body'}>
          {children}
        </div>
      )}
```

Replace it with a branch: collapsible panels get the always-mounted slide wrapper; static panels (Mission Control) keep the simple body:

```tsx
      {collapsible ? (
        <div class="panel-section-collapse" data-expanded={expanded ? 'true' : 'false'}>
          <div class="panel-section-collapse-inner">
            <div
              id={bodyId}
              class={bodyClass ? `panel-section-body ${bodyClass}` : 'panel-section-body'}
            >
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div id={bodyId} class={bodyClass ? `panel-section-body ${bodyClass}` : 'panel-section-body'}>
          {children}
        </div>
      )}
```

`showBody` is now unused — remove the `const showBody = !collapsible || !collapsed;` line. Keep `collapsible` and `expanded`.

- [ ] **Step 3: Add the slide CSS**

In `src/webview/styles.css`, after the `.panel-section-open { … }` rule (the existing `max-height: 24vh; overflow: auto;` lives on the open collapsible section — keep it), add:

```css
/* Collapsible body slide: animate the grid row 1fr <-> 0fr plus opacity so the
   panel opens AND closes smoothly. visibility flips to hidden at the collapsed
   end-state (after the slide) so collapsed content leaves the tab order and the
   a11y tree. Honors reduced-motion via the global tokens.css block. */
.panel-section-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--veyra-motion-base) var(--veyra-motion-ease);
}
.panel-section-collapse[data-expanded="false"] {
  grid-template-rows: 0fr;
}
.panel-section-collapse-inner {
  min-height: 0;
  overflow: hidden;
  opacity: 1;
  transition: opacity var(--veyra-motion-base) var(--veyra-motion-ease);
}
.panel-section-collapse[data-expanded="false"] .panel-section-collapse-inner {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity var(--veyra-motion-base) var(--veyra-motion-ease),
    visibility 0s linear var(--veyra-motion-base);
}
```

> The `max-height: 24vh; overflow: auto;` on `.panel-section-open` still scrolls overflowing expanded bodies; the inner wrapper's `overflow: hidden` only clips during the slide. If the open panel's scroll feels off in the visual pass, the fix is to move `max-height/overflow:auto` onto `.panel-section-body` — flag it then, don't pre-optimize.

- [ ] **Step 4: Adapt the three flipped assertions**

The collapsed body is now mounted, so the old `.not.toContain(...)` body-absence checks no longer hold. Replace each with a structural assertion that the panel is collapsed — find the `.panel-section-collapse` wrapper via the repo walker and assert its `data-expanded` is `'false'`. Add this helper near the top of each affected test file (or a shared spot) if one isn't already present:

```tsx
function findCollapseWrapper(vnode: any): any | undefined {
  if (!vnode || typeof vnode !== 'object') return undefined;
  if (typeof vnode.type === 'function') return findCollapseWrapper(vnode.type(vnode.props));
  const cls = String(vnode.props?.class ?? '');
  if (cls.split(/\s+/u).includes('panel-section-collapse')) return vnode;
  const children = vnode.props?.children;
  if (Array.isArray(children)) {
    for (const c of children) { const f = findCollapseWrapper(c); if (f) return f; }
    return undefined;
  }
  return findCollapseWrapper(children);
}
```

Then:
- `tests/presentationDensity.test.tsx` TrustCenter-collapsed test: remove the two lines `expect(text).not.toContain('Pending Changes');` and `expect(text).not.toContain('Run verification');`; replace with `expect(findCollapseWrapper(vnode)?.props['data-expanded']).toBe('false');`. Keep the `.toContain('Trust Center')` / `.toContain('2 pending files')` summary assertions.
- `tests/presentationDensity.test.tsx` WorkflowPanel-collapsed test: remove `expect(flattenText(collapsed)).not.toContain('Latest replay');`; replace with `expect(findCollapseWrapper(collapsed)?.props['data-expanded']).toBe('false');`. Keep the `Workflows` / `Replay /review` / `History 1` summary assertions.
- `tests/retrievalFeedback.test.tsx` RetrievalFeedbackPanel-collapsed test: remove `expect(collapsedText).not.toContain('Selected files');`; replace with `expect(findCollapseWrapper(collapsed)?.props['data-expanded']).toBe('false');`. Keep the `Retrieval Feedback` / `@codebase` / `1 selected` / `2 omitted` summary assertions, and the rest of the test (button click, expanded panel) unchanged.

Keep every assertion about EXPANDED panels as-is. Do not weaken any unrelated assertion. (`flattenText` walks function components, so the now-mounted hidden body's text WILL appear in `flattenText` — that's exactly why these three must move to the structural `data-expanded` check rather than text absence.)

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: PASS. No raw colors; motion tokens defined. If a collapse test still fails, it's asserting the old unmount behavior — finish adapting it per Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/webview/components/PanelSection.tsx src/webview/styles.css tests/
git commit -m "feat(webview): true height-slide for collapsible panels (v0.2 Phase D)"
```

---

## Task 4: Mission Control status cross-fade

**Files:** Modify `src/webview/styles.css` only. CSS-only; verified by the visual pass.

The spec's final motion bullet: keep the MC active-dot pulse (already does, `1.6s`) and make stage **state changes cross-fade rather than snap**. Today the stage state color (`.mission-stage-state` and the `.agent-marker-dot`) flips instantly between waiting/queued/active/complete/failed/cancelled. Add a short color/opacity transition under the motion tokens so the change eases.

- [ ] **Step 1: Add the transitions to the existing base rules**

Both base rules already exist — append a `transition` to each, do NOT create duplicate selectors.

`.mission-stage-state` (currently, ~line 189):
```css
.mission-stage-state {
  flex: 0 0 auto;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--veyra-space-1);
  opacity: 0.72;
}
```
Add one declaration before the closing brace so color + opacity changes ease (the per-state rules `.mission-stage-complete/-failed/-cancelled/-active .mission-stage-state` override `color`/`opacity`, and this transition makes those overrides cross-fade):
```css
  transition:
    color var(--veyra-motion-base) var(--veyra-motion-ease),
    opacity var(--veyra-motion-base) var(--veyra-motion-ease);
```

`.agent-marker-dot` (currently, ~line 156):
```css
.agent-marker-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--veyra-fg-muted);
}
```
Add before its closing brace so the dot color eases when an agent's stage state changes:
```css
  transition: background-color var(--veyra-motion-base) var(--veyra-motion-ease);
```

- [ ] **Step 2: Run the full suite**

Run: `npm run verify`
Expected: PASS. Tokens defined; no raw color; existing Mission Control timeline tests (text/class assertions) unaffected by a transition declaration.

- [ ] **Step 3: Commit**

```bash
git add src/webview/styles.css
git commit -m "feat(webview): cross-fade Mission Control stage state changes (v0.2 Phase D)"
```

---

## Task 5: Human visual pass + reduced-motion check (acceptance gate)

The real acceptance for a motion phase — the user performs it in the Extension Host. Do **not** open the PR until this passes.

- [ ] **Step 1:** Run `npm run verify` (must be green); the user launches the Extension Development Host (F5).

- [ ] **Step 2: Visual checklist across Light+, Dark+, Dark High Contrast, Light High Contrast**
  - **Streaming:** send a prompt; while an agent works, its marker dot pulses calmly and one thin shimmer sweeps under the row. No random verbs, no braille spinner, no blinking block cursor. Reads calm and identical across all three agents.
  - **Message entrance:** new rows fade + rise in gently as they arrive; no jarring pop; streaming text updates don't re-trigger the entrance.
  - **Panel slide:** expand/collapse Trust Center / Workflows / Retrieval — the body slides open AND closed smoothly (height + fade), not an instant snap. Tab through a collapsed panel: focus must NOT land inside the hidden body.
  - **MC state cross-fade:** as stages move waiting→active→complete, the state color eases rather than snaps; the active pulse still reads.
  - **High Contrast:** shimmer + pulse remain legible/non-distracting; nothing relies on color alone for meaning.

- [ ] **Step 3: Reduced-motion check**
  Enable OS "reduce motion" (Windows: Settings → Accessibility → Visual effects → Animation effects off), reload the Ext Host. Confirm: no shimmer sweep, no pulse, no entrance slide, panels open/close instantly. Everything still fully usable.

- [ ] **Step 4:** Fix any reported issues with token-only CSS; re-run `npm run verify`; repeat the pass.

- [ ] **Step 5: Final whole-branch review + open PR.** After visual approval: dispatch a final code reviewer over the whole branch, fold any findings, then open the Phase D PR (base `main`). The plan file is committed on the branch.

---

## Self-Review (checked against the spec)

**Spec coverage (Phase D bullets):**
- Message entrance — fade+rise over `--veyra-motion-base`, opacity-only under reduced-motion → Task 2 (reduced-motion handled by the global block, which zeroes duration so rows just appear). ✓
- Panel expand/collapse — animate height + opacity with the ease token instead of instant show/hide → Task 3 (true grid-rows slide both ways). ✓
- Streaming affordance — retire `THINKING_VERBS` + per-agent braille spinners; while streaming, the agent's marker shows a settled pulse and the row carries one thin progress shimmer; one cohesive treatment for all agents → Task 1. ✓
- Status transitions — keep the MC active-dot pulse; state changes cross-fade rather than snap → Task 4 (pulse kept; `.mission-stage-state`/`.agent-marker-dot` transitions added). ✓
- All motion honors `prefers-reduced-motion`; no random-verb text remains → global tokens.css block + Task 1 removal; verified in Task 5 Step 3. ✓

**Placeholder scan:** none — every step has exact paths, full code, explicit run/expected lines.

**Type consistency:** `AgentBubble` Props unchanged; removing the hooks import is safe (no hook remains used in the file). `streaming`/`isThinking` booleans already exist. `PanelSection` keeps `collapsible`/`expanded`/`bodyId`/`bodyClass`; only `showBody` (now unused) is removed. No new props, no new tokens. Shimmer/entrance/slide/cross-fade reference only tokens defined in `tokens.css` (`--veyra-motion-base`, `--veyra-motion-ease`, `--veyra-border-default`, `--veyra-status-info`, `--veyra-space-1`).

**No new tokens / no raw colors:** the shimmer is a token-colored track + accent segment (no gradient literal); all durations are either the existing `--veyra-motion-*` tokens (transitions) or literal ambient loop durations matching the already-shipped `pulse 1.6s` precedent. Raw-color gate stays clean.

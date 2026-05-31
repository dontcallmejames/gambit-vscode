# UI/UX Polish v0.2 — Phase B (Agent Identity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude / Codex / Gemini trackable at a glance with one shared `<AgentMarker>` used everywhere, and in Mission Control separate agent *identity* (color) from *state* (a High-Contrast-legible icon shape), without visual regression.

**Architecture:** A single `agentLabel` module replaces 6 duplicated copies. A hook-free `<AgentMarker>` (colored dot + agent name) renders identically in Mission Control stages, message rows, and Trust Center. Mission Control stages render `<AgentMarker>` for identity and a per-state codicon (via the existing `<Icon>`) plus the existing state word for state — so the state word assertions in tests still pass and state reads in High Contrast without relying on color.

**Tech Stack:** Preact (`h`/JSX), plain CSS custom properties (tokens from Phase A), `@vscode/codicons` (already shipped), Vitest. No new dependencies.

**Branch:** `design/ui-ux-polish-v0.2-phase-b` (already checked out; main has Phase A merged).

**Guardrails (enforced by `tests/webviewStyles.test.ts`, runs under `npm test`):**
- Raw color literals (`#…`, `rgb(`, `rgba(`) only in `tokens.css`; everything else uses `var(--veyra-*)`. `var()` is fine.
- Every `var(--veyra-*)` referenced in `styles.css` must be defined in `tokens.css`. The agent tokens `--veyra-agent-claude/codex/gemini` and the Phase A `--veyra-space-*` already exist.
- Workflow-state chip classes must keep their rules — do not touch `mission-control-workflow-*` / `trust-workflow-warning-*`.

**Test-harness facts (important):**
- `tests/agentBubble.test.ts` ALREADY mocks `preact/hooks` (so rendering `<Icon>`-using children is safe there).
- `tests/missionControlTimeline.test.ts` does NOT currently mock `preact/hooks`. Today that's fine (the component uses no hooks). Task 3 introduces an `<Icon>` (which uses `useState`/`useEffect`) into the stage, so Task 3 MUST add a `preact/hooks` mock to that test or its `flattenText`/`findByClass` (which invoke function components for real) will throw "hook called outside render."
- `tests/trustCenter.test.ts` — Task 4 adds `<AgentMarker>` there. `<AgentMarker>` is hook-free, so no `preact/hooks` mock is required for Trust Center. (If that test already mocks hooks from Phase 2, leave it.)
- `flattenText`/`findByClass` in the tests recurse into function components via `vnode.type(vnode.props)`, so any component rendered in the tree is actually invoked.

**Design note (identity vs state, HC):** The agent dot is color-only, which is acceptable for *identity* because the agent NAME renders right next to it (text carries identity; color is reinforcement). State is the thing that must not be color-only, so state gets a distinct icon SHAPE per value plus the existing word. In forced-colors/HC the agent dot color may be flattened by the browser — fine, the name still identifies the agent.

---

## File structure

- `src/webview/agentLabel.ts` — **new.** The single `agentLabel(agentId)` helper. One responsibility.
- `src/webview/components/AgentMarker.tsx` — **new.** Hook-free presentational marker: colored dot + (optional) agent name.
- `src/webview/components/MissionControlTimeline.tsx` — **modify.** Stage uses `<AgentMarker>` + per-state `<Icon>`; head uses shared `agentLabel`.
- `src/webview/components/AgentBubble.tsx` — **modify.** `.msg-role` renders `<AgentMarker>`; drop local `agentLabel`.
- `src/webview/components/TrustCenter.tsx` — **modify.** Workflow-warning attribution uses `<AgentMarker showLabel>`; drop local `agentLabel`.
- `src/webview/state.ts`, `src/webview/workflowHistory.ts`, `src/webview/workflowReplay.ts` — **modify.** Drop local `agentLabel`, import the shared one.
- `src/webview/styles.css` — **modify.** Add `.agent-marker*` rules; rework `.mission-stage*` for the identity/state split; remove dead state-dot rules; move the active pulse.
- `tests/agentLabel.test.ts` — **new.** Unit test for the helper.
- `tests/agentMarker.test.tsx` — **new.** Component test.
- `tests/missionControlTimeline.test.ts` — **modify.** Add `preact/hooks` mock; assertions otherwise unchanged.

---

## Task 1: Shared `agentLabel` module + consolidate the 6 copies

**Files:**
- Create: `src/webview/agentLabel.ts`
- Create: `tests/agentLabel.test.ts`
- Modify: `src/webview/state.ts`, `src/webview/workflowHistory.ts`, `src/webview/workflowReplay.ts`, `src/webview/components/AgentBubble.tsx`, `src/webview/components/MissionControlTimeline.tsx`, `src/webview/components/TrustCenter.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/agentLabel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agentLabel } from '../src/webview/agentLabel.js';

describe('agentLabel', () => {
  it('maps each agent id to its display name', () => {
    expect(agentLabel('claude')).toBe('Claude');
    expect(agentLabel('codex')).toBe('Codex');
    expect(agentLabel('gemini')).toBe('Gemini');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run --environment node tests/agentLabel.test.ts`
Expected: FAIL (`Cannot find module '../src/webview/agentLabel.js'`).

- [ ] **Step 3: Create the module**

Create `src/webview/agentLabel.ts`:

```ts
import type { AgentId } from '../types.js';

export function agentLabel(agentId: AgentId): string {
  if (agentId === 'claude') return 'Claude';
  if (agentId === 'codex') return 'Codex';
  if (agentId === 'gemini') return 'Gemini';
  return agentId;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run --environment node tests/agentLabel.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the 6 local copies with the shared import**

For each file below, FIRST read the exact current text of its local `agentLabel` definition (line numbers drift), then make the change.

**`src/webview/state.ts`** (currently `export function agentLabel(agentId: AgentId): string { ... }`): replace the entire function definition with a re-export so any external importer keeps working:
```ts
export { agentLabel } from './agentLabel.js';
```
(Place it where the function was. Leave the rest of state.ts unchanged. If `AgentId` becomes unused after removal, leave the import — it is used elsewhere in state.ts.)

**`src/webview/workflowHistory.ts`** (local `function agentLabel(agentId: AgentId): string { ... }`, used by `.map(agentLabel)`): delete the local function and add to the file's import block near the top:
```ts
import { agentLabel } from './agentLabel.js';
```

**`src/webview/workflowReplay.ts`** (same shape as workflowHistory): delete the local function and add:
```ts
import { agentLabel } from './agentLabel.js';
```

**`src/webview/components/AgentBubble.tsx`** (local `function agentLabel(agentId: string): string { ... }`): delete it and add to the import block:
```ts
import { agentLabel } from '../agentLabel.js';
```
(Callers pass `message.agentId`, which is `AgentId` — compatible with the shared signature.)

**`src/webview/components/MissionControlTimeline.tsx`** (local `function agentLabel(agentId: MissionControlStage['agentId']): string { ... }`): delete it and add:
```ts
import { agentLabel } from '../agentLabel.js';
```

**`src/webview/components/TrustCenter.tsx`** (local `function agentLabel(agentId: string): string { ... }`): delete it and add:
```ts
import { agentLabel } from '../agentLabel.js';
```

- [ ] **Step 6: Verify no local definitions remain and everything compiles**

Run: `grep -rn "function agentLabel" src/webview/`
Expected: NO matches (all definitions removed; only `agentLabel.ts` has it, as an `export function`, which this grep WILL match — so expected output is exactly one line: `src/webview/agentLabel.ts:...export function agentLabel`).
Run: `npm run typecheck`
Expected: PASS.
Run: `npx vitest run --environment node tests/agentLabel.test.ts tests/missionControlTimeline.test.ts tests/agentBubble.test.ts tests/trustCenter.test.ts`
Expected: PASS (behavior unchanged; labels still render).

- [ ] **Step 7: Commit**

```bash
git add src/webview/agentLabel.ts tests/agentLabel.test.ts src/webview/state.ts src/webview/workflowHistory.ts src/webview/workflowReplay.ts src/webview/components/AgentBubble.tsx src/webview/components/MissionControlTimeline.tsx src/webview/components/TrustCenter.tsx
git commit -m "refactor(webview): consolidate agentLabel into one module (v0.2 Phase B)"
```

---

## Task 2: `<AgentMarker>` component

**Files:**
- Create: `src/webview/components/AgentMarker.tsx`
- Create: `tests/agentMarker.test.tsx`
- Modify: `src/webview/styles.css`

- [ ] **Step 1: Write the failing test**

Create `tests/agentMarker.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { h } from 'preact';
import { AgentMarker } from '../src/webview/components/AgentMarker.js';

function collect(node: unknown, acc: { text: string[]; classes: string[] }) {
  if (node == null || node === false || node === true) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.text.push(String(node)); return acc; }
  if (Array.isArray(node)) { for (const c of node) collect(c, acc); return acc; }
  const v = node as { props?: { class?: unknown; children?: unknown } };
  if (typeof v.props?.class === 'string') acc.classes.push(v.props.class);
  if (v.props && 'children' in v.props) collect(v.props.children, acc);
  return acc;
}

describe('AgentMarker', () => {
  it('renders an agent-colored dot class and the agent name by default', () => {
    const acc = collect(AgentMarker({ agentId: 'claude' }), { text: [], classes: [] });
    expect(acc.classes).toContain('agent-marker-claude');
    expect(acc.classes).toContain('agent-marker-dot');
    expect(acc.text.join(' ')).toContain('Claude');
  });

  it('omits the name when showLabel is false', () => {
    const acc = collect(AgentMarker({ agentId: 'codex', showLabel: false }), { text: [], classes: [] });
    expect(acc.classes).toContain('agent-marker-codex');
    expect(acc.text.join(' ')).not.toContain('Codex');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run --environment node tests/agentMarker.test.tsx`
Expected: FAIL (`Cannot find module '../src/webview/components/AgentMarker.js'`).

- [ ] **Step 3: Create the component**

Create `src/webview/components/AgentMarker.tsx`:

```tsx
import { h } from 'preact';
import type { AgentId } from '../../types.js';
import { agentLabel } from '../agentLabel.js';

interface AgentMarkerProps {
  agentId: AgentId;
  /** Render the agent name after the dot. Default true. */
  showLabel?: boolean;
}

/**
 * Shared agent identity marker: a color dot (the agent's --veyra-agent-* token)
 * plus the agent name. Hook-free and purely presentational so it can render in
 * any context (and any test) without a preact/hooks mock. Identity is carried by
 * the name text; the dot color is reinforcement (acceptable to be color-only).
 */
export function AgentMarker({ agentId, showLabel = true }: AgentMarkerProps) {
  return (
    <span class={`agent-marker agent-marker-${agentId}`}>
      <span class="agent-marker-dot" aria-hidden="true" />
      {showLabel && <span class="agent-marker-label">{agentLabel(agentId)}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Add the CSS**

In `src/webview/styles.css`, add this block immediately BEFORE the `.mission-stage {` rule (so marker rules sit with the mission chrome they're first used in):

```css
/* Shared agent identity marker (v0.2 Phase B): color dot + name, used in
   Mission Control, message rows, and Trust Center. */
.agent-marker {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--veyra-space-1);
}
.agent-marker-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--veyra-fg-muted);
}
.agent-marker-claude .agent-marker-dot {
  background: var(--veyra-agent-claude);
}
.agent-marker-codex .agent-marker-dot {
  background: var(--veyra-agent-codex);
}
.agent-marker-gemini .agent-marker-dot {
  background: var(--veyra-agent-gemini);
}
.agent-marker-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npx vitest run --environment node tests/agentMarker.test.tsx`
Expected: PASS (2 tests).
Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS (raw-color gate clean; `--veyra-agent-*` and `--veyra-space-1` are defined).

- [ ] **Step 6: Commit**

```bash
git add src/webview/components/AgentMarker.tsx tests/agentMarker.test.tsx src/webview/styles.css
git commit -m "feat(webview): add shared AgentMarker component (v0.2 Phase B)"
```

---

## Task 3: Mission Control — adopt AgentMarker + split identity from state

**Files:**
- Modify: `src/webview/components/MissionControlTimeline.tsx`
- Modify: `src/webview/styles.css` (the `.mission-stage*` rules)
- Modify: `tests/missionControlTimeline.test.ts` (add `preact/hooks` mock)

- [ ] **Step 1: Add the `preact/hooks` mock to the test (Stage will render `<Icon>`)**

In `tests/missionControlTimeline.test.ts`, immediately AFTER the line `vi.stubGlobal('React', { createElement: h });`, add:

```ts
vi.mock('preact/hooks', () => ({
  useEffect: vi.fn(),
  useState: vi.fn(() => [false, vi.fn()]),
  useMemo: vi.fn((fn: () => unknown) => fn()),
  useRef: vi.fn(() => ({ current: null })),
}));
```

(This keeps `flattenText`/`findByClass` from invoking real hooks when they render the new `<Icon>` inside Stage. `useState` returning `[false, ...]` means `<Icon>` renders the codicon span; the state WORD is a separate span, so the existing text assertions still hold.)

- [ ] **Step 2: Run the existing test to confirm it still passes BEFORE changing the component**

Run: `npx vitest run --environment node tests/missionControlTimeline.test.ts`
Expected: PASS (the mock is inert until the component uses hooks; behavior unchanged).

- [ ] **Step 3: Rewrite the Stage rendering in MissionControlTimeline.tsx**

In `src/webview/components/MissionControlTimeline.tsx`, add these imports near the top (alongside the existing imports and the `agentLabel` import added in Task 1):

```ts
import { AgentMarker } from './AgentMarker.js';
import { Icon } from './Icon.js';
import type { MissionControlStageState } from '../missionControl.js';
```

(If `MissionControlStage` is already imported as a type, extend that import to also include `MissionControlStageState`, or add the separate line above — either compiles.)

Add this state→icon map at module scope (after the imports, before the `MissionControlTimeline` function):

```ts
const STAGE_STATE_ICON: Record<MissionControlStageState, { name: string; fallback: string }> = {
  waiting: { name: 'circle-large-outline', fallback: 'o' },
  queued: { name: 'clock', fallback: '~' },
  active: { name: 'play-circle', fallback: '>' },
  complete: { name: 'pass-filled', fallback: 'v' },
  failed: { name: 'error', fallback: 'x' },
  cancelled: { name: 'circle-slash', fallback: '/' },
};
```

Replace the existing `Stage` function:

```tsx
function Stage({ stage }: { stage: MissionControlStage }) {
  return (
    <div class={`mission-stage mission-stage-${stage.agentId} mission-stage-${stage.state}`}>
      <span class="mission-stage-dot"></span>
      <span class="mission-stage-label">{stage.label}</span>
      <span class="mission-stage-state">{stage.state}</span>
    </div>
  );
}
```

with:

```tsx
function Stage({ stage }: { stage: MissionControlStage }) {
  const stateIcon = STAGE_STATE_ICON[stage.state];
  return (
    <div class={`mission-stage mission-stage-${stage.agentId} mission-stage-${stage.state}`}>
      <AgentMarker agentId={stage.agentId} />
      <span class="mission-stage-state">
        <Icon name={stateIcon.name} fallback={stateIcon.fallback} />
        <span class="mission-stage-state-text">{stage.state}</span>
      </span>
    </div>
  );
}
```

(The `<AgentMarker>` renders the agent dot in the agent's color + the agent name — the same text the old `stage.label` showed. The state word stays in `.mission-stage-state-text`.)

- [ ] **Step 4: Rework the mission-stage CSS for the identity/state split**

In `src/webview/styles.css`, find the `.mission-stage-dot` rule and the state-dot rules. Replace this block:

```css
.mission-stage-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--veyra-fg-muted);
}
.mission-stage-label {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mission-stage-state {
  flex: 0 0 auto;
  margin-left: auto;
  opacity: 0.72;
}
.mission-stage-active {
  border-color: var(--veyra-border-focus);
}
.mission-stage-active .mission-stage-dot {
  background: var(--ok-color);
  animation: pulse 1.6s infinite;
}
.mission-stage-complete .mission-stage-dot {
  background: var(--ok-color);
}
.mission-stage-failed .mission-stage-dot,
.mission-stage-cancelled .mission-stage-dot {
  background: var(--error-color);
}
.mission-stage-queued .mission-stage-dot {
  background: var(--veyra-status-info);
}
```

with (the old `.mission-stage-dot` is gone — AgentMarker provides the dot now; state is conveyed by the icon shape + a color reinforcement on the state group; the active pulse moves to the marker dot):

```css
.mission-stage-label {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mission-stage-state {
  flex: 0 0 auto;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--veyra-space-1);
  opacity: 0.72;
}
.mission-stage-active {
  border-color: var(--veyra-border-focus);
}
.mission-stage-active .agent-marker-dot {
  animation: pulse 1.6s infinite;
}
.mission-stage-complete .mission-stage-state {
  color: var(--ok-color);
  opacity: 1;
}
.mission-stage-failed .mission-stage-state,
.mission-stage-cancelled .mission-stage-state {
  color: var(--error-color);
  opacity: 1;
}
.mission-stage-active .mission-stage-state {
  color: var(--veyra-status-info);
  opacity: 1;
}
```

(Keep the `.mission-stage-claude/codex/gemini` left-stripe rules that follow — they are the identity stripe and are unchanged. Do not touch `.mission-control-workflow-*`.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --environment node tests/missionControlTimeline.test.ts`
Expected: PASS — the text still contains agent names (`Claude`, `Codex`) via `<AgentMarker>` and state words (`active`, `queued`) via `.mission-stage-state-text`; `findByClass(vnode, 'mission-control')` still finds the section.
Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS (no raw literals; all referenced tokens defined).
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/webview/components/MissionControlTimeline.tsx src/webview/styles.css tests/missionControlTimeline.test.ts
git commit -m "feat(webview): Mission Control identity/state split with AgentMarker + state icons (v0.2 Phase B)"
```

---

## Task 4: Adopt AgentMarker in message rows and Trust Center

**Files:**
- Modify: `src/webview/components/AgentBubble.tsx`
- Modify: `src/webview/components/TrustCenter.tsx`
- Modify: `src/webview/styles.css`

- [ ] **Step 1: Use AgentMarker for the message role label**

In `src/webview/components/AgentBubble.tsx`, add the import (alongside the `agentLabel` import from Task 1):

```ts
import { AgentMarker } from './AgentMarker.js';
```

Find the role line in the returned JSX:

```tsx
      <div class="msg-role">{agentLabel(message.agentId)}</div>
```

Replace with:

```tsx
      <div class="msg-role"><AgentMarker agentId={message.agentId} /></div>
```

If `agentLabel` is now unused in `AgentBubble.tsx` after this change (check for other uses in the file), remove its import to keep the file clean; if it is still used elsewhere in the file, keep it.

- [ ] **Step 2: Use AgentMarker for Trust Center workflow-warning attribution**

In `src/webview/components/TrustCenter.tsx`, add the import (alongside the `agentLabel` import from Task 1):

```ts
import { AgentMarker } from './AgentMarker.js';
```

Find the warning attribution:

```tsx
                  <span>{warning.label}</span>
                  {warning.agentId && <span>{` - ${agentLabel(warning.agentId)}`}</span>}
```

Replace with:

```tsx
                  <span>{warning.label}</span>
                  {warning.agentId && (
                    <span class="trust-workflow-warning-agent">
                      <AgentMarker agentId={warning.agentId} />
                    </span>
                  )}
```

If `agentLabel` is now unused in `TrustCenter.tsx` (check the file), remove its import; otherwise keep it.

- [ ] **Step 3: Add a small spacing rule for the Trust Center attribution**

In `src/webview/styles.css`, add near the other trust rules (anywhere in the trust section is fine):

```css
.trust-workflow-warning-agent {
  margin-left: var(--veyra-space-1);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --environment node tests/agentBubble.test.ts tests/trustCenter.test.ts`
Expected: PASS — `agentBubble.test.ts` still finds `Claude` in the rendered text (now via `<AgentMarker>`; that test already mocks `preact/hooks`, and `<AgentMarker>` is hook-free anyway). `trustCenter.test.ts` still passes (`<AgentMarker>` is hook-free).
Run: `npx vitest run --environment node tests/webviewStyles.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webview/components/AgentBubble.tsx src/webview/components/TrustCenter.tsx src/webview/styles.css
git commit -m "feat(webview): adopt AgentMarker in message rows and Trust Center (v0.2 Phase B)"
```

---

## Task 5: Full verification and visual review

**Files:** none (verification only)

- [ ] **Step 1: Run the full verification**

Run: `npm run verify`
Expected: PASS (typecheck, all unit tests, build, package dry-run 20 files, integration, `git diff --check`). The build refreshes `dist/` for the Extension Host.

- [ ] **Step 2: Manual visual review across the four themes**

Press F5 to launch the Extension Host; open a workspace with a Veyra view (e.g. `C:\Users\jford\Projects\veyra-demo`). In each of Light+, Dark+, Dark High Contrast, Light High Contrast (`Ctrl+K Ctrl+T`):
- Each Mission Control stage shows the agent's color dot + name (identity) on the left and a state icon + word (state) on the right. The agent dot color matches the left accent stripe.
- The same agent reads identically in Mission Control, message rows (the role label is now a marker), and the Trust Center workflow-warning attribution.
- In Dark High Contrast, the stage STATE is distinguishable by icon shape even though colors flatten (waiting=ring, queued=clock, active=play, complete=check, failed=error-x, cancelled=slash).
- The active stage's agent dot still pulses.
Expected: agent identity is consistent and trackable; state is legible in HC; no layout regression.

- [ ] **Step 3: Re-baseline snapshots only if needed**

If `npm run verify` reported a snapshot diff AND Step 2 confirms the rendering is correct, run `npx vitest run -u`, then re-run `npm run verify`. If no snapshot diffs appeared, skip.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin design/ui-ux-polish-v0.2-phase-b
```

---

## Self-review

**Spec coverage (Phase B items):**
- Shared `<AgentMarker>` (dot + optional codicon + name) used in Mission Control, message rows, Trust Center → Tasks 2, 3, 4. (Marker uses dot + name; the optional codicon is the per-state icon in Mission Control, kept as a separate `<Icon>` so the marker stays hook-free — a deliberate, documented refinement of "color dot + optional codicon".)
- Consolidate `agentLabel` duplicated across files into one module → Task 1 (all 6 copies).
- Mission Control: separate identity (agent color via marker + existing per-agent stripe from the same token) from state (per-state icon shape, HC-legible without color, state word kept, active pulse kept) → Task 3.
- Constraints (token-only color, HC-safe, CSP/codicons, verify green) → guarded by `webviewStyles.test.ts` each task + Task 5.
- Component test for `<AgentMarker>` (per-agent class, decorative dot, label toggle) → Task 2.

**Deviation flagged for reviewer:** the spec described the marker as "color dot + optional codicon + name." The marker is implemented hook-free as dot + name; the per-state codicon lives as a separate `<Icon>` in the Mission Control stage rather than inside the marker. Rationale: keeping the marker hook-free means it renders in any test/context without a `preact/hooks` mock, and the only place that needs an icon (state) is Mission Control. Same visual outcome; cleaner test surface.

**Placeholder scan:** none — every code step has exact content or a precise read-then-replace instruction.

**Type consistency:** `agentLabel(agentId: AgentId)` is defined once (Task 1) and imported everywhere. `AgentMarkerProps` (`agentId: AgentId`, `showLabel?: boolean`) is defined in Task 2 and used in Tasks 3-4. `MissionControlStageState` (the 6-value union) is imported in Task 3 and keys `STAGE_STATE_ICON`. `<Icon>` props (`name`, `fallback`, optional `label`) match `Icon.tsx`. Class names (`.agent-marker*`, `.mission-stage-state-text`, `.trust-workflow-warning-agent`) are defined in CSS and used in the same/adjacent task.

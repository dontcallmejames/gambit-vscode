# UI/UX Polish v0.2 — Phase C (Composer & states) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible composer focus ring, surface which agent holds the floor at the point of typing, and unify the "nothing here yet" surfaces behind one shared `<StatePanel>` component on the v0.2 type + space scale.

**Architecture:** A new `<StatePanel>` presentational component owns the shared structure (optional icon, title, optional subtitle, body). The existing empty state and a new no-agents-ready state both render through it. The composer gains a real focus ring and a floor-held affordance that reuses the Phase B `<AgentMarker>`. All color stays token-only; no new tokens are introduced (everything uses existing `--veyra-*`).

**Tech Stack:** Preact (webview), TypeScript (ESM/NodeNext, `.js` import extensions), esbuild bundle, design tokens in `tokens.css`.

**TEST CONVENTION (critical — this repo does NOT use @testing-library):** Component tests call the component as a plain function (e.g. `Composer({...})`, `MessageList({...})`) after `vi.mock('preact/hooks', …)`, then walk the returned vnode with local `collect`/`collectText`/`findNode` helpers. **Nested component vnodes are NOT invoked** — `h(StatePanel, {title})` is an object `{ type: StatePanel, props: { title } }`; its `title`/`subtitle` props never appear as walkable text, and its internal `class="state-panel"` is invisible. So you assert on nested components via `findNode(vnode, StatePanel).props.title`, exactly like `composer.test.ts` does with `findNode(vnode, MentionAutocomplete).props.filter`. Text passed as `children` (e.g. the `<ul>` hints) IS reachable because `collect` recurses `props.children`. A component called directly at the top of a test (`StatePanel({...})`) IS invoked and returns real DOM vnodes, so its own classes/text are walkable.

**Reconnaissance already done (verbatim current state — trust this over assumptions):**
- Empty-state markup is inline in `MessageList.tsx`, rendered when `items.length === 0`:
  ```tsx
  <div class="message-list-empty">
    <Icon name="comment-discussion" fallback="❝" />
    <p class="message-list-empty-title">Send your first prompt</p>
    <p class="message-list-empty-subtitle">Veyra routes it to Claude, Codex, and Gemini.</p>
    <ul class="message-list-empty-hints">
      <li><code>@claude</code> <code>@codex</code> <code>@gemini</code> go to one agent — <code>@all</code> fans out to all three</li>
      <li><code>/review</code> <code>/debate</code> <code>/consensus</code> <code>/implement</code> run a multi-agent workflow</li>
      <li><code>@path/to/file</code> adds a file as context</li>
    </ul>
  </div>
  ```
- `MessageList` Props today are `{ session, inProgress, settings, send }` — it does **not** receive agent status. Status lives at `state.status` (`Record<AgentId, AgentStatus>`, default all `'ready'`) and is passed to `Composer`/`HealthStrip`. Task 4 adds a `status` prop to MessageList and threads it from `App.tsx`.
- `.composer` **already has `position: relative`**, and the autocomplete popover (`.mention-popover`, anchored `bottom:100%`) is already correctly anchored — **no popover-anchoring change is needed.**
- `.composer textarea` has **no `:focus` rule** — the focus ring is genuinely missing. `.composer button.cancel` already exists (destructive bg). Send/cancel hierarchy already reads correctly — **no hierarchy change is needed.**
- `Icon` renders either `<span class="codicon codicon-NAME">` or `<span class="icon-fallback">`; `Icon` uses `useState`/`useEffect`, but it is left **uninvoked** inside StatePanel during function-call tests, so StatePanel can be called as a function with **no hook mock**.
- The HC inline-code override is at `styles.css` lines ~929–933, targeting `.message-list-empty-hints code` — it must be **retargeted** to `.state-panel-hints code`.
- `FloorIndicator.tsx` is dead (only self-reference; no importers).

**Scope note (decided with the user — "Shared component + real states only"):** The spec's "cohesive state set" lists empty / loading / errored / no-agents-ready. Only **empty** and **no-agents-ready** have real triggers today — there is no async loading phase, and errors surface as inline `<SystemNotice>` rows, not a full-panel state. This plan builds the shared `<StatePanel>` (the vehicle for all four) and adopts it for the two states with real triggers. loading/errored adopt the same component later if/when introduced; rendering panels for them now would be dead UI.

**Branch:** `design/ui-ux-polish-v0.2-phase-c` (already created off `main`).

**Gates that must stay green every task:**
- `tests/webviewStyles.test.ts`: (a) no raw color literals (`#`/`rgb(`/`rgba(`) outside `tokens.css`; (b) every `var(--veyra-*)` referenced in `styles.css` is defined in `tokens.css`; (c) workflow-chip class existence. Use only existing tokens; add no color literals. (px/`em` literals are fine — the gate only flags colors.)
- `npm run verify` green (unit + integration + esbuild + package dry-run).
- HC-safe: no state encoded by color alone.

---

## File Structure

**Create:**
- `src/webview/components/StatePanel.tsx`
- `tests/statePanel.test.tsx`

**Modify:**
- `src/webview/components/MessageList.tsx` — empty + no-agents-ready via `<StatePanel>`; accept `status` prop.
- `src/webview/App.tsx` — pass `status={state.status}` to `<MessageList>`.
- `src/webview/components/Composer.tsx` — floor-held affordance via `<AgentMarker>`.
- `src/webview/styles.css` — `.state-panel*` (replacing `.message-list-empty*`), retarget HC code override, `.composer textarea:focus`, `.composer-floor*`.
- `tests/messageList.test.ts` — add `findNode`/`StatePanel` import; `status` prop; empty vs no-agents assertions.
- `tests/composer.test.ts` — floor-held assertions.

**Delete:**
- `src/webview/components/FloorIndicator.tsx`

---

## Task 1: Shared `<StatePanel>` + migrate the empty state

**Files:**
- Create: `src/webview/components/StatePanel.tsx`, `tests/statePanel.test.tsx`
- Modify: `src/webview/components/MessageList.tsx`, `tests/messageList.test.ts`, `src/webview/styles.css`

- [ ] **Step 1: Write the failing StatePanel test**

Create `tests/statePanel.test.tsx` (call StatePanel as a function — it is hook-free; no `preact/hooks` mock needed):

```tsx
import { describe, expect, it } from 'vitest';
import { h } from 'preact';
import { StatePanel } from '../src/webview/components/StatePanel.js';

vi.stubGlobal('React', { createElement: h });

type Acc = { text: string[]; classes: string[] };

function collect(node: unknown, acc: Acc): Acc {
  if (node == null || node === false || node === true) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.text.push(String(node)); return acc; }
  if (Array.isArray(node)) { for (const c of node) collect(c, acc); return acc; }
  const v = node as any;
  if (typeof v.props?.class === 'string') {
    for (const cls of v.props.class.split(/\s+/)) { if (cls) acc.classes.push(cls); }
  }
  if (v.props && 'children' in v.props) collect(v.props.children, acc);
  return acc;
}

describe('StatePanel', () => {
  it('renders the title with the title class', () => {
    const acc = collect(StatePanel({ title: 'Nothing here yet' }), { text: [], classes: [] });
    expect(acc.text.join(' ')).toContain('Nothing here yet');
    expect(acc.classes).toContain('state-panel');
    expect(acc.classes).toContain('state-panel-title');
  });

  it('renders an optional subtitle', () => {
    const acc = collect(StatePanel({ title: 'X', subtitle: 'more detail' }), { text: [], classes: [] });
    expect(acc.text.join(' ')).toContain('more detail');
    expect(acc.classes).toContain('state-panel-subtitle');
  });

  it('wraps body children in the body element', () => {
    const acc = collect(StatePanel({ title: 'X', children: h('div', null, 'hint text') }), { text: [], classes: [] });
    expect(acc.classes).toContain('state-panel-body');
    expect(acc.text.join(' ')).toContain('hint text');
  });

  it('omits subtitle and body when not provided', () => {
    const acc = collect(StatePanel({ title: 'Only title' }), { text: [], classes: [] });
    expect(acc.classes).not.toContain('state-panel-subtitle');
    expect(acc.classes).not.toContain('state-panel-body');
  });
});
```

> Add `import { vi } from 'vitest';` to the import line if `vi.stubGlobal` is used — combine with the existing vitest import: `import { describe, expect, it, vi } from 'vitest';`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/statePanel.test.tsx`
Expected: FAIL — cannot resolve `../src/webview/components/StatePanel.js`.

- [ ] **Step 3: Implement `StatePanel.tsx`**

Create `src/webview/components/StatePanel.tsx`:

```tsx
import { h, type ComponentChildren } from 'preact';
import { Icon } from './Icon.js';

interface StatePanelProps {
  /** Optional codicon name shown above the title. */
  icon?: string;
  /** Text fallback for the icon when codicons are unavailable. */
  iconFallback?: string;
  /** Heading line; emphasis comes from weight + color, not size. */
  title: string;
  /** Optional one-line supporting sentence under the title. */
  subtitle?: string;
  /** Optional body content (hints, guidance, action buttons). */
  children?: ComponentChildren;
}

/**
 * Shared "nothing here yet" state container. One structure — optional codicon,
 * a title, an optional subtitle, and body content — on the v0.2 type + space
 * scale, so every empty / no-agents state reads the same across all four
 * themes. Presentational and hook-free (the only hook is inside <Icon>).
 */
export function StatePanel({ icon, iconFallback, title, subtitle, children }: StatePanelProps) {
  return (
    <div class="state-panel">
      {icon && <Icon name={icon} fallback={iconFallback} />}
      <p class="state-panel-title">{title}</p>
      {subtitle && <p class="state-panel-subtitle">{subtitle}</p>}
      {children && <div class="state-panel-body">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/statePanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Migrate the empty state in `MessageList.tsx`**

Add the import near the other component imports:

```tsx
import { StatePanel } from './StatePanel.js';
```

Replace the empty branch — the `items.length === 0 ? ( <div class="message-list-empty">…</div> )` part; **keep** the `: ( items.map(… ) )` else branch unchanged — with:

```tsx
      {items.length === 0 ? (
        <StatePanel
          icon="comment-discussion"
          iconFallback="❝"
          title="Send your first prompt"
          subtitle="Veyra routes it to Claude, Codex, and Gemini."
        >
          <ul class="state-panel-hints">
            <li><code>@claude</code> <code>@codex</code> <code>@gemini</code> go to one agent — <code>@all</code> fans out to all three</li>
            <li><code>/review</code> <code>/debate</code> <code>/consensus</code> <code>/implement</code> run a multi-agent workflow</li>
            <li><code>@path/to/file</code> adds a file as context</li>
          </ul>
        </StatePanel>
      ) : (
```

The `Icon` import in `MessageList.tsx` becomes unused after this (StatePanel owns the icon now). Remove the `import { Icon } from './Icon.js';` line — tsc (`npm run verify`) errors on an unused import under this repo's config, so it must go.

- [ ] **Step 6: Update the existing empty-state tests in `tests/messageList.test.ts`**

The `collect` walker can no longer see `message-list-empty` (StatePanel is uninvoked) or the `title` prop. Add a `findNode` helper (copy of the one in `composer.test.ts`) and the StatePanel import, then assert via the vnode's props.

Add the import after the MessageList import:

```tsx
import { StatePanel } from '../src/webview/components/StatePanel.js';
```

Add this helper next to the existing `collect` function:

```tsx
function findNode(vnode: any, type: unknown): any | undefined {
  if (vnode === null || vnode === undefined || typeof vnode !== 'object') return undefined;
  if (vnode.type === type) return vnode;
  const children = vnode.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findNode(child, type);
      if (found) return found;
    }
    return undefined;
  }
  return findNode(children, type);
}
```

In the test `renders first-launch orientation copy when there are no messages`, replace:

```tsx
    expect(collected.classes).toContain('message-list-empty');
    expect(text).toContain('Send your first prompt');
```

with (the `@all` / `/review` / `@path/to/file` assertions stay — those live in `children` and are still collected):

```tsx
    const panel = findNode(vnode, StatePanel);
    expect(panel).toBeTruthy();
    expect(panel.props.title).toBe('Send your first prompt');
```

In the test `renders messages instead of the empty state once a message exists`, replace:

```tsx
    expect(collected.classes).not.toContain('message-list-empty');
```

with:

```tsx
    expect(findNode(vnode, StatePanel)).toBeFalsy();
```

- [ ] **Step 7: Replace the empty-state CSS in `styles.css`**

The current rules (lines ~801–846) are:

```css
/* First-launch empty state: centered orientation for the docked conversation. */
.message-list-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 18px;
  text-align: center;
}
.message-list-empty .codicon,
.message-list-empty .icon-fallback {
  font-size: 26px;
  line-height: 1;
  margin-bottom: 4px;
  color: var(--veyra-fg-muted);
}
.message-list-empty-title {
  margin: 0;
  font-weight: 600;
  color: var(--veyra-fg-default);
}
.message-list-empty-subtitle {
  margin: 0;
  color: var(--veyra-fg-muted);
}
.message-list-empty-hints {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
  font-size: 12px;
  color: var(--veyra-fg-muted);
}
.message-list-empty-hints code {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--veyra-bg-code);
  color: var(--veyra-fg-default);
}
```

**Replace that whole block** with (spacing onto `--veyra-space-*`; type onto `--veyra-text-*`; off-scale `24px 18px`/`10px` snap to `--veyra-space-5`/`--veyra-space-4`; `1px 5px` code padding and `320px`/`26px` stay literals — not colors, consistent with the original):

```css
/* Shared state surface (empty, no-agents, …): centered orientation for the
   docked conversation, on the v0.2 type + space scale. */
.state-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--veyra-space-2);
  padding: var(--veyra-space-5);
  text-align: center;
}
.state-panel .codicon,
.state-panel .icon-fallback {
  font-size: 26px;
  line-height: 1;
  margin-bottom: var(--veyra-space-1);
  color: var(--veyra-fg-muted);
}
.state-panel-title {
  margin: 0;
  font-size: var(--veyra-text-label);
  font-weight: 600;
  color: var(--veyra-fg-default);
}
.state-panel-subtitle {
  margin: 0;
  font-size: var(--veyra-text-micro);
  color: var(--veyra-fg-muted);
}
.state-panel-body {
  margin-top: var(--veyra-space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--veyra-space-3);
}
.state-panel-hints {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--veyra-space-2);
  max-width: 320px;
  font-size: var(--veyra-text-micro);
  color: var(--veyra-fg-muted);
  text-align: left;
}
.state-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--veyra-space-3);
  justify-content: center;
}
.state-panel-hints code,
.state-panel-actions code {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--veyra-text-micro);
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--veyra-bg-code);
  color: var(--veyra-fg-default);
}
```

- [ ] **Step 8: Retarget the HC inline-code override**

At `styles.css` lines ~929–933, the rule is:

```css
body.vscode-high-contrast .message-list-empty-hints code,
body.vscode-high-contrast-light .message-list-empty-hints code {
  background: transparent;
  border: 1px solid var(--veyra-border-default);
}
```

Change both selectors to the new class:

```css
body.vscode-high-contrast .state-panel-hints code,
body.vscode-high-contrast-light .state-panel-hints code {
  background: transparent;
  border: 1px solid var(--veyra-border-default);
}
```

- [ ] **Step 9: Guard against stragglers, then run the full suite**

First confirm no other reference to the old classes survives:
Run: `git grep -n "message-list-empty" -- src tests` → expected: **no matches**.

Run: `npm run verify`
Expected: PASS (StatePanel test + updated MessageList tests; raw-color + token-definition gates green).

- [ ] **Step 10: Commit**

```bash
git add src/webview/components/StatePanel.tsx tests/statePanel.test.tsx src/webview/components/MessageList.tsx tests/messageList.test.ts src/webview/styles.css
git commit -m "feat(webview): shared StatePanel; migrate empty state onto type/space scale (v0.2 Phase C)"
```

---

## Task 2: Composer textarea focus ring

**Files:** Modify `src/webview/styles.css` only. (`.composer` is already `position: relative`; popover already anchored; send/cancel hierarchy already correct — the only real gap is the missing focus ring.)

- [ ] **Step 1: Add the focus rule**

The `.composer textarea` rule is at lines ~1250–1261. Immediately **after** it (before `.composer-spacer`), add a `:focus` rule. Use `:focus` (not `:focus-visible`) so the ring shows on click as well as Tab — desirable for the primary input. Specificity `(0,2,1)` beats the base `(0,1,1)`:

```css
.composer textarea:focus {
  outline: 1px solid var(--veyra-border-focus);
  outline-offset: -1px;
  border-color: var(--veyra-border-focus);
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm run verify`
Expected: PASS. `--veyra-border-focus` is an existing token; no raw color added.

- [ ] **Step 3: Commit**

```bash
git add src/webview/styles.css
git commit -m "feat(webview): visible composer textarea focus ring (v0.2 Phase C)"
```

---

## Task 3: Floor-held affordance + remove dead FloorIndicator

**Files:**
- Modify: `src/webview/components/Composer.tsx`, `tests/composer.test.ts`, `src/webview/styles.css`
- Delete: `src/webview/components/FloorIndicator.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/composer.test.ts`, add the AgentMarker import after the existing component imports:

```tsx
import { AgentMarker } from '../src/webview/components/AgentMarker.js';
```

Add a new describe block at the end of the file (before the helper `function` declarations). It relies on the existing `collectText` and `findNode` helpers already in this file:

```ts
describe('Composer floor-held affordance', () => {
  beforeEach(() => {
    mockedUseState.mockReset();
    mockedUseState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
  });

  it('shows which agent holds the floor via an AgentMarker', () => {
    const vnode = Composer({
      send: vi.fn(),
      floorHolder: 'claude',
      status: { claude: 'ready', codex: 'ready', gemini: 'ready' },
      veyraMdPresent: false,
    });

    const marker = findNode(vnode, AgentMarker);
    expect(marker).toBeTruthy();
    expect(marker.props.agentId).toBe('claude');
    expect(collectText(vnode)).toContain('Working');
  });

  it('shows no floor affordance when no agent holds the floor', () => {
    const vnode = Composer({
      send: vi.fn(),
      floorHolder: null,
      status: { claude: 'ready', codex: 'ready', gemini: 'ready' },
      veyraMdPresent: false,
    });

    expect(findNode(vnode, AgentMarker)).toBeUndefined();
    expect(collectText(vnode)).not.toContain('Working');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/composer.test.ts`
Expected: FAIL — no `AgentMarker` in the tree / no "Working" text.

- [ ] **Step 3: Implement the affordance in `Composer.tsx`**

Add the import near the other component imports:

```tsx
import { AgentMarker } from './AgentMarker.js';
```

The composer row is currently:

```tsx
      <div class="composer-row">
        <HealthStrip status={status} send={send} veyraMdPresent={veyraMdPresent} />
        <div class="composer-spacer" />
        {isFloorHeld && (
          <button class="cancel" onClick={() => send({ kind: 'cancel' })}>Cancel</button>
        )}
        <button onClick={handleSend} disabled={!text.trim()}>Send</button>
      </div>
```

Replace it with (the `&& floorHolder` guard narrows `AgentId | null` to `AgentId`):

```tsx
      <div class="composer-row">
        <HealthStrip status={status} send={send} veyraMdPresent={veyraMdPresent} />
        <div class="composer-spacer" />
        {isFloorHeld && floorHolder && (
          <span class="composer-floor">
            <AgentMarker agentId={floorHolder} />
            <span class="composer-floor-state veyra-microlabel">Working</span>
          </span>
        )}
        {isFloorHeld && (
          <button class="cancel" onClick={() => send({ kind: 'cancel' })}>Cancel</button>
        )}
        <button onClick={handleSend} disabled={!text.trim()}>Send</button>
      </div>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/composer.test.ts`
Expected: PASS (existing tests + the two new ones).

- [ ] **Step 5: Add `.composer-floor*` styles**

In `src/webview/styles.css`, **after** the `.composer-spacer` rule (lines ~1262–1264), add:

```css
.composer-floor {
  display: inline-flex;
  align-items: center;
  gap: var(--veyra-space-2);
}
.composer-floor-state {
  font-size: var(--veyra-text-micro);
}
```

(`.veyra-microlabel` already supplies uppercase/tracking/weight/muted color; `.composer-floor-state` only pins the micro size so it sits inline with the marker.)

- [ ] **Step 6: Delete the dead FloorIndicator**

```bash
git rm src/webview/components/FloorIndicator.tsx
```

- [ ] **Step 7: Run the full suite**

Run: `npm run verify`
Expected: PASS. FloorIndicator had no importers, so nothing breaks. `webviewStyles.test.ts` green.

- [ ] **Step 8: Commit**

```bash
git add src/webview/components/Composer.tsx tests/composer.test.ts src/webview/styles.css
git commit -m "feat(webview): floor-held affordance in composer; drop dead FloorIndicator (v0.2 Phase C)"
```

---

## Task 4: No-agents-ready state through `<StatePanel>`

**Files:**
- Modify: `src/webview/components/MessageList.tsx`, `src/webview/App.tsx`, `tests/messageList.test.ts`

When there are no messages **and** every agent is unavailable (not `ready`/`busy`), show a no-agents panel with the existing setup affordances instead of the onboarding hints. `status` defaults to all `ready`, so this never flashes on launch — it appears only once the host reports all agents down. Availability mirrors HealthStrip's `ok = s === 'ready' || s === 'busy'`.

- [ ] **Step 1: Update the empty-state tests to pass `status`, and add the failing no-agents tests**

In `tests/messageList.test.ts`, every existing `MessageList({...})` call must gain a `status` field once Task 4's impl lands (the prop becomes required). Add `status: { claude: 'ready', codex: 'ready', gemini: 'ready' }` to each existing call (the auto-scroll test and both empty-state tests).

Then add two tests inside `describe('MessageList empty state', …)`:

```ts
  it('shows the no-agents-ready state when all agents are unavailable and there are no messages', () => {
    const vnode = MessageList({
      session: { version: 1, messages: [] },
      inProgress: new Map<string, InProgressMessage>(),
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
      status: { claude: 'unauthenticated', codex: 'not-installed', gemini: 'inaccessible' },
    });

    const panel = findNode(vnode, StatePanel);
    expect(panel).toBeTruthy();
    expect(panel.props.title).toBe('No agents are available');
  });

  it('shows the onboarding empty state when at least one agent is ready', () => {
    const vnode = MessageList({
      session: { version: 1, messages: [] },
      inProgress: new Map<string, InProgressMessage>(),
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
      status: { claude: 'unauthenticated', codex: 'ready', gemini: 'not-installed' },
    });

    const panel = findNode(vnode, StatePanel);
    expect(panel.props.title).toBe('Send your first prompt');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/messageList.test.ts`
Expected: FAIL — `status` is not a valid prop yet; no "No agents are available".

- [ ] **Step 3: Add the `status` prop, helper, and branch in `MessageList.tsx`**

Add the type import (alongside the protocol imports):

```tsx
import type { AgentId, AgentStatus } from '../../types.js';
```

Add `status` to `Props` and destructure it:

```tsx
interface Props {
  session: Session;
  inProgress: Map<string, InProgressMessage>;
  settings: Settings;
  send: (message: FromWebview) => void;
  status: Record<AgentId, AgentStatus>;
}
```

```tsx
export function MessageList({ session, inProgress, settings, send, status }: Props) {
```

Add a helper above the component (mirrors HealthStrip's availability test):

```tsx
function allAgentsUnavailable(status: Record<AgentId, AgentStatus>): boolean {
  const values = Object.values(status);
  return values.length > 0 && values.every((s) => s !== 'ready' && s !== 'busy');
}
```

Replace the empty branch from Task 1 so the empty case chooses between the two states:

```tsx
      {items.length === 0 ? (
        allAgentsUnavailable(status) ? (
          <StatePanel
            icon="circle-slash"
            iconFallback="∅"
            title="No agents are available"
            subtitle="No agent CLI is connected. Make sure Claude, Codex, or Gemini is installed and on your PATH."
          >
            <div class="state-panel-actions">
              <button
                type="button"
                class="file-edited-link"
                onClick={() => send({ kind: 'show-setup-guide' })}
              >
                Open setup guide
              </button>
              <button
                type="button"
                class="file-edited-link"
                onClick={() => send({ kind: 'configure-cli-paths' })}
              >
                Configure CLI paths
              </button>
            </div>
          </StatePanel>
        ) : (
          <StatePanel
            icon="comment-discussion"
            iconFallback="❝"
            title="Send your first prompt"
            subtitle="Veyra routes it to Claude, Codex, and Gemini."
          >
            <ul class="state-panel-hints">
              <li><code>@claude</code> <code>@codex</code> <code>@gemini</code> go to one agent — <code>@all</code> fans out to all three</li>
              <li><code>/review</code> <code>/debate</code> <code>/consensus</code> <code>/implement</code> run a multi-agent workflow</li>
              <li><code>@path/to/file</code> adds a file as context</li>
            </ul>
          </StatePanel>
        )
      ) : (
```

(`show-setup-guide` and `configure-cli-paths` are existing `FromWebview` kinds — used by `SystemNotice`/`HealthStrip` routing buttons; `file-edited-link` is the existing link-button style. No new CSS — reuses `.state-panel*`, `.state-panel-actions`, `.file-edited-link`.)

- [ ] **Step 4: Thread `status` from `App.tsx`**

The MessageList render is:

```tsx
      <MessageList session={state.session} inProgress={state.inProgress} settings={state.settings} send={send} />
```

Change it to:

```tsx
      <MessageList session={state.session} inProgress={state.inProgress} settings={state.settings} send={send} status={state.status} />
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/messageList.test.ts`
Expected: PASS (updated empty tests + the two new ones).

- [ ] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: PASS. `webviewStyles.test.ts` green (no new CSS).

- [ ] **Step 7: Commit**

```bash
git add src/webview/components/MessageList.tsx src/webview/App.tsx tests/messageList.test.ts
git commit -m "feat(webview): no-agents-ready state via StatePanel (v0.2 Phase C)"
```

---

## Task 5: Human visual pass across four themes (acceptance gate)

The real acceptance for a CSS/UX phase — the user performs it in the Extension Host. Do **not** open the PR until this passes.

- [ ] **Step 1:** Run `npm run verify` (must be green); the user opens the Extension Development Host (F5 / "Run Extension").

- [ ] **Step 2: Visual checklist across Light+, Dark+, Dark High Contrast, Light High Contrast**
  - Empty state ("Send your first prompt"): icon, title, subtitle, inline-`code` hints all legible; spacing reads on-scale.
  - No-agents-ready state (force all agents unavailable): "No agents are available" + both action buttons; same structure as the empty state.
  - Composer textarea: a clear focus ring on focus (click and Tab) in every theme — including both HC themes.
  - Floor-held affordance: while an agent holds the floor, the composer shows that agent's `<AgentMarker>` + "WORKING", and the marker color matches the same agent in Mission Control and message rows.

- [ ] **Step 3:** Fix any reported issues with token-only CSS; re-run `npm run verify`; repeat the visual pass.

- [ ] **Step 4: Final whole-branch review + open PR.** After visual approval: dispatch a final code reviewer over the whole branch, fold any findings, then open the Phase C PR (base `main`). The plan file is already committed on the branch.

---

## Self-Review (checked against the spec)

**Spec coverage:**
- Composer focus ring (`--veyra-border-focus`) → Task 2. ✓
- Send/cancel hierarchy via existing button tokens → already correct (primary Send / destructive Cancel); unchanged, documented in recon. ✓
- File-chip row + autocomplete popover spacing on scale → already tokenized/anchored (`.composer` is `position: relative`; `.mention-popover` anchored). No change needed; documented. ✓
- Floor-held affordance reusing `<AgentMarker>` → Task 3. ✓
- Cohesive state set with shared structure + microlabel/spacing → `<StatePanel>` (Task 1), adopted by empty (Task 1) and no-agents-ready (Task 4). loading/errored deferred per user-confirmed scope. ✓
- HealthStrip unavailable-agent messaging aligns → the no-agents-ready panel reuses the same setup/configure affordances HealthStrip surfaces. Health-pill color-only is not a Phase C acceptance item; out of scope. ✓

**Placeholder scan:** none — every step has exact paths, full code, and explicit run/expected lines.

**Type consistency:** `StatePanelProps` (`icon?`/`iconFallback?`/`title`/`subtitle?`/`children?`) used identically in Tasks 1 & 4; `allAgentsUnavailable(status: Record<AgentId, AgentStatus>)` matches the new `status` prop and `types.ts`; `AgentMarker`'s `agentId: AgentId` matches `floorHolder` after the `&& floorHolder` narrowing; `send` kinds `show-setup-guide` / `configure-cli-paths` / `cancel` are existing `FromWebview` variants; tests use this repo's function-call + `collect`/`findNode` pattern (NOT @testing-library), matching `composer.test.ts`/`messageList.test.ts`.

**No new tokens / no raw colors:** every rule uses existing `--veyra-*` tokens; px/`em` literals (e.g. `320px`, `26px`, `1px 5px`) are non-color and allowed by the gate, consistent with the original rules. Raw-color gate stays clean.

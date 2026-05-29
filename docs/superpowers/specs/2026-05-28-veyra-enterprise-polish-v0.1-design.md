# Veyra Enterprise Polish v0.1 — Design

## Goal & Non-Goals

**Goal:** Transform Veyra from a prototype-looking extension into a professional, VS Code-native tool. This involves moving to a "flat" design that respects VS Code theme tokens, eliminating hardcoded colors, and establishing a reusable component system for the webview.

**Non-Goals:**
- Functional changes to agent logic or workflow routing.
- Introduction of project management or external storage features.
- Redesigning the extension host or session management.

## Phase Plan

### Phase 1: Tokens & Layout (Foundations)
- Implement `src/webview/tokens.css`.
- Map all hardcoded colors in `src/webview/styles.css` to tokens.
- Transition from "chat bubbles" to a flat, row-based layout for messages.
- Re-baseline snapshot tests.

### Phase 2: Components & Icons (Abstraction)
- Extract `<PanelSection>` component to unify UI across the six major panels.
- Integrate `@vscode/codicons` for native icon support.
- Update CSP to allow font loading.
- Implement icon fallback logic.

### Phase 3: Integration & Polish (Delivery)
- Add a VS Code Status Bar item for real-time state visibility.
- Polish empty state copy and graphics.
- Capture marketplace screenshots for Light, Dark, and High Contrast themes.
- Update `package.json` assets.

## Phase Sequencing Rule
**Strict Serial Execution:** Each phase must be fully implemented, verified via `npm run verify`, and merged before the next phase begins. No parallel work on components before tokens are landed.

**Prerequisite:** Workflow Professionalism v0.1 is a prerequisite pass before visual Phase 1. The visual token/layout work should start only after `/implement` role enforcement, structured workflow-state notices, and reviewer-edit trust handling are stable.

## Phase Acceptance Gates

- **Phase 1:** a raw-color scan over `src/webview/` excluding `src/webview/tokens.css` returns no raw `#`, `rgb(`, or `rgba(` color literals; the flat message layout is shipped; snapshots are updated only after visual review.
- **Phase 2:** every migrated panel uses `<PanelSection>` for outer chrome; panel-local CSS owns only body layout details.
- **Phase 3:** the `StatusBarItem` is registered in `context.subscriptions`; marketplace screenshot paths are included in extension packaging.

## Token Dictionary

### Categories
1. **Surfaces**: Backgrounds for panels, inputs, and code blocks.
2. **Borders**: Hairlines and focus rings.
3. **Foreground**: Primary, secondary, and link text.
4. **Status**: OK, Warning, Error, Info colors.
5. **Agent**: Brand colors for Claude, Codex, and Gemini.
6. **Selection**: Hover and active states in lists.
7. **Radius/Space**: Consistent rhythm (non-theme derived).

### Token Mapping Table (Representative)

| Token Name | VS Code Variable Chain | Fallback Value | Usage Example |
| :--- | :--- | :--- | :--- |
| `--veyra-bg-panel` | `--vscode-sideBar-background` | `Canvas` | Main panel containers |
| `--veyra-bg-panel-muted` | `--vscode-editorWidget-background` | `ButtonFace` | Nested cards and rows |
| `--veyra-bg-input` | `--vscode-input-background` | `Field` | Composer textarea |
| `--veyra-border-default` | `--vscode-widget-border` | `ButtonBorder` | Section separators |
| `--veyra-border-focus` | `--vscode-focusBorder` | `Highlight` | Active/focused elements |
| `--veyra-fg-default` | `--vscode-foreground` | `CanvasText` | Primary labels |
| `--veyra-fg-muted` | `--vscode-descriptionForeground` | `GrayText` | Secondary/muted text |
| `--veyra-fg-link` | `--vscode-textLink-foreground` | `LinkText` | Markdown links |
| `--veyra-status-ok` | `--vscode-testing-iconPassed` | `green` | Success states |
| `--veyra-status-error` | `--vscode-errorForeground` | `red` | Error/Failed states |
| `--veyra-status-warning` | `--vscode-inputValidation-warningForeground` | `orange` | Warning/Conflict states |
| `--veyra-status-info` | `--vscode-progressBar-background` | `Highlight` | Active/Queued states |
| `--veyra-agent-claude` | `--vscode-veyra-claudeColor` | `CanvasText` | Claude accent |
| `--veyra-agent-codex` | `--vscode-veyra-codexColor` | `CanvasText` | Codex accent |
| `--veyra-agent-gemini` | `--vscode-veyra-geminiColor` | `CanvasText` | Gemini accent |

### Forbidden Patterns Checklist

- No raw color literals (`#`, `rgb(`, or `rgba(`) outside `src/webview/tokens.css`; all components must use `--veyra-*` tokens.
- No inline `style={{ color }}` or `backgroundColor` for semantic UI colors.
- No panel-specific `border`, `background`, `box-shadow`, or outer `padding` after migration to `<PanelSection>`.
- No CDN font or icon loading; icon assets must ship with the extension and respect webview CSP.

### Token Fallback Constraints

- Every token must resolve to a visible color across all four target themes (Light+, Dark+, Dark HC, Light HC).
- Prefer `var(--vscode-*, system-color)` chains using system colors such as `Canvas`, `CanvasText`, `ButtonFace`, `Highlight`, and `LinkText` when no theme token is available.
- Avoid hardcoded alpha fallbacks such as `rgba(255,255,255,0.04)`, even inside fallback chains, unless the row documents a verified contrast reason.

## <PanelSection> Component API

```tsx
interface PanelSectionProps {
  kind: 'trust' | 'workflow' | 'history' | 'replay' | 'retrieval' | 'mission';
  label: string;
  kicker: string;             // Uppercase prefix (e.g., "WORKFLOWS")
  summary?: ReactNode;        // Chips row, right-aligned
  actions?: ReactNode;        // Buttons row
  state?: 'default' | 'active' | 'empty' | 'warning';
  collapsed: boolean;
  onToggleCollapse: () => void;
  accent?: 'claude' | 'codex' | 'gemini' | 'focus' | 'warning' | 'ok';
  children: ReactNode;
}
```

### Precedence

- `state` controls border, background, and semantic chrome (e.g., `state="warning"` turns the border yellow).
- `accent` only controls the 2-px inset stripe on the left.
- If `state="warning"` and `accent="claude"`, warning wins for border/background while Claude may remain only as the identity stripe if visually safe.

### Migration Map
1. **MissionControlTimeline**: Map to `<PanelSection kind="mission" kicker="MISSION CONTROL">`.
2. **TrustCenter**: Extract nested panels into `<PanelSection kind="trust" kicker="PENDING CHANGES">`.
3. **WorkflowPanel**: Unified header using `<PanelSection kind="workflow" kicker="WORKFLOWS">`.
4. **WorkflowReplayPanel**: Map to `<PanelSection kind="replay" kicker="REPLAY">`.
5. **WorkflowHistoryPanel**: Map to `<PanelSection kind="history" kicker="HISTORY">`.
6. **RetrievalFeedbackPanel**: Map to `<PanelSection kind="retrieval" kicker="RETRIEVAL">`.

## Status Bar Item

- **Lifecycle:** Created in `extension.ts:activate`, disposed in `subscriptions`.
- **States:**
  - `idle`: "Veyra" (icon only)
  - `dispatching`: "$(sync~spin) Veyra: <AgentName>..."
  - `awaiting accept`: "$(check) Veyra: <N> pending files"
  - `error`: "$(error) Veyra: Error"
- **Click Target:** `veyra.openPanel` (focuses the webview).

## Codicons Integration

- **Asset Shipping:** Copy `@vscode/codicons/dist/codicon.ttf` and `codicon.css` to `dist/` during build.
- **CSP Update:** Update `src/extension.ts` webview options to include `font-src ${webview.cspSource}` and ensure the URI is correctly mapped via `asWebviewUri`.
- **Fallback:** If `document.fonts.check` fails, `<Icon>` component renders a short text label or Unicode character.

## Manual Testing Matrix

| Screen | Default Light+ | Default Dark+ | Dark High Contrast | Light High Contrast |
| :--- | :--- | :--- | :--- | :--- |
| Message List | Row borders visible? | Text contrast 4.5:1? | High-vis borders? | Focus rings visible? |
| Trust Center | "Accept" button blue? | Inset shadow visible? | Canvas colors used? | No invisible text? |
| Workflow Panel | Agent accent stripe? | Kicker readable? | Background distinct? | Icons rendered? |
| Composer | Border on focus? | Placeholder color? | System colors? | Resize handle? |

## Verification

- **Automated:** `npm run verify` must pass at each stage.
- **Snapshots:** Re-run `vitest -u` after Phase 1 layout changes.
- **Marketplace:** Verify `package.json` contains `resources/screenshots/` and files are present in the final `.vsix`.

## Test Plan

- **Token import/order unit tests:** own the guarantee that `tokens.css` is imported before `styles.css` and that semantic tokens are available to downstream styles.
- **`<PanelSection>` component tests:** own render coverage for default, active, empty, warning, collapsed, action-bearing, and accent-bearing states.
- **CSP/status bar tests:** own webview HTML generation coverage for codicons CSP entries and extension activation coverage for `StatusBarItem` creation/disposal.
- **Snapshot tests:** update only after Phase 1 visual review confirms the flat layout and theme behavior; snapshot changes are evidence, not the review itself.

## Rollback Plan

- Phase 1 must be independently revertible from Phase 2.
- Do not combine token migration, component extraction, and codicons in one PR because snapshot churn would hide regressions.
- Each phase should leave a coherent checkpoint: token/layout migration, component/icon extraction, and status/marketplace polish must remain separable in review and rollback.

## Risks & Mitigations

1. **Invisible Text in HC:** Mitigated by mandatory HC cells in the testing matrix.
2. **CSP Font Block:** Mitigated by explicit font-src additions and local asset shipping.
3. **Snapshot Churn:** Mitigated by strict serial sequencing and manual visual check before re-baselining.
4. **Hardcoded Color Leakage:** Mitigated by exhaustive grep during Phase 1.

## Out of Scope for v0.1
- Workflow templates and role customization (tracked in the current roadmap as follow-on workflow depth work).
- Terminal verification loops (tracked in the current roadmap as follow-on verification hardening).

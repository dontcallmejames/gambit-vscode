import { describe, expect, it, vi } from 'vitest';
import { h, type VNode } from 'preact';

// PanelSection renders <Icon>, which uses hooks; stub them so the panels can be
// rendered synchronously in tests.
vi.mock('preact/hooks', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, vi.fn()],
  useEffect: vi.fn(),
}));

import { initialState, reduce } from '../src/webview/state.js';
import { buildMissionControlSnapshot } from '../src/webview/missionControl.js';
import { MissionControlTimeline } from '../src/webview/components/MissionControlTimeline.js';
import { TrustCenter } from '../src/webview/components/TrustCenter.js';
import { WorkflowPanel } from '../src/webview/components/WorkflowPanel.js';
import { buildTrustCenterSnapshot } from '../src/webview/trustCenter.js';
import { buildWorkflowReplaySnapshot } from '../src/webview/workflowReplay.js';
import { buildWorkflowHistorySnapshot } from '../src/webview/workflowHistory.js';
import {
  DEFAULT_PRESENTATION_DENSITY_STATE,
  buildPresentationDensityChips,
  effectivePresentationPanelExpanded,
  isTrustCenterUrgent,
  mergePresentationDensityState,
  nextPresentationDensityStateForSignals,
  readPresentationDensityState,
  setPresentationPanelExpanded,
  trustCenterUrgencyKey,
} from '../src/webview/presentationDensity.js';
import type { AgentMessage, FromExtension, RetrievalFeedbackSummary, SystemMessage, UserMessage } from '../src/shared/protocol.js';

vi.stubGlobal('React', { createElement: h });

describe('presentation density state', () => {
  it('defaults dense panels collapsed and auto-expands Trust Center when new urgent signals appear', () => {
    expect(effectivePresentationPanelExpanded(DEFAULT_PRESENTATION_DENSITY_STATE, 'trust', { trustUrgent: false })).toBe(false);
    expect(effectivePresentationPanelExpanded(DEFAULT_PRESENTATION_DENSITY_STATE, 'workflows', { trustUrgent: false })).toBe(false);
    expect(effectivePresentationPanelExpanded(DEFAULT_PRESENTATION_DENSITY_STATE, 'retrieval', { trustUrgent: false })).toBe(false);

    let state = initialState();
    state = reduce(state, eventForMessage(checkpoint('cp1', 2)));
    expect(isTrustCenterUrgent(buildTrustCenterSnapshot(state))).toBe(false);

    state = reduce(state, eventForMessage(changeSet('cs1', 3)));
    expect(isTrustCenterUrgent(buildTrustCenterSnapshot(state))).toBe(true);
    const urgencyKey = trustCenterUrgencyKey(buildTrustCenterSnapshot(state));
    const autoOpened = nextPresentationDensityStateForSignals(DEFAULT_PRESENTATION_DENSITY_STATE, { trustUrgencyKey: urgencyKey });
    expect(autoOpened.expandedPanels.trust).toBe(true);

    const userCollapsed = setPresentationPanelExpanded(autoOpened, 'trust', false);
    expect(effectivePresentationPanelExpanded(userCollapsed, 'trust', { trustUrgent: true })).toBe(false);
    expect(nextPresentationDensityStateForSignals(userCollapsed, { trustUrgencyKey: urgencyKey })).toEqual(userCollapsed);

    let failedVerificationState = initialState();
    failedVerificationState = reduce(failedVerificationState, eventForMessage(user('u1', 'Source: Approved Veyra verification command\nExit status: 1', 1)));
    expect(isTrustCenterUrgent(buildTrustCenterSnapshot(failedVerificationState))).toBe(true);
  });

  it('persists expanded and collapsed choices inside VS Code webview state without dropping unrelated keys', () => {
    const restored = readPresentationDensityState({
      scrollTop: 240,
      presentationDensity: { expandedPanels: { trust: true, workflows: false, retrieval: true } },
    });

    expect(restored.expandedPanels).toEqual({ trust: true, workflows: false, retrieval: true });

    const next = setPresentationPanelExpanded(restored, 'workflows', true);
    expect(next.expandedPanels).toEqual({ trust: true, workflows: true, retrieval: true });
    expect(mergePresentationDensityState({ scrollTop: 240 }, next)).toEqual({
      scrollTop: 240,
      presentationDensity: next,
    });
  });
});

describe('Mission Control density chips', () => {
  it('opens Trust, checkpoint, replay, and history sections from compact Mission Control buttons', () => {
    const state = workflowState();
    const chips = buildPresentationDensityChips({
      trustCenter: buildTrustCenterSnapshot(state),
      workflowReplay: buildWorkflowReplaySnapshot(state),
      workflowHistory: buildWorkflowHistorySnapshot(state),
      expandedPanels: { trust: false, workflows: false, retrieval: false },
    });
    const opened: string[] = [];

    const vnode = MissionControlTimeline({
      snapshot: buildMissionControlSnapshot(state),
      actionChips: chips,
      onOpenPanel: (panelId) => opened.push(panelId),
    });
    const text = flattenText(vnode);

    expect(text).toContain('Trust');
    expect(text).toContain('2 pending files');
    expect(text).toContain('checkpoint available');
    expect(text).toContain('Replay /review');
    expect(text).toContain('History 1');

    clickButtonContaining(vnode, 'Trust');
    clickButtonContaining(vnode, 'checkpoint available');
    clickButtonContaining(vnode, 'Replay /review');
    clickButtonContaining(vnode, 'History 1');

    expect(opened).toEqual(['trust', 'trust', 'workflows', 'workflows']);
  });

  it('opens Retrieval Feedback from Mission Control only when @codebase evidence exists', () => {
    const state = workflowState();
    const chips = buildPresentationDensityChips({
      trustCenter: buildTrustCenterSnapshot(state),
      workflowReplay: buildWorkflowReplaySnapshot(state),
      workflowHistory: buildWorkflowHistorySnapshot(state),
      retrievalFeedback: { latest: retrievalSummary() },
      expandedPanels: { trust: false, workflows: false, retrieval: false },
    });
    const opened: string[] = [];

    const vnode = MissionControlTimeline({
      snapshot: buildMissionControlSnapshot(state),
      actionChips: chips,
      onOpenPanel: (panelId) => opened.push(panelId),
    });
    const text = flattenText(vnode);

    expect(text).toContain('Retrieval @codebase');
    expect(text).toContain('1 selected');

    clickButtonContaining(vnode, 'Retrieval @codebase');

    expect(opened).toEqual(['retrieval']);
  });
});

describe('collapsible density panels', () => {
  it('keeps Trust Center collapsed until opened while preserving actionable summary text', () => {
    const state = workflowState();
    const onToggle = vi.fn();
    const sent: unknown[] = [];
    const vnode = TrustCenter({
      snapshot: buildTrustCenterSnapshot(state),
      expanded: false,
      onToggle,
      send: (message) => sent.push(message),
    });
    const text = flattenText(vnode);

    expect(text).toContain('Trust Center');
    expect(text).toContain('2 pending files');
    expect(text).not.toContain('Pending Changes');
    expect(text).not.toContain('Run verification');

    clickButtonContaining(vnode, 'Open Trust Center');

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(sent).toEqual([]);
  });

  it('combines latest replay and recent history in one capped Workflows panel', () => {
    const state = workflowState();
    const onPrepareReplay = vi.fn();
    const onCopySummary = vi.fn();
    const collapsed = WorkflowPanel({
      replay: buildWorkflowReplaySnapshot(state),
      history: buildWorkflowHistorySnapshot(state),
      expanded: false,
      onToggle: vi.fn(),
      onPrepareReplay,
      onCopySummary,
    });

    expect(flattenText(collapsed)).toContain('Workflows');
    expect(flattenText(collapsed)).toContain('Replay /review');
    expect(flattenText(collapsed)).toContain('History 1');
    expect(flattenText(collapsed)).not.toContain('Latest replay');

    const expanded = WorkflowPanel({
      replay: buildWorkflowReplaySnapshot(state),
      history: buildWorkflowHistorySnapshot(state),
      expanded: true,
      onToggle: vi.fn(),
      onPrepareReplay,
      onCopySummary,
    });
    const text = flattenText(expanded);

    expect(text).toContain('Latest replay');
    expect(text).toContain('inspect density controls');
    expect(text).toContain('Recent workflows');
    expect(text).toContain('Claude, Codex, Gemini');
    expect(findByClass(expanded, 'workflow-panel-body')).toHaveLength(1);

    clickButtonContaining(expanded, 'Prepare replay');
    clickButtonContaining(expanded, 'Copy summary');

    expect(onPrepareReplay).toHaveBeenCalledWith(expect.stringContaining('@veyra /review inspect density controls'));
    expect(onPrepareReplay).toHaveBeenCalledWith(expect.stringContaining('Source: Manual Veyra workflow replay'));
    expect(onCopySummary).toHaveBeenCalledWith(expect.stringContaining('Command: /review'));
    expect(onCopySummary).toHaveBeenCalledWith(expect.stringContaining('Agents: Claude, Codex, Gemini'));
  });
});

function workflowState() {
  let state = initialState();
  for (const message of [
    user('u1', '@veyra /review inspect density controls', 1),
    agent('a1', 'claude', 2, '## Blocking issues\nNone found.'),
    checkpoint('cp1', 3),
    agent('a2', 'codex', 4, '## Missing tests\nAdd density tests.'),
    changeSet('cs1', 5),
    agent('a3', 'gemini', 6, '## Veyra Synthesis\nCompact it.\n\n## Next action\nCollapse dense panels.'),
  ]) {
    state = reduce(state, eventForMessage(message));
  }
  return state;
}

function user(id: string, text: string, timestamp: number): UserMessage {
  return { id, role: 'user', text, timestamp };
}

function agent(
  id: string,
  agentId: AgentMessage['agentId'],
  timestamp: number,
  text: string,
): AgentMessage {
  return {
    id,
    role: 'agent',
    agentId,
    text,
    toolEvents: [],
    timestamp,
    status: 'complete',
  };
}

function changeSet(id: string, timestamp: number): SystemMessage {
  return {
    id,
    role: 'system',
    kind: 'change-set',
    text: 'Codex changed 2 files.',
    timestamp,
    agentId: 'codex',
    changeSet: {
      id,
      agentId: 'codex',
      messageId: 'a2',
      timestamp,
      readOnly: false,
      status: 'pending',
      fileCount: 2,
      files: [
        { path: 'src/a.ts', changeKind: 'edited' },
        { path: 'src/a.test.ts', changeKind: 'created' },
      ],
    },
  };
}

function checkpoint(id: string, timestamp: number): SystemMessage {
  return {
    id,
    role: 'system',
    kind: 'checkpoint',
    text: 'Checkpoint saved.',
    timestamp,
    checkpoint: {
      id,
      timestamp,
      source: 'automatic',
      status: 'available',
      label: 'Before dispatch',
      promptSummary: 'Before dispatch',
      fileCount: 2,
    },
  };
}

function retrievalSummary(): RetrievalFeedbackSummary {
  return {
    sourceMessageId: 'retrieval-1',
    timestamp: 7,
    query: 'auth flow',
    methodLabel: 'local lexical search',
    selectedFileCount: 1,
    matchedFileCount: 1,
    omittedMatchedFileCount: 0,
    selectedFiles: [{ path: 'src/auth/session.ts', score: 10, reason: 'path:auth' }],
    queryTerms: ['auth'],
    budgetSummary: 'max files 8, max snippet lines 80, max file bytes 1000000',
    possibleMisses: 'Lexical retrieval can miss renamed concepts.',
    warnings: [],
    guardrails: ['no cloud indexing', 'no paid embedding calls', 'no background repository scans'],
  };
}

function eventForMessage(message: UserMessage | AgentMessage | SystemMessage): FromExtension {
  if (message.role === 'user') return { kind: 'user-message-appended', message };
  if (message.role === 'agent') return { kind: 'message-finalized', message };
  return { kind: 'system-message', message };
}

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  const vnode = node as VNode;
  if (typeof vnode.type === 'function') return flattenText((vnode.type as any)(vnode.props));
  return flattenText(vnode.props?.children);
}

function findButtons(node: unknown): Array<VNode & { props: { onClick?: () => void; children?: unknown } }> {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap(findButtons);
  const vnode = node as VNode;
  if (typeof vnode.type === 'function') return findButtons((vnode.type as any)(vnode.props));
  const self = vnode.type === 'button' ? [vnode as VNode & { props: { onClick?: () => void; children?: unknown } }] : [];
  return [...self, ...findButtons(vnode.props?.children)];
}

function clickButtonContaining(node: unknown, label: string): void {
  const button = findButtons(node).find((candidate) => flattenText(candidate).includes(label));
  expect(button, `button containing ${label}`).toBeTruthy();
  button?.props.onClick?.();
}

function findByClass(vnode: any, className: string): any[] {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return [];
  if (typeof vnode === 'string' || typeof vnode === 'number') return [];
  if (Array.isArray(vnode)) return vnode.flatMap((child) => findByClass(child, className));
  const node = vnode as any;
  if (typeof node.type === 'function') return findByClass((node.type as any)(node.props), className);
  const ownClass = String(node.props?.class ?? '');
  const own = ownClass.split(/\s+/u).includes(className) ? [node] : [];
  return own.concat(findByClass(node.props?.children, className));
}

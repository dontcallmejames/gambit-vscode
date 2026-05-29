import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { initialState, reduce } from '../src/webview/state.js';
import { buildMissionControlSnapshot } from '../src/webview/missionControl.js';
import { MissionControlTimeline } from '../src/webview/components/MissionControlTimeline.js';
import type { FromExtension, SystemMessage } from '../src/shared/protocol.js';

vi.stubGlobal('React', { createElement: h });

describe('Mission Control timeline state', () => {
  it('renders a graceful idle timeline before any dispatch events', () => {
    const snapshot = buildMissionControlSnapshot(initialState());

    expect(snapshot.mode).toBe('idle');
    expect(snapshot.label).toBe('Idle');
    expect(snapshot.floorHolder).toBeNull();
    expect(snapshot.recentTool).toBeNull();
    expect(snapshot.pendingChangeCount).toBe(0);
    expect(snapshot.availableCheckpointCount).toBe(0);
    expect(snapshot.verificationState).toBeNull();
    expect(snapshot.stages.map((stage) => [stage.agentId, stage.state])).toEqual([
      ['claude', 'waiting'],
      ['codex', 'waiting'],
      ['gemini', 'waiting'],
    ]);
  });

  it('derives queued active and complete stages from a normal all-agent workflow replay', () => {
    let state = initialState();
    for (const event of [
      {
        kind: 'user-message-appended',
        message: { id: 'u1', role: 'user', text: '@veyra /review inspect this', timestamp: 1 },
      },
      { kind: 'floor-changed', holder: 'claude' },
      { kind: 'message-started', id: 'claude-1', agentId: 'claude', timestamp: 2 },
      { kind: 'message-chunk', id: 'claude-1', chunk: { type: 'tool-call', name: 'read_file', input: { path: 'src/a.ts' } } },
      {
        kind: 'message-finalized',
        message: {
          id: 'claude-1',
          role: 'agent',
          agentId: 'claude',
          text: 'Claude done',
          toolEvents: [{ kind: 'call', name: 'read_file', input: { path: 'src/a.ts' }, timestamp: 3 }],
          timestamp: 2,
          status: 'complete',
        },
      },
      { kind: 'floor-changed', holder: 'codex' },
      { kind: 'message-started', id: 'codex-1', agentId: 'codex', timestamp: 4 },
      { kind: 'message-chunk', id: 'codex-1', chunk: { type: 'tool-call', name: 'shell', input: { command: 'npm test' } } },
    ] satisfies FromExtension[]) {
      state = reduce(state, event);
    }

    const snapshot = buildMissionControlSnapshot(state);

    expect(snapshot.mode).toBe('workflow');
    expect(snapshot.label).toBe('/review');
    expect(snapshot.floorHolder).toBe('codex');
    expect(snapshot.recentTool).toMatchObject({ agentId: 'codex', name: 'shell' });
    expect(snapshot.stages.map((stage) => [stage.agentId, stage.state])).toEqual([
      ['claude', 'complete'],
      ['codex', 'active'],
      ['gemini', 'queued'],
    ]);
  });

  it('surfaces cancelled and failed stages without marking later agents complete', () => {
    let state = initialState();
    for (const event of [
      {
        kind: 'user-message-appended',
        message: { id: 'u1', role: 'user', text: '@veyra /implement change parser', timestamp: 1 },
      },
      {
        kind: 'message-finalized',
        message: {
          id: 'claude-1',
          role: 'agent',
          agentId: 'claude',
          text: 'cancelled',
          toolEvents: [],
          timestamp: 2,
          status: 'cancelled',
        },
      },
      {
        kind: 'message-finalized',
        message: {
          id: 'codex-1',
          role: 'agent',
          agentId: 'codex',
          text: 'failed',
          toolEvents: [],
          timestamp: 3,
          status: 'errored',
          error: 'boom',
        },
      },
    ] satisfies FromExtension[]) {
      state = reduce(state, event);
    }

    expect(buildMissionControlSnapshot(state).stages.map((stage) => [stage.agentId, stage.state])).toEqual([
      ['claude', 'cancelled'],
      ['codex', 'failed'],
      ['gemini', 'queued'],
    ]);
  });

  it('keeps direct one-agent dispatches focused on the participating agent', () => {
    let state = initialState();
    state = reduce(state, {
      kind: 'user-message-appended',
      message: { id: 'u1', role: 'user', text: '@codex add a small test', timestamp: 1 },
    });
    state = reduce(state, { kind: 'message-started', id: 'codex-1', agentId: 'codex', timestamp: 2 });

    const snapshot = buildMissionControlSnapshot(state);

    expect(snapshot.mode).toBe('direct');
    expect(snapshot.label).toBe('Codex direct');
    expect(snapshot.stages.map((stage) => [stage.agentId, stage.state])).toEqual([
      ['claude', 'waiting'],
      ['codex', 'active'],
      ['gemini', 'waiting'],
    ]);
  });

  it('derives pending change and checkpoint indicators from existing system notices', () => {
    let state = initialState();
    for (const message of [pendingChangeSetNotice(), checkpointNotice()]) {
      state = reduce(state, { kind: 'system-message', message });
    }

    const snapshot = buildMissionControlSnapshot(state);

    expect(snapshot.pendingChangeCount).toBe(2);
    expect(snapshot.availableCheckpointCount).toBe(1);
  });

  it('derives compact workflow warning chips from structured workflow-state notices', () => {
    let state = initialState();
    state = reduce(state, {
      kind: 'user-message-appended',
      message: { id: 'u1', role: 'user', text: '@veyra /implement fix this', timestamp: 1 },
    });
    state = reduce(state, { kind: 'system-message', message: workflowNotice('stalled', 'Gemini stalled', 10, 'gemini') });
    state = reduce(state, { kind: 'system-message', message: workflowNotice('low-evidence-output', 'No observed inspection evidence from Claude.', 11, 'claude') });

    const snapshot = buildMissionControlSnapshot(state);

    expect(snapshot.workflowWarnings).toEqual([
      expect.objectContaining({
        kind: 'low-evidence-output',
        label: 'No observed inspection evidence',
        agentId: 'claude',
      }),
      expect.objectContaining({
        kind: 'stalled',
        label: 'Stalled',
        agentId: 'gemini',
      }),
    ]);
  });

  it('derives verification state only from approved verification command context', () => {
    let state = initialState();
    state = reduce(state, {
      kind: 'user-message-appended',
      message: {
        id: 'u1',
        role: 'user',
        text: [
          '@veyra /review Review this verification result.',
          '',
          '[Terminal context]',
          'Source: Approved Veyra verification command',
          'Command: npm run verify',
          'Exit status: 0',
          'Output:',
          'PASS',
          '[/Terminal context]',
        ].join('\n'),
        timestamp: 1,
      },
    });

    expect(buildMissionControlSnapshot(state).verificationState).toBe('passed');

    state = reduce(state, {
      kind: 'user-message-appended',
      message: {
        id: 'u2',
        role: 'user',
        text: [
          '@veyra /review Review this verification result.',
          '',
          '[Terminal context]',
          'Source: Approved Veyra verification command',
          'Command: npm test',
          'Exit status: 1',
          'Output:',
          'FAIL',
          '[/Terminal context]',
        ].join('\n'),
        timestamp: 2,
      },
    });

    expect(buildMissionControlSnapshot(state).verificationState).toBe('failed');
  });
});

describe('MissionControlTimeline component', () => {
  it('renders stage labels and compact trust indicators', () => {
    let state = initialState();
    state = reduce(state, {
      kind: 'user-message-appended',
      message: { id: 'u1', role: 'user', text: '@veyra /review inspect this', timestamp: 1 },
    });
    state = reduce(state, { kind: 'message-started', id: 'claude-1', agentId: 'claude', timestamp: 2 });
    state = reduce(state, { kind: 'system-message', message: pendingChangeSetNotice() });
    state = reduce(state, { kind: 'system-message', message: checkpointNotice() });

    const vnode = MissionControlTimeline({ snapshot: buildMissionControlSnapshot(state) });
    const text = flattenText(vnode);

    expect(findByClass(vnode, 'mission-control')).toHaveLength(1);
    expect(text).toContain('/review');
    expect(text).toContain('Claude');
    expect(text).toContain('active');
    expect(text).toContain('Codex');
    expect(text).toContain('queued');
    expect(text).toContain('2 pending files');
    expect(text).toContain('checkpoint available');
  });

  it('renders workflow-state warnings as compact Mission Control signals', () => {
    let state = initialState();
    state = reduce(state, {
      kind: 'user-message-appended',
      message: { id: 'u1', role: 'user', text: '@veyra /implement fix this', timestamp: 1 },
    });
    state = reduce(state, { kind: 'system-message', message: workflowNotice('watchdog-released', 'Watchdog released Claude.', 10, 'claude') });
    state = reduce(state, { kind: 'system-message', message: workflowNotice('read-only-violation', 'Read-only workflow violation.', 11, 'gemini') });

    const vnode = MissionControlTimeline({ snapshot: buildMissionControlSnapshot(state) });
    const text = flattenText(vnode);

    expect(text).toContain('Watchdog released');
    expect(text).toContain('Read-only violation');
  });
});

function workflowNotice(
  kind: NonNullable<SystemMessage['workflowState']>['kind'],
  text: string,
  timestamp: number,
  agentId: NonNullable<SystemMessage['workflowState']>['agentId'],
): SystemMessage {
  return {
    id: `workflow-${kind}-${timestamp}`,
    role: 'system',
    kind: kind === 'read-only-violation' ? 'error' : 'warning',
    text,
    timestamp,
    agentId,
    workflowState: {
      kind,
      severity: kind === 'read-only-violation' ? 'error' : 'warning',
      agentId,
      text,
    },
  };
}

function pendingChangeSetNotice(): SystemMessage {
  return {
    id: 'change-set-system-1',
    role: 'system',
    kind: 'change-set',
    text: 'Codex changed 2 files. Review pending changes before continuing.',
    timestamp: 10,
    agentId: 'codex',
    changeSet: {
      id: 'change-set-1',
      agentId: 'codex',
      messageId: 'codex-1',
      timestamp: 10,
      readOnly: false,
      status: 'pending',
      fileCount: 2,
      files: [
        { path: 'src/a.ts', changeKind: 'edited', status: 'pending' },
        { path: 'src/b.ts', changeKind: 'created', status: 'pending' },
      ],
    },
  };
}

function checkpointNotice(): SystemMessage {
  return {
    id: 'checkpoint-system-1',
    role: 'system',
    kind: 'checkpoint',
    text: 'Checkpoint saved: Before Codex dispatch.',
    timestamp: 9,
    checkpoint: {
      id: 'checkpoint-1',
      timestamp: 9,
      source: 'automatic',
      label: 'Before Codex dispatch',
      promptSummary: '@veyra /implement change parser',
      status: 'available',
      fileCount: 2,
    },
  };
}

function findByClass(vnode: any, className: string): any[] {
  if (!vnode) return [];
  if (Array.isArray(vnode)) return vnode.flatMap((child) => findByClass(child, className));
  if (typeof vnode.type === 'function') return findByClass(vnode.type(vnode.props), className);
  const ownClass = String(vnode.props?.class ?? '');
  const own = ownClass.split(/\s+/u).includes(className) ? [vnode] : [];
  return own.concat(findByClass(vnode.props?.children, className));
}

function flattenText(vnode: any): string {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(flattenText).join('');
  if (typeof vnode.type === 'function') return flattenText(vnode.type(vnode.props));
  return flattenText(vnode.props?.children);
}

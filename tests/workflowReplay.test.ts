import { describe, expect, it, vi } from 'vitest';
import { h, type VNode } from 'preact';
import { initialState, reduce } from '../src/webview/state.js';
import {
  buildWorkflowReplayDraft,
  buildWorkflowReplaySnapshot,
} from '../src/webview/workflowReplay.js';
import { WorkflowReplayPanel } from '../src/webview/components/WorkflowReplayPanel.js';
import { veyraWorkflowPrompt } from '../src/workflowPrompts.js';
import type { AgentMessage, FromExtension, UserMessage } from '../src/shared/protocol.js';

vi.stubGlobal('React', { createElement: h });

describe('buildWorkflowReplaySnapshot', () => {
  it('returns an empty replay state before any Veyra workflow exists', () => {
    const state = initialState();
    const before = state.session.messages;

    const snapshot = buildWorkflowReplaySnapshot(state);

    expect(snapshot.latestWorkflow).toBeNull();
    expect(state.session.messages).toBe(before);
  });

  it('identifies the latest raw workflow command and participating agents', () => {
    let state = initialState();
    for (const message of [
      user('u1', '@veyra /review inspect parser risk', 1),
      agent('a1', 'claude', 2),
      agent('a2', 'codex', 3),
      user('u2', '/implement add parser tests', 4),
      agent('a3', 'claude', 5),
      agent('a4', 'codex', 6),
      agent('a5', 'gemini', 7),
    ]) {
      state = reduce(state, eventForMessage(message));
    }
    const before = structuredClone(state.session.messages);

    const snapshot = buildWorkflowReplaySnapshot(state);

    expect(snapshot.latestWorkflow).toMatchObject({
      command: 'implement',
      prompt: 'add parser tests',
      sourceMessageId: 'u2',
      participatingAgents: ['claude', 'codex', 'gemini'],
    });
    expect(state.session.messages).toEqual(before);
  });

  it('detects routed workflow prompts persisted in existing sessions', () => {
    let state = initialState();
    state = reduce(state, {
      kind: 'user-message-appended',
      message: user('u1', veyraWorkflowPrompt('consensus', 'choose a release path'), 1),
    });
    state = reduce(state, { kind: 'message-finalized', message: agent('a1', 'claude', 2) });
    state = reduce(state, { kind: 'message-finalized', message: agent('a2', 'gemini', 3) });

    const snapshot = buildWorkflowReplaySnapshot(state);

    expect(snapshot.latestWorkflow).toMatchObject({
      command: 'consensus',
      prompt: 'choose a release path',
      participatingAgents: ['claude', 'gemini'],
    });
  });
});

describe('buildWorkflowReplayDraft', () => {
  it('creates a visible manual replay request for the composer', () => {
    const snapshot = buildWorkflowReplaySnapshot({
      ...initialState(),
      session: {
        version: 1,
        messages: [
          user('u1', '/review inspect auth\n\n[Workflow replay]\nold replay\n[/Workflow replay]', 1),
          agent('a1', 'claude', 2),
          agent('a2', 'codex', 3),
        ],
      },
    });

    const draft = buildWorkflowReplayDraft(snapshot.latestWorkflow!);

    expect(draft).toContain('@veyra /review inspect auth');
    expect(draft).toContain('[Workflow replay]');
    expect(draft).toContain('Source: Manual Veyra workflow replay');
    expect(draft).toContain('Original workflow: /review');
    expect(draft).toContain('Agents observed last time: Claude, Codex');
    expect(draft).toContain('Replay against the current workspace and current Git state.');
    expect(draft).not.toContain('old replay');
    expect(draft).not.toMatch(/auto-rollback|hidden terminal|background dispatch/iu);
  });
});

describe('WorkflowReplayPanel', () => {
  it('renders an empty state when there is no workflow to replay', () => {
    const vnode = WorkflowReplayPanel({
      snapshot: buildWorkflowReplaySnapshot(initialState()),
      onPrepareReplay: vi.fn(),
    });

    expect(flattenText(vnode)).toContain('No workflow to replay yet');
  });

  it('summarizes the latest workflow and routes Prepare replay to the composer draft callback', () => {
    const snapshot = buildWorkflowReplaySnapshot({
      ...initialState(),
      session: {
        version: 1,
        messages: [
          user('u1', '@veyra /debate choose a parser approach', 10),
          agent('a1', 'claude', 11),
          agent('a2', 'codex', 12),
        ],
      },
    });
    const onPrepareReplay = vi.fn();
    const vnode = WorkflowReplayPanel({ snapshot, onPrepareReplay });
    const text = flattenText(vnode);

    expect(text).toContain('Workflow Replay');
    expect(text).toContain('/debate');
    expect(text).toContain('choose a parser approach');
    expect(text).toContain('Claude, Codex');

    clickButton(vnode, 'Prepare replay');

    expect(onPrepareReplay).toHaveBeenCalledWith(expect.stringContaining('@veyra /debate choose a parser approach'));
    expect(onPrepareReplay).toHaveBeenCalledWith(expect.stringContaining('Source: Manual Veyra workflow replay'));
  });
});

function user(id: string, text: string, timestamp: number): UserMessage {
  return { id, role: 'user', text, timestamp };
}

function agent(id: string, agentId: AgentMessage['agentId'], timestamp: number): AgentMessage {
  return {
    id,
    role: 'agent',
    agentId,
    text: `${agentId} response`,
    toolEvents: [],
    timestamp,
    status: 'complete',
  };
}

function eventForMessage(message: UserMessage | AgentMessage): FromExtension {
  return message.role === 'user'
    ? { kind: 'user-message-appended', message }
    : { kind: 'message-finalized', message };
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

function clickButton(node: unknown, label: string): void {
  const button = findButtons(node).find((candidate) => flattenText(candidate) === label);
  expect(button, `button ${label}`).toBeTruthy();
  button?.props.onClick?.();
}

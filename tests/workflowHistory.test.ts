import { describe, expect, it, vi } from 'vitest';
import { h, type VNode } from 'preact';
import { initialState, reduce } from '../src/webview/state.js';
import {
  buildWorkflowHistorySnapshot,
} from '../src/webview/workflowHistory.js';
import { WorkflowHistoryPanel } from '../src/webview/components/WorkflowHistoryPanel.js';
import { veyraWorkflowPrompt } from '../src/workflowPrompts.js';
import type { AgentMessage, FromExtension, SystemMessage, UserMessage } from '../src/shared/protocol.js';

vi.stubGlobal('React', { createElement: h });

describe('buildWorkflowHistorySnapshot', () => {
  it('derives lightweight completed workflow summaries from persisted session messages', () => {
    let state = initialState();
    const messages = [
      user('u1', '@veyra /review inspect parser risk', 1),
      agent('a1', 'claude', 2, '## Summary\nLooks okay.'),
      checkpoint('cp1', 3, 'automatic'),
      agent('a2', 'codex', 4, '## Blocking issues\nNone found.\n\n## Missing tests\nAdd parser coverage.'),
      changeSet('cs1', 5, 'codex', 2),
      agent('a3', 'gemini', 6, '## Veyra Synthesis\nShip it.\n\n## Next action\nRun verify.'),
      user('verify1', 'Source: Approved Veyra verification command\nCommand: npm run verify\nExit status: 0', 7),
      user('u2', '/implement add parser tests', 8),
      agent('a4', 'claude', 9, 'Approach', 'complete'),
      agent('a5', 'codex', 10, 'Changed files', 'errored'),
    ];
    for (const message of messages) state = reduce(state, eventForMessage(message));
    const before = structuredClone(state.session.messages);

    const snapshot = buildWorkflowHistorySnapshot(state);

    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0]).toMatchObject({
      command: 'implement',
      prompt: 'add parser tests',
      sourceMessageId: 'u2',
      participatingAgents: ['claude', 'codex'],
      completionStatus: 'errored',
      pendingChangeCount: 0,
      checkpointCount: 0,
      verificationState: null,
    });
    expect(snapshot.entries[1]).toMatchObject({
      command: 'review',
      prompt: 'inspect parser risk',
      sourceMessageId: 'u1',
      participatingAgents: ['claude', 'codex', 'gemini'],
      completionStatus: 'complete',
      pendingChangeCount: 2,
      checkpointCount: 1,
      verificationState: 'passed',
      artifactHeadings: ['Veyra Synthesis', 'Next action'],
    });
    expect(state.session.messages).toEqual(before);
  });

  it('detects routed workflow prompts from older persisted sessions and ignores incomplete workflows', () => {
    let state = initialState();
    state = reduce(state, eventForMessage(user('u1', veyraWorkflowPrompt('consensus', 'choose release path'), 1)));
    state = reduce(state, eventForMessage(agent('a1', 'gemini', 2, '## Recommendation\nShip.')));
    state = reduce(state, eventForMessage(user('u2', '/review waiting for agents', 3)));

    const snapshot = buildWorkflowHistorySnapshot(state);

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      command: 'consensus',
      prompt: 'choose release path',
      participatingAgents: ['gemini'],
      artifactHeadings: ['Recommendation'],
    });
  });

  it('does not count individually resolved change-set files as pending history signals', () => {
    let state = initialState();
    const resolved = changeSet('cs1', 3, 'codex', 2);
    resolved.changeSet!.files = resolved.changeSet!.files.map((file) => ({ ...file, status: 'accepted' }));
    state = reduce(state, eventForMessage(user('u1', '/implement update tests', 1)));
    state = reduce(state, eventForMessage(agent('a1', 'codex', 2, 'Changed files')));
    state = reduce(state, eventForMessage(resolved));

    const snapshot = buildWorkflowHistorySnapshot(state);

    expect(snapshot.entries[0].pendingChangeCount).toBe(0);
  });
});

describe('WorkflowHistoryPanel', () => {
  it('renders compact history entries and prepares replay through the existing composer flow', () => {
    const state = {
      ...initialState(),
      session: {
        version: 1 as const,
        messages: [
          user('u1', '@veyra /debate choose a parser approach', 10),
          agent('a1', 'claude', 11, '## Recommendation\nUse a parser combinator.'),
          agent('a2', 'codex', 12, '## Handoff Summary\nReady for implementation.'),
        ],
      },
    };
    const onPrepareReplay = vi.fn();

    const vnode = WorkflowHistoryPanel({
      snapshot: buildWorkflowHistorySnapshot(state),
      onPrepareReplay,
    });
    const text = flattenText(vnode);

    expect(text).toContain('Workflow History');
    expect(text).toContain('/debate');
    expect(text).toContain('choose a parser approach');
    expect(text).toContain('Claude, Codex');
    expect(text).toContain('Handoff Summary');
    expect(text).toContain('complete');

    clickButton(vnode, 'Prepare replay');

    expect(onPrepareReplay).toHaveBeenCalledWith(expect.stringContaining('@veyra /debate choose a parser approach'));
    expect(onPrepareReplay).toHaveBeenCalledWith(expect.stringContaining('Source: Manual Veyra workflow replay'));
  });
});

function user(id: string, text: string, timestamp: number): UserMessage {
  return { id, role: 'user', text, timestamp };
}

function agent(
  id: string,
  agentId: AgentMessage['agentId'],
  timestamp: number,
  text: string,
  status: AgentMessage['status'] = 'complete',
): AgentMessage {
  return {
    id,
    role: 'agent',
    agentId,
    text,
    toolEvents: [],
    timestamp,
    status,
  };
}

function checkpoint(id: string, timestamp: number, source: 'automatic' | 'manual'): SystemMessage {
  return {
    id,
    role: 'system',
    kind: 'checkpoint',
    text: 'Checkpoint saved.',
    timestamp,
    checkpoint: {
      id,
      timestamp,
      source,
      status: 'available',
      label: 'Before dispatch',
      promptSummary: 'Before dispatch',
      fileCount: 2,
    },
  };
}

function changeSet(id: string, timestamp: number, agentId: AgentMessage['agentId'], fileCount: number): SystemMessage {
  return {
    id,
    role: 'system',
    kind: 'change-set',
    text: `${agentId} changed ${fileCount} files.`,
    timestamp,
    agentId,
    changeSet: {
      id,
      agentId,
      messageId: 'a2',
      timestamp,
      readOnly: false,
      status: 'pending',
      fileCount,
      files: [
        { path: 'src/a.ts', changeKind: 'edited' },
        { path: 'src/a.test.ts', changeKind: 'created' },
      ],
    },
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

function clickButton(node: unknown, label: string): void {
  const button = findButtons(node).find((candidate) => flattenText(candidate) === label);
  expect(button, `button ${label}`).toBeTruthy();
  button?.props.onClick?.();
}

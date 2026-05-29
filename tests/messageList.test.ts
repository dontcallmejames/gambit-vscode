import { beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import type { InProgressMessage, Session } from '../src/shared/protocol.js';

vi.stubGlobal('React', { createElement: h });

vi.mock('preact/hooks', () => ({
  useEffect: vi.fn(),
  useMemo: vi.fn((factory: () => unknown) => factory()),
  useRef: vi.fn(() => ({ current: null })),
  useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
}));

import { MessageList } from '../src/webview/components/MessageList.js';
import { useEffect } from 'preact/hooks';

const mockedUseEffect = useEffect as unknown as ReturnType<typeof vi.fn>;

type Collected = { text: string[]; classes: string[] };

function collect(node: unknown, acc: Collected): Collected {
  if (node === null || node === undefined || node === false || node === true) return acc;
  if (typeof node === 'string' || typeof node === 'number') {
    acc.text.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, acc);
    return acc;
  }
  const vnode = node as { props?: { class?: unknown; className?: unknown; children?: unknown } };
  const cls = vnode.props?.class ?? vnode.props?.className;
  if (typeof cls === 'string') acc.classes.push(cls);
  if (vnode.props && 'children' in vnode.props) collect(vnode.props.children, acc);
  return acc;
}

describe('MessageList auto-scroll', () => {
  beforeEach(() => {
    mockedUseEffect.mockClear();
  });

  it('tracks streaming text and tool-event changes in the auto-scroll dependency', () => {
    const session: Session = { version: 1, messages: [] };
    const inProgress = new Map<string, InProgressMessage>([
      ['codex-1', {
        id: 'codex-1',
        role: 'agent',
        agentId: 'codex',
        text: 'thinking',
        toolEvents: [
          { kind: 'call', name: 'Bash', input: { command: 'npm test' }, timestamp: 1 },
          { kind: 'result', name: 'Bash', output: 'passed', timestamp: 2 },
        ],
        timestamp: 1,
      }],
    ]);

    MessageList({
      session,
      inProgress,
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });

    const deps = mockedUseEffect.mock.calls[0]?.[1] ?? [];
    const dependencyText = deps.join('|');

    expect(dependencyText).toContain('codex-1');
    expect(dependencyText).toContain('text:8');
    expect(dependencyText).toContain('tools:2');
  });
});

describe('MessageList empty state', () => {
  beforeEach(() => {
    mockedUseEffect.mockClear();
  });

  it('renders first-launch orientation copy when there are no messages', () => {
    const vnode = MessageList({
      session: { version: 1, messages: [] },
      inProgress: new Map<string, InProgressMessage>(),
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });

    const collected = collect(vnode, { text: [], classes: [] });
    const text = collected.text.join(' ');

    expect(collected.classes).toContain('message-list-empty');
    expect(text).toContain('Send your first prompt');
    expect(text).toContain('@all');
    expect(text).toContain('/review');
    expect(text).toContain('@path/to/file');
  });

  it('renders messages instead of the empty state once a message exists', () => {
    const vnode = MessageList({
      session: {
        version: 1,
        messages: [{ id: 'u1', role: 'user', text: 'hello', timestamp: 1 }],
      },
      inProgress: new Map<string, InProgressMessage>(),
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });

    const collected = collect(vnode, { text: [], classes: [] });
    expect(collected.classes).not.toContain('message-list-empty');
  });
});

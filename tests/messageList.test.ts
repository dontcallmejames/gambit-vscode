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

import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import * as AgentBubbleModule from '../src/webview/components/AgentBubble.js';

vi.stubGlobal('React', { createElement: h });
vi.mock('preact/hooks', () => ({
  useEffect: vi.fn(),
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => [initial, vi.fn()],
}));

describe('AgentBubble edited files', () => {
  it('renders agent prose as Markdown without swallowing compact tool activity or file chips', () => {
    const send = vi.fn();
    const vnode = AgentBubbleModule.AgentBubble({
      message: {
        id: 'm1',
        role: 'agent',
        agentId: 'codex',
        text: '## Review\n\n- inspect `src/parser.ts`',
        toolEvents: [
          { kind: 'call', name: 'Read', input: { path: 'src/parser.ts' }, timestamp: 1 },
        ],
        editedFiles: ['src/parser.ts'],
        timestamp: 1,
        status: 'complete',
      },
      streaming: false,
      settings: { toolCallRenderStyle: 'compact' },
      send,
    });

    expect(findByType(vnode, 'h2')).toHaveLength(1);
    expect(findByType(vnode, 'li')).toHaveLength(1);
    expect(findByClass(vnode, 'tool-activity-summary')).toHaveLength(1);
    expect(findByClass(vnode, 'edited-file-chip')).toHaveLength(1);
  });

  it('collapses noisy compact tool streams into one activity summary', () => {
    const toolEvents = Array.from({ length: 24 }, (_, index) => ({
      kind: index % 2 === 0 ? 'call' as const : 'result' as const,
      name: index < 12 ? 'Bash' : 'Read',
      input: index % 2 === 0 ? { command: `step ${index}` } : undefined,
      output: index % 2 === 1 ? `result ${index}` : undefined,
      timestamp: index + 1,
    })).map((event) => (
      event.kind === 'call'
        ? { kind: event.kind, name: event.name, input: event.input, timestamp: event.timestamp }
        : { kind: event.kind, name: event.name, output: event.output, timestamp: event.timestamp }
    ));

    const vnode = AgentBubbleModule.AgentBubble({
      message: {
        id: 'm1',
        role: 'agent',
        agentId: 'codex',
        text: 'Checking the workspace.',
        toolEvents,
        editedFiles: [],
        timestamp: 1,
        status: 'complete',
      },
      streaming: false,
      settings: { toolCallRenderStyle: 'compact' },
      send: vi.fn(),
    });

    const text = collectText(vnode);

    expect(findByClass(vnode, 'tool-activity-summary')).toHaveLength(1);
    expect(findByClass(vnode, 'tool-card')).toHaveLength(0);
    expect(text).toContain('Activity');
    expect(text).toContain('24 tool events');
    expect(text).toContain('Bash x12');
    expect(text).toContain('Read x12');
  });

  it('keeps verbose mode as individual raw tool cards', () => {
    const vnode = AgentBubbleModule.AgentBubble({
      message: {
        id: 'm1',
        role: 'agent',
        agentId: 'codex',
        text: 'Debugging.',
        toolEvents: [
          { kind: 'call', name: 'Bash', input: { command: 'npm test' }, timestamp: 1 },
          { kind: 'result', name: 'Bash', output: 'passed', timestamp: 2 },
        ],
        editedFiles: [],
        timestamp: 1,
        status: 'complete',
      },
      streaming: false,
      settings: { toolCallRenderStyle: 'verbose' },
      send: vi.fn(),
    });

    expect(findByClass(vnode, 'tool-card')).toHaveLength(2);
    expect(findByClass(vnode, 'tool-activity-summary')).toHaveLength(0);
  });

  it('renders edited files as clickable workspace-file chips', () => {
    const send = vi.fn();

    expect(typeof AgentBubbleModule.EditedFilesRow).toBe('function');
    const vnode = AgentBubbleModule.EditedFilesRow({
      editedFiles: ['src/parser.ts', 'README.md'],
      send,
    });

    const buttons = findButtons(vnode);

    expect(buttons.map((button) => button.props.children)).toEqual(['src/parser.ts', 'README.md']);

    buttons[0].props.onClick();

    expect(send).toHaveBeenCalledWith({
      kind: 'open-workspace-file',
      relativePath: 'src/parser.ts',
    });
  });
});

function findByType(vnode: any, type: string): any[] {
  if (!vnode) return [];
  if (Array.isArray(vnode)) return vnode.flatMap((child) => findByType(child, type));
  if (typeof vnode.type === 'function') return findByType(vnode.type(vnode.props), type);
  const own = vnode.type === type ? [vnode] : [];
  return own.concat(findByType(vnode.props?.children, type));
}

function findByClass(vnode: any, className: string): any[] {
  if (!vnode) return [];
  if (Array.isArray(vnode)) return vnode.flatMap((child) => findByClass(child, className));
  if (typeof vnode.type === 'function') return findByClass(vnode.type(vnode.props), className);
  const ownClass = String(vnode.props?.class ?? '');
  const own = ownClass.split(/\s+/u).includes(className) ? [vnode] : [];
  return own.concat(findByClass(vnode.props?.children, className));
}

function collectText(vnode: any): string {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(collectText).join('');
  if (typeof vnode.type === 'function') return collectText(vnode.type(vnode.props));
  return collectText(vnode.props?.children);
}

function findButtons(vnode: any): any[] {
  if (!vnode) return [];
  if (Array.isArray(vnode)) return vnode.flatMap(findButtons);
  if (typeof vnode.type === 'function') return findButtons(vnode.type(vnode.props));
  const own = vnode.type === 'button' ? [vnode] : [];
  return own.concat(findButtons(vnode.props?.children));
}

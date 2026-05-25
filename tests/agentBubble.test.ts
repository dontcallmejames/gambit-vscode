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
  it('renders agent prose as Markdown without swallowing tool cards or file chips', () => {
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
    expect(findByClass(vnode, 'tool-card')).toHaveLength(1);
    expect(findByClass(vnode, 'edited-file-chip')).toHaveLength(1);
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

function findButtons(vnode: any): any[] {
  if (!vnode) return [];
  if (Array.isArray(vnode)) return vnode.flatMap(findButtons);
  if (typeof vnode.type === 'function') return findButtons(vnode.type(vnode.props));
  const own = vnode.type === 'button' ? [vnode] : [];
  return own.concat(findButtons(vnode.props?.children));
}

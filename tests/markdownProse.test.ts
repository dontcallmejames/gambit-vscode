import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { MarkdownProse } from '../src/webview/components/MarkdownProse.js';

vi.stubGlobal('React', { createElement: h });

describe('MarkdownProse', () => {
  it('renders common review Markdown as structured prose', () => {
    const vnode = MarkdownProse({
      text: [
        '## Findings',
        '',
        '- **Blocking:** fix `src/parser.ts`',
        '- Follow-up item',
        '',
        '> keep this visible',
        '',
        '```ts',
        'const ok = true;',
        '```',
        '',
        '| Area | Risk |',
        '| --- | --- |',
        '| Parser | Low |',
      ].join('\n'),
    });

    expect(findByType(vnode, 'h2')).toHaveLength(1);
    expect(findByType(vnode, 'ul')).toHaveLength(1);
    expect(findByType(vnode, 'li')).toHaveLength(2);
    expect(findByType(vnode, 'strong')).toHaveLength(1);
    expect(findByType(vnode, 'code').map(flattenText).join('\n')).toContain('src/parser.ts');
    expect(findByType(vnode, 'pre')).toHaveLength(1);
    expect(findByType(vnode, 'blockquote')).toHaveLength(1);
    expect(findByType(vnode, 'table')).toHaveLength(1);
    expect(flattenText(vnode)).toContain('Parser');
  });

  it('keeps raw HTML readable instead of rendering unsafe elements', () => {
    const vnode = MarkdownProse({
      text: '<img src=x onerror=alert(1)> <script>alert("x")</script>',
    });

    expect(findByType(vnode, 'img')).toHaveLength(0);
    expect(findByType(vnode, 'script')).toHaveLength(0);
    expect(flattenText(vnode)).toContain('<img src=x onerror=alert(1)>');
    expect(flattenText(vnode)).toContain('<script>alert("x")</script>');
  });

  it('dispatches safe external and workspace links while rejecting script links', () => {
    const send = vi.fn();
    const vnode = MarkdownProse({
      text: [
        '[docs](https://example.com/docs)',
        '[parser](src/parser.ts)',
        '[bad](javascript:alert(1))',
      ].join('\n'),
      send,
    });

    const links = findByType(vnode, 'a');
    const labels = links.map(flattenText);

    expect(labels).toEqual(['docs', 'parser']);
    expect(flattenText(vnode)).toContain('bad');

    links[0].props.onClick({ preventDefault: vi.fn() });
    links[1].props.onClick({ preventDefault: vi.fn() });

    expect(send).toHaveBeenCalledWith({ kind: 'open-external', url: 'https://example.com/docs' });
    expect(send).toHaveBeenCalledWith({ kind: 'open-workspace-file', relativePath: 'src/parser.ts' });
  });
});

function findByType(vnode: any, type: string): any[] {
  if (!vnode) return [];
  if (Array.isArray(vnode)) return vnode.flatMap((child) => findByType(child, type));
  const own = vnode.type === type ? [vnode] : [];
  return own.concat(findByType(vnode.props?.children, type));
}

function flattenText(vnode: any): string {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(flattenText).join('');
  return flattenText(vnode.props?.children);
}

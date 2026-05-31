import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { StatePanel } from '../src/webview/components/StatePanel.js';

vi.stubGlobal('React', { createElement: h });

type Acc = { text: string[]; classes: string[] };

function collect(node: unknown, acc: Acc): Acc {
  if (node == null || node === false || node === true) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.text.push(String(node)); return acc; }
  if (Array.isArray(node)) { for (const c of node) collect(c, acc); return acc; }
  const v = node as any;
  if (typeof v.props?.class === 'string') {
    for (const cls of v.props.class.split(/\s+/)) { if (cls) acc.classes.push(cls); }
  }
  if (v.props && 'children' in v.props) collect(v.props.children, acc);
  return acc;
}

describe('StatePanel', () => {
  it('renders the title with the title class', () => {
    const acc = collect(StatePanel({ title: 'Nothing here yet' }), { text: [], classes: [] });
    expect(acc.text.join(' ')).toContain('Nothing here yet');
    expect(acc.classes).toContain('state-panel');
    expect(acc.classes).toContain('state-panel-title');
  });

  it('renders an optional subtitle', () => {
    const acc = collect(StatePanel({ title: 'X', subtitle: 'more detail' }), { text: [], classes: [] });
    expect(acc.text.join(' ')).toContain('more detail');
    expect(acc.classes).toContain('state-panel-subtitle');
  });

  it('wraps body children in the body element', () => {
    const acc = collect(StatePanel({ title: 'X', children: h('div', null, 'hint text') }), { text: [], classes: [] });
    expect(acc.classes).toContain('state-panel-body');
    expect(acc.text.join(' ')).toContain('hint text');
  });

  it('omits subtitle and body when not provided', () => {
    const acc = collect(StatePanel({ title: 'Only title' }), { text: [], classes: [] });
    expect(acc.classes).not.toContain('state-panel-subtitle');
    expect(acc.classes).not.toContain('state-panel-body');
  });
});

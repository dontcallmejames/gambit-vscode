import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { AgentMarker } from '../src/webview/components/AgentMarker.js';

vi.stubGlobal('React', { createElement: h });

function collect(node: unknown, acc: { text: string[]; classes: string[] }) {
  if (node == null || node === false || node === true) return acc;
  if (typeof node === 'string' || typeof node === 'number') { acc.text.push(String(node)); return acc; }
  if (Array.isArray(node)) { for (const c of node) collect(c, acc); return acc; }
  const v = node as any;
  // Handle Preact VNode structure
  if (v && typeof v === 'object') {
    if (typeof v.props?.class === 'string') {
      // Split class strings so each class name is a separate entry
      for (const cls of v.props.class.split(/\s+/)) {
        if (cls) acc.classes.push(cls);
      }
    }
    if (v.props && 'children' in v.props) collect(v.props.children, acc);
  }
  return acc;
}

describe('AgentMarker', () => {
  it('renders an agent-colored dot class and the agent name by default', () => {
    const acc = collect(AgentMarker({ agentId: 'claude' }), { text: [], classes: [] });
    expect(acc.classes).toContain('agent-marker-claude');
    expect(acc.classes).toContain('agent-marker-dot');
    expect(acc.text.join(' ')).toContain('Claude');
  });

  it('omits the name when showLabel is false', () => {
    const acc = collect(AgentMarker({ agentId: 'codex', showLabel: false }), { text: [], classes: [] });
    expect(acc.classes).toContain('agent-marker-codex');
    expect(acc.text.join(' ')).not.toContain('Codex');
  });

  it('exposes an accessible label when the name is hidden (dot-only)', () => {
    const vnode = AgentMarker({ agentId: 'gemini', showLabel: false }) as any;
    expect(vnode.props.role).toBe('img');
    expect(vnode.props['aria-label']).toBe('Gemini');
  });
});

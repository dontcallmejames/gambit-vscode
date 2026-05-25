import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';
import { parseWorkflowArtifactBlocks } from '../src/webview/workflowArtifacts.js';
import { WorkflowArtifactCards } from '../src/webview/components/WorkflowArtifactCards.js';

vi.stubGlobal('React', { createElement: h });

describe('workflow artifact parsing', () => {
  it('detects known Veyra workflow sections from Markdown headings', () => {
    const result = parseWorkflowArtifactBlocks([
      'Gemini closes with synthesis.',
      '',
      '## Veyra Synthesis',
      '',
      '- Ship artifact cards.',
      '',
      '## Blocking issues',
      '',
      'None.',
      '',
      '### Missing tests',
      '',
      '- Add parser tests.',
      '',
      '## Next action',
      '',
      'Release as a patch.',
    ].join('\n'));

    expect(result.hasArtifacts).toBe(true);
    expect(result.blocks.map((block) => block.kind === 'section' ? block.title : 'prose')).toEqual([
      'prose',
      'Veyra Synthesis',
      'Blocking issues',
      'Missing tests',
      'Next action',
    ]);
  });

  it('accepts agent-prefixed artifact headings and common follow-up sections', () => {
    const result = parseWorkflowArtifactBlocks([
      '## Gemini — Veyra Synthesis',
      'Consensus is clear.',
      '',
      '## Advisory risks',
      '- Watch release timing.',
      '',
      '## Follow-up suggestions',
      '- Re-run the smoke test.',
      '',
      '## Handoff Summary',
      'Codex should implement the UI slice.',
    ].join('\n'));

    const sections = result.blocks.filter((block) => block.kind === 'section');

    expect(sections.map((section) => section.title)).toEqual([
      'Veyra Synthesis',
      'Advisory risks',
      'Follow-up suggestions',
      'Handoff Summary',
    ]);
  });

  it('detects PR package draft sections as artifact cards', () => {
    const result = parseWorkflowArtifactBlocks([
      '## PR Summary',
      'Ship the parser fix.',
      '',
      '## Changed File Explanation',
      '- `src/parser.ts`: parser implementation.',
      '',
      '## Risk Checklist',
      '- Migration risk: low.',
      '',
      '## Verification Evidence',
      '- `npm run verify` passed.',
      '',
      '## Unresolved Blockers',
      'None.',
      '',
      '## Suggested Follow-up Commands',
      '- `git status --short`',
    ].join('\n'));

    const sections = result.blocks.filter((block) => block.kind === 'section');

    expect(result.hasArtifacts).toBe(true);
    expect(sections.map((section) => section.title)).toEqual([
      'PR Summary',
      'Changed File Explanation',
      'Risk Checklist',
      'Verification Evidence',
      'Unresolved Blockers',
      'Suggested Follow-up Commands',
    ]);
  });

  it('detects browser testing review sections as artifact cards', () => {
    const result = parseWorkflowArtifactBlocks([
      '## Browser/Test Summary',
      'Playwright reproduced the issue.',
      '',
      '## Reproduction Evidence',
      '- Console error and screenshot note attached.',
      '',
      '## User-Visible Risk',
      '- Login button is hidden.',
      '',
      '## Likely Cause',
      '- Responsive layout regression.',
      '',
      '## Verification Gaps',
      '- Mobile viewport not covered.',
      '',
      '## Suggested Follow-up Commands',
      '- `npm run test:e2e`',
    ].join('\n'));

    const sections = result.blocks.filter((block) => block.kind === 'section');

    expect(result.hasArtifacts).toBe(true);
    expect(sections.map((section) => section.title)).toEqual([
      'Browser/Test Summary',
      'Reproduction Evidence',
      'User-Visible Risk',
      'Likely Cause',
      'Verification Gaps',
      'Suggested Follow-up Commands',
    ]);
  });

  it('falls back to plain Markdown when no known artifact sections exist', () => {
    const result = parseWorkflowArtifactBlocks([
      '## Ordinary Review',
      '',
      '- Keep this as normal prose.',
    ].join('\n'));

    expect(result.hasArtifacts).toBe(false);
    expect(result.blocks).toEqual([
      {
        kind: 'prose',
        text: '## Ordinary Review\n\n- Keep this as normal prose.',
      },
    ]);
  });
});

describe('WorkflowArtifactCards', () => {
  it('renders known sections as professional artifact cards with safe Markdown links', () => {
    const send = vi.fn();
    const vnode = WorkflowArtifactCards({
      text: [
        '## Recommendation',
        '',
        'Ship this with [docs](https://example.com/docs), inspect [parser](src/parser.ts), and ignore [bad](javascript:alert(1)).',
        '',
        '## Handoff Summary',
        '',
        '- Codex owns implementation.',
      ].join('\n'),
      send,
    });

    const text = flattenText(vnode);
    const links = findByType(vnode, 'a');

    expect(findByClass(vnode, 'workflow-artifact-card')).toHaveLength(2);
    expect(findByClass(vnode, 'workflow-artifact-chip').map(flattenText)).toContain('Recommendation');
    expect(text).toContain('Handoff Summary');
    expect(links.map(flattenText)).toEqual(['docs', 'parser']);
    expect(text).toContain('bad');

    links[0].props.onClick({ preventDefault: vi.fn() });
    links[1].props.onClick({ preventDefault: vi.fn() });

    expect(send).toHaveBeenCalledWith({ kind: 'open-external', url: 'https://example.com/docs' });
    expect(send).toHaveBeenCalledWith({ kind: 'open-workspace-file', relativePath: 'src/parser.ts' });
  });

  it('keeps malformed or unknown prose as normal Markdown instead of carding it', () => {
    const vnode = WorkflowArtifactCards({
      text: [
        '## Ordinary Review',
        '',
        '- Keep this as normal prose.',
      ].join('\n'),
    });

    expect(findByClass(vnode, 'workflow-artifact-card')).toHaveLength(0);
    expect(findByType(vnode, 'h2')).toHaveLength(1);
    expect(flattenText(vnode)).toContain('Ordinary Review');
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

function flattenText(vnode: any): string {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(flattenText).join('');
  if (typeof vnode.type === 'function') return flattenText(vnode.type(vnode.props));
  return flattenText(vnode.props?.children);
}

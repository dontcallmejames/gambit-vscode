import { describe, expect, it, vi } from 'vitest';
import { h } from 'preact';

vi.stubGlobal('React', { createElement: h });
import {
  COMMAND_DISCOVERY_ITEMS,
  MENTION_ITEMS,
  MentionAutocomplete,
  WORKFLOW_SLASH_ITEMS,
  applyAutocompletePick,
  autocompleteItemsForToken,
} from '../src/webview/components/MentionAutocomplete.js';

describe('MentionAutocomplete', () => {
  it('advertises Codex instead of the legacy GPT alias', () => {
    expect(MENTION_ITEMS.map((item) => item.token)).toEqual([
      '@claude',
      '@codex',
      '@gemini',
      '@all',
    ]);
  });

  it('advertises slash workflows before command-palette actions', () => {
    expect(WORKFLOW_SLASH_ITEMS.map((item) => item.token)).toEqual([
      '/review',
      '/debate',
      '/consensus',
      '/implement',
    ]);
    expect(COMMAND_DISCOVERY_ITEMS.map((item) => item.label)).toEqual([
      'Veyra: Open Pending Changes',
      'Veyra: Run Verification Command',
      'Veyra: Summarize Git Status',
      'Veyra: Review CI/PR Output',
      'Veyra: Prepare PR Package Draft',
      'Veyra: Create Checkpoint',
      'Veyra: Roll Back Latest Checkpoint',
      'Veyra: Check agent status',
      'Veyra: Copy Diagnostic Report',
    ]);
  });

  it('filters agent mentions and command suggestions by the current token', () => {
    expect(autocompleteItemsForToken('@co').map((item) => item.token)).toEqual(['@codex']);
    expect(autocompleteItemsForToken('/ver').map((item) => item.label)).toEqual([
      'Veyra: Run Verification Command',
    ]);
    expect(autocompleteItemsForToken('/git').map((item) => item.label)).toEqual([
      'Veyra: Summarize Git Status',
    ]);
    expect(autocompleteItemsForToken('/ci').map((item) => item.label)).toEqual([
      'Veyra: Review CI/PR Output',
    ]);
    expect(autocompleteItemsForToken('/pr').map((item) => item.label)).toEqual([
      'Veyra: Prepare PR Package Draft',
    ]);
  });

  it('inserts workflow slash commands while command actions return executable command ids', () => {
    const review = WORKFLOW_SLASH_ITEMS.find((item) => item.token === '/review')!;
    const verification = COMMAND_DISCOVERY_ITEMS.find((item) =>
      item.kind === 'command' && item.command === 'veyra.runVerificationCommand'
    )!;

    expect(applyAutocompletePick('please /rev', review)).toEqual({
      text: 'please /review ',
    });
    expect(applyAutocompletePick('/ver', verification)).toEqual({
      text: '',
      command: 'veyra.runVerificationCommand',
    });
  });

  it('renders command labels and short descriptions', () => {
    const vnode = MentionAutocomplete({ filter: '/run', activeIndex: 0, onPick: () => undefined });
    const text = collectText(vnode);

    expect(text).toContain('Veyra: Run Verification Command');
    expect(text).toContain('choose and approve a test command');
  });
});

function collectText(vnode: any): string {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(collectText).join('');
  return collectText(vnode.props?.children);
}

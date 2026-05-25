import { h } from 'preact';
import type { VeyraCommandActionId } from '../../shared/protocol.js';

export type AutocompleteItem =
  | {
    kind: 'insert';
    token: string;
    label: string;
    desc: string;
    insertText: string;
  }
  | {
    kind: 'command';
    token: string;
    label: string;
    desc: string;
    command: VeyraCommandActionId;
  };

const ITEMS: AutocompleteItem[] = [
  { kind: 'insert', token: '@claude', label: '@claude', desc: 'code reasoning', insertText: '@claude ' },
  { kind: 'insert', token: '@codex', label: '@codex', desc: 'execution & tests', insertText: '@codex ' },
  { kind: 'insert', token: '@gemini', label: '@gemini', desc: 'research', insertText: '@gemini ' },
  { kind: 'insert', token: '@all', label: '@all', desc: 'broadcast to all three', insertText: '@all ' },
];

export const WORKFLOW_SLASH_ITEMS: AutocompleteItem[] = [
  { kind: 'insert', token: '/review', label: '/review', desc: 'structured read-only review', insertText: '/review ' },
  { kind: 'insert', token: '/debate', label: '/debate', desc: 'compare safe approaches', insertText: '/debate ' },
  { kind: 'insert', token: '/consensus', label: '/consensus', desc: 'resolve to one recommendation', insertText: '/consensus ' },
  { kind: 'insert', token: '/implement', label: '/implement', desc: 'serial implementation pass', insertText: '/implement ' },
];

export const COMMAND_DISCOVERY_ITEMS: AutocompleteItem[] = [
  {
    kind: 'command',
    token: '/pending',
    label: 'Veyra: Open Pending Changes',
    desc: 'inspect agent edits',
    command: 'veyra.openPendingChanges',
  },
  {
    kind: 'command',
    token: '/verify',
    label: 'Veyra: Run Verification Command',
    desc: 'choose and approve a test command',
    command: 'veyra.runVerificationCommand',
  },
  {
    kind: 'command',
    token: '/browser-test',
    label: 'Veyra: Review Browser/Test Output',
    desc: 'review browser logs and screenshots',
    command: 'veyra.reviewBrowserTestOutput',
  },
  {
    kind: 'command',
    token: '/git-status',
    label: 'Veyra: Summarize Git Status',
    desc: 'summarize local Git state',
    command: 'veyra.summarizeGitStatus',
  },
  {
    kind: 'command',
    token: '/ci',
    label: 'Veyra: Review CI/PR Output',
    desc: 'review copied CI or PR output',
    command: 'veyra.reviewCiWorkflowOutput',
  },
  {
    kind: 'command',
    token: '/pr-package',
    label: 'Veyra: Prepare PR Package Draft',
    desc: 'draft PR summary and readiness evidence',
    command: 'veyra.preparePrPackageDraft',
  },
  {
    kind: 'command',
    token: '/checkpoint',
    label: 'Veyra: Create Checkpoint',
    desc: 'save a recovery point',
    command: 'veyra.createCheckpoint',
  },
  {
    kind: 'command',
    token: '/rollback',
    label: 'Veyra: Roll Back Latest Checkpoint',
    desc: 'restore the latest checkpoint',
    command: 'veyra.rollbackLatestCheckpoint',
  },
  {
    kind: 'command',
    token: '/status',
    label: 'Veyra: Check agent status',
    desc: 'check Claude, Codex, and Gemini',
    command: 'veyra.checkStatus',
  },
  {
    kind: 'command',
    token: '/diagnostics',
    label: 'Veyra: Copy Diagnostic Report',
    desc: 'copy tester diagnostics',
    command: 'veyra.copyDiagnosticReport',
  },
];

const SLASH_ITEMS = [...WORKFLOW_SLASH_ITEMS, ...COMMAND_DISCOVERY_ITEMS];

interface Props {
  filter: string;
  activeIndex: number;
  onPick: (item: AutocompleteItem) => void;
}

export function MentionAutocomplete({ filter, activeIndex, onPick }: Props) {
  const filtered = autocompleteItemsForToken(filter);
  if (filtered.length === 0) return null;
  return (
    <div class="mention-popover">
      {filtered.map((item, i) => (
        <div
          class={`mention-item ${i === activeIndex ? 'active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onPick(item); }}
        >
          <span class="mention-token">{item.label}</span>
          <span class="mention-desc">{item.desc}</span>
        </div>
      ))}
    </div>
  );
}

export const MENTION_ITEMS = ITEMS;

export function autocompleteItemsForToken(token: string): AutocompleteItem[] {
  const isSlash = token.startsWith('/');
  const candidates = isSlash ? SLASH_ITEMS : token.startsWith('@') ? MENTION_ITEMS : [];
  const normalized = token.toLowerCase();
  const bare = normalized.replace(/^[@/]/, '');
  return candidates.filter((item) => {
    const tokenText = item.token.toLowerCase();
    const commandText = item.kind === 'command' ? item.command.toLowerCase() : '';
    const labelText = item.label.replace(/\//gu, ' ').toLowerCase();
    return tokenText.includes(normalized)
      || commandText.includes(normalized)
      || (bare.length >= 3 && labelText.includes(bare));
  });
}

export function currentAutocompleteToken(text: string): string | null {
  return text.match(/(?:^|\s)([@/][^\s]*)$/)?.[1] ?? null;
}

export function applyAutocompletePick(
  text: string,
  item: AutocompleteItem,
): { text: string; command?: VeyraCommandActionId } {
  const token = currentAutocompleteToken(text);
  const start = token ? text.length - token.length : text.length;
  const before = text.slice(0, start);
  if (item.kind === 'command') {
    return {
      text: before,
      command: item.command,
    };
  }
  return {
    text: `${before}${item.insertText}`,
  };
}

import { describe, expect, it, vi } from 'vitest';
import { h, type VNode } from 'preact';
import { initialState, reduce } from '../src/webview/state.js';
import type { FromExtension, RetrievalFeedbackSummary, SystemMessage } from '../src/shared/protocol.js';
import {
  addMarkedMissingFile,
  buildFileMentionDraft,
  buildMissingFileDraft,
  buildRefineCodebaseDraft,
  buildRetrievalFeedbackReport,
  buildRetrievalFeedbackSnapshot,
  normalizeMarkedMissingFilePath,
} from '../src/webview/retrievalFeedback.js';
import { RetrievalFeedbackPanel } from '../src/webview/components/RetrievalFeedbackPanel.js';
import { retrievalFeedbackSummaryFromWorkspaceContextResult } from '../src/retrievalFeedback.js';
import type { WorkspaceContextResult } from '../src/workspaceContext.js';

vi.stubGlobal('React', { createElement: h });

// PanelSection renders <Icon>, which uses hooks; stub them so the panel can be
// rendered synchronously in tests.
vi.mock('preact/hooks', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, vi.fn()],
  useEffect: vi.fn(),
}));

const COMPLETE_RETRIEVAL_GUARDRAILS = [
  'no hidden dispatches',
  'no command execution',
  'no uploads',
  'no cloud indexing',
  'no embedding calls',
  'no paid embedding calls',
  'no background indexing',
  'no background repository scans',
  'no hidden memory',
];

describe('retrieval feedback summary', () => {
  it('derives a source summary with complete local-first guardrails from @codebase evidence', () => {
    const summary = retrievalFeedbackSummaryFromWorkspaceContextResult(
      sampleWorkspaceContextResult(),
      'user-1',
      123,
      'implement',
    );

    expect(summary).toMatchObject({
      sourceMessageId: 'user-1',
      timestamp: 123,
      query: 'auth flow',
      workflowCommand: 'implement',
      methodLabel: 'local lexical search over workspace file names and file text',
      selectedFileCount: 1,
      matchedFileCount: 3,
      omittedMatchedFileCount: 2,
      queryTerms: ['auth', 'flow'],
      budgetSummary: 'max files 1, max snippet lines 80, max file bytes 1000000',
      selectedFiles: [
        { path: 'src/auth/session.ts', score: 42, reason: 'path:auth, text:flow' },
      ],
    });
    for (const guardrail of COMPLETE_RETRIEVAL_GUARDRAILS) {
      expect(summary.guardrails).toContain(guardrail);
    }
  });

  it('derives the latest @codebase retrieval feedback from existing session messages', () => {
    let state = initialState();
    state = reduce(state, eventForMessage(retrievalMessage('older', 1, {
      ...sampleSummary(),
      sourceMessageId: 'older',
      query: 'old query',
    })));
    state = reduce(state, eventForMessage(retrievalMessage('latest', 2, sampleSummary())));

    const snapshot = buildRetrievalFeedbackSnapshot(state);

    expect(snapshot.latest?.sourceMessageId).toBe('latest');
    expect(snapshot.latest?.query).toBe('auth flow');
    expect(snapshot.latest?.selectedFiles).toEqual([
      { path: 'src/auth/session.ts', score: 42, reason: 'path:auth, text:flow' },
    ]);
    expect(snapshot.latest?.omittedMatchedFileCount).toBe(2);
    expect(snapshot.latest?.budgetSummary).toContain('max files 1');
    expect(snapshot.latest?.methodLabel).toContain('local lexical');
    expect(snapshot.latest?.guardrails).toContain('no cloud indexing');
    expect(snapshot.latest?.guardrails).toContain('no background repository scans');
  });

  it('builds visible user-controlled drafts and a copyable local report', () => {
    const summary = sampleSummary();

    expect(buildRefineCodebaseDraft(summary)).toContain('@veyra /review @codebase auth flow');
    expect(buildRefineCodebaseDraft(summary)).toContain('Source: Manual retrieval refinement');
    expect(buildRefineCodebaseDraft(summary)).toContain('src/auth/session.ts - path:auth, text:flow');
    expect(buildFileMentionDraft(summary, 'src/auth/session.ts')).toContain('@src/auth/session.ts');

    const report = buildRetrievalFeedbackReport(summary);
    expect(report).toContain('# Veyra Retrieval Report');
    expect(report).toContain('Query: auth flow');
    expect(report).toContain('Selected files');
    expect(report).toContain('Omitted matching files: 2');
    expect(report).toContain('no cloud indexing');
    expect(report).toContain('no hidden dispatches');
    expect(report).toContain('no command execution');
    expect(report).toContain('no uploads');
    expect(report).toContain('no embedding calls');
    expect(report).toContain('no paid embedding calls');
    expect(report).toContain('no background indexing');
    expect(report).toContain('no hidden memory');
  });

  it('normalizes marked missing paths and includes them in manual drafts and reports', () => {
    const summary = sampleSummary();

    expect(normalizeMarkedMissingFilePath(' @src/auth/session.ts ')).toBe('src/auth/session.ts');
    expect(normalizeMarkedMissingFilePath('`docs/user-guide.md`')).toBe('docs/user-guide.md');
    expect(normalizeMarkedMissingFilePath('   ')).toBeNull();
    expect(addMarkedMissingFile(['src/auth/session.ts'], '@src/auth/session.ts')).toEqual(['src/auth/session.ts']);
    expect(addMarkedMissingFile(['src/auth/session.ts'], 'src/auth/middleware.ts')).toEqual([
      'src/auth/session.ts',
      'src/auth/middleware.ts',
    ]);

    const markedFiles = ['src/auth/session.ts', 'src/auth/middleware.ts'];
    expect(buildRefineCodebaseDraft(summary, markedFiles)).toContain('Known missing files marked in panel: src/auth/session.ts, src/auth/middleware.ts');
    expect(buildMissingFileDraft(summary, markedFiles)).toContain('@veyra /review @src/auth/session.ts @src/auth/middleware.ts');
    expect(buildMissingFileDraft(summary, markedFiles)).toContain('Source: Manual known-missing file draft from visible Veyra retrieval feedback.');

    const report = buildRetrievalFeedbackReport(summary, markedFiles);
    expect(report).toContain('Known missing files marked in panel:');
    expect(report).toContain('- src/auth/session.ts');
    expect(report).toContain('- src/auth/middleware.ts');
    expect(report).toContain('Marked missing files are visible manual evidence only; Veyra does not persist them as hidden memory.');
  });

  it.each(['review', 'debate', 'consensus', 'implement'] as const)(
    'preserves the originating /%s workflow command in retrieval follow-up drafts',
    (workflowCommand) => {
      const summary = {
        ...sampleSummary(),
        workflowCommand,
      } as RetrievalFeedbackSummary;

      expect(buildRefineCodebaseDraft(summary)).toContain(`@veyra /${workflowCommand} @codebase auth flow`);
      expect(buildRefineCodebaseDraft(summary)).toContain('before sending this manual follow-up');
      expect(buildFileMentionDraft(summary, 'src/auth/session.ts')).toContain(`@veyra /${workflowCommand} @src/auth/session.ts`);
      expect(buildRetrievalFeedbackReport(summary)).toContain(`Workflow: /${workflowCommand}`);
    },
  );
});

describe('RetrievalFeedbackPanel', () => {
  it('stays compact when collapsed and exposes explicit draft/copy actions when opened', () => {
    const onToggle = vi.fn();
    const onPrepareDraft = vi.fn();
    const onCopyReport = vi.fn();
    const onOpenFile = vi.fn();
    const onMissingFileInput = vi.fn();
    const onMarkMissingFile = vi.fn();
    const snapshot = { latest: sampleSummary() };

    const collapsed = RetrievalFeedbackPanel({
      snapshot,
      expanded: false,
      markedMissingFiles: [],
      missingFileInput: '',
      onToggle,
      onPrepareDraft,
      onCopyReport,
      onOpenFile,
      onMissingFileInput: vi.fn(),
      onMarkMissingFile: vi.fn(),
    });
    const collapsedText = flattenText(collapsed);

    expect(collapsedText).toContain('Retrieval Feedback');
    expect(collapsedText).toContain('@codebase');
    expect(collapsedText).toContain('1 selected');
    expect(collapsedText).toContain('2 omitted');
    expect(collapsedText).not.toContain('Selected files');

    clickButtonContaining(collapsed, 'Retrieval Feedback');

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onPrepareDraft).not.toHaveBeenCalled();
    expect(onCopyReport).not.toHaveBeenCalled();

    const expanded = RetrievalFeedbackPanel({
      snapshot,
      expanded: true,
      markedMissingFiles: ['src/auth/middleware.ts'],
      missingFileInput: 'src/auth/policy.ts',
      onToggle,
      onPrepareDraft,
      onCopyReport,
      onOpenFile,
      onMissingFileInput,
      onMarkMissingFile,
    });
    const expandedText = flattenText(expanded);

    expect(expandedText).toContain('Selected files');
    expect(expandedText).toContain('src/auth/session.ts');
    expect(expandedText).toContain('path:auth, text:flow');
    expect(expandedText).toContain('Prompt budget');
    expect(expandedText).toContain('no hidden dispatches');
    expect(expandedText).toContain('no cloud indexing');
    expect(expandedText).toContain('no hidden memory');
    expect(expandedText).toContain('Known missing files');
    expect(expandedText).toContain('src/auth/middleware.ts');

    clickButtonContaining(expanded, 'Refine @codebase query');
    clickButtonContaining(expanded, 'Open file');
    clickButtonContaining(expanded, 'Mention');
    inputWithPlaceholder(expanded, 'src/path/to/missing.ts')?.props.onInput?.({
      currentTarget: { value: 'src/auth/policy.ts' },
    });
    clickButtonContaining(expanded, 'Mark missing file');
    clickButtonContaining(expanded, 'Draft missing files');
    clickButtonContaining(expanded, 'Copy retrieval report');

    expect(onPrepareDraft).toHaveBeenCalledWith(expect.stringContaining('@veyra /review @codebase auth flow'));
    expect(onPrepareDraft).toHaveBeenCalledWith(expect.stringContaining('@src/auth/session.ts'));
    expect(onPrepareDraft).toHaveBeenCalledWith(expect.stringContaining('@src/auth/middleware.ts'));
    expect(onMissingFileInput).toHaveBeenCalledWith('src/auth/policy.ts');
    expect(onMarkMissingFile).toHaveBeenCalledWith('src/auth/policy.ts');
    expect(onOpenFile).toHaveBeenCalledWith('src/auth/session.ts');
    expect(onCopyReport).toHaveBeenCalledWith(expect.stringContaining('# Veyra Retrieval Report'));
    expect(onCopyReport).toHaveBeenCalledWith(expect.stringContaining('src/auth/middleware.ts'));
  });

  it('renders no panel when no @codebase retrieval feedback exists', () => {
    expect(RetrievalFeedbackPanel({
      snapshot: { latest: null },
      expanded: false,
      markedMissingFiles: [],
      missingFileInput: '',
      onToggle: vi.fn(),
      onPrepareDraft: vi.fn(),
      onCopyReport: vi.fn(),
      onOpenFile: vi.fn(),
      onMissingFileInput: vi.fn(),
      onMarkMissingFile: vi.fn(),
    })).toBeNull();
  });
});

function sampleSummary(): RetrievalFeedbackSummary {
  return {
    sourceMessageId: 'latest',
    timestamp: 2,
    query: 'auth flow',
    methodLabel: 'local lexical search over workspace file names and file text',
    selectedFileCount: 1,
    matchedFileCount: 3,
    omittedMatchedFileCount: 2,
    selectedFiles: [
      { path: 'src/auth/session.ts', score: 42, reason: 'path:auth, text:flow' },
    ],
    queryTerms: ['auth', 'flow'],
    budgetSummary: 'max files 1, max snippet lines 80, max file bytes 1000000',
    possibleMisses: 'Lexical retrieval can miss renamed concepts; attach known files with @file.',
    warnings: [
      '2 matching files were omitted by veyra.workspaceContext.maxFiles (1). Refine @codebase query or attach known files with @file.',
    ],
    guardrails: COMPLETE_RETRIEVAL_GUARDRAILS,
  };
}

function sampleWorkspaceContextResult(): WorkspaceContextResult {
  return {
    enabled: true,
    query: 'auth flow',
    block: '[Workspace context from @codebase]\n[/Workspace context]',
    attached: [{ path: 'src/auth/session.ts', lines: 80, truncated: false }],
    selected: [
      {
        path: 'src/auth/session.ts',
        score: 42,
        reasons: ['path:auth', 'text:flow'],
        language: 'ts',
        startLine: 1,
        endLine: 80,
      },
    ],
    diagnostics: [],
    quality: {
      method: 'local-lexical',
      inventoryFileCount: 10,
      candidateFileCount: 4,
      matchedFileCount: 3,
      selectedFileCount: 1,
      omittedMatchedFileCount: 2,
      queryTerms: ['auth', 'flow'],
      maxFiles: 1,
      maxSnippetLines: 80,
      maxFileBytes: 1_000_000,
      embeddingReadiness: 'inactive',
      warnings: [
        '2 matching files were omitted by veyra.workspaceContext.maxFiles (1). Refine @codebase query or attach known files with @file.',
      ],
    },
  };
}

function retrievalMessage(id: string, timestamp: number, summary: RetrievalFeedbackSummary): SystemMessage {
  return {
    id,
    role: 'system',
    kind: 'retrieval-feedback',
    text: `@codebase retrieval selected ${summary.selectedFileCount} of ${summary.matchedFileCount} matches.`,
    timestamp,
    retrievalFeedback: summary,
  };
}

function eventForMessage(message: SystemMessage): FromExtension {
  return { kind: 'system-message', message };
}

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  const vnode = node as VNode;
  if (typeof vnode.type === 'function') return flattenText((vnode.type as any)(vnode.props));
  return flattenText(vnode.props?.children);
}

function findButtons(node: unknown): Array<VNode & { props: { onClick?: () => void; children?: unknown } }> {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap(findButtons);
  const vnode = node as VNode;
  if (typeof vnode.type === 'function') return findButtons((vnode.type as any)(vnode.props));
  const self = vnode.type === 'button' ? [vnode as VNode & { props: { onClick?: () => void; children?: unknown } }] : [];
  return [...self, ...findButtons(vnode.props?.children)];
}

function findInputs(node: unknown): Array<VNode & { props: { placeholder?: string; onInput?: (event: { currentTarget: { value: string } }) => void } }> {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap(findInputs);
  const vnode = node as VNode;
  if (typeof vnode.type === 'function') return findInputs((vnode.type as any)(vnode.props));
  const self = vnode.type === 'input'
    ? [vnode as VNode & { props: { placeholder?: string; onInput?: (event: { currentTarget: { value: string } }) => void } }]
    : [];
  return [...self, ...findInputs(vnode.props?.children)];
}

function inputWithPlaceholder(node: unknown, placeholder: string): (VNode & { props: { placeholder?: string; onInput?: (event: { currentTarget: { value: string } }) => void } }) | undefined {
  const input = findInputs(node).find((candidate) => candidate.props.placeholder === placeholder);
  expect(input, `input with placeholder ${placeholder}`).toBeTruthy();
  return input;
}

function clickButtonContaining(node: unknown, label: string): void {
  const button = findButtons(node).find((candidate) => flattenText(candidate).includes(label));
  expect(button, `button containing ${label}`).toBeTruthy();
  button?.props.onClick?.();
}

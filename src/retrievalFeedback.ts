import type { RetrievalFeedbackSummary } from './shared/protocol.js';
import type { WorkspaceContextResult } from './workspaceContext.js';

const RETRIEVAL_GUARDRAILS = [
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

export function retrievalFeedbackSummaryFromWorkspaceContextResult(
  result: WorkspaceContextResult,
  sourceMessageId: string,
  timestamp: number,
  workflowCommand?: RetrievalFeedbackSummary['workflowCommand'],
): RetrievalFeedbackSummary {
  const quality = result.quality;
  return {
    sourceMessageId,
    timestamp,
    query: result.query,
    ...(workflowCommand ? { workflowCommand } : {}),
    methodLabel: 'local lexical search over workspace file names and file text',
    selectedFileCount: quality.selectedFileCount,
    matchedFileCount: quality.matchedFileCount,
    omittedMatchedFileCount: quality.omittedMatchedFileCount,
    selectedFiles: result.selected.map((selection) => ({
      path: selection.path,
      score: selection.score,
      reason: selection.reasons.join(', ') || selection.language || 'metadata',
    })),
    queryTerms: quality.queryTerms,
    budgetSummary: `max files ${quality.maxFiles}, max snippet lines ${quality.maxSnippetLines}, max file bytes ${quality.maxFileBytes}`,
    possibleMisses: 'Lexical retrieval can miss renamed concepts or files that do not contain the query terms; attach known files with @file.',
    warnings: quality.warnings.length > 0 ? quality.warnings : result.diagnostics,
    guardrails: RETRIEVAL_GUARDRAILS,
  };
}

export function retrievalFeedbackNoticeText(summary: RetrievalFeedbackSummary): string {
  const selected = plural(summary.selectedFileCount, 'selected file');
  const omitted = summary.omittedMatchedFileCount > 0
    ? `, ${plural(summary.omittedMatchedFileCount, 'omitted match')}`
    : '';
  return `@codebase retrieval feedback ready: ${selected}${omitted}.`;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

import type { RetrievalFeedbackSummary } from '../shared/protocol.js';
import type { WebviewState } from './state.js';

export type RetrievalFeedbackSnapshot = {
  latest: RetrievalFeedbackSummary | null;
};

export function buildRetrievalFeedbackSnapshot(state: WebviewState): RetrievalFeedbackSnapshot {
  for (let index = state.session.messages.length - 1; index >= 0; index -= 1) {
    const message = state.session.messages[index];
    if (
      message.role === 'system' &&
      message.kind === 'retrieval-feedback' &&
      message.retrievalFeedback
    ) {
      return { latest: message.retrievalFeedback };
    }
  }
  return { latest: null };
}

export function buildRefineCodebaseDraft(summary: RetrievalFeedbackSummary): string {
  const workflowCommand = summary.workflowCommand ?? 'review';
  return [
    `@veyra /${workflowCommand} @codebase ${summary.query}`,
    '',
    '[Retrieval feedback]',
    'Source: Manual retrieval refinement from visible Veyra retrieval feedback.',
    `Original workflow: /${workflowCommand}.`,
    `Previous method: ${summary.methodLabel}.`,
    `Previous query terms: ${summary.queryTerms.join(', ') || 'none'}.`,
    `Previous budget: ${summary.budgetSummary}.`,
    'Previously selected files:',
    ...formatSelectedFiles(summary),
    summary.omittedMatchedFileCount > 0
      ? `Omitted matching files: ${summary.omittedMatchedFileCount}.`
      : 'Omitted matching files: none recorded.',
    ...summary.warnings.map((warning) => `Warning: ${warning}`),
    `Possible misses: ${summary.possibleMisses}`,
    'Please refine the @codebase query or add @file mentions for known missing context before reviewing.',
    '[/Retrieval feedback]',
  ].join('\n');
}

export function buildFileMentionDraft(summary: RetrievalFeedbackSummary, filePath: string): string {
  const workflowCommand = summary.workflowCommand ?? 'review';
  return [
    `@veyra /${workflowCommand} @${filePath}`,
    '',
    '[Retrieval feedback]',
    'Source: Manual file mention from visible Veyra retrieval feedback.',
    `Original workflow: /${workflowCommand}.`,
    `Original @codebase query: ${summary.query}`,
    'Use this explicitly mentioned file as context. Add more @file mentions before sending if retrieval missed important files.',
    '[/Retrieval feedback]',
  ].join('\n');
}

export function buildRetrievalFeedbackReport(summary: RetrievalFeedbackSummary): string {
  return [
    '# Veyra Retrieval Report',
    '',
    `Query: ${summary.query}`,
    `Workflow: /${summary.workflowCommand ?? 'review'}`,
    `Method: ${summary.methodLabel}`,
    `Query terms: ${summary.queryTerms.join(', ') || 'none'}`,
    `Prompt budget: ${summary.budgetSummary}`,
    `Selected files: ${summary.selectedFileCount} of ${summary.matchedFileCount} lexical matches`,
    ...formatSelectedFiles(summary),
    `Omitted matching files: ${summary.omittedMatchedFileCount}`,
    ...summary.warnings.map((warning) => `Warning: ${warning}`),
    `Possible misses: ${summary.possibleMisses}`,
    '',
    'Guardrails:',
    ...summary.guardrails.map((guardrail) => `- ${guardrail}`),
    '- no hidden background scans',
    '',
    'Next steps:',
    '- Refine @codebase query terms when lexical retrieval missed a concept.',
    '- Mention known files explicitly with @path/to/file before sending the next prompt.',
  ].join('\n');
}

function formatSelectedFiles(summary: RetrievalFeedbackSummary): string[] {
  if (summary.selectedFiles.length === 0) return ['- None selected.'];
  return summary.selectedFiles.map((file) => `- ${file.path} - ${file.reason} (score ${file.score})`);
}

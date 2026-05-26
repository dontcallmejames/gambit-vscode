import { h } from 'preact';
import {
  buildFileMentionDraft,
  buildRefineCodebaseDraft,
  buildRetrievalFeedbackReport,
  type RetrievalFeedbackSnapshot,
} from '../retrievalFeedback.js';

type RetrievalFeedbackPanelProps = {
  snapshot: RetrievalFeedbackSnapshot;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onPrepareDraft: (text: string) => void;
  onCopyReport: (text: string) => void;
  onOpenFile: (path: string) => void;
};

export function RetrievalFeedbackPanel({
  snapshot,
  expanded,
  onToggle,
  onPrepareDraft,
  onCopyReport,
  onOpenFile,
}: RetrievalFeedbackPanelProps) {
  const summary = snapshot.latest;
  if (!summary) return null;

  return (
    <section
      class={`retrieval-feedback-panel ${expanded ? 'retrieval-feedback-panel-expanded' : 'retrieval-feedback-panel-collapsed'}`}
      aria-label="Retrieval Feedback"
    >
      <div class="retrieval-feedback-head">
        <div>
          <span class="retrieval-feedback-kicker">Retrieval Feedback</span>
          <span class="retrieval-feedback-label">@codebase</span>
        </div>
        <div class="retrieval-feedback-summary">
          <span>{plural(summary.selectedFileCount, 'selected')}</span>
          {summary.omittedMatchedFileCount > 0 && <span>{plural(summary.omittedMatchedFileCount, 'omitted')}</span>}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="veyra-retrieval-feedback-body"
            onClick={() => onToggle(!expanded)}
          >
            {expanded ? 'Collapse Retrieval Feedback' : 'Open Retrieval Feedback'}
          </button>
        </div>
      </div>

      {expanded && (
        <div id="veyra-retrieval-feedback-body" class="retrieval-feedback-body">
          <div class="retrieval-feedback-grid">
            <section class="retrieval-feedback-card">
              <div class="retrieval-feedback-card-head">
                <span>Selected files</span>
                <span>{summary.methodLabel}</span>
              </div>
              {summary.selectedFiles.length > 0 ? (
                <div class="retrieval-feedback-files">
                  {summary.selectedFiles.map((file) => (
                    <div class="retrieval-feedback-file" key={file.path}>
                      <span class="retrieval-feedback-file-path">{file.path}</span>
                      <span>{file.reason}</span>
                      <button type="button" onClick={() => onOpenFile(file.path)}>
                        Open file
                      </button>
                      <button
                        type="button"
                        onClick={() => onPrepareDraft(buildFileMentionDraft(summary, file.path))}
                      >
                        Mention {file.path}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p class="retrieval-feedback-muted">No files were selected for the last @codebase query.</p>
              )}
            </section>

            <section class="retrieval-feedback-card">
              <div class="retrieval-feedback-card-head">
                <span>Prompt budget</span>
                <span>{summary.omittedMatchedFileCount > 0 ? `${summary.omittedMatchedFileCount} omitted` : 'none omitted'}</span>
              </div>
              <p>{summary.budgetSummary}</p>
              {summary.warnings.length > 0 && (
                <ul>
                  {summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
              <p>{summary.possibleMisses}</p>
            </section>
          </div>

          <div class="retrieval-feedback-actions">
            <button type="button" onClick={() => onPrepareDraft(buildRefineCodebaseDraft(summary))}>
              Refine @codebase query
            </button>
            <button type="button" onClick={() => onCopyReport(buildRetrievalFeedbackReport(summary))}>
              Copy retrieval report
            </button>
            <span>{summary.guardrails.join(', ')}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

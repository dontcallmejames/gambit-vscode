import { h } from 'preact';
import { PanelSection } from './PanelSection.js';
import {
  buildFileMentionDraft,
  buildMissingFileDraft,
  buildRefineCodebaseDraft,
  buildRetrievalFeedbackReport,
  type RetrievalFeedbackSnapshot,
} from '../retrievalFeedback.js';

type RetrievalFeedbackPanelProps = {
  snapshot: RetrievalFeedbackSnapshot;
  expanded: boolean;
  markedMissingFiles: string[];
  missingFileInput: string;
  onToggle: (expanded: boolean) => void;
  onPrepareDraft: (text: string) => void;
  onCopyReport: (text: string) => void;
  onOpenFile: (path: string) => void;
  onMissingFileInput: (value: string) => void;
  onMarkMissingFile: (value: string) => void;
};

export function RetrievalFeedbackPanel({
  snapshot,
  expanded,
  markedMissingFiles,
  missingFileInput,
  onToggle,
  onPrepareDraft,
  onCopyReport,
  onOpenFile,
  onMissingFileInput,
  onMarkMissingFile,
}: RetrievalFeedbackPanelProps) {
  const summary = snapshot.latest;
  if (!summary) return null;

  return (
    <PanelSection
      kind="retrieval"
      kicker="Retrieval Feedback"
      label="@codebase"
      ariaLabel="Retrieval Feedback"
      state="active"
      collapsed={!expanded}
      onToggleCollapse={() => onToggle(!expanded)}
      bodyId="veyra-retrieval-feedback-body"
      bodyClass="retrieval-feedback-body"
      summary={(
        <>
          <span>{plural(summary.selectedFileCount, 'selected')}</span>
          {summary.omittedMatchedFileCount > 0 && <span>{plural(summary.omittedMatchedFileCount, 'omitted')}</span>}
        </>
      )}
    >
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

            <section class="retrieval-feedback-card">
              <div class="retrieval-feedback-card-head">
                <span>Known missing files</span>
                <span>{markedMissingFiles.length > 0 ? `${markedMissingFiles.length} marked` : 'none marked'}</span>
              </div>
              {markedMissingFiles.length > 0 ? (
                <ul class="retrieval-feedback-missing-list">
                  {markedMissingFiles.map((filePath) => <li key={filePath}>{filePath}</li>)}
                </ul>
              ) : (
                <p class="retrieval-feedback-muted">Mark files you know retrieval missed before drafting a manual follow-up.</p>
              )}
              <div class="retrieval-feedback-missing-input">
                <input
                  type="text"
                  value={missingFileInput}
                  placeholder="src/path/to/missing.ts"
                  onInput={(event) => onMissingFileInput(event.currentTarget.value)}
                />
                <button type="button" onClick={() => onMarkMissingFile(missingFileInput)}>
                  Mark missing file
                </button>
              </div>
              <button
                type="button"
                disabled={markedMissingFiles.length === 0}
                onClick={() => onPrepareDraft(buildMissingFileDraft(summary, markedMissingFiles))}
              >
                Draft missing files
              </button>
            </section>
          </div>

          <div class="retrieval-feedback-actions">
            <button type="button" onClick={() => onPrepareDraft(buildRefineCodebaseDraft(summary, markedMissingFiles))}>
              Refine @codebase query
            </button>
            <button type="button" onClick={() => onCopyReport(buildRetrievalFeedbackReport(summary, markedMissingFiles))}>
              Copy retrieval report
            </button>
            <span>{summary.guardrails.join(', ')}</span>
          </div>
    </PanelSection>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

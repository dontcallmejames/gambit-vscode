import { h } from 'preact';
import { buildWorkflowReplayDraft } from '../workflowReplay.js';
import {
  buildWorkflowHistorySummary,
  workflowHistoryAgentLabel,
  workflowHistoryEntryToReplaySummary,
  workflowHistoryPromptPreview,
  type WorkflowHistoryEntry,
  type WorkflowHistorySnapshot,
} from '../workflowHistory.js';

type WorkflowHistoryPanelProps = {
  snapshot: WorkflowHistorySnapshot;
  onPrepareReplay: (text: string) => void;
  onCopySummary: (text: string) => void;
};

export function WorkflowHistoryPanel({ snapshot, onPrepareReplay, onCopySummary }: WorkflowHistoryPanelProps) {
  return (
    <section class={`workflow-history ${snapshot.entries.length > 0 ? 'workflow-history-active' : 'workflow-history-empty'}`} aria-label="Workflow History">
      <div class="workflow-history-head">
        <div>
          <span class="workflow-history-kicker">Workflow History</span>
          <span class="workflow-history-label">{snapshot.entries.length > 0 ? recentLabel(snapshot.entries.length) : 'No completed workflows yet'}</span>
        </div>
      </div>
      {snapshot.entries.length > 0 ? (
        <div class="workflow-history-list">
          {snapshot.entries.map((entry) => (
            <article class="workflow-history-item" key={entry.sourceMessageId}>
              <div class="workflow-history-main">
                <span class="workflow-history-command">{`/${entry.command}`}</span>
                <span class="workflow-history-prompt">{workflowHistoryPromptPreview(entry)}</span>
                <span class={`workflow-history-status workflow-history-status-${entry.completionStatus}`}>
                  {entry.completionStatus}
                </span>
              </div>
              <div class="workflow-history-meta">
                <span>{workflowHistoryAgentLabel(entry)}</span>
                {entry.artifactHeadings.length > 0 && <span>{entry.artifactHeadings.join(', ')}</span>}
                {entry.pendingChangeCount > 0 && <span>{plural(entry.pendingChangeCount, 'pending file')}</span>}
                {entry.checkpointCount > 0 && <span>{plural(entry.checkpointCount, 'checkpoint')}</span>}
                {entry.verificationState && <span>{`verification ${entry.verificationState}`}</span>}
              </div>
              <div class="workflow-history-actions">
                <button
                  type="button"
                  onClick={() => onPrepareReplay(buildWorkflowReplayDraft(workflowHistoryEntryToReplaySummary(entry)))}
                >
                  Prepare replay
                </button>
                <button type="button" onClick={() => onCopySummary(buildWorkflowHistorySummary(entry))}>
                  Copy summary
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p class="workflow-history-muted">Completed /review, /debate, /consensus, and /implement turns will appear here.</p>
      )}
    </section>
  );
}

function recentLabel(count: number): string {
  return count === 1 ? '1 recent workflow' : `${count} recent workflows`;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

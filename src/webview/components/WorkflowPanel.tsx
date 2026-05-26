import { h } from 'preact';
import {
  buildWorkflowReplayDraft,
  workflowReplayAgentLabel,
  workflowReplayPromptPreview,
  type WorkflowReplaySnapshot,
} from '../workflowReplay.js';
import {
  workflowHistoryAgentLabel,
  workflowHistoryEntryToReplaySummary,
  workflowHistoryPromptPreview,
  type WorkflowHistorySnapshot,
} from '../workflowHistory.js';

type WorkflowPanelProps = {
  replay: WorkflowReplaySnapshot;
  history: WorkflowHistorySnapshot;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onPrepareReplay: (text: string) => void;
};

export function WorkflowPanel({
  replay,
  history,
  expanded,
  onToggle,
  onPrepareReplay,
}: WorkflowPanelProps) {
  const workflow = replay.latestWorkflow;
  return (
    <section class={`workflow-panel ${expanded ? 'workflow-panel-expanded' : 'workflow-panel-collapsed'}`} aria-label="Workflows">
      <div class="workflow-panel-head">
        <div>
          <span class="workflow-panel-kicker">Workflows</span>
          <span class="workflow-panel-label">{workflow ? `Replay /${workflow.command}` : 'Replay none'}</span>
        </div>
        <div class="workflow-panel-summary">
          <span>{`History ${history.entries.length}`}</span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="veyra-workflow-panel-body"
            onClick={() => onToggle(!expanded)}
          >
            {expanded ? 'Collapse Workflows' : 'Open Workflows'}
          </button>
        </div>
      </div>

      {expanded && (
        <div id="veyra-workflow-panel-body" class="workflow-panel-body">
          <section class="workflow-panel-latest">
            <div class="workflow-panel-subhead">
              <span>Latest replay</span>
              {workflow && <span>{workflowReplayAgentLabel(workflow)}</span>}
            </div>
            {workflow ? (
              <div class="workflow-panel-replay">
                <p>{workflowReplayPromptPreview(workflow)}</p>
                <button type="button" onClick={() => onPrepareReplay(buildWorkflowReplayDraft(workflow))}>
                  Prepare replay
                </button>
              </div>
            ) : (
              <p class="workflow-panel-muted">Run /review, /debate, /consensus, or /implement to enable replay.</p>
            )}
          </section>

          <section class="workflow-panel-history" aria-label="Recent workflows">
            <div class="workflow-panel-subhead">
              <span>Recent workflows</span>
              <span>{history.entries.length === 1 ? '1 recent' : `${history.entries.length} recent`}</span>
            </div>
            {history.entries.length > 0 ? (
              <div class="workflow-panel-list">
                {history.entries.map((entry) => (
                  <article class="workflow-panel-item" key={entry.sourceMessageId}>
                    <div class="workflow-panel-main">
                      <span class="workflow-panel-command">{`/${entry.command}`}</span>
                      <span class="workflow-panel-prompt">{workflowHistoryPromptPreview(entry)}</span>
                      <span class={`workflow-panel-status workflow-panel-status-${entry.completionStatus}`}>
                        {entry.completionStatus}
                      </span>
                    </div>
                    <div class="workflow-panel-meta">
                      <span>{workflowHistoryAgentLabel(entry)}</span>
                      {entry.artifactHeadings.length > 0 && <span>{entry.artifactHeadings.join(', ')}</span>}
                      {entry.pendingChangeCount > 0 && <span>{plural(entry.pendingChangeCount, 'pending file')}</span>}
                      {entry.checkpointCount > 0 && <span>{plural(entry.checkpointCount, 'checkpoint')}</span>}
                      {entry.verificationState && <span>{`verification ${entry.verificationState}`}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onPrepareReplay(buildWorkflowReplayDraft(workflowHistoryEntryToReplaySummary(entry)))}
                    >
                      Prepare replay
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p class="workflow-panel-muted">Completed workflows will appear here.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

import { h } from 'preact';
import { PanelSection } from './PanelSection.js';
import {
  buildWorkflowReplayDraft,
  workflowReplayAgentLabel,
  workflowReplayPromptPreview,
  type WorkflowReplaySnapshot,
} from '../workflowReplay.js';
import {
  buildWorkflowHistorySummary,
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
  onCopySummary: (text: string) => void;
};

export function WorkflowPanel({
  replay,
  history,
  expanded,
  onToggle,
  onPrepareReplay,
  onCopySummary,
}: WorkflowPanelProps) {
  const workflow = replay.latestWorkflow;
  return (
    <PanelSection
      kind="workflow"
      kicker="Workflows"
      label={workflow ? `Replay /${workflow.command}` : 'Replay none'}
      ariaLabel="Workflows"
      collapsed={!expanded}
      onToggleCollapse={() => onToggle(!expanded)}
      toggleNoun="Workflows"
      bodyId="veyra-workflow-panel-body"
      bodyClass="workflow-panel-body"
      summary={<span>{`History ${history.entries.length}`}</span>}
    >
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
                    <div class="workflow-panel-actions">
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
              <p class="workflow-panel-muted">Completed workflows will appear here.</p>
            )}
          </section>
    </PanelSection>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

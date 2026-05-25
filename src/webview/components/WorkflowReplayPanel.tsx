import { h } from 'preact';
import {
  buildWorkflowReplayDraft,
  workflowReplayAgentLabel,
  workflowReplayPromptPreview,
  type WorkflowReplaySnapshot,
} from '../workflowReplay.js';

type WorkflowReplayPanelProps = {
  snapshot: WorkflowReplaySnapshot;
  onPrepareReplay: (text: string) => void;
};

export function WorkflowReplayPanel({ snapshot, onPrepareReplay }: WorkflowReplayPanelProps) {
  const workflow = snapshot.latestWorkflow;
  return (
    <section class={`workflow-replay ${workflow ? 'workflow-replay-active' : 'workflow-replay-empty'}`} aria-label="Workflow Replay">
      <div class="workflow-replay-head">
        <div>
          <span class="workflow-replay-kicker">Workflow Replay</span>
          <span class="workflow-replay-label">{workflow ? `/${workflow.command}` : 'No workflow to replay yet'}</span>
        </div>
        {workflow && <span class="workflow-replay-agents">{workflowReplayAgentLabel(workflow)}</span>}
      </div>
      {workflow ? (
        <div class="workflow-replay-body">
          <p>{workflowReplayPromptPreview(workflow)}</p>
          <button type="button" onClick={() => onPrepareReplay(buildWorkflowReplayDraft(workflow))}>
            Prepare replay
          </button>
        </div>
      ) : (
        <p class="workflow-replay-muted">Run /review, /debate, /consensus, or /implement to enable replay.</p>
      )}
    </section>
  );
}

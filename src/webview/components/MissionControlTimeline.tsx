import { h } from 'preact';
import type { MissionControlSnapshot, MissionControlStage } from '../missionControl.js';
import { agentLabel } from '../agentLabel.js';

type MissionControlTimelineProps = {
  snapshot: MissionControlSnapshot;
};

export function MissionControlTimeline({ snapshot }: MissionControlTimelineProps) {
  return (
    <section class={`mission-control mission-control-${snapshot.mode}`} aria-label="Mission Control timeline">
      <div class="mission-control-head">
        <div>
          <span class="mission-control-kicker">Mission Control</span>
          <span class="mission-control-label">{snapshot.label}</span>
        </div>
        <div class="mission-control-summary">
          {snapshot.floorHolder && <span>{agentLabel(snapshot.floorHolder)} has floor</span>}
          {snapshot.recentTool && <span>{agentLabel(snapshot.recentTool.agentId)} used {snapshot.recentTool.name}</span>}
        </div>
      </div>
      <div class="mission-control-stages">
        {snapshot.stages.map((stage) => <Stage key={stage.agentId} stage={stage} />)}
      </div>
      {snapshot.workflowWarnings.length > 0 && (
        <div class="mission-control-workflow-warnings" aria-label="Workflow state warnings">
          {snapshot.workflowWarnings.map((warning) => (
            <span
              class={`mission-control-workflow-chip mission-control-workflow-chip-${warning.severity}`}
              key={`${warning.kind}-${warning.agentId ?? 'workflow'}-${warning.filePath ?? warning.text}`}
              title={warning.text}
            >
              {warning.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Stage({ stage }: { stage: MissionControlStage }) {
  return (
    <div class={`mission-stage mission-stage-${stage.agentId} mission-stage-${stage.state}`}>
      <span class="mission-stage-dot"></span>
      <span class="mission-stage-label">{stage.label}</span>
      <span class="mission-stage-state">{stage.state}</span>
    </div>
  );
}

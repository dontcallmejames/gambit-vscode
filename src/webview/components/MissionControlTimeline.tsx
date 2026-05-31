import { h } from 'preact';
import type { MissionControlSnapshot, MissionControlStage, MissionControlStageState } from '../missionControl.js';
import { agentLabel } from '../agentLabel.js';
import { AgentMarker } from './AgentMarker.js';
import { Icon } from './Icon.js';

const STAGE_STATE_ICON: Record<MissionControlStageState, { name: string; fallback: string }> = {
  waiting: { name: 'circle-large-outline', fallback: 'o' },
  queued: { name: 'clock', fallback: '~' },
  active: { name: 'play-circle', fallback: '>' },
  complete: { name: 'pass-filled', fallback: 'v' },
  failed: { name: 'error', fallback: 'x' },
  cancelled: { name: 'circle-slash', fallback: '/' },
};

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
  const stateIcon = STAGE_STATE_ICON[stage.state];
  return (
    <div class={`mission-stage mission-stage-${stage.agentId} mission-stage-${stage.state}`}>
      <AgentMarker agentId={stage.agentId} />
      <span class="mission-stage-state">
        <Icon name={stateIcon.name} fallback={stateIcon.fallback} />
        <span class="mission-stage-state-text">{stage.state}</span>
      </span>
    </div>
  );
}

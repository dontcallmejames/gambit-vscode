import { h } from 'preact';
import type { MissionControlSnapshot, MissionControlStage } from '../missionControl.js';
import type { MissionControlActionChip, PresentationPanelId } from '../presentationDensity.js';

type MissionControlTimelineProps = {
  snapshot: MissionControlSnapshot;
  actionChips?: MissionControlActionChip[];
  onOpenPanel?: (panelId: PresentationPanelId) => void;
};

export function MissionControlTimeline({ snapshot, actionChips, onOpenPanel }: MissionControlTimelineProps) {
  return (
    <section class={`mission-control mission-control-${snapshot.mode}`} aria-label="Mission Control timeline">
      <div class="mission-control-head">
        <div>
          <span class="mission-control-kicker">Mission Control</span>
          <span class="mission-control-label">{snapshot.label}</span>
        </div>
        <div class="mission-control-summary">
          {snapshot.floorHolder ? <span>{agentLabel(snapshot.floorHolder)} has floor</span> : <span>Idle</span>}
          {snapshot.recentTool && <span>{agentLabel(snapshot.recentTool.agentId)} used {snapshot.recentTool.name}</span>}
        </div>
      </div>
      <div class="mission-control-stages">
        {snapshot.stages.map((stage) => <Stage key={stage.agentId} stage={stage} />)}
      </div>
      {actionChips && actionChips.length > 0 ? (
        <div class="mission-control-actions" aria-label="Mission Control sections">
          {actionChips.map((chip) => (
            <button
              type="button"
              class={`mission-control-chip ${chip.expanded ? 'mission-control-chip-active' : ''} ${chip.urgent ? 'mission-control-chip-urgent' : ''}`}
              key={chip.id}
              aria-pressed={chip.expanded}
              onClick={() => onOpenPanel?.(chip.panelId)}
            >
              <span>{chip.label}</span>
              {chip.detail && <span>{chip.detail}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div class="mission-control-indicators">
          {snapshot.pendingChangeCount > 0 && (
            <span>{snapshot.pendingChangeCount} pending {snapshot.pendingChangeCount === 1 ? 'file' : 'files'}</span>
          )}
          {snapshot.availableCheckpointCount > 0 && (
            <span>
              {snapshot.availableCheckpointCount === 1
                ? 'checkpoint available'
                : `${snapshot.availableCheckpointCount} checkpoints available`}
            </span>
          )}
          {snapshot.verificationState && <span>verification {snapshot.verificationState}</span>}
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

function agentLabel(agentId: MissionControlStage['agentId']): string {
  if (agentId === 'claude') return 'Claude';
  if (agentId === 'codex') return 'Codex';
  return 'Gemini';
}

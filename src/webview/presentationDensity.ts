import type { TrustCenterSnapshot } from './trustCenter.js';
import type { RetrievalFeedbackSnapshot } from './retrievalFeedback.js';
import type { WorkflowHistorySnapshot } from './workflowHistory.js';
import type { WorkflowReplaySnapshot } from './workflowReplay.js';

export type PresentationPanelId = 'trust' | 'workflows' | 'retrieval';

export type PresentationDensityState = {
  expandedPanels: Record<PresentationPanelId, boolean>;
  lastUrgentTrustKey: string | null;
};

export type MissionControlActionChip = {
  id: 'trust' | 'checkpoints' | 'replay' | 'history' | 'retrieval';
  panelId: PresentationPanelId;
  label: string;
  detail: string;
  urgent?: boolean;
  expanded: boolean;
};

export const DEFAULT_PRESENTATION_DENSITY_STATE: PresentationDensityState = {
  expandedPanels: {
    trust: false,
    workflows: false,
    retrieval: false,
  },
  lastUrgentTrustKey: null,
};

export function readPresentationDensityState(raw: unknown): PresentationDensityState {
  const candidate = isRecord(raw) ? raw.presentationDensity : undefined;
  if (!isRecord(candidate) || !isRecord(candidate.expandedPanels)) return DEFAULT_PRESENTATION_DENSITY_STATE;
  return {
    expandedPanels: {
      trust: candidate.expandedPanels.trust === true,
      workflows: candidate.expandedPanels.workflows === true,
      retrieval: candidate.expandedPanels.retrieval === true,
    },
    lastUrgentTrustKey: typeof candidate.lastUrgentTrustKey === 'string' ? candidate.lastUrgentTrustKey : null,
  };
}

export function mergePresentationDensityState(raw: unknown, state: PresentationDensityState): unknown {
  return {
    ...(isRecord(raw) ? raw : {}),
    presentationDensity: state,
  };
}

export function setPresentationPanelExpanded(
  state: PresentationDensityState,
  panelId: PresentationPanelId,
  expanded: boolean,
): PresentationDensityState {
  return {
    expandedPanels: {
      ...state.expandedPanels,
      [panelId]: expanded,
    },
    lastUrgentTrustKey: state.lastUrgentTrustKey,
  };
}

export function nextPresentationDensityStateForSignals(
  state: PresentationDensityState,
  { trustUrgencyKey }: { trustUrgencyKey: string | null },
): PresentationDensityState {
  if (!trustUrgencyKey) {
    return state.lastUrgentTrustKey === null ? state : { ...state, lastUrgentTrustKey: null };
  }
  if (state.lastUrgentTrustKey === trustUrgencyKey) return state;
  return {
    expandedPanels: {
      ...state.expandedPanels,
      trust: true,
    },
    lastUrgentTrustKey: trustUrgencyKey,
  };
}

export function effectivePresentationPanelExpanded(
  state: PresentationDensityState,
  panelId: PresentationPanelId,
  { trustUrgent }: { trustUrgent: boolean },
): boolean {
  return state.expandedPanels[panelId];
}

export function isTrustCenterUrgent(snapshot: TrustCenterSnapshot): boolean {
  return snapshot.pendingChangeCount > 0
    || snapshot.editConflictCount > 0
    || snapshot.verificationState === 'failed';
}

export function trustCenterUrgencyKey(snapshot: TrustCenterSnapshot): string | null {
  const signals = [
    snapshot.pendingChangeCount > 0 ? `pending:${snapshot.pendingChangeCount}` : '',
    snapshot.editConflictCount > 0 ? `conflicts:${snapshot.editConflictCount}` : '',
    snapshot.verificationState === 'failed' ? 'verification:failed' : '',
  ].filter(Boolean);
  return signals.length > 0 ? signals.join('|') : null;
}

export function buildPresentationDensityChips({
  trustCenter,
  workflowReplay,
  workflowHistory,
  retrievalFeedback,
  expandedPanels,
}: {
  trustCenter: TrustCenterSnapshot;
  workflowReplay: WorkflowReplaySnapshot;
  workflowHistory: WorkflowHistorySnapshot;
  retrievalFeedback?: RetrievalFeedbackSnapshot;
  expandedPanels: Record<PresentationPanelId, boolean>;
}): MissionControlActionChip[] {
  const chips: MissionControlActionChip[] = [
    {
      id: 'trust',
      panelId: 'trust',
      label: 'Trust',
      detail: trustDetail(trustCenter),
      urgent: isTrustCenterUrgent(trustCenter),
      expanded: expandedPanels.trust,
    },
    {
      id: 'checkpoints',
      panelId: 'trust',
      label: checkpointLabel(trustCenter.checkpointCount),
      detail: '',
      expanded: expandedPanels.trust,
    },
    {
      id: 'replay',
      panelId: 'workflows',
      label: workflowReplay.latestWorkflow ? `Replay /${workflowReplay.latestWorkflow.command}` : 'Replay none',
      detail: '',
      expanded: expandedPanels.workflows,
    },
    {
      id: 'history',
      panelId: 'workflows',
      label: `History ${workflowHistory.entries.length}`,
      detail: '',
      expanded: expandedPanels.workflows,
    },
  ];
  if (retrievalFeedback?.latest) {
    chips.push({
      id: 'retrieval',
      panelId: 'retrieval',
      label: 'Retrieval @codebase',
      detail: retrievalDetail(retrievalFeedback.latest),
      expanded: expandedPanels.retrieval,
    });
  }
  return chips;
}

function trustDetail(snapshot: TrustCenterSnapshot): string {
  if (snapshot.pendingChangeCount > 0) return plural(snapshot.pendingChangeCount, 'pending file');
  if (snapshot.editConflictCount > 0) return plural(snapshot.editConflictCount, 'edit conflict');
  if (snapshot.verificationState === 'failed') return 'verification failed';
  if (snapshot.verificationState) return `verification ${snapshot.verificationState}`;
  if (snapshot.hasSignals) return 'observed';
  return 'clear';
}

function checkpointLabel(count: number): string {
  if (count === 0) return 'No checkpoints';
  return count === 1 ? 'checkpoint available' : `${count} checkpoints available`;
}

function retrievalDetail(summary: NonNullable<RetrievalFeedbackSnapshot['latest']>): string {
  const selected = plural(summary.selectedFileCount, 'selected');
  return summary.omittedMatchedFileCount > 0
    ? `${selected}, ${plural(summary.omittedMatchedFileCount, 'omitted')}`
    : selected;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

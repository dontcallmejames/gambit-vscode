import type { TrustCenterSnapshot } from './trustCenter.js';

export type PresentationPanelId = 'trust' | 'workflows' | 'retrieval';

export type PresentationDensityState = {
  expandedPanels: Record<PresentationPanelId, boolean>;
  lastUrgentTrustKey: string | null;
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

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { h } from 'preact';
import { useEffect, useReducer, useState } from 'preact/hooks';
import { initialState, reduce } from './state.js';
import { buildMissionControlSnapshot } from './missionControl.js';
import { buildTrustCenterSnapshot } from './trustCenter.js';
import { buildRetrievalFeedbackSnapshot } from './retrievalFeedback.js';
import { buildWorkflowReplaySnapshot } from './workflowReplay.js';
import { buildWorkflowHistorySnapshot } from './workflowHistory.js';
import {
  buildPresentationDensityChips,
  effectivePresentationPanelExpanded,
  isTrustCenterUrgent,
  mergePresentationDensityState,
  nextPresentationDensityStateForSignals,
  readPresentationDensityState,
  setPresentationPanelExpanded,
  trustCenterUrgencyKey,
  type PresentationPanelId,
} from './presentationDensity.js';
import { MissionControlTimeline } from './components/MissionControlTimeline.js';
import { TrustCenter } from './components/TrustCenter.js';
import { RetrievalFeedbackPanel } from './components/RetrievalFeedbackPanel.js';
import { WorkflowPanel } from './components/WorkflowPanel.js';
import { MessageList } from './components/MessageList.js';
import { Composer } from './components/Composer.js';
import type { FromExtension, FromWebview } from '../shared/protocol.js';

type VsCodeApi = {
  postMessage(msg: unknown): void;
  getState?(): unknown;
  setState?(state: unknown): void;
};

declare const acquireVsCodeApi: () => VsCodeApi;
const vscode = acquireVsCodeApi();
const send = (msg: FromWebview) => vscode.postMessage(msg);

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState());
  const [composerDraft, setComposerDraft] = useState<{ id: number; text: string } | null>(null);
  const [density, setDensity] = useState(() => readPresentationDensityState(vscode.getState?.()));
  const missionControl = buildMissionControlSnapshot(state);
  const trustCenter = buildTrustCenterSnapshot(state);
  const retrievalFeedback = buildRetrievalFeedbackSnapshot(state);
  const workflowReplay = buildWorkflowReplaySnapshot(state);
  const workflowHistory = buildWorkflowHistorySnapshot(state);
  const trustUrgent = isTrustCenterUrgent(trustCenter);
  const trustUrgentKey = trustCenterUrgencyKey(trustCenter);
  const expandedPanels = {
    trust: effectivePresentationPanelExpanded(density, 'trust', { trustUrgent }),
    workflows: effectivePresentationPanelExpanded(density, 'workflows', { trustUrgent }),
    retrieval: effectivePresentationPanelExpanded(density, 'retrieval', { trustUrgent }),
  };
  const actionChips = buildPresentationDensityChips({
    trustCenter,
    workflowReplay,
    workflowHistory,
    retrievalFeedback,
    expandedPanels,
  });

  useEffect(() => {
    const handler = (e: MessageEvent) => dispatch(e.data as FromExtension);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    vscode.setState?.(mergePresentationDensityState(vscode.getState?.(), density));
  }, [density]);

  useEffect(() => {
    setDensity((current) => nextPresentationDensityStateForSignals(current, { trustUrgencyKey: trustUrgentKey }));
  }, [trustUrgentKey]);

  const setPanelExpanded = (panelId: PresentationPanelId, expanded: boolean) => {
    setDensity((current) => setPresentationPanelExpanded(current, panelId, expanded));
  };
  const prepareComposerDraft = (text: string) => {
    setComposerDraft((draft) => ({ id: (draft?.id ?? 0) + 1, text }));
  };

  return (
    <div class="app">
      <MissionControlTimeline
        snapshot={missionControl}
        actionChips={actionChips}
        onOpenPanel={(panelId) => setPanelExpanded(panelId, true)}
      />
      <TrustCenter
        snapshot={trustCenter}
        expanded={expandedPanels.trust}
        onToggle={(expanded) => setPanelExpanded('trust', expanded)}
        send={send}
      />
      <WorkflowPanel
        replay={workflowReplay}
        history={workflowHistory}
        expanded={expandedPanels.workflows}
        onToggle={(expanded) => setPanelExpanded('workflows', expanded)}
        onPrepareReplay={prepareComposerDraft}
      />
      <RetrievalFeedbackPanel
        snapshot={retrievalFeedback}
        expanded={expandedPanels.retrieval}
        onToggle={(expanded) => setPanelExpanded('retrieval', expanded)}
        onPrepareDraft={prepareComposerDraft}
        onCopyReport={(text) => send({ kind: 'copy-text', text })}
      />
      <MessageList session={state.session} inProgress={state.inProgress} settings={state.settings} send={send} />
      <Composer
        send={send}
        floorHolder={state.floorHolder}
        status={state.status}
        veyraMdPresent={state.veyraMdPresent}
        draft={composerDraft}
      />
    </div>
  );
}

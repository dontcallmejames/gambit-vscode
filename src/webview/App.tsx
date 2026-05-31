import { h } from 'preact';
import { useEffect, useReducer, useState } from 'preact/hooks';
import { initialState, reduce } from './state.js';
import { buildMissionControlSnapshot } from './missionControl.js';
import { buildTrustCenterSnapshot } from './trustCenter.js';
import { addMarkedMissingFile, buildRetrievalFeedbackSnapshot } from './retrievalFeedback.js';
import { buildWorkflowReplaySnapshot } from './workflowReplay.js';
import { buildWorkflowHistorySnapshot } from './workflowHistory.js';
import {
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
  const [retrievalMissingFiles, setRetrievalMissingFiles] = useState<{
    sourceMessageId: string | null;
    input: string;
    files: string[];
  }>({ sourceMessageId: null, input: '', files: [] });
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

  useEffect(() => {
    const sourceMessageId = retrievalFeedback.latest?.sourceMessageId ?? null;
    setRetrievalMissingFiles((current) => (
      current.sourceMessageId === sourceMessageId
        ? current
        : { sourceMessageId, input: '', files: [] }
    ));
  }, [retrievalFeedback.latest?.sourceMessageId]);

  const setPanelExpanded = (panelId: PresentationPanelId, expanded: boolean) => {
    setDensity((current) => setPresentationPanelExpanded(current, panelId, expanded));
  };
  const prepareComposerDraft = (text: string) => {
    setComposerDraft((draft) => ({ id: (draft?.id ?? 0) + 1, text }));
  };
  const markMissingFile = (value: string) => {
    setRetrievalMissingFiles((current) => {
      const files = addMarkedMissingFile(current.files, value);
      return {
        ...current,
        input: files === current.files ? current.input : '',
        files,
      };
    });
  };

  return (
    <div class="app">
      <MissionControlTimeline snapshot={missionControl} />
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
        onCopySummary={(text) => send({ kind: 'copy-text', text })}
      />
      <RetrievalFeedbackPanel
        snapshot={retrievalFeedback}
        expanded={expandedPanels.retrieval}
        markedMissingFiles={retrievalMissingFiles.files}
        missingFileInput={retrievalMissingFiles.input}
        onToggle={(expanded) => setPanelExpanded('retrieval', expanded)}
        onPrepareDraft={prepareComposerDraft}
        onCopyReport={(text) => send({ kind: 'copy-text', text })}
        onOpenFile={(relativePath) => send({ kind: 'open-workspace-file', relativePath })}
        onMissingFileInput={(input) => setRetrievalMissingFiles((current) => ({ ...current, input }))}
        onMarkMissingFile={markMissingFile}
      />
      <MessageList session={state.session} inProgress={state.inProgress} settings={state.settings} send={send} status={state.status} />
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

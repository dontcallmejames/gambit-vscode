import { h } from 'preact';
import { useEffect, useReducer, useState } from 'preact/hooks';
import { initialState, reduce } from './state.js';
import { buildMissionControlSnapshot } from './missionControl.js';
import { buildTrustCenterSnapshot } from './trustCenter.js';
import { buildWorkflowReplaySnapshot } from './workflowReplay.js';
import { MissionControlTimeline } from './components/MissionControlTimeline.js';
import { TrustCenter } from './components/TrustCenter.js';
import { WorkflowReplayPanel } from './components/WorkflowReplayPanel.js';
import { MessageList } from './components/MessageList.js';
import { Composer } from './components/Composer.js';
import type { FromExtension, FromWebview } from '../shared/protocol.js';

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
const send = (msg: FromWebview) => vscode.postMessage(msg);

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState());
  const [composerDraft, setComposerDraft] = useState<{ id: number; text: string } | null>(null);
  const missionControl = buildMissionControlSnapshot(state);
  const trustCenter = buildTrustCenterSnapshot(state);
  const workflowReplay = buildWorkflowReplaySnapshot(state);

  useEffect(() => {
    const handler = (e: MessageEvent) => dispatch(e.data as FromExtension);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div class="app">
      <MissionControlTimeline snapshot={missionControl} />
      <TrustCenter snapshot={trustCenter} send={send} />
      <WorkflowReplayPanel
        snapshot={workflowReplay}
        onPrepareReplay={(text) => setComposerDraft((draft) => ({ id: (draft?.id ?? 0) + 1, text }))}
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

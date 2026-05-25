import { h } from 'preact';
import { useEffect, useReducer } from 'preact/hooks';
import { initialState, reduce } from './state.js';
import { buildMissionControlSnapshot } from './missionControl.js';
import { buildTrustCenterSnapshot } from './trustCenter.js';
import { MissionControlTimeline } from './components/MissionControlTimeline.js';
import { TrustCenter } from './components/TrustCenter.js';
import { MessageList } from './components/MessageList.js';
import { Composer } from './components/Composer.js';
import type { FromExtension, FromWebview } from '../shared/protocol.js';

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
const send = (msg: FromWebview) => vscode.postMessage(msg);

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState());
  const missionControl = buildMissionControlSnapshot(state);
  const trustCenter = buildTrustCenterSnapshot(state);

  useEffect(() => {
    const handler = (e: MessageEvent) => dispatch(e.data as FromExtension);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div class="app">
      <MissionControlTimeline snapshot={missionControl} />
      <TrustCenter snapshot={trustCenter} send={send} />
      <MessageList session={state.session} inProgress={state.inProgress} settings={state.settings} send={send} />
      <Composer send={send} floorHolder={state.floorHolder} status={state.status} veyraMdPresent={state.veyraMdPresent} />
    </div>
  );
}

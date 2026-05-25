import { h } from 'preact';
import { useEffect, useReducer } from 'preact/hooks';
import { initialState, reduce } from './state.js';
import { buildMissionControlSnapshot } from './missionControl.js';
import { MissionControlTimeline } from './components/MissionControlTimeline.js';
import { MessageList } from './components/MessageList.js';
import { Composer } from './components/Composer.js';
import type { FromExtension, FromWebview } from '../shared/protocol.js';

declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
const send = (msg: FromWebview) => vscode.postMessage(msg);

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState());
  const missionControl = buildMissionControlSnapshot(state);

  useEffect(() => {
    const handler = (e: MessageEvent) => dispatch(e.data as FromExtension);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div class="app">
      <MissionControlTimeline snapshot={missionControl} />
      <MessageList session={state.session} inProgress={state.inProgress} settings={state.settings} send={send} />
      <Composer send={send} floorHolder={state.floorHolder} status={state.status} veyraMdPresent={state.veyraMdPresent} />
    </div>
  );
}

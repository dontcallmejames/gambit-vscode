import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { UserBubble } from './UserBubble.js';
import { AgentBubble } from './AgentBubble.js';
import { SystemNotice } from './SystemNotice.js';
import { StatePanel } from './StatePanel.js';
import type { FromWebview, Session, InProgressMessage, Settings, SessionMessage } from '../../shared/protocol.js';
import type { AgentId, AgentStatus } from '../../types.js';

interface Props {
  session: Session;
  inProgress: Map<string, InProgressMessage>;
  settings: Settings;
  send: (message: FromWebview) => void;
  status: Record<AgentId, AgentStatus>;
}

type PersistedItem = { kind: 'persisted'; message: SessionMessage; ts: number };
type InProgressItem = { kind: 'in-progress'; message: InProgressMessage; ts: number };
type ListItem = PersistedItem | InProgressItem;

const MESSAGE_LIST_BOTTOM_THRESHOLD_PX = 48;

export function isNearMessageListBottom(el: Pick<HTMLDivElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= MESSAGE_LIST_BOTTOM_THRESHOLD_PX;
}

function messageScrollPart(message: SessionMessage): string {
  if (message.role === 'agent') {
    return `${message.id}:agent:${message.status}:text:${message.text.length}:tools:${message.toolEvents.length}`;
  }
  return `${message.id}:${message.role}:text:${message.text.length}`;
}

export function buildMessageListScrollDependency(session: Session, inProgress: Map<string, InProgressMessage>): string {
  const persisted = session.messages.map(messageScrollPart);
  const live = Array.from(inProgress.values()).map((message) => (
    `${message.id}:live:${message.agentId}:text:${message.text.length}:tools:${message.toolEvents.length}`
  ));
  return [...persisted, ...live].join('|');
}

function allAgentsUnavailable(status: Record<AgentId, AgentStatus>): boolean {
  const values = Object.values(status);
  return values.length > 0 && values.every((s) => s !== 'ready' && s !== 'busy');
}

export function MessageList({ session, inProgress, settings, send, status }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const shouldFollowBottomRef = useRef(true);
  const scrollDependency = buildMessageListScrollDependency(session, inProgress);

  useEffect(() => {
    const el = listRef.current;
    if (el && shouldFollowBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [scrollDependency]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) shouldFollowBottomRef.current = isNearMessageListBottom(el);
  };

  // Merge persisted history + in-progress, ordered by timestamp
  const items: ListItem[] = [
    ...session.messages.map((m): PersistedItem => ({ kind: 'persisted', message: m, ts: m.timestamp })),
    ...Array.from(inProgress.values()).map((m): InProgressItem => ({ kind: 'in-progress', message: m, ts: m.timestamp })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <div class="message-list" ref={listRef} onScroll={onScroll}>
      {items.length === 0 ? (
        allAgentsUnavailable(status) ? (
          <StatePanel
            icon="circle-slash"
            iconFallback="∅"
            title="No agents are available"
            subtitle="No agent CLI is connected. Make sure Claude, Codex, or Gemini is installed and on your PATH."
          >
            <div class="state-panel-actions">
              <button
                type="button"
                class="file-edited-link"
                onClick={() => send({ kind: 'show-setup-guide' })}
              >
                Open setup guide
              </button>
              <button
                type="button"
                class="file-edited-link"
                onClick={() => send({ kind: 'configure-cli-paths' })}
              >
                Configure CLI paths
              </button>
            </div>
          </StatePanel>
        ) : (
          <StatePanel
            icon="comment-discussion"
            iconFallback="❝"
            title="Send your first prompt"
            subtitle="Veyra routes it to Claude, Codex, and Gemini."
          >
            <ul class="state-panel-hints">
              <li><code>@claude</code> <code>@codex</code> <code>@gemini</code> go to one agent — <code>@all</code> fans out to all three</li>
              <li><code>/review</code> <code>/debate</code> <code>/consensus</code> <code>/implement</code> run a multi-agent workflow</li>
              <li><code>@path/to/file</code> adds a file as context</li>
            </ul>
          </StatePanel>
        )
      ) : (
        items.map((item) => {
          if (item.kind === 'in-progress') {
            return <AgentBubble key={item.message.id} message={item.message} streaming={true} settings={settings} send={send} />;
          }
          const m = item.message;
          if (m.role === 'user') return <UserBubble key={m.id} message={m} />;
          if (m.role === 'agent') return <AgentBubble key={m.id} message={m} streaming={false} settings={settings} send={send} />;
          if (m.role === 'system') return <SystemNotice key={m.id} message={m} send={send} />;
        })
      )}
    </div>
  );
}

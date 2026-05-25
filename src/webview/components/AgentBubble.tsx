import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AgentMessage, FromWebview, InProgressMessage, Settings, ToolEvent } from '../../shared/protocol.js';
import { ToolCallCard } from './ToolCallCard.js';
import { WorkflowArtifactCards } from './WorkflowArtifactCards.js';

interface Props {
  message: AgentMessage | InProgressMessage;
  streaming: boolean;
  settings: Settings;
  send?: (message: FromWebview) => void;
}

const SPINNER_FRAMES: Record<string, string[]> = {
  claude: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  codex: ['⡀', '⡄', '⡆', '⡇', '⣇', '⣧', '⣷', '⣿', '⣾', '⣼', '⣸', '⣰', '⣠', '⣀'],
  gemini: ['⠁', '⠃', '⠇', '⠧', '⠷', '⠿', '⠾', '⠼', '⠸', '⠘', '⠈'],
};

const THINKING_VERBS: Record<string, string[]> = {
  claude: ['thinking', 'pondering', 'considering', 'weighing'],
  codex: ['compiling', 'parsing', 'processing', 'cooking'],
  gemini: ['researching', 'searching', 'looking up', 'digging'],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function BrailleSpinner({ agentId }: { agentId: string }) {
  const frames = SPINNER_FRAMES[agentId] ?? SPINNER_FRAMES.claude;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 90);
    return () => clearInterval(t);
  }, [frames.length]);
  return <span class="braille-spinner">{frames[frame]}</span>;
}

export function EditedFilesRow({
  editedFiles,
  send,
}: {
  editedFiles: string[];
  send?: (message: FromWebview) => void;
}) {
  if (editedFiles.length === 0) return null;
  return (
    <div class="edited-files-row">
      <span class="edited-files-label">Edited</span>
      {editedFiles.map((file) => (
        <button
          key={file}
          type="button"
          class="file-chip edited-file-chip"
          onClick={() => send?.({ kind: 'open-workspace-file', relativePath: file })}
        >
          {file}
        </button>
      ))}
    </div>
  );
}

const TOOL_DETAIL_PREVIEW_LIMIT = 180;

function formatToolEventCount(count: number): string {
  return `${count} tool ${count === 1 ? 'event' : 'events'}`;
}

function summarizeToolEventCounts(events: ToolEvent[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function toolEventLabel(event: ToolEvent): string {
  return `${event.kind === 'call' ? 'call' : 'result'} ${event.name}`;
}

function toolEventPreview(event: ToolEvent): string {
  const detail = event.kind === 'call' ? event.input : event.output;
  if (detail === undefined || detail === null) return '';
  let raw: string;
  try {
    raw = typeof detail === 'string' ? detail : JSON.stringify(detail);
  } catch {
    raw = String(detail);
  }
  const singleLine = raw.replace(/\s+/gu, ' ').trim();
  return singleLine.length > TOOL_DETAIL_PREVIEW_LIMIT
    ? `${singleLine.slice(0, TOOL_DETAIL_PREVIEW_LIMIT - 3)}...`
    : singleLine;
}

function ToolActivitySummary({ events }: { events: ToolEvent[] }) {
  const latest = events[events.length - 1];
  const counts = summarizeToolEventCounts(events);
  return (
    <details class="tool-activity-summary">
      <summary class="tool-activity-head">
        <span class="tool-activity-title">Activity</span>
        <span class="tool-activity-count">{formatToolEventCount(events.length)}</span>
        <span class="tool-activity-kinds">
          {counts.slice(0, 4).map(({ name, count }) => (
            <span key={name} class="tool-activity-chip">{name} x{count}</span>
          ))}
        </span>
        {latest && <span class="tool-activity-latest">Latest: {toolEventLabel(latest)}</span>}
      </summary>
      <div class="tool-activity-detail" aria-label="Tool activity details">
        {events.map((event, index) => {
          const preview = toolEventPreview(event);
          return (
            <div key={`${event.timestamp}-${index}`} class="tool-activity-event">
              <span class="tool-activity-event-name">{toolEventLabel(event)}</span>
              {preview && <code title={preview}>{preview}</code>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ToolEvents({
  events,
  renderStyle,
}: {
  events: ToolEvent[];
  renderStyle: Settings['toolCallRenderStyle'];
}) {
  if (renderStyle === 'hidden') return null;
  if (renderStyle === 'verbose') {
    return (
      <div class="tool-events tool-events-verbose">
        {events.map((event, index) => (
          <ToolCallCard key={index} event={event} renderStyle={renderStyle} />
        ))}
      </div>
    );
  }
  return <ToolActivitySummary events={events} />;
}

export function AgentBubble({ message, streaming, settings, send }: Props) {
  const status = 'status' in message ? message.status : null;
  const error = 'error' in message ? message.error : undefined;
  const editedFiles = 'editedFiles' in message ? message.editedFiles ?? [] : [];
  const isThinking = streaming && message.text === '' && message.toolEvents.length === 0;
  const verb = useMemo(
    () => pickRandom(THINKING_VERBS[message.agentId] ?? THINKING_VERBS.claude),
    [message.agentId],
  );
  const classes = ['bubble', 'agent', `agent-${message.agentId}`];
  if (streaming) classes.push('streaming');
  if (isThinking) classes.push('thinking');

  return (
    <div class={classes.join(' ')}>
      <div class="role" style="font-size:10px;text-transform:uppercase;opacity:0.6;margin-bottom:3px">
        {message.agentId}
      </div>
      {isThinking ? (
        <div class="thinking-line">{verb} <BrailleSpinner agentId={message.agentId} /></div>
      ) : (
        <WorkflowArtifactCards text={message.text} send={send} />
      )}
      {message.toolEvents.length > 0 && <ToolEvents events={message.toolEvents} renderStyle={settings.toolCallRenderStyle} />}
      <EditedFilesRow editedFiles={editedFiles} send={send} />
      {status === 'cancelled' && <div style="font-style:italic;opacity:0.6;margin-top:4px">[Cancelled]</div>}
      {status === 'errored' && error && <div style="color:var(--error-color);margin-top:4px">{error}</div>}
    </div>
  );
}

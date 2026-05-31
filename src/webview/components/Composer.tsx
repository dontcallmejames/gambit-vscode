import { h } from 'preact';
import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import type { AgentId, AgentStatus } from '../../types.js';
import type { FromWebview } from '../../shared/protocol.js';
import { HealthStrip } from './HealthStrip.js';
import { AgentMarker } from './AgentMarker.js';
import {
  MentionAutocomplete,
  applyAutocompletePick,
  autocompleteItemsForToken,
  currentAutocompleteToken,
  type AutocompleteItem,
} from './MentionAutocomplete.js';

interface Props {
  send: (msg: FromWebview) => void;
  floorHolder: AgentId | null;
  status: Record<AgentId, AgentStatus>;
  veyraMdPresent: boolean;
  draft?: { id: number; text: string } | null;
}

const AGENT_TOKENS = new Set(['@claude', '@gpt', '@codex', '@chatgpt', '@gemini', '@all']);
const PACKAGE_SCOPES = new Set(['anthropic-ai', 'google', 'openai', 'types', 'vscode']);

function detectFileMentions(text: string): string[] {
  const out: string[] = [];
  const parts = text.split(/(\r?\n)/);
  let activeFence: FenceMarker | null = null;

  for (const part of parts) {
    if (part === '\n' || part === '\r\n') continue;

    const fenceMarker = detectFenceMarker(part);
    if (fenceMarker && (activeFence === null || activeFence === fenceMarker)) {
      activeFence = activeFence === null ? fenceMarker : null;
      continue;
    }
    if (activeFence) continue;

    for (const t of part.split(/\s+/)) {
      const mention = normalizeMentionToken(t);
      if (!mention) continue;
      if (AGENT_TOKENS.has(`@${mention.toLowerCase()}`)) continue;
      const path = mention;
      if (looksLikeScopedPackage(path)) continue;
      if (path.includes('/') || path.includes('.')) out.push(path);
    }
  }
  return out;
}

type FenceMarker = '```' | '~~~';

function detectFenceMarker(line: string): FenceMarker | null {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('```')) return '```';
  if (trimmed.startsWith('~~~')) return '~~~';
  return null;
}

function normalizeMentionToken(token: string): string | null {
  const mentionStart = token.indexOf('@');
  if (mentionStart === -1) return null;
  if (mentionStart > 0 && !isMentionBoundary(token[mentionStart - 1])) return null;
  return token
    .slice(mentionStart + 1)
    .replace(/[)\]}>,:;.`]+$/, '');
}

function isMentionBoundary(char: string): boolean {
  return char === '(' || char === '[' || char === '{' || char === '<' || char === '`';
}

function looksLikeScopedPackage(token: string): boolean {
  const parts = token.split('/');
  return parts.length >= 2 && PACKAGE_SCOPES.has(parts[0].toLowerCase());
}

function shouldOpenAutocomplete(token: string): boolean {
  return token.startsWith('/')
    || (token.startsWith('@') && !token.includes('/') && !token.includes('.'));
}

export function Composer({ send, floorHolder, status, veyraMdPresent, draft = null }: Props) {
  const [text, setText] = useState(draft?.text ?? '');
  const [autocomplete, setAutocomplete] = useState<{ open: boolean; token: string; activeIndex: number }>({
    open: false, token: '', activeIndex: 0,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    setAutocomplete((a) => ({ ...a, open: false }));
    textareaRef.current?.focus();
  }, [draft?.id]);

  useEffect(() => {
    const token = currentAutocompleteToken(text);
    if (token && shouldOpenAutocomplete(token) && autocompleteItemsForToken(token).length > 0) {
      setAutocomplete((a) => ({ ...a, open: true, token, activeIndex: 0 }));
    } else if (autocomplete.open) {
      setAutocomplete((a) => ({ ...a, open: false }));
    }
  }, [text]);

  const filePaths = useMemo(() => detectFileMentions(text), [text]);

  const handleSend = () => {
    if (!text.trim()) return;
    send({ kind: 'send', text });
    setText('');
  };

  const pickAutocomplete = (item: AutocompleteItem) => {
    const result = applyAutocompletePick(text, item);
    setText(result.text);
    setAutocomplete((a) => ({ ...a, open: false }));
    if (result.command) {
      send({ kind: 'run-command', command: result.command });
    }
    textareaRef.current?.focus();
  };

  const filtered = autocompleteItemsForToken(autocomplete.token);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (autocomplete.open && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAutocomplete((a) => ({ ...a, activeIndex: (a.activeIndex + 1) % filtered.length })); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAutocomplete((a) => ({ ...a, activeIndex: (a.activeIndex - 1 + filtered.length) % filtered.length })); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pickAutocomplete(filtered[autocomplete.activeIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAutocomplete((a) => ({ ...a, open: false })); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isFloorHeld = floorHolder !== null;

  return (
    <div class="composer">
      {autocomplete.open && (
        <MentionAutocomplete filter={autocomplete.token} activeIndex={autocomplete.activeIndex} onPick={pickAutocomplete} />
      )}
      <textarea
        ref={textareaRef}
        value={text}
        placeholder="Type @ for agents, / for commands, or @path/to/file..."
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={handleKeyDown}
      />
      {filePaths.length > 0 && (
        <div class="file-chip-row">
          {filePaths.map((p) => (
            <span class="file-chip" key={p}>Attached: {p}</span>
          ))}
        </div>
      )}
      <div class="composer-row">
        <HealthStrip status={status} send={send} veyraMdPresent={veyraMdPresent} />
        <div class="composer-spacer" />
        {isFloorHeld && floorHolder && (
          <span class="composer-floor">
            <AgentMarker agentId={floorHolder} />
            <span class="composer-floor-state veyra-microlabel">Working</span>
          </span>
        )}
        {isFloorHeld && (
          <button class="cancel" onClick={() => send({ kind: 'cancel' })}>Cancel</button>
        )}
        <button onClick={handleSend} disabled={!text.trim()}>Send</button>
      </div>
    </div>
  );
}

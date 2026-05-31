import type { ChildProcess } from 'node:child_process';
import type { Agent, SendOptions } from './types.js';
import type { AgentChunk, AgentStatus } from '../types.js';
import { checkClaude } from '../statusChecks.js';
import { runClaudeCli } from '../claudeCli.js';
import * as vscode from 'vscode';

export class ClaudeAgent implements Agent {
  readonly id = 'claude' as const;
  private activeCli: ChildProcess | null = null;

  async status(): Promise<AgentStatus> {
    return checkClaude();
  }

  async *send(prompt: string, opts: SendOptions = {}): AsyncIterable<AgentChunk> {
    const permissionMode = claudePermissionMode(opts.readOnly);
    yield* runClaudeCli(prompt, {
      cwd: opts.cwd,
      permissionMode,
      // Read-only sends (review/debate/consensus, and the non-Codex roles in
      // /implement) strip the write tools from Claude's context so it cannot
      // edit files at all. We deliberately do NOT use 'plan' mode: plan mode
      // persists a plan file via the Write tool (to ~/.claude/plans), which
      // counts as a write and tripped the read-only violation detector in
      // practice. Removing the write tools keeps Claude's normal answering turn
      // while making edits impossible; read-only Bash stays available for
      // exploration (git log, grep) that aids planning.
      ...(opts.readOnly ? { disallowedTools: CLAUDE_READONLY_DISALLOWED_TOOLS } : {}),
      signal: opts.signal,
      onProcess: (child) => {
        this.activeCli = child;
      },
    });
  }

  async cancel(): Promise<void> {
    this.activeCli?.kill('SIGTERM');
  }
}

function claudePermissionMode(readOnly?: boolean): 'default' | 'acceptEdits' {
  // Write-capable sends auto-accept edits when the user has opted into auto-edit;
  // read-only sends stay in 'default' mode and rely on disallowedTools (set in
  // send()) to remove the write tools entirely.
  if (readOnly) return 'default';
  const writeApproval = vscode.workspace.getConfiguration('veyra').get<string>('writeApproval', 'auto-edit');
  return writeApproval === 'auto-edit' ? 'acceptEdits' : 'default';
}

const CLAUDE_WRITE_TOOLS: Record<string, string[]> = {
  Edit: ['file_path'],
  Write: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path'],
};

// The write tools removed from Claude's context on read-only sends. Derived
// from CLAUDE_WRITE_TOOLS so the disallow list and the edit-detection list
// (getEditedPath) can never drift apart.
const CLAUDE_READONLY_DISALLOWED_TOOLS = Object.keys(CLAUDE_WRITE_TOOLS);

export function getEditedPath(toolName: string, input: unknown): string | null {
  const fields = CLAUDE_WRITE_TOOLS[toolName];
  if (!fields) return null;
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;
  for (const f of fields) {
    if (typeof obj[f] === 'string') return obj[f] as string;
  }
  return null;
}

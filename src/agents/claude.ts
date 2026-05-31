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

function claudePermissionMode(readOnly?: boolean): 'default' | 'acceptEdits' | 'plan' {
  // Read-only sends (review/debate/consensus, and the non-Codex roles in
  // /implement) use 'plan' — Claude Code's true read-only mode, which forbids
  // file edits at the CLI level rather than merely declining to auto-accept
  // them. 'default' would only withhold auto-approval, leaving writes possible.
  if (readOnly) return 'plan';
  const writeApproval = vscode.workspace.getConfiguration('veyra').get<string>('writeApproval', 'auto-edit');
  return writeApproval === 'auto-edit' ? 'acceptEdits' : 'default';
}

const CLAUDE_WRITE_TOOLS: Record<string, string[]> = {
  Edit: ['file_path'],
  Write: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path'],
};

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

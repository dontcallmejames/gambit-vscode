import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  VeyraDispatchEventSink,
  VeyraDispatchRequest,
} from './veyraService.js';

const execFileAsync = promisify(execFile);
const GIT_COMMAND_TIMEOUT_MS = 10_000;
const GIT_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;

export const SUMMARIZE_GIT_STATUS_COMMAND = 'veyra.summarizeGitStatus';

export type GitWorkflowCommandRunner = (
  workspacePath: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export interface GitRemoteSummary {
  name: string;
  url: string;
  purposes: string[];
}

export interface GitDirtyFile {
  status: string;
  path: string;
}

export interface GitWorkflowContext {
  insideWorkTree: boolean;
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirtySummary: string;
  dirtyFiles: GitDirtyFile[];
  latestCommit: string;
  remotes: GitRemoteSummary[];
  rawStatus: string;
}

export interface GitWorkflowRegistration {
  workspacePath: string;
  service: {
    dispatch(request: VeyraDispatchRequest, emit: VeyraDispatchEventSink): Promise<void>;
  };
}

export interface GitWorkflowApi {
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): { dispose(): void };
  };
  window: {
    showErrorMessage(message: string): Thenable<string | undefined> | unknown;
    showInformationMessage(message: string): Thenable<string | undefined> | unknown;
    showWarningMessage(message: string): Thenable<string | undefined> | unknown;
  };
}

export function registerGitWorkflowAwarenessCommands(
  api: GitWorkflowApi,
  getRegistration: () => GitWorkflowRegistration | undefined,
  revealVeyraView: () => Thenable<unknown> | Promise<unknown>,
  dispatchToView?: (text: string) => Promise<boolean>,
  commandRunner: GitWorkflowCommandRunner = runGitCommand,
): { dispose(): void } {
  return api.commands.registerCommand(SUMMARIZE_GIT_STATUS_COMMAND, async () => {
    const registration = getRegistration();
    if (!registration) {
      api.window.showErrorMessage('Veyra requires an open workspace folder.');
      return;
    }

    let context: GitWorkflowContext | null;
    try {
      context = await collectGitWorkflowContext(registration.workspacePath, commandRunner);
    } catch (err) {
      api.window.showWarningMessage(`Veyra Git status summary failed: ${errorMessage(err)}`);
      return;
    }

    if (!context) {
      api.window.showInformationMessage('No Git repository found for this workspace.');
      return;
    }

    await revealVeyraView();
    const prompt = formatGitWorkflowPrompt(context);
    if (await dispatchToView?.(prompt)) {
      return;
    }

    try {
      await registration.service.dispatch(
        {
          text: prompt,
          source: 'panel',
          cwd: registration.workspacePath,
          readOnly: true,
        },
        () => undefined,
      );
    } catch (err) {
      api.window.showWarningMessage(`Veyra Git workflow dispatch failed: ${errorMessage(err)}`);
    }
  });
}

export async function collectGitWorkflowContext(
  workspacePath: string,
  commandRunner: GitWorkflowCommandRunner = runGitCommand,
): Promise<GitWorkflowContext | null> {
  const inside = await commandRunner(workspacePath, ['rev-parse', '--is-inside-work-tree']);
  if (inside.stdout.trim() !== 'true') return null;

  const [status, remotes, latestCommit] = await Promise.all([
    commandRunner(workspacePath, ['status', '--short', '--branch']),
    commandRunner(workspacePath, ['remote', '-v']),
    commandRunner(workspacePath, ['log', '-1', '--oneline', '--decorate']),
  ]);
  const parsedStatus = parseGitStatus(status.stdout);

  return {
    insideWorkTree: true,
    branch: parsedStatus.branch,
    upstream: parsedStatus.upstream,
    ahead: parsedStatus.ahead,
    behind: parsedStatus.behind,
    dirtySummary: formatDirtySummary(parsedStatus.dirtyFiles),
    dirtyFiles: parsedStatus.dirtyFiles,
    latestCommit: latestCommit.stdout.trim() || 'none',
    remotes: parseGitRemotes(remotes.stdout),
    rawStatus: status.stdout.trim(),
  };
}

export function formatGitWorkflowPrompt(context: GitWorkflowContext): string {
  const remoteLines = context.remotes.length > 0
    ? context.remotes.map((remote) => `Remote: ${remote.name} ${remote.url} (${remote.purposes.join(', ')})`)
    : ['Remote: none detected'];
  const dirtyLines = context.dirtyFiles.length > 0
    ? context.dirtyFiles.map((file) => `- ${file.status} ${file.path}`)
    : ['- clean'];
  const upstream = context.upstream || 'none';

  return [
    '@veyra /review Review this GitHub and CI workflow context.',
    '',
    'Suggest PR and CI follow-up only from this local Git evidence. Do not claim remote PR or CI state unless the user provides it.',
    'Do not run git push, git pull, merge, rebase, reset, clean, or GitHub/CI network commands.',
    'If a network command or destructive git command would help, suggest the exact command and wait for explicit approval.',
    '',
    '[Git workflow context]',
    'Source: Explicit user-triggered local git status summary',
    `Branch: ${context.branch}`,
    `Upstream: ${upstream}`,
    `Ahead: ${context.ahead}`,
    `Behind: ${context.behind}`,
    `Dirty tree: ${context.dirtySummary}`,
    `Latest commit: ${context.latestCommit}`,
    ...remoteLines,
    'Changed files:',
    ...dirtyLines,
    '[/Git workflow context]',
  ].join('\n');
}

function parseGitStatus(rawStatus: string): {
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  dirtyFiles: GitDirtyFile[];
} {
  const lines = rawStatus.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith('##')) ?? '## unknown';
  const header = branchLine.replace(/^##\s*/, '');
  const statusWithoutCounts = header.replace(/\s+\[[^\]]+\]$/, '');
  const [branchPart, upstream = ''] = statusWithoutCounts.split('...');
  const countText = header.match(/\[([^\]]+)\]/)?.[1] ?? '';

  return {
    branch: branchPart || 'unknown',
    upstream,
    ahead: numericCount(countText, 'ahead'),
    behind: numericCount(countText, 'behind'),
    dirtyFiles: lines
      .filter((line) => !line.startsWith('##'))
      .map(parseDirtyFile),
  };
}

function parseDirtyFile(line: string): GitDirtyFile {
  const status = line.slice(0, 2).trim() || line.slice(0, 2);
  return {
    status,
    path: line.slice(3).trim(),
  };
}

function numericCount(text: string, label: 'ahead' | 'behind'): number {
  const match = text.match(new RegExp(`${label}\\s+(\\d+)`));
  return match ? Number(match[1]) : 0;
}

function parseGitRemotes(rawRemotes: string): GitRemoteSummary[] {
  const byKey = new Map<string, GitRemoteSummary>();
  for (const line of rawRemotes.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, rawUrl, purpose] = match;
    const url = sanitizeRemoteUrl(rawUrl);
    const key = `${name}\0${url}`;
    const existing = byKey.get(key) ?? { name, url, purposes: [] };
    if (!existing.purposes.includes(purpose)) {
      existing.purposes.push(purpose);
    }
    byKey.set(key, existing);
  }
  return [...byKey.values()].sort((a, b) => `${a.name} ${a.url}`.localeCompare(`${b.name} ${b.url}`));
}

function sanitizeRemoteUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return rawUrl;
  }
}

function formatDirtySummary(files: GitDirtyFile[]): string {
  if (files.length === 0) return 'clean';
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(dirtyLabel(file.status), (counts.get(dirtyLabel(file.status)) ?? 0) + 1);
  }
  const details = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => `${count} ${label}`)
    .join(', ');
  return `${files.length} changed ${files.length === 1 ? 'file' : 'files'}: ${details}`;
}

function dirtyLabel(status: string): string {
  if (status.includes('?')) return 'untracked';
  if (status.includes('A')) return 'added';
  if (status.includes('D')) return 'deleted';
  if (status.includes('R')) return 'renamed';
  if (status.includes('M')) return 'modified';
  return 'changed';
}

async function runGitCommand(
  workspacePath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: workspacePath,
    windowsHide: true,
    timeout: GIT_COMMAND_TIMEOUT_MS,
    maxBuffer: GIT_COMMAND_MAX_BUFFER_BYTES,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

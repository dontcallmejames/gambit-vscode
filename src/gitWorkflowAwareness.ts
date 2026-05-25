import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  VeyraDispatchEventSink,
  VeyraDispatchRequest,
} from './veyraService.js';
import type {
  CheckpointSummary,
  DispatchChangeSetSummary,
  SessionMessage,
} from './shared/protocol.js';
import { prepareTerminalOutputForPrompt } from './terminalAwareness.js';

const execFileAsync = promisify(execFile);
const GIT_COMMAND_TIMEOUT_MS = 10_000;
const GIT_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;

export const SUMMARIZE_GIT_STATUS_COMMAND = 'veyra.summarizeGitStatus';
export const REVIEW_CI_WORKFLOW_OUTPUT_COMMAND = 'veyra.reviewCiWorkflowOutput';
export const PREPARE_PR_PACKAGE_DRAFT_COMMAND = 'veyra.preparePrPackageDraft';

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
    loadSession?(): Promise<{ version: 1; messages: SessionMessage[] }>;
    listPendingChangeSets?(): Promise<DispatchChangeSetSummary[]>;
    listCheckpoints?(): Promise<CheckpointSummary[]>;
  };
}

export interface PrPackageVerificationResult {
  command: string;
  exitStatus: string;
  source: string;
}

export interface PrPackageEvidence {
  pendingChangeSets: DispatchChangeSetSummary[];
  checkpoints: CheckpointSummary[];
  verificationResults: PrPackageVerificationResult[];
}

export interface PrPackageDraftPromptInput {
  userProvidedOutput?: string;
  evidence?: PrPackageEvidence;
}

export interface GitWorkflowApi {
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): { dispose(): void };
  };
  env: {
    clipboard: {
      readText(): Thenable<string>;
    };
  };
  window: {
    showErrorMessage(message: string): Thenable<string | undefined> | unknown;
    showInformationMessage(message: string): Thenable<string | undefined> | unknown;
    showInputBox(options: {
      title?: string;
      prompt?: string;
      placeHolder?: string;
      ignoreFocusOut?: boolean;
    }): Thenable<string | undefined>;
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
  const disposables = [
    api.commands.registerCommand(SUMMARIZE_GIT_STATUS_COMMAND, async () => {
      const registration = getRegistration();
      if (!registration) {
        api.window.showErrorMessage('Veyra requires an open workspace folder.');
        return;
      }

      const context = await collectContextForCommand(
        api,
        registration.workspacePath,
        commandRunner,
        'Veyra Git status summary failed',
      );
      if (!context) return;

      await dispatchGitWorkflowPrompt(
        api,
        registration,
        revealVeyraView,
        formatGitWorkflowPrompt(context),
        dispatchToView,
      );
    }),
    api.commands.registerCommand(REVIEW_CI_WORKFLOW_OUTPUT_COMMAND, async () => {
      const registration = getRegistration();
      if (!registration) {
        api.window.showErrorMessage('Veyra requires an open workspace folder.');
        return;
      }

      const output = await explicitCiPrOutput(api);
      if (!output.trim()) {
        api.window.showInformationMessage('No CI or PR output provided.');
        return;
      }

      const context = await collectContextForCommand(
        api,
        registration.workspacePath,
        commandRunner,
        'Veyra CI/PR workflow review failed',
      );
      if (!context) return;

      await dispatchGitWorkflowPrompt(
        api,
        registration,
        revealVeyraView,
        formatGitWorkflowReviewPrompt(context, output),
        dispatchToView,
      );
    }),
    api.commands.registerCommand(PREPARE_PR_PACKAGE_DRAFT_COMMAND, async () => {
      const registration = getRegistration();
      if (!registration) {
        api.window.showErrorMessage('Veyra requires an open workspace folder.');
        return;
      }

      const output = await optionalCiPrOutput(api);
      const context = await collectContextForCommand(
        api,
        registration.workspacePath,
        commandRunner,
        'Veyra PR package draft failed',
      );
      if (!context) return;

      const evidence = await collectPrPackageEvidence(registration.service).catch((err) => {
        api.window.showWarningMessage(`Veyra PR package evidence collection failed: ${errorMessage(err)}`);
        return emptyPrPackageEvidence();
      });

      await dispatchGitWorkflowPrompt(
        api,
        registration,
        revealVeyraView,
        formatPrPackageDraftPrompt(context, { userProvidedOutput: output, evidence }),
        dispatchToView,
      );
    }),
  ];

  return {
    dispose(): void {
      for (const disposable of disposables) disposable.dispose();
    },
  };
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
  return [
    '@veyra /review Review this GitHub and CI workflow context.',
    '',
    'Suggest PR and CI follow-up only from this local Git evidence. Do not claim remote PR or CI state unless the user provides it.',
    'Do not run git push, git pull, merge, rebase, reset, clean, or GitHub/CI network commands.',
    'If a network command or destructive git command would help, suggest the exact command and wait for explicit approval.',
    '',
    ...formatGitWorkflowContextBlock(context),
  ].join('\n');
}

export function formatGitWorkflowReviewPrompt(context: GitWorkflowContext, userProvidedOutput: string): string {
  const ciOutput = sanitizeUserProvidedWorkflowOutput(userProvidedOutput);
  return [
    '@veyra /review Review this GitHub PR and CI readiness context.',
    '',
    'Use only the local git context and explicit user-provided CI or PR output below.',
    'Produce a Draft PR summary, PR readiness checklist, CI findings, and suggested follow-up commands.',
    'Do not claim live remote PR or CI state unless it appears in the user-provided output.',
    'Do not run git push, git pull, merge, rebase, reset, clean, GitHub CLI, API, or CI commands.',
    'If follow-up would help, recommend exact follow-up commands and wait for explicit approval.',
    '',
    ...formatGitWorkflowContextBlock(context),
    '',
    '[CI/PR context]',
    'Source: Explicit user-provided CI or PR output',
    ciOutput,
    '[/CI/PR context]',
  ].join('\n');
}

export function formatPrPackageDraftPrompt(
  context: GitWorkflowContext,
  input: PrPackageDraftPromptInput = {},
): string {
  const evidence = input.evidence ?? emptyPrPackageEvidence();
  const ciOutput = sanitizeUserProvidedWorkflowOutput(input.userProvidedOutput ?? '');
  const ciPrLines = ciOutput.trim()
    ? [
        'Source: Explicit user-provided CI or PR output',
        ciOutput,
      ]
    : [
        'Source: No user-provided CI or PR output',
        'No explicit CI or PR output was provided.',
      ];

  return [
    '@veyra /review Prepare a local-first GitHub PR package draft.',
    '',
    'Use only local Git evidence, Veyra trust evidence, and explicit user-provided CI/PR output.',
    'Do not claim live remote PR, review, branch protection, or CI state unless it appears in the user-provided output.',
    'Do not run git push, git pull, merge, rebase, reset, clean, GitHub CLI, API, CI commands, or create a PR.',
    'If follow-up would help, suggest exact follow-up commands and wait for explicit approval before any command runs.',
    '',
    'Produce exactly these Markdown headings in the final answer so the docked view can render artifact cards:',
    '## PR Summary',
    '## Changed File Explanation',
    '## Risk Checklist',
    '## Verification Evidence',
    '## Unresolved Blockers',
    '## Suggested Follow-up Commands',
    '',
    ...formatGitWorkflowContextBlock(context),
    '',
    ...formatPrPackageContextBlock(evidence),
    '',
    '[CI/PR context]',
    ...ciPrLines,
    '[/CI/PR context]',
  ].join('\n');
}

export async function collectPrPackageEvidence(
  service: GitWorkflowRegistration['service'],
): Promise<PrPackageEvidence> {
  const [pendingChangeSets, checkpoints, session] = await Promise.all([
    service.listPendingChangeSets?.() ?? Promise.resolve([]),
    service.listCheckpoints?.() ?? Promise.resolve([]),
    service.loadSession?.() ?? Promise.resolve({ version: 1 as const, messages: [] }),
  ]);

  return {
    pendingChangeSets: pendingChangeSets.slice(0, 5),
    checkpoints: checkpoints.slice(0, 5),
    verificationResults: approvedVerificationResults(session.messages).slice(0, 5),
  };
}

function formatGitWorkflowContextBlock(context: GitWorkflowContext): string[] {
  const remoteLines = context.remotes.length > 0
    ? context.remotes.map((remote) => `Remote: ${remote.name} ${remote.url} (${remote.purposes.join(', ')})`)
    : ['Remote: none detected'];
  const dirtyLines = context.dirtyFiles.length > 0
    ? context.dirtyFiles.map((file) => `- ${file.status} ${file.path}`)
    : ['- clean'];
  const upstream = context.upstream || 'none';

  return [
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
  ];
}

async function collectContextForCommand(
  api: GitWorkflowApi,
  workspacePath: string,
  commandRunner: GitWorkflowCommandRunner,
  failurePrefix: string,
): Promise<GitWorkflowContext | null> {
  let context: GitWorkflowContext | null;
  try {
    context = await collectGitWorkflowContext(workspacePath, commandRunner);
  } catch (err) {
    api.window.showWarningMessage(`${failurePrefix}: ${errorMessage(err)}`);
    return null;
  }

  if (!context) {
    api.window.showInformationMessage('No Git repository found for this workspace.');
    return null;
  }

  return context;
}

async function dispatchGitWorkflowPrompt(
  api: GitWorkflowApi,
  registration: GitWorkflowRegistration,
  revealVeyraView: () => Thenable<unknown> | Promise<unknown>,
  prompt: string,
  dispatchToView?: (text: string) => Promise<boolean>,
): Promise<void> {
  await revealVeyraView();
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
}

async function explicitCiPrOutput(api: GitWorkflowApi): Promise<string> {
  let clipboardText = '';
  try {
    clipboardText = await api.env.clipboard.readText();
  } catch {
    clipboardText = '';
  }
  if (clipboardText.trim()) return clipboardText;

  return await api.window.showInputBox({
    title: 'Review CI/PR output',
    prompt: 'Paste CI logs, PR review notes, GitHub status output, or copied check details to send to Veyra.',
    placeHolder: 'Paste copied CI or PR output here',
    ignoreFocusOut: true,
  }) ?? '';
}

async function optionalCiPrOutput(api: GitWorkflowApi): Promise<string> {
  let clipboardText = '';
  try {
    clipboardText = await api.env.clipboard.readText();
  } catch {
    clipboardText = '';
  }
  if (clipboardText.trim()) return clipboardText;

  return await api.window.showInputBox({
    title: 'Prepare PR package draft',
    prompt: 'Optional: paste CI logs, PR review notes, GitHub status text, or check output to include.',
    placeHolder: 'Optional CI/PR output',
    ignoreFocusOut: true,
  }) ?? '';
}

function formatPrPackageContextBlock(evidence: PrPackageEvidence): string[] {
  const pendingLines = evidence.pendingChangeSets.length > 0
    ? evidence.pendingChangeSets.map((changeSet) => {
        const files = changeSet.files.map((file) => file.path).join(', ') || 'no files';
        return `- ${changeSet.id} ${changeSet.status} ${formatFileCount(changeSet.fileCount)}: ${files}`;
      })
    : [];
  const checkpointLines = evidence.checkpoints.length > 0
    ? evidence.checkpoints.map((checkpoint) =>
        `- ${checkpoint.id} ${checkpoint.status} ${checkpoint.source} "${checkpoint.label}" for ${formatFileCount(checkpoint.fileCount)}`
      )
    : [];
  const verificationLines = evidence.verificationResults.length > 0
    ? evidence.verificationResults.map((result) => `- ${result.command} -> exit ${result.exitStatus}`)
    : [];

  return [
    '[PR package context]',
    'Source: Explicit user-triggered local PR package draft',
    evidence.pendingChangeSets.length > 0 ? 'Pending change sets:' : 'Pending change sets: none recorded',
    ...pendingLines,
    evidence.checkpoints.length > 0 ? 'Checkpoints:' : 'Checkpoints: none recorded',
    ...checkpointLines,
    evidence.verificationResults.length > 0 ? 'Approved verification results:' : 'Approved verification results: none recorded',
    ...verificationLines,
    '[/PR package context]',
  ];
}

function formatFileCount(fileCount: number): string {
  return `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
}

function approvedVerificationResults(messages: SessionMessage[]): PrPackageVerificationResult[] {
  const results: PrPackageVerificationResult[] = [];
  for (const message of [...messages].reverse()) {
    if (message.role !== 'user') continue;
    if (!message.text.includes('Source: Approved Veyra verification command')) continue;
    const command = message.text.match(/^Command:\s*(.+)$/im)?.[1]?.trim() || 'unknown command';
    const exitStatus = message.text.match(/^Exit status:\s*(.+)$/im)?.[1]?.trim() || 'unknown';
    results.push({
      command,
      exitStatus,
      source: 'Approved Veyra verification command',
    });
  }
  return results;
}

function emptyPrPackageEvidence(): PrPackageEvidence {
  return {
    pendingChangeSets: [],
    checkpoints: [],
    verificationResults: [],
  };
}

function sanitizeUserProvidedWorkflowOutput(output: string): string {
  return redactSecrets(prepareTerminalOutputForPrompt(output));
}

function redactSecrets(value: string): string {
  return value
    .replace(/\b(https?:\/\/)([^:\s/@]+(?::[^@\s/]*)?)@/gi, '$1')
    .replace(/\bAuthorization:\s*(?:Bearer|token)\s+\S+/gi, 'Authorization: [redacted]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{8,}\b/g, '[redacted-token]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, '[redacted-token]');
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

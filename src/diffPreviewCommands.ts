import * as vscode from 'vscode';
import type { ChangeSetDiffInputs, RejectChangeSetResult } from './changeLedger.js';
import type { DispatchChangeSetSummary } from './shared/protocol.js';

export interface DiffPreviewCommandService {
  listPendingChangeSets(): Promise<DispatchChangeSetSummary[]>;
  changeSetDiffInputs(id: string, filePath: string): Promise<ChangeSetDiffInputs>;
  acceptChangeSet(id: string): Promise<DispatchChangeSetSummary>;
  rejectChangeSet(id: string): Promise<RejectChangeSetResult>;
  acceptChangeSetFile(id: string, filePath: string): Promise<DispatchChangeSetSummary>;
  rejectChangeSetFile(id: string, filePath: string): Promise<RejectChangeSetResult>;
}

type ServiceProvider = () => DiffPreviewCommandService | undefined;

interface ChangeSetQuickPickItem extends vscode.QuickPickItem {
  changeSet: DispatchChangeSetSummary;
}

interface ChangeSetFileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
}

type PickChangeSetFileOptions = {
  placeHolder?: string;
  unresolvedOnly?: boolean;
};

export function registerDiffPreviewCommands(
  context: vscode.ExtensionContext,
  getService: ServiceProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('veyra.openPendingChanges', async (changeSetId?: string, filePath?: string) => {
      await runDiffPreviewCommand(() => openPendingChanges(getService, changeSetId, filePath));
    }),
    vscode.commands.registerCommand('veyra.acceptPendingChanges', async (changeSetId?: string) => {
      await runDiffPreviewCommand(() => acceptPendingChanges(getService, changeSetId));
    }),
    vscode.commands.registerCommand('veyra.rejectPendingChanges', async (changeSetId?: string) => {
      await runDiffPreviewCommand(() => rejectPendingChanges(getService, changeSetId));
    }),
    vscode.commands.registerCommand('veyra.acceptPendingChangeFile', async (changeSetId?: string, filePath?: string) => {
      await runDiffPreviewCommand(() => acceptPendingChangeFile(getService, changeSetId, filePath));
    }),
    vscode.commands.registerCommand('veyra.rejectPendingChangeFile', async (changeSetId?: string, filePath?: string) => {
      await runDiffPreviewCommand(() => rejectPendingChangeFile(getService, changeSetId, filePath));
    }),
  );
}

async function openPendingChanges(
  getService: ServiceProvider,
  changeSetId?: string,
  filePath?: string,
): Promise<void> {
  const service = getActiveService(getService);
  if (!service) return;

  const selection = changeSetId
    ? { id: changeSetId, changeSet: undefined as DispatchChangeSetSummary | undefined }
    : await resolveChangeSetSelection(service);
  if (!selection) return;

  const selectedFilePath = filePath
    ?? (selection.changeSet
      ? await pickChangeSetFile(selection.changeSet)
      : await pickChangeSetFileById(service, selection.id));
  if (!selectedFilePath) return;

  const diff = await service.changeSetDiffInputs(selection.id, selectedFilePath);
  await vscode.commands.executeCommand(
    'vscode.diff',
    vscode.Uri.file(diff.beforePath),
    vscode.Uri.file(diff.afterPath),
    diff.title,
  );
}

async function acceptPendingChanges(
  getService: ServiceProvider,
  changeSetId?: string,
): Promise<void> {
  const service = getActiveService(getService);
  if (!service) return;

  const selection = changeSetId ? { id: changeSetId } : await resolveChangeSetSelection(service);
  if (!selection) return;

  const accepted = await service.acceptChangeSet(selection.id);
  vscode.window.showInformationMessage(formatChangeSetActionMessage('Accepted', accepted.fileCount));
}

async function rejectPendingChanges(
  getService: ServiceProvider,
  changeSetId?: string,
): Promise<void> {
  const service = getActiveService(getService);
  if (!service) return;

  const selection = changeSetId ? { id: changeSetId } : await resolveChangeSetSelection(service);
  if (!selection) return;

  const result = await service.rejectChangeSet(selection.id);
  if (result.status === 'stale') {
    vscode.window.showWarningMessage(
      `Veyra could not reject pending changes because files changed after the agent edit: ${result.staleFiles.join(', ')}.`,
    );
    return;
  }

  vscode.window.showInformationMessage(formatChangeSetActionMessage('Rejected', result.restoredFiles.length));
}

async function acceptPendingChangeFile(
  getService: ServiceProvider,
  changeSetId?: string,
  filePath?: string,
): Promise<void> {
  const service = getActiveService(getService);
  if (!service) return;

  const selection = changeSetId
    ? { id: changeSetId, changeSet: undefined as DispatchChangeSetSummary | undefined }
    : await resolveChangeSetSelection(service);
  if (!selection) return;

  const selectedFilePath = filePath
    ?? (selection.changeSet
      ? await pickChangeSetFile(selection.changeSet, { placeHolder: 'Select a file to accept', unresolvedOnly: true })
      : await pickChangeSetFileById(service, selection.id, { placeHolder: 'Select a file to accept', unresolvedOnly: true }));
  if (!selectedFilePath) return;

  await service.acceptChangeSetFile(selection.id, selectedFilePath);
  vscode.window.showInformationMessage(`Accepted Veyra pending change for ${selectedFilePath}.`);
}

async function rejectPendingChangeFile(
  getService: ServiceProvider,
  changeSetId?: string,
  filePath?: string,
): Promise<void> {
  const service = getActiveService(getService);
  if (!service) return;

  const selection = changeSetId
    ? { id: changeSetId, changeSet: undefined as DispatchChangeSetSummary | undefined }
    : await resolveChangeSetSelection(service);
  if (!selection) return;

  const selectedFilePath = filePath
    ?? (selection.changeSet
      ? await pickChangeSetFile(selection.changeSet, { placeHolder: 'Select a file to reject', unresolvedOnly: true })
      : await pickChangeSetFileById(service, selection.id, { placeHolder: 'Select a file to reject', unresolvedOnly: true }));
  if (!selectedFilePath) return;

  const result = await service.rejectChangeSetFile(selection.id, selectedFilePath);
  if (result.status === 'stale') {
    vscode.window.showWarningMessage(
      `Veyra could not reject ${selectedFilePath} because it changed after the agent edit.`,
    );
    return;
  }

  vscode.window.showInformationMessage(`Rejected Veyra pending change for ${selectedFilePath}.`);
}

function getActiveService(getService: ServiceProvider): DiffPreviewCommandService | undefined {
  const service = getService();
  if (!service) {
    vscode.window.showWarningMessage('Open a workspace folder before using Veyra pending changes.');
  }
  return service;
}

async function resolveChangeSetSelection(
  service: DiffPreviewCommandService,
): Promise<{ id: string; changeSet: DispatchChangeSetSummary } | undefined> {
  const changeSet = await pickChangeSet(service);
  return changeSet ? { id: changeSet.id, changeSet } : undefined;
}

async function pickChangeSet(
  service: DiffPreviewCommandService,
): Promise<DispatchChangeSetSummary | undefined> {
  const pending = await service.listPendingChangeSets();
  if (pending.length === 0) {
    vscode.window.showInformationMessage('No Veyra pending changes to review.');
    return undefined;
  }
  if (pending.length === 1) return pending[0];

  const selected = await vscode.window.showQuickPick(
    pending.map((changeSet): ChangeSetQuickPickItem => ({
      label: `${changeSet.agentId}: ${formatFileCount(changeSet.fileCount)}`,
      description: changeSet.readOnly ? 'read-only workflow edit' : undefined,
      detail: changeSet.files.map((file) => file.path).join(', '),
      changeSet,
    })),
    { placeHolder: 'Select Veyra pending changes' },
  );
  return selected?.changeSet;
}

async function pickChangeSetFile(
  changeSet: DispatchChangeSetSummary,
  options: PickChangeSetFileOptions = {},
): Promise<string | undefined> {
  const files = options.unresolvedOnly
    ? changeSet.files.filter(isUnresolvedFile)
    : changeSet.files;
  if (files.length === 0) {
    vscode.window.showInformationMessage('Selected Veyra change set has no files to review.');
    return undefined;
  }
  if (files.length === 1) return files[0].path;

  const selected = await vscode.window.showQuickPick(
    files.map((file): ChangeSetFileQuickPickItem => ({
      label: file.path,
      description: file.status && file.status !== 'pending'
        ? `${file.changeKind} - ${file.status}`
        : file.changeKind,
      filePath: file.path,
    })),
    { placeHolder: options.placeHolder ?? 'Select a file to diff' },
  );
  return selected?.filePath;
}

async function pickChangeSetFileById(
  service: DiffPreviewCommandService,
  changeSetId: string,
  options: PickChangeSetFileOptions = {},
): Promise<string | undefined> {
  const pending = await service.listPendingChangeSets();
  const changeSet = pending.find((entry) => entry.id === changeSetId);
  if (!changeSet) {
    vscode.window.showWarningMessage(`Veyra pending change set ${changeSetId} was not found.`);
    return undefined;
  }
  return pickChangeSetFile(changeSet, options);
}

function isUnresolvedFile(file: DispatchChangeSetSummary['files'][number]): boolean {
  return !file.status || file.status === 'pending' || file.status === 'stale';
}

async function runDiffPreviewCommand(command: () => Promise<void>): Promise<void> {
  try {
    await command();
  } catch (err) {
    vscode.window.showErrorMessage(`Veyra pending changes command failed: ${errorMessage(err)}`);
  }
}

function formatChangeSetActionMessage(action: 'Accepted' | 'Rejected', fileCount: number): string {
  return `${action} Veyra pending changes for ${formatFileCount(fileCount)}.`;
}

function formatFileCount(fileCount: number): string {
  return `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

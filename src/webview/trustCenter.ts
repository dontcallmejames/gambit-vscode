import type { AgentId } from '../types.js';
import type {
  CheckpointSummary,
  DispatchChangeSetFileSummary,
  DispatchChangeSetSummary,
  FileChangeKind,
  SessionMessage,
  SystemMessage,
  WorkflowStateKind,
} from '../shared/protocol.js';
import type { WebviewState } from './state.js';

export type TrustCenterVerificationState = 'passed' | 'failed' | 'unknown';

export type TrustCenterFileSignal = {
  path: string;
  timestamp: number;
  agentId?: AgentId;
  changeKind?: FileChangeKind;
  text?: string;
};

export type TrustCenterWorkflowWarning = {
  kind: WorkflowStateKind;
  label: string;
  text: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
  agentId?: AgentId;
  filePath?: string;
};

export type TrustCenterSnapshot = {
  hasSignals: boolean;
  pendingChangeCount: number;
  pendingChangeSetCount: number;
  checkpointCount: number;
  editConflictCount: number;
  workflowWarningCount: number;
  fileEditCount: number;
  verificationState: TrustCenterVerificationState | null;
  gitWorkflowPresent: boolean;
  ciPrWorkflowPresent: boolean;
  prPackageWorkflowPresent: boolean;
  browserTestingPresent: boolean;
  latestPendingChangeSet: DispatchChangeSetSummary | null;
  latestAvailableCheckpoint: CheckpointSummary | null;
  pendingFiles: DispatchChangeSetFileSummary[];
  recentFileEdits: TrustCenterFileSignal[];
  recentConflicts: TrustCenterFileSignal[];
  recentWorkflowWarnings: TrustCenterWorkflowWarning[];
};

const INACTIVE_CHANGE_STATUSES = new Set(['accepted', 'rejected', 'resolved']);

export function buildTrustCenterSnapshot(state: WebviewState): TrustCenterSnapshot {
  const messages = state.session.messages;
  const changeSets = latestChangeSets(messages);
  const pendingChangeSets = changeSets.filter((changeSet) =>
    !INACTIVE_CHANGE_STATUSES.has(changeSet.status)
    && pendingFiles(changeSet).length > 0
  );
  const latestPendingChangeSet = pendingChangeSets[0] ?? null;
  const checkpoints = availableCheckpoints(messages);
  const recentFileEdits = fileSignals(messages, 'file-edited');
  const recentConflicts = fileSignals(messages, 'edit-conflict');
  const recentWorkflowWarnings = workflowWarnings(messages);
  const verificationState = approvedVerificationState(messages);
  const gitWorkflowPresent = messages.some((message) =>
    message.role === 'user' && message.text.includes('[Git workflow context]')
  );
  const ciPrWorkflowPresent = messages.some((message) =>
    message.role === 'user' && message.text.includes('[CI/PR context]')
  );
  const prPackageWorkflowPresent = messages.some((message) =>
    message.role === 'user' && message.text.includes('[PR package context]')
  );
  const browserTestingPresent = messages.some((message) =>
    message.role === 'user' && message.text.includes('[Browser testing context]')
  );
  const pendingChangeCount = pendingChangeSets.reduce((total, changeSet) => total + pendingFiles(changeSet).length, 0);
  const checkpointCount = checkpoints.length;
  const editConflictCount = recentConflicts.length;
  const workflowWarningCount = recentWorkflowWarnings.length;
  const fileEditCount = recentFileEdits.length;

  return {
    hasSignals: pendingChangeCount > 0
      || checkpointCount > 0
      || editConflictCount > 0
      || workflowWarningCount > 0
      || fileEditCount > 0
      || verificationState !== null
      || gitWorkflowPresent
      || ciPrWorkflowPresent
      || prPackageWorkflowPresent
      || browserTestingPresent,
    pendingChangeCount,
    pendingChangeSetCount: pendingChangeSets.length,
    checkpointCount,
    editConflictCount,
    workflowWarningCount,
    fileEditCount,
    verificationState,
    gitWorkflowPresent,
    ciPrWorkflowPresent,
    prPackageWorkflowPresent,
    browserTestingPresent,
    latestPendingChangeSet,
    latestAvailableCheckpoint: checkpoints[0] ?? null,
    pendingFiles: latestPendingChangeSet ? pendingFiles(latestPendingChangeSet) : [],
    recentFileEdits,
    recentConflicts,
    recentWorkflowWarnings,
  };
}

function latestChangeSets(messages: SessionMessage[]): DispatchChangeSetSummary[] {
  const latestById = new Map<string, DispatchChangeSetSummary>();
  for (const message of messages) {
    if (message.role === 'system' && message.kind === 'change-set' && message.changeSet) {
      latestById.set(message.changeSet.id, message.changeSet);
    }
  }
  return Array.from(latestById.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function pendingFiles(changeSet: DispatchChangeSetSummary): DispatchChangeSetFileSummary[] {
  return changeSet.files.filter((file) => !file.status || !INACTIVE_CHANGE_STATUSES.has(file.status));
}

function availableCheckpoints(messages: SessionMessage[]): CheckpointSummary[] {
  const latestById = new Map<string, CheckpointSummary>();
  for (const message of messages) {
    if (message.role === 'system' && message.kind === 'checkpoint' && message.checkpoint) {
      latestById.set(message.checkpoint.id, message.checkpoint);
    }
  }
  return Array.from(latestById.values())
    .filter((checkpoint) => checkpoint.status === 'available')
    .sort((a, b) => b.timestamp - a.timestamp);
}

function fileSignals(messages: SessionMessage[], kind: 'file-edited' | 'edit-conflict'): TrustCenterFileSignal[] {
  return messages
    .filter((message): message is SystemMessage => (
      message.role === 'system'
      && message.kind === kind
      && Boolean(message.filePath)
    ))
    .map((message) => ({
      path: message.filePath!,
      timestamp: message.timestamp,
      agentId: message.agentId,
      changeKind: message.changeKind,
      text: message.text,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 4);
}

function workflowWarnings(messages: SessionMessage[]): TrustCenterWorkflowWarning[] {
  return messages
    .filter((message): message is SystemMessage => message.role === 'system' && Boolean(message.workflowState))
    .map((message) => ({
      kind: message.workflowState!.kind,
      label: workflowStateLabel(message.workflowState!.kind),
      text: message.workflowState!.text,
      severity: message.workflowState!.severity,
      timestamp: message.timestamp,
      agentId: message.workflowState!.agentId,
      filePath: message.workflowState!.filePath,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 4);
}

function workflowStateLabel(kind: WorkflowStateKind): string {
  if (kind === 'stalled') return 'Stalled';
  if (kind === 'watchdog-released') return 'Watchdog released';
  if (kind === 'read-only-violation') return 'Read-only violation';
  if (kind === 'edit-conflict') return 'Edit conflict';
  return 'No observed inspection evidence';
}

function approvedVerificationState(messages: SessionMessage[]): TrustCenterVerificationState | null {
  const latest = [...messages].reverse().find((message) =>
    message.role === 'user'
    && message.text.includes('Source: Approved Veyra verification command')
    && /Exit status:/iu.test(message.text)
  );
  if (!latest || latest.role !== 'user') return null;
  const match = latest.text.match(/Exit status:\s*([^\r\n]+)/iu);
  const status = match?.[1]?.trim().toLowerCase();
  if (!status || status === 'unknown') return 'unknown';
  return status === '0' ? 'passed' : 'failed';
}

import { h } from 'preact';
import { PanelSection } from './PanelSection.js';
import type { FromWebview, VeyraCommandActionId } from '../../shared/protocol.js';
import type { TrustCenterSnapshot } from '../trustCenter.js';
import { AgentMarker } from './AgentMarker.js';

type TrustCenterProps = {
  snapshot: TrustCenterSnapshot;
  send: (message: FromWebview) => void;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
};

export function TrustCenter({ snapshot, send, expanded = true, onToggle }: TrustCenterProps) {
  return (
    <PanelSection
      kind="trust"
      kicker="Trust Center"
      label={snapshot.hasSignals ? 'Observed by Veyra' : 'No active trust signals'}
      ariaLabel="Trust Center"
      state={snapshot.hasSignals ? 'active' : 'empty'}
      collapsed={!expanded}
      onToggleCollapse={() => onToggle?.(!expanded)}
      bodyId="veyra-trust-center-body"
      bodyClass="trust-center-grid"
      summary={(
        <>
          {snapshot.pendingChangeCount > 0 && <span>{plural(snapshot.pendingChangeCount, 'pending file')}</span>}
          {snapshot.checkpointCount > 0 && <span>{`${plural(snapshot.checkpointCount, 'checkpoint')} available`}</span>}
          {snapshot.verificationState && <span>{`verification ${snapshot.verificationState}`}</span>}
          {snapshot.gitWorkflowPresent && <span>Git context</span>}
          {snapshot.ciPrWorkflowPresent && <span>CI/PR context</span>}
          {snapshot.prPackageWorkflowPresent && <span>PR package</span>}
          {snapshot.browserTestingPresent && <span>browser/test context</span>}
          {snapshot.editConflictCount > 0 && <span>{plural(snapshot.editConflictCount, 'edit conflict')}</span>}
          {snapshot.workflowWarningCount > 0 && <span>{plural(snapshot.workflowWarningCount, 'workflow warning')}</span>}
        </>
      )}
    >
        <section class="trust-panel trust-panel-changes">
          <div class="trust-panel-head">
            <span>Pending Changes</span>
            <span>{snapshot.pendingChangeCount > 0 ? plural(snapshot.pendingChangeCount, 'file') : 'clear'}</span>
          </div>
          {snapshot.latestPendingChangeSet ? (
            <>
              <div class="trust-actions">
                <button type="button" onClick={() => send({ kind: 'open-change-set-diff', changeSetId: snapshot.latestPendingChangeSet!.id })}>
                  Open pending changes
                </button>
                <button type="button" onClick={() => send({ kind: 'accept-change-set', changeSetId: snapshot.latestPendingChangeSet!.id })}>
                  Accept pending changes
                </button>
                <button type="button" onClick={() => send({ kind: 'reject-change-set', changeSetId: snapshot.latestPendingChangeSet!.id })}>
                  Reject pending changes
                </button>
              </div>
              <div class="trust-file-list">
                {snapshot.pendingFiles.map((file) => (
                  <div class="trust-file-row" key={`${snapshot.latestPendingChangeSet!.id}-${file.path}`}>
                    <span class="trust-file-path">{file.path}</span>
                    <span class="trust-file-kind">{file.changeKind}</span>
                    <div class="trust-row-actions">
                      <button
                        type="button"
                        onClick={() => send({
                          kind: 'open-change-set-diff',
                          changeSetId: snapshot.latestPendingChangeSet!.id,
                          filePath: file.path,
                        })}
                      >
                        {`Open ${file.path}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => send({
                          kind: 'accept-change-set-file',
                          changeSetId: snapshot.latestPendingChangeSet!.id,
                          filePath: file.path,
                        })}
                      >
                        {`Accept ${file.path}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => send({
                          kind: 'reject-change-set-file',
                          changeSetId: snapshot.latestPendingChangeSet!.id,
                          filePath: file.path,
                        })}
                      >
                        {`Reject ${file.path}`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p class="trust-muted">No pending file decisions.</p>
          )}
        </section>

        <section class="trust-panel">
          <div class="trust-panel-head">
            <span>Recovery</span>
            <span>{snapshot.latestAvailableCheckpoint ? snapshot.latestAvailableCheckpoint.label : 'manual'}</span>
          </div>
          <div class="trust-actions">
            <button type="button" onClick={() => send({ kind: 'create-checkpoint' })}>Create checkpoint</button>
            {snapshot.latestAvailableCheckpoint && (
              <button type="button" onClick={() => send({ kind: 'rollback-latest-checkpoint' })}>Roll back latest</button>
            )}
          </div>
        </section>

        <section class="trust-panel">
          <div class="trust-panel-head">
            <span>Verification</span>
            <span>{snapshot.verificationState ? `approved ${snapshot.verificationState}` : 'user approved'}</span>
          </div>
          <p class="trust-muted">Veyra only records verification after an explicit approved run.</p>
          <div class="trust-actions">
            <CommandButton command="veyra.runVerificationCommand" send={send}>Run verification</CommandButton>
            <CommandButton command="veyra.reviewBrowserTestOutput" send={send}>Review browser/test</CommandButton>
            <CommandButton command="veyra.summarizeGitStatus" send={send}>Summarize Git</CommandButton>
            <CommandButton command="veyra.reviewCiWorkflowOutput" send={send}>Review CI/PR</CommandButton>
            <CommandButton command="veyra.preparePrPackageDraft" send={send}>Prepare PR draft</CommandButton>
            <CommandButton command="veyra.copyDiagnosticReport" send={send}>Copy diagnostics</CommandButton>
          </div>
        </section>

        <section class="trust-panel">
          <div class="trust-panel-head">
            <span>Files and conflicts</span>
            <span>{snapshot.fileEditCount + snapshot.editConflictCount > 0 ? 'observed' : 'quiet'}</span>
          </div>
          {snapshot.recentConflicts.length > 0 && (
            <div class="trust-signal-list">
              {snapshot.recentConflicts.map((conflict) => (
                <button
                  type="button"
                  class="trust-file-link trust-conflict-link"
                  key={`conflict-${conflict.timestamp}-${conflict.path}`}
                  onClick={() => send({ kind: 'open-workspace-file', relativePath: conflict.path })}
                >
                  {`Conflict: ${conflict.path}`}
                </button>
              ))}
            </div>
          )}
          {snapshot.recentFileEdits.length > 0 ? (
            <div class="trust-signal-list">
              {snapshot.recentFileEdits.map((edit) => (
                <button
                  type="button"
                  class="trust-file-link"
                  key={`edit-${edit.timestamp}-${edit.path}`}
                  onClick={() => send({ kind: 'open-workspace-file', relativePath: edit.path })}
                >
                  {`${edit.changeKind ?? 'edited'} ${edit.path}`}
                </button>
              ))}
            </div>
          ) : snapshot.recentConflicts.length === 0 ? (
            <p class="trust-muted">No recent file edits or conflicts.</p>
          ) : null}
        </section>

        <section class="trust-panel">
          <div class="trust-panel-head">
            <span>Workflow state</span>
            <span>{snapshot.workflowWarningCount > 0 ? plural(snapshot.workflowWarningCount, 'warning') : 'clear'}</span>
          </div>
          {snapshot.recentWorkflowWarnings.length > 0 ? (
            <div class="trust-signal-list">
              {snapshot.recentWorkflowWarnings.map((warning) => (
                <div
                  class={`trust-workflow-warning trust-workflow-warning-${warning.severity}`}
                  key={`${warning.kind}-${warning.timestamp}-${warning.agentId ?? 'workflow'}`}
                  title={warning.text}
                >
                  <span>{warning.label}</span>
                  {warning.agentId && (
                    <span class="trust-workflow-warning-agent">
                      <AgentMarker agentId={warning.agentId} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p class="trust-muted">No workflow state warnings.</p>
          )}
        </section>
    </PanelSection>
  );
}

function CommandButton({
  command,
  children,
  send,
}: {
  command: VeyraCommandActionId;
  children: string;
  send: (message: FromWebview) => void;
}) {
  return (
    <button type="button" onClick={() => send({ kind: 'run-command', command })}>
      {children}
    </button>
  );
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

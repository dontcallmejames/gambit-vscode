import { describe, expect, it, vi } from "vitest";
import { h, type VNode } from "preact";
import { buildTrustCenterSnapshot } from "../src/webview/trustCenter.js";
import { TrustCenter } from "../src/webview/components/TrustCenter.js";
import { initialState, reduce } from "../src/webview/state.js";
import type { FromWebview, SystemMessage, UserMessage } from "../src/shared/protocol.js";

vi.stubGlobal("React", { createElement: h });

// PanelSection renders <Icon>, which uses hooks; stub them so the panel can be
// rendered synchronously in tests.
vi.mock("preact/hooks", () => ({
  useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, vi.fn()],
  useEffect: vi.fn(),
}));

function pendingChangeSetNotice(status: "pending" | "accepted" = "pending"): SystemMessage {
  return {
    id: `change-set-${status}`,
    role: "system",
    agentId: "codex",
    timestamp: status === "pending" ? 10 : 20,
    text: "Codex changed 2 files. Review pending changes before continuing.",
    kind: "change-set",
    changeSet: {
      id: "change-set-1",
      agentId: "codex",
      messageId: `change-set-${status}`,
      timestamp: status === "pending" ? 10 : 20,
      readOnly: false,
      status,
      fileCount: 2,
      files: [
        { path: "src/parser.ts", status, changeKind: "edited" },
        { path: "src/parser.test.ts", status, changeKind: "created" },
      ],
    },
  };
}

function checkpointNotice(): SystemMessage {
  return {
    id: "checkpoint-1",
    role: "system",
    timestamp: 30,
    text: "Checkpoint saved: Before Codex dispatch.",
    kind: "checkpoint",
    checkpoint: {
      id: "checkpoint-1",
      timestamp: 30,
      source: "automatic",
      status: "available",
      label: "Before Codex dispatch",
      promptSummary: "Before Codex dispatch",
      fileCount: 2,
    },
  };
}

function editConflictNotice(): SystemMessage {
  return {
    id: "conflict-1",
    role: "system",
    agentId: "codex",
    timestamp: 40,
    text: "Codex changed src/parser.ts while you were editing it.",
    kind: "edit-conflict",
    filePath: "src/parser.ts",
  };
}

function workflowNotice(
  kind: NonNullable<SystemMessage["workflowState"]>["kind"],
  text: string,
  timestamp: number,
  agentId: NonNullable<SystemMessage["workflowState"]>["agentId"] = "gemini",
): SystemMessage {
  return {
    id: `workflow-${kind}-${timestamp}`,
    role: "system",
    agentId,
    timestamp,
    text,
    kind: kind === "read-only-violation" ? "error" : "warning",
    workflowState: {
      kind,
      severity: kind === "read-only-violation" ? "error" : "warning",
      agentId,
      text,
    },
  };
}

function userMessage(text: string): UserMessage {
  return {
    id: `user-${text.length}`,
    role: "user",
    timestamp: 50,
    text,
  };
}

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  const vnode = node as VNode;
  if (typeof vnode.type === "function") return flattenText((vnode.type as any)(vnode.props));
  return flattenText(vnode.props?.children);
}

function findButtons(node: unknown): Array<VNode & { props: { onClick?: () => void; children?: unknown } }> {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [];
  if (Array.isArray(node)) return node.flatMap(findButtons);
  const vnode = node as VNode;
  if (typeof vnode.type === "function") return findButtons((vnode.type as any)(vnode.props));
  const self = vnode.type === "button" ? [vnode as VNode & { props: { onClick?: () => void; children?: unknown } }] : [];
  return [...self, ...findButtons(vnode.props?.children)];
}

function clickButton(node: unknown, label: string): void {
  const button = findButtons(node).find((candidate) => flattenText(candidate) === label);
  expect(button, `button ${label}`).toBeTruthy();
  button?.props.onClick?.();
}

describe("buildTrustCenterSnapshot", () => {
  it("returns an empty persistent state when no trust signals exist", () => {
    const snapshot = buildTrustCenterSnapshot(initialState());

    expect(snapshot.hasSignals).toBe(false);
    expect(snapshot.pendingChangeCount).toBe(0);
    expect(snapshot.pendingChangeSetCount).toBe(0);
    expect(snapshot.checkpointCount).toBe(0);
    expect(snapshot.editConflictCount).toBe(0);
    expect(snapshot.fileEditCount).toBe(0);
    expect(snapshot.verificationState).toBeNull();
    expect(snapshot.gitWorkflowPresent).toBe(false);
    expect(snapshot.ciPrWorkflowPresent).toBe(false);
    expect(snapshot.prPackageWorkflowPresent).toBe(false);
    expect(snapshot.browserTestingPresent).toBe(false);
  });

  it("derives trust signals from existing session messages", () => {
    let state = initialState();
    state = reduce(state, { kind: "system-message", message: pendingChangeSetNotice() });
    state = reduce(state, { kind: "system-message", message: checkpointNotice() });
    state = reduce(state, {
      kind: "file-edited",
      agentId: "codex",
      path: "src/parser.ts",
      timestamp: 35,
      changeKind: "edited",
    });
    state = reduce(state, { kind: "system-message", message: editConflictNotice() });
    state = reduce(state, {
      kind: "user-message-appended",
      message: userMessage(
        [
          "Source: Approved Veyra verification command",
          "Command: npm test",
          "Exit status: 0",
          "[Git workflow context]",
          "Source: Explicit user-triggered local git status summary",
          "[CI/PR context]",
          "Source: Explicit user-provided CI or PR output",
          "[PR package context]",
          "Source: Explicit user-triggered local PR package draft",
          "[Browser testing context]",
          "Source: Explicit user-provided browser/test output",
        ].join("\n"),
      ),
    });

    const snapshot = buildTrustCenterSnapshot(state);

    expect(snapshot.hasSignals).toBe(true);
    expect(snapshot.pendingChangeCount).toBe(2);
    expect(snapshot.pendingChangeSetCount).toBe(1);
    expect(snapshot.latestPendingChangeSet?.id).toBe("change-set-1");
    expect(snapshot.checkpointCount).toBe(1);
    expect(snapshot.latestAvailableCheckpoint?.id).toBe("checkpoint-1");
    expect(snapshot.fileEditCount).toBe(1);
    expect(snapshot.recentFileEdits[0]?.path).toBe("src/parser.ts");
    expect(snapshot.editConflictCount).toBe(1);
    expect(snapshot.recentConflicts[0]?.path).toBe("src/parser.ts");
    expect(snapshot.verificationState).toBe("passed");
    expect(snapshot.gitWorkflowPresent).toBe(true);
    expect(snapshot.ciPrWorkflowPresent).toBe(true);
    expect(snapshot.prPackageWorkflowPresent).toBe(true);
    expect(snapshot.browserTestingPresent).toBe(true);
  });

  it("derives workflow-state notices as trust signals", () => {
    let state = initialState();
    state = reduce(state, {
      kind: "system-message",
      message: workflowNotice("read-only-violation", "Read-only workflow violation: Gemini edited docs/review.md.", 60),
    });
    state = reduce(state, {
      kind: "system-message",
      message: workflowNotice("low-evidence-output", "No observed inspection evidence from Claude.", 61, "claude"),
    });

    const snapshot = buildTrustCenterSnapshot(state);

    expect(snapshot.hasSignals).toBe(true);
    expect(snapshot.workflowWarningCount).toBe(2);
    expect(snapshot.recentWorkflowWarnings).toEqual([
      expect.objectContaining({
        kind: "low-evidence-output",
        label: "No observed inspection evidence",
        agentId: "claude",
      }),
      expect.objectContaining({
        kind: "read-only-violation",
        label: "Read-only violation",
        agentId: "gemini",
      }),
    ]);
  });

  it("uses the latest change-set notice so resolved inline notices do not drift", () => {
    let state = initialState();
    state = reduce(state, { kind: "system-message", message: pendingChangeSetNotice("pending") });
    state = reduce(state, {
      kind: "change-set-updated",
      changeSet: pendingChangeSetNotice("accepted").changeSet!,
      text: "Codex changed 2 files. Changes accepted.",
    });

    const snapshot = buildTrustCenterSnapshot(state);

    expect(snapshot.pendingChangeCount).toBe(0);
    expect(snapshot.pendingChangeSetCount).toBe(0);
    expect(snapshot.latestPendingChangeSet).toBeNull();
  });
});

describe("TrustCenter", () => {
  it("renders observed trust signals and routes through existing webview actions", () => {
    let state = initialState();
    state = reduce(state, { kind: "system-message", message: pendingChangeSetNotice() });
    state = reduce(state, { kind: "system-message", message: checkpointNotice() });
    state = reduce(state, { kind: "system-message", message: editConflictNotice() });
    state = reduce(state, {
      kind: "user-message-appended",
      message: userMessage("Source: Approved Veyra verification command\nExit status: 1\n[Git workflow context]\n[CI/PR context]\n[PR package context]\n[Browser testing context]"),
    });
    const sent: FromWebview[] = [];
    const vnode = TrustCenter({
      snapshot: buildTrustCenterSnapshot(state),
      send: (message) => sent.push(message),
    });
    const text = flattenText(vnode);

    expect(text).toContain("Trust Center");
    expect(text).toContain("Observed by Veyra");
    expect(text).toContain("2 pending files");
    expect(text).toContain("verification failed");
    expect(text).toContain("Git context");
    expect(text).toContain("CI/PR context");
    expect(text).toContain("PR package");
    expect(text).toContain("browser/test context");
    expect(text).toContain("1 edit conflict");

    clickButton(vnode, "Open pending changes");
    clickButton(vnode, "Accept pending changes");
    clickButton(vnode, "Reject pending changes");
    clickButton(vnode, "Open src/parser.ts");
    clickButton(vnode, "Accept src/parser.ts");
    clickButton(vnode, "Reject src/parser.ts");
    clickButton(vnode, "Create checkpoint");
    clickButton(vnode, "Roll back latest");
    clickButton(vnode, "Run verification");
    clickButton(vnode, "Review browser/test");
    clickButton(vnode, "Summarize Git");
    clickButton(vnode, "Review CI/PR");
    clickButton(vnode, "Prepare PR draft");
    clickButton(vnode, "Copy diagnostics");

    expect(sent).toEqual([
      { kind: "open-change-set-diff", changeSetId: "change-set-1" },
      { kind: "accept-change-set", changeSetId: "change-set-1" },
      { kind: "reject-change-set", changeSetId: "change-set-1" },
      { kind: "open-change-set-diff", changeSetId: "change-set-1", filePath: "src/parser.ts" },
      { kind: "accept-change-set-file", changeSetId: "change-set-1", filePath: "src/parser.ts" },
      { kind: "reject-change-set-file", changeSetId: "change-set-1", filePath: "src/parser.ts" },
      { kind: "create-checkpoint" },
      { kind: "rollback-latest-checkpoint" },
      { kind: "run-command", command: "veyra.runVerificationCommand" },
      { kind: "run-command", command: "veyra.reviewBrowserTestOutput" },
      { kind: "run-command", command: "veyra.summarizeGitStatus" },
      { kind: "run-command", command: "veyra.reviewCiWorkflowOutput" },
      { kind: "run-command", command: "veyra.preparePrPackageDraft" },
      { kind: "run-command", command: "veyra.copyDiagnosticReport" },
    ]);
  });

  it("renders workflow-state notices without adding new actions", () => {
    let state = initialState();
    state = reduce(state, {
      kind: "system-message",
      message: workflowNotice("edit-conflict", "Edit conflict: Codex and Gemini touched the same file.", 60, "codex"),
    });
    state = reduce(state, {
      kind: "system-message",
      message: workflowNotice("low-evidence-output", "No observed inspection evidence from Gemini.", 61, "gemini"),
    });
    const sent: FromWebview[] = [];

    const vnode = TrustCenter({
      snapshot: buildTrustCenterSnapshot(state),
      send: (message) => sent.push(message),
    });
    const text = flattenText(vnode);

    expect(text).toContain("2 workflow warnings");
    expect(text).toContain("Workflow state");
    expect(text).toContain("Edit conflict");
    expect(text).toContain("No observed inspection evidence");
    expect(sent).toEqual([]);
  });

  it("keeps an empty fallback inspectable with manual safety actions", () => {
    const sent: FromWebview[] = [];
    const vnode = TrustCenter({
      snapshot: buildTrustCenterSnapshot(initialState()),
      send: (message) => sent.push(message),
    });

    expect(flattenText(vnode)).toContain("No active trust signals");

    clickButton(vnode, "Create checkpoint");
    clickButton(vnode, "Run verification");
    clickButton(vnode, "Review browser/test");
    clickButton(vnode, "Summarize Git");
    clickButton(vnode, "Review CI/PR");
    clickButton(vnode, "Prepare PR draft");
    clickButton(vnode, "Copy diagnostics");

    expect(sent).toEqual([
      { kind: "create-checkpoint" },
      { kind: "run-command", command: "veyra.runVerificationCommand" },
      { kind: "run-command", command: "veyra.reviewBrowserTestOutput" },
      { kind: "run-command", command: "veyra.summarizeGitStatus" },
      { kind: "run-command", command: "veyra.reviewCiWorkflowOutput" },
      { kind: "run-command", command: "veyra.preparePrPackageDraft" },
      { kind: "run-command", command: "veyra.copyDiagnosticReport" },
    ]);
  });
});

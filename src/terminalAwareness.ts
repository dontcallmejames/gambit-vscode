import type {
  VeyraDispatchEventSink,
  VeyraDispatchRequest,
} from './veyraService.js';
import {
  ProjectCommandProvider,
  type ProjectCommandHint,
  type ProjectCommandHintsResult,
} from './projectCommands.js';

const DEFAULT_TERMINAL_OUTPUT_MAX_CHARS = 12_000;
export const DIAGNOSE_TERMINAL_OUTPUT_COMMAND = 'veyra.diagnoseTerminalOutput';
export const RUN_VERIFICATION_COMMAND = 'veyra.runVerificationCommand';
const RUN_VERIFICATION_APPROVAL = 'Run command';
const SHELL_INTEGRATION_TIMEOUT_MS = 5_000;

interface VerificationQuickPickItem {
  label: string;
  description: string;
  detail: string;
  hint: ProjectCommandHint;
}

export interface VerificationCommandProvider {
  retrieve(): Promise<ProjectCommandHintsResult>;
}

export interface VerificationResultPromptInput {
  command: string;
  exitCode: number | undefined;
  output: string;
  source: string;
  outputWasTruncated?: boolean;
}

export interface TerminalLike {
  shellIntegration?: TerminalShellIntegrationLike;
  show(preserveFocus?: boolean): void;
}

export interface TerminalShellIntegrationLike {
  executeCommand(commandLine: string): TerminalShellExecutionLike;
}

export interface TerminalShellExecutionLike {
  read(): AsyncIterable<string>;
}

export interface TerminalShellIntegrationChangeEventLike {
  terminal: TerminalLike;
  shellIntegration: TerminalShellIntegrationLike;
}

export interface TerminalShellExecutionEndEventLike {
  terminal: TerminalLike;
  execution: TerminalShellExecutionLike;
  exitCode: number | undefined;
}

export interface TerminalAwarenessRegistration {
  workspacePath: string;
  service: {
    dispatch(request: VeyraDispatchRequest, emit: VeyraDispatchEventSink): Promise<void>;
  };
}

export interface TerminalAwarenessApi {
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): { dispose(): void };
  };
  env: {
    clipboard: {
      readText(): Thenable<string>;
    };
  };
  window: {
    createTerminal?(options: { name: string; cwd: string }): TerminalLike;
    onDidChangeTerminalShellIntegration?(
      listener: (event: TerminalShellIntegrationChangeEventLike) => unknown,
    ): { dispose(): void };
    onDidEndTerminalShellExecution?(
      listener: (event: TerminalShellExecutionEndEventLike) => unknown,
    ): { dispose(): void };
    showErrorMessage(message: string): Thenable<string | undefined> | unknown;
    showInformationMessage(message: string): Thenable<string | undefined> | unknown;
    showInputBox(options: {
      title?: string;
      prompt?: string;
      placeHolder?: string;
      ignoreFocusOut?: boolean;
    }): Thenable<string | undefined>;
    showQuickPick?(
      items: readonly VerificationQuickPickItem[],
      options?: { title?: string; placeHolder?: string; ignoreFocusOut?: boolean },
    ): Thenable<VerificationQuickPickItem | undefined>;
    showWarningMessage(
      message: string,
      options?: { modal?: boolean },
      ...items: string[]
    ): Thenable<string | undefined> | unknown;
  };
}

export function prepareTerminalOutputForPrompt(
  output: string,
  maxChars = DEFAULT_TERMINAL_OUTPUT_MAX_CHARS,
): string {
  const trimmed = output.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;

  const tail = trimmed.slice(-maxChars).trimStart();
  const cleanTail = tail.includes('\n') ? tail.slice(tail.indexOf('\n') + 1).trimStart() : tail;

  return [
    `[Terminal output truncated to last ${maxChars} characters]`,
    cleanTail,
  ].join('\n');
}

export function formatTerminalDiagnosisPrompt(output: string): string {
  const terminalOutput = prepareTerminalOutputForPrompt(output);
  return [
    '@veyra /review Diagnose this terminal output.',
    '',
    'Explain the likely cause, identify the most useful next check, and call out whether the failure appears to be tests, lint, typecheck, build, runtime, or environment setup.',
    'Do not run commands unless the user explicitly approves the exact command.',
    'If a command would help, suggest it with a short reason and wait for approval.',
    '',
    '[Terminal context]',
    'Source: Explicit user-provided terminal output',
    terminalOutput,
    '[/Terminal context]',
  ].join('\n');
}

export function formatVerificationResultPrompt(input: VerificationResultPromptInput): string {
  const terminalOutput = prepareCapturedTerminalOutputForPrompt(
    input.output,
    DEFAULT_TERMINAL_OUTPUT_MAX_CHARS,
    input.outputWasTruncated === true,
  );
  const exitStatus = input.exitCode === undefined ? 'unknown' : String(input.exitCode);
  return [
    '@veyra /review Review this verification result.',
    '',
    'Explain whether the verification passed, identify the failing area if it failed, and recommend the smallest useful next step.',
    'Do not run additional commands unless the user explicitly approves the exact command.',
    '',
    '[Terminal context]',
    'Source: Approved Veyra verification command',
    `Command: ${input.command}`,
    `Source hint: ${input.source}`,
    `Exit status: ${exitStatus}`,
    'Output:',
    terminalOutput,
    '[/Terminal context]',
  ].join('\n');
}

export function registerTerminalAwarenessCommands(
  api: TerminalAwarenessApi,
  getRegistration: () => TerminalAwarenessRegistration | undefined,
  revealVeyraView: () => Thenable<unknown> | Promise<unknown>,
  dispatchToView?: (text: string) => Promise<boolean>,
): { dispose(): void } {
  const disposables = [
    api.commands.registerCommand(DIAGNOSE_TERMINAL_OUTPUT_COMMAND, async () => {
      const registration = getRegistration();
      if (!registration) {
        api.window.showErrorMessage('Veyra requires an open workspace folder.');
        return;
      }

      const output = await explicitTerminalOutput(api);
      if (!output.trim()) {
        api.window.showInformationMessage('No terminal output provided.');
        return;
      }

      await revealVeyraView();
      const prompt = formatTerminalDiagnosisPrompt(output);
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
        api.window.showWarningMessage(`Veyra terminal diagnosis failed: ${errorMessage(err)}`);
      }
    }),
    api.commands.registerCommand(RUN_VERIFICATION_COMMAND, async () => {
      const registration = getRegistration();
      if (!registration) {
        api.window.showErrorMessage('Veyra requires an open workspace folder.');
        return;
      }

      await runApprovedVerificationCommand(
        api,
        registration,
        new ProjectCommandProvider(registration.workspacePath),
        revealVeyraView,
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

export async function runApprovedVerificationCommand(
  api: TerminalAwarenessApi,
  registration: TerminalAwarenessRegistration,
  commandProvider: VerificationCommandProvider,
  revealVeyraView: () => Thenable<unknown> | Promise<unknown>,
  dispatchToView?: (text: string) => Promise<boolean>,
): Promise<void> {
  const choices = verificationCommandChoices(await commandProvider.retrieve());
  if (choices.length === 0) {
    api.window.showInformationMessage('No safe verification commands detected.');
    return;
  }
  if (!api.window.showQuickPick) {
    api.window.showErrorMessage('Veyra verification runner requires VS Code quick pick support.');
    return;
  }

  const selected = await api.window.showQuickPick(choices, {
    title: 'Run Veyra verification',
    placeHolder: 'Choose the exact verification command to run',
    ignoreFocusOut: true,
  });
  if (!selected) return;

  const approval = await api.window.showWarningMessage(
    `Run verification command?\n\n${selected.hint.command}`,
    { modal: true },
    RUN_VERIFICATION_APPROVAL,
  );
  if (approval !== RUN_VERIFICATION_APPROVAL) {
    api.window.showInformationMessage('Verification command cancelled.');
    return;
  }

  try {
    const result = await executeVerificationCommandInTerminal(
      api,
      selected.hint.command,
      registration.workspacePath,
    );
    await revealVeyraView();
    const prompt = formatVerificationResultPrompt({
      command: selected.hint.command,
      source: selected.hint.source,
      exitCode: result.exitCode,
      output: result.output,
      outputWasTruncated: result.outputWasTruncated,
    });
    if (await dispatchToView?.(prompt)) {
      return;
    }

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
    api.window.showWarningMessage(`Veyra verification command failed: ${errorMessage(err)}`);
  }
}

export function verificationCommandChoices(result: ProjectCommandHintsResult): VerificationQuickPickItem[] {
  const byLabel = new Map(result.hints.map((hint) => [hint.label, hint]));
  return [
    'verify',
    'test',
    'typecheck',
    'lint',
    'build',
    'check',
  ]
    .map((label) => byLabel.get(label))
    .filter((hint): hint is ProjectCommandHint => Boolean(hint))
    .filter((hint) => isNonDestructiveVerificationCommand(hint))
    .map((hint) => ({
      label: hint.label,
      description: hint.command,
      detail: hint.script
        ? `${hint.source}: ${hint.script}`
        : hint.source,
      hint,
    }));
}

export function isNonDestructiveVerificationCommand(hint: ProjectCommandHint): boolean {
  return !destructiveCommandPattern.test(`${hint.command}\n${hint.script ?? ''}`);
}

async function executeVerificationCommandInTerminal(
  api: TerminalAwarenessApi,
  command: string,
  cwd: string,
): Promise<{ output: string; outputWasTruncated: boolean; exitCode: number | undefined }> {
  if (!api.window.createTerminal || !api.window.onDidChangeTerminalShellIntegration || !api.window.onDidEndTerminalShellExecution) {
    throw new Error('VS Code terminal shell integration is unavailable.');
  }

  const terminal = api.window.createTerminal({ name: 'Veyra Verification', cwd });
  terminal.show(true);
  const shellIntegration = await waitForShellIntegration(api, terminal);
  if (!shellIntegration) {
    throw new Error('VS Code terminal shell integration did not become available.');
  }

  const execution = shellIntegration.executeCommand(command);
  const endPromise = waitForExecutionEnd(api, terminal, execution);
  const outputPromise = collectExecutionOutput(execution, DEFAULT_TERMINAL_OUTPUT_MAX_CHARS);
  const [end, output] = await Promise.all([endPromise, outputPromise]);
  return {
    output: output.output,
    outputWasTruncated: output.truncated,
    exitCode: end.exitCode,
  };
}

async function waitForShellIntegration(
  api: TerminalAwarenessApi,
  terminal: TerminalLike,
): Promise<TerminalShellIntegrationLike | undefined> {
  if (terminal.shellIntegration) return terminal.shellIntegration;
  if (!api.window.onDidChangeTerminalShellIntegration) return undefined;

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      resolve(undefined);
    }, SHELL_INTEGRATION_TIMEOUT_MS);
    const disposable = api.window.onDidChangeTerminalShellIntegration!((event) => {
      if (event.terminal !== terminal) return;
      clearTimeout(timeout);
      disposable.dispose();
      resolve(event.shellIntegration);
    });
  });
}

async function waitForExecutionEnd(
  api: TerminalAwarenessApi,
  terminal: TerminalLike,
  execution: TerminalShellExecutionLike,
): Promise<{ exitCode: number | undefined }> {
  if (!api.window.onDidEndTerminalShellExecution) {
    throw new Error('VS Code terminal execution end events are unavailable.');
  }

  return await new Promise((resolve) => {
    const disposable = api.window.onDidEndTerminalShellExecution!((event) => {
      if (event.terminal !== terminal || event.execution !== execution) return;
      disposable.dispose();
      resolve({ exitCode: event.exitCode });
    });
  });
}

async function collectExecutionOutput(
  execution: TerminalShellExecutionLike,
  maxChars: number,
): Promise<{ output: string; truncated: boolean }> {
  let output = '';
  let truncated = false;
  for await (const chunk of execution.read()) {
    const next = output + stripAnsi(chunk);
    if (next.length > maxChars) {
      output = next.slice(-maxChars);
      truncated = true;
    } else {
      output = next;
    }
  }
  return { output, truncated };
}

function prepareCapturedTerminalOutputForPrompt(
  output: string,
  maxChars: number,
  wasTruncated: boolean,
): string {
  const prepared = prepareTerminalOutputForPrompt(output, maxChars);
  if (!wasTruncated || !prepared) return prepared;
  if (prepared.startsWith('[Terminal output truncated')) return prepared;
  return [
    `[Terminal output truncated to last ${maxChars} characters]`,
    prepared,
  ].join('\n');
}

async function explicitTerminalOutput(api: TerminalAwarenessApi): Promise<string> {
  let clipboardText = '';
  try {
    clipboardText = await api.env.clipboard.readText();
  } catch {
    clipboardText = '';
  }
  if (clipboardText.trim()) return clipboardText;

  return await api.window.showInputBox({
    title: 'Diagnose terminal output',
    prompt: 'Paste terminal output to send to Veyra for diagnosis.',
    placeHolder: 'Paste copied terminal output here',
    ignoreFocusOut: true,
  }) ?? '';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

const destructiveCommandPattern = /\b(?:rm\s+-[^\s;|&]*r[^\s;|&]*|rmdir|del|erase|Remove-Item|git\s+(?:reset|clean|checkout|restore)|npm\s+(?:publish|unpublish|version)|pnpm\s+publish|yarn\s+npm\s+publish)\b/i;

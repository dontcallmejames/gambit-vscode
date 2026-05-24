import type {
  VeyraDispatchEventSink,
  VeyraDispatchRequest,
} from './veyraService.js';

const DEFAULT_TERMINAL_OUTPUT_MAX_CHARS = 12_000;
export const DIAGNOSE_TERMINAL_OUTPUT_COMMAND = 'veyra.diagnoseTerminalOutput';

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

export function registerTerminalAwarenessCommands(
  api: TerminalAwarenessApi,
  getRegistration: () => TerminalAwarenessRegistration | undefined,
  revealVeyraView: () => Thenable<unknown> | Promise<unknown>,
  dispatchToView?: (text: string) => Promise<boolean>,
): { dispose(): void } {
  return api.commands.registerCommand(DIAGNOSE_TERMINAL_OUTPUT_COMMAND, async () => {
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
  });
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

import type {
  VeyraDispatchEventSink,
  VeyraDispatchRequest,
} from './veyraService.js';
import {
  ProjectCommandProvider,
  formatProjectCommandHintsBlock,
  type ProjectCommandHintsResult,
} from './projectCommands.js';
import { prepareTerminalOutputForPrompt } from './terminalAwareness.js';

export const REVIEW_BROWSER_TEST_OUTPUT_COMMAND = 'veyra.reviewBrowserTestOutput';

export interface BrowserTestingPromptInput {
  userProvidedOutput: string;
  projectCommands?: ProjectCommandHintsResult;
}

export interface BrowserTestingRegistration {
  workspacePath: string;
  service: {
    dispatch(request: VeyraDispatchRequest, emit: VeyraDispatchEventSink): Promise<void>;
  };
}

export interface BrowserTestingCommandProvider {
  retrieve(): Promise<ProjectCommandHintsResult>;
}

export interface BrowserTestingApi {
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

export function registerBrowserTestingAwarenessCommands(
  api: BrowserTestingApi,
  getRegistration: () => BrowserTestingRegistration | undefined,
  revealVeyraView: () => Thenable<unknown> | Promise<unknown>,
  dispatchToView?: (text: string) => Promise<boolean>,
  commandProviderFactory: (workspacePath: string) => BrowserTestingCommandProvider = (workspacePath) =>
    new ProjectCommandProvider(workspacePath),
): { dispose(): void } {
  const disposable = api.commands.registerCommand(REVIEW_BROWSER_TEST_OUTPUT_COMMAND, async () => {
    const registration = getRegistration();
    if (!registration) {
      api.window.showErrorMessage('Veyra requires an open workspace folder.');
      return;
    }

    const output = await explicitBrowserTestingOutput(api);
    if (!output.trim()) {
      api.window.showInformationMessage('No browser or test output provided.');
      return;
    }

    const projectCommands = await commandProviderFactory(registration.workspacePath).retrieve().catch((err) => {
      api.window.showWarningMessage(`Veyra browser/test project context failed: ${errorMessage(err)}`);
      return { packageManager: 'unknown' as const, hints: [] };
    });

    await revealVeyraView();
    const prompt = formatBrowserTestingReviewPrompt({
      userProvidedOutput: output,
      projectCommands,
    });
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
      api.window.showWarningMessage(`Veyra browser/test review failed: ${errorMessage(err)}`);
    }
  });

  return {
    dispose(): void {
      disposable.dispose();
    },
  };
}

export function formatBrowserTestingReviewPrompt(input: BrowserTestingPromptInput): string {
  const browserOutput = sanitizeUserProvidedBrowserTestingOutput(input.userProvidedOutput);
  const commandHints = input.projectCommands
    ? formatProjectCommandHintsBlock(input.projectCommands)
    : '';
  return [
    '@veyra /review Review this browser and frontend test evidence.',
    '',
    'Use only explicit user-provided browser/test output and local project context.',
    'Do not launch a browser, scrape the network, rerun tests, edit files, or run Git commands.',
    'Do not claim live browser, network, screenshot, CI, or test state unless it appears in the user-provided evidence.',
    'If follow-up would help, suggest exact follow-up commands and wait for explicit approval before any command runs.',
    '',
    'Produce exactly these Markdown headings in the final answer so the docked view can render artifact cards:',
    '## Browser/Test Summary',
    '## Reproduction Evidence',
    '## User-Visible Risk',
    '## Likely Cause',
    '## Verification Gaps',
    '## Suggested Follow-up Commands',
    '',
    '[Browser testing context]',
    'Source: Explicit user-provided browser/test output',
    browserOutput,
    '[/Browser testing context]',
    ...(commandHints ? ['', commandHints] : []),
  ].join('\n');
}

async function explicitBrowserTestingOutput(api: BrowserTestingApi): Promise<string> {
  let clipboardText = '';
  try {
    clipboardText = await api.env.clipboard.readText();
  } catch {
    clipboardText = '';
  }
  if (clipboardText.trim()) return clipboardText;

  return await api.window.showInputBox({
    title: 'Review browser/test output',
    prompt: 'Paste browser test logs, console errors, network errors, screenshot notes, URL notes, or reproduction text.',
    placeHolder: 'Paste copied browser or test output here',
    ignoreFocusOut: true,
  }) ?? '';
}

function sanitizeUserProvidedBrowserTestingOutput(output: string): string {
  return redactSecrets(prepareTerminalOutputForPrompt(output));
}

function redactSecrets(value: string): string {
  return value
    .replace(/\b(https?:\/\/)([^:\s/@]+(?::[^@\s/]*)?)@/gi, '$1')
    .replace(/([?&](?:access_token|api_key|auth|code|key|secret|token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\bAuthorization:\s*(?:Bearer|token)\s+\S+/gi, 'Authorization: [redacted]')
    .replace(/\bCookie:\s*.+$/gim, 'Cookie: [redacted]')
    .replace(/\bSet-Cookie:\s*.+$/gim, 'Set-Cookie: [redacted]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{8,}\b/g, '[redacted-token]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, '[redacted-token]');
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

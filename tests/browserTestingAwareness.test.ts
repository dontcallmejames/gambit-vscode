import { describe, expect, it, vi } from 'vitest';
import {
  formatBrowserTestingReviewPrompt,
  REVIEW_BROWSER_TEST_OUTPUT_COMMAND,
  registerBrowserTestingAwarenessCommands,
  type BrowserTestingApi,
} from '../src/browserTestingAwareness.js';

describe('browser testing awareness', () => {
  it('formats explicit browser and frontend test evidence with artifact headings and safety guardrails', () => {
    const prompt = formatBrowserTestingReviewPrompt({
      userProvidedOutput: [
        'Playwright failed: expect(locator).toBeVisible()',
        'URL: https://tester:secret@example.com/app/login?token=secret1234567890',
        'Console error: Authorization: Bearer ghp_secret1234567890',
        'Screenshot note: submit button is hidden below the fold',
        'Network error: POST /api/login 500',
      ].join('\n'),
      projectCommands: {
        packageManager: 'npm',
        hints: [
          {
            label: 'test',
            command: 'npm test',
            source: 'package.json#scripts.test',
            script: 'vitest run',
          },
          {
            label: 'verify',
            command: 'npm run verify',
            source: 'package.json#scripts.verify',
            script: 'npm test',
          },
        ],
      },
    });

    expect(prompt).toContain('@veyra /review Review this browser and frontend test evidence.');
    expect(prompt).toContain('## Browser/Test Summary');
    expect(prompt).toContain('## Reproduction Evidence');
    expect(prompt).toContain('## User-Visible Risk');
    expect(prompt).toContain('## Likely Cause');
    expect(prompt).toContain('## Verification Gaps');
    expect(prompt).toContain('## Suggested Follow-up Commands');
    expect(prompt).toContain('[Browser testing context]');
    expect(prompt).toContain('Source: Explicit user-provided browser/test output');
    expect(prompt).toContain('Playwright failed: expect(locator).toBeVisible()');
    expect(prompt).toContain('Screenshot note: submit button is hidden below the fold');
    expect(prompt).toContain('Network error: POST /api/login 500');
    expect(prompt).toContain('[Project command hints]');
    expect(prompt).toContain('- test: npm test (package.json#scripts.test)');
    expect(prompt).toContain('- verify: npm run verify (package.json#scripts.verify)');
    expect(prompt).toContain('Use only explicit user-provided browser/test output and local project context.');
    expect(prompt).toContain('Do not launch a browser, scrape the network, rerun tests, edit files, or run Git commands.');
    expect(prompt).toContain('suggest exact follow-up commands and wait for explicit approval');
    expect(prompt).not.toContain('tester:secret');
    expect(prompt).not.toContain('ghp_secret1234567890');
    expect(prompt).not.toContain('token=secret1234567890');
    expect(prompt).toContain('https://example.com/app/login?token=[redacted]');
    expect(prompt).toContain('Authorization: [redacted]');
  });

  it('omits project command context when no local command hints are available', () => {
    const prompt = formatBrowserTestingReviewPrompt({
      userProvidedOutput: 'Console error: TypeError in app.tsx',
      projectCommands: { packageManager: 'unknown', hints: [] },
    });

    expect(prompt).toContain('[Browser testing context]');
    expect(prompt).not.toContain('[Project command hints]');
  });

  it('routes copied browser/test output through the docked view without running commands', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, {
      clipboardText: 'Cypress failed: expected /dashboard\nConsole error: TypeError',
    });
    const service = registration().service;
    const dispatched: string[] = [];
    const provider = {
      retrieve: vi.fn(async () => ({
        packageManager: 'npm' as const,
        hints: [
          {
            label: 'test',
            command: 'npm test',
            source: 'package.json#scripts.test',
            script: 'vitest run',
          },
        ],
      })),
    };

    registerBrowserTestingAwarenessCommands(
      api,
      () => ({ workspacePath: '/workspace', service }),
      async () => undefined,
      async (text) => {
        dispatched.push(text);
        return true;
      },
      () => provider,
    );

    await callbacks.get(REVIEW_BROWSER_TEST_OUTPUT_COMMAND)?.();

    expect(api.commands.registerCommand).toHaveBeenCalledWith(REVIEW_BROWSER_TEST_OUTPUT_COMMAND, expect.any(Function));
    expect(provider.retrieve).toHaveBeenCalledTimes(1);
    expect(api.window.showInputBox).not.toHaveBeenCalled();
    expect(service.dispatch).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('[Browser testing context]');
    expect(dispatched[0]).toContain('Cypress failed: expected /dashboard');
    expect(dispatched[0]).toContain('[Project command hints]');
  });

  it('falls back to explicit input and skips dispatch when no browser/test output is provided', async () => {
    const callbacks = new Map<string, () => Promise<void>>();
    const api = fakeApi(callbacks, { clipboardText: '', inputText: '   ' });
    const service = registration().service;

    registerBrowserTestingAwarenessCommands(
      api,
      () => ({ workspacePath: '/workspace', service }),
      async () => undefined,
      async () => true,
      () => ({ retrieve: vi.fn(async () => ({ packageManager: 'npm' as const, hints: [] })) }),
    );

    await callbacks.get(REVIEW_BROWSER_TEST_OUTPUT_COMMAND)?.();

    expect(api.window.showInputBox).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review browser/test output',
    }));
    expect(service.dispatch).not.toHaveBeenCalled();
    expect(api.window.showInformationMessage).toHaveBeenCalledWith('No browser or test output provided.');
  });
});

function fakeApi(
  callbacks: Map<string, () => Promise<void>>,
  options: { clipboardText?: string; inputText?: string } = {},
): BrowserTestingApi & {
  env: { clipboard: { readText: ReturnType<typeof vi.fn> } };
  window: BrowserTestingApi['window'] & { showInputBox: ReturnType<typeof vi.fn> };
} {
  return {
    commands: {
      registerCommand: vi.fn((command: string, callback: () => Promise<void>) => {
        callbacks.set(command, callback);
        return { dispose: vi.fn() };
      }),
    },
    env: {
      clipboard: {
        readText: vi.fn().mockResolvedValue(options.clipboardText ?? ''),
      },
    },
    window: {
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showInputBox: vi.fn().mockResolvedValue(options.inputText),
      showWarningMessage: vi.fn(),
    },
  };
}

function registration() {
  return {
    workspacePath: '/workspace',
    service: {
      dispatch: vi.fn().mockResolvedValue(undefined),
    },
  };
}

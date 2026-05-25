import { describe, expect, it, vi } from 'vitest';
import {
  formatTerminalDiagnosisPrompt,
  formatVerificationResultPrompt,
  prepareTerminalOutputForPrompt,
  runApprovedVerificationCommand,
  type TerminalAwarenessApi,
} from '../src/terminalAwareness.js';

describe('terminal awareness', () => {
  it('formats terminal output as read-only diagnosis context', () => {
    const prompt = formatTerminalDiagnosisPrompt('  npm test\nTS2304: Cannot find name Parser\n  ');

    expect(prompt).toContain('@veyra /review Diagnose this terminal output.');
    expect(prompt).toContain('[Terminal context]');
    expect(prompt).toContain('Source: Explicit user-provided terminal output');
    expect(prompt).toContain('npm test\nTS2304: Cannot find name Parser');
    expect(prompt).toContain('[/Terminal context]');
    expect(prompt).toContain('Do not run commands unless the user explicitly approves the exact command.');
    expect(prompt).toContain('If a command would help, suggest it with a short reason and wait for approval.');
  });

  it('keeps the tail of long terminal output with a truncation note', () => {
    const output = `${'a'.repeat(24)}\nfinal failure line`;

    expect(prepareTerminalOutputForPrompt(output, 20)).toBe([
      '[Terminal output truncated to last 20 characters]',
      'final failure line',
    ].join('\n'));
  });

  it('normalizes whitespace-only terminal output to an empty string', () => {
    expect(prepareTerminalOutputForPrompt(' \n\t ')).toBe('');
  });

  it('formats verification command results as terminal context', () => {
    const prompt = formatVerificationResultPrompt({
      command: 'npm test',
      exitCode: 1,
      output: 'FAIL parser.test.ts\nExpected true to be false',
      source: 'package.json#scripts.test',
    });

    expect(prompt).toContain('@veyra /review Review this verification result.');
    expect(prompt).toContain('[Terminal context]');
    expect(prompt).toContain('Source: Approved Veyra verification command');
    expect(prompt).toContain('Command: npm test');
    expect(prompt).toContain('Source hint: package.json#scripts.test');
    expect(prompt).toContain('Exit status: 1');
    expect(prompt).toContain('FAIL parser.test.ts');
    expect(prompt).toContain('[/Terminal context]');
  });

  it('runs an approved verification command and dispatches captured output to Veyra', async () => {
    const harness = verificationHarness({
      output: ['\u001b[31mFAIL\u001b[0m parser.test.ts\n'],
      exitCode: 1,
    });
    const provider = {
      retrieve: vi.fn(async () => ({
        packageManager: 'npm' as const,
        hints: [
          {
            label: 'verify',
            command: 'npm run verify',
            source: 'package.json#scripts.verify',
            script: 'vitest run',
          },
        ],
      })),
    };
    const dispatched: string[] = [];

    await runApprovedVerificationCommand(
      harness.api,
      registration(),
      provider,
      async () => undefined,
      async (prompt) => {
        dispatched.push(prompt);
        return true;
      },
    );

    expect(provider.retrieve).toHaveBeenCalledTimes(1);
    expect(harness.api.window.showQuickPick).toHaveBeenCalledWith(
      [expect.objectContaining({ label: 'verify', description: 'npm run verify' })],
      expect.objectContaining({ title: 'Run Veyra verification' }),
    );
    expect(harness.api.window.showWarningMessage).toHaveBeenCalledWith(
      'Run verification command?\n\nnpm run verify',
      { modal: true },
      'Run command',
    );
    expect(harness.terminal.show).toHaveBeenCalledTimes(1);
    expect(harness.shellIntegration.executeCommand).toHaveBeenCalledWith('npm run verify');
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toContain('Command: npm run verify');
    expect(dispatched[0]).toContain('Exit status: 1');
    expect(dispatched[0]).toContain('FAIL parser.test.ts');
    expect(dispatched[0]).not.toContain('\u001b[31m');
  });

  it('does not run a verification command until the exact command is approved', async () => {
    const harness = verificationHarness({ output: ['PASS\n'], exitCode: 0, approval: undefined });

    await runApprovedVerificationCommand(
      harness.api,
      registration(),
      safeProvider(),
      async () => undefined,
      async () => true,
    );

    expect(harness.api.window.showWarningMessage).toHaveBeenCalledWith(
      'Run verification command?\n\nnpm run verify',
      { modal: true },
      'Run command',
    );
    expect(harness.shellIntegration.executeCommand).not.toHaveBeenCalled();
    expect(harness.api.window.showInformationMessage).toHaveBeenCalledWith('Verification command cancelled.');
  });

  it('filters destructive-looking package scripts out of verification choices', async () => {
    const harness = verificationHarness({ output: ['should not run'], exitCode: 0 });
    const provider = {
      retrieve: vi.fn(async () => ({
        packageManager: 'npm' as const,
        hints: [
          {
            label: 'verify',
            command: 'npm run verify',
            source: 'package.json#scripts.verify',
            script: 'rm -rf dist && vitest run',
          },
        ],
      })),
    };

    await runApprovedVerificationCommand(
      harness.api,
      registration(),
      provider,
      async () => undefined,
      async () => true,
    );

    expect(harness.api.window.showQuickPick).not.toHaveBeenCalled();
    expect(harness.shellIntegration.executeCommand).not.toHaveBeenCalled();
    expect(harness.api.window.showInformationMessage).toHaveBeenCalledWith('No safe verification commands detected.');
  });
});

function registration() {
  return {
    workspacePath: '/workspace',
    service: {
      dispatch: vi.fn(),
    },
  };
}

function safeProvider() {
  return {
    retrieve: vi.fn(async () => ({
      packageManager: 'npm' as const,
      hints: [
        {
          label: 'verify',
          command: 'npm run verify',
          source: 'package.json#scripts.verify',
          script: 'vitest run',
        },
      ],
    })),
  };
}

function verificationHarness(options: {
  output: string[];
  exitCode: number | undefined;
  approval?: 'Run command' | undefined;
}) {
  let endListener: ((event: unknown) => void) | undefined;
  const execution = {
    async *read() {
      for (const chunk of options.output) {
        yield chunk;
      }
    },
  };
  const shellIntegration = {
    executeCommand: vi.fn(() => {
      queueMicrotask(() => {
        endListener?.({ terminal, execution, exitCode: options.exitCode });
      });
      return execution;
    }),
  };
  const terminal = {
    shellIntegration,
    show: vi.fn(),
  };
  const api: TerminalAwarenessApi = {
    commands: {
      registerCommand: vi.fn(),
    },
    env: {
      clipboard: {
        readText: vi.fn(),
      },
    },
    window: {
      createTerminal: vi.fn(() => terminal),
      onDidChangeTerminalShellIntegration: vi.fn(() => ({ dispose: vi.fn() })),
      onDidEndTerminalShellExecution: vi.fn((listener: (event: unknown) => void) => {
        endListener = listener;
        return { dispose: vi.fn() };
      }),
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
      showInputBox: vi.fn(),
      showQuickPick: vi.fn(async (items) => items[0]) as TerminalAwarenessApi['window']['showQuickPick'],
      showWarningMessage: vi.fn(async () => (
        Object.prototype.hasOwnProperty.call(options, 'approval') ? options.approval : 'Run command'
      )),
    },
  };
  return { api, terminal, shellIntegration };
}

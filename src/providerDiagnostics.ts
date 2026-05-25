import { accessSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type GoogleRuntimeSelection = 'antigravity' | 'legacy-gemini';

export type ProviderDiagnostic = {
  provider: 'Claude' | 'Codex' | 'Gemini';
  runtime: string;
  command: string;
  version: string;
  model: string;
};

export type ProviderDiagnostics = Record<'claude' | 'codex' | 'gemini', ProviderDiagnostic>;

type VersionRunner = (command: string, args: string[]) => string;

export function collectProviderDiagnostics(options: {
  googleRuntime?: GoogleRuntimeSelection;
  runVersion?: VersionRunner;
} = {}): ProviderDiagnostics {
  const googleRuntime = options.googleRuntime ?? detectGoogleRuntime();
  const runVersion = options.runVersion ?? defaultRunVersion;
  const googleCommand = googleRuntime === 'antigravity' ? 'agy' : 'gemini';

  return {
    claude: {
      provider: 'Claude',
      runtime: 'Claude CLI',
      command: 'claude',
      version: safeVersion(runVersion, 'claude'),
      model: 'local CLI/provider default; not selected by Veyra',
    },
    codex: {
      provider: 'Codex',
      runtime: 'Codex CLI',
      command: 'codex',
      version: safeVersion(runVersion, 'codex'),
      model: 'local CLI/provider default; not selected by Veyra',
    },
    gemini: {
      provider: 'Gemini',
      runtime: googleRuntime === 'antigravity' ? 'Antigravity CLI' : 'legacy Gemini CLI fallback',
      command: googleCommand,
      version: safeVersion(runVersion, googleCommand),
      model: 'local CLI/provider default; not selected by Veyra',
    },
  };
}

function safeVersion(runVersion: VersionRunner, command: string): string {
  try {
    return normalizeVersion(runVersion(command, ['--version']));
  } catch {
    return 'unavailable';
  }
}

function normalizeVersion(output: string): string {
  return output.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? 'unavailable';
}

function defaultRunVersion(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1500,
    windowsHide: true,
  });
}

function detectGoogleRuntime(): GoogleRuntimeSelection {
  if (process.env.VEYRA_ANTIGRAVITY_CLI_PATH?.trim()) return 'antigravity';
  if (process.env.VEYRA_GEMINI_CLI_PATH?.trim()) return 'legacy-gemini';
  if (commandExists('agy')) return 'antigravity';
  if (standardAntigravityInstallExists()) return 'antigravity';
  return 'legacy-gemini';
}

function commandExists(command: string): boolean {
  try {
    const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
    execFileSync(lookup, [process.platform === 'win32' ? `${command}.exe` : command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function standardAntigravityInstallExists(): boolean {
  const candidate = process.platform === 'win32'
    ? process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
      : ''
    : join(homedir(), '.local', 'bin', 'agy');
  if (!candidate) return false;
  try {
    accessSync(candidate);
    return true;
  } catch {
    return false;
  }
}

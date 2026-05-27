import { accessSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  collectLocalModelDiagnostics,
  type LocalModelConfigurationInput,
  type LocalModelDiagnostic,
} from './localModelSupport.js';

export type GoogleRuntimeSelection = 'antigravity' | 'legacy-gemini';

export type ProviderDiagnostic = {
  provider: 'Claude' | 'Codex' | 'Gemini';
  runtime: string;
  command: string;
  version: string;
  model: string;
};

export type CliProviderDiagnostics = Record<'claude' | 'codex' | 'gemini', ProviderDiagnostic>;

export type ProviderDiagnostics = CliProviderDiagnostics & {
  localModel: LocalModelDiagnostic;
};

type VersionRunner = (command: string, args: string[]) => string;

export function collectProviderDiagnostics(options: {
  googleRuntime?: GoogleRuntimeSelection;
  localModel?: LocalModelConfigurationInput;
  runVersion?: VersionRunner;
} = {}): ProviderDiagnostics {
  const googleRuntime = options.googleRuntime ?? detectGoogleRuntime();
  const runVersion = options.runVersion ?? defaultRunVersion;
  const googleCommand = googleRuntime === 'antigravity' ? 'agy' : 'gemini';
  const claudeMetadata = safeProviderMetadata(runVersion, 'claude');
  const codexMetadata = safeProviderMetadata(runVersion, 'codex');
  const googleMetadata = safeProviderMetadata(runVersion, googleCommand);

  return {
    claude: {
      provider: 'Claude',
      runtime: 'Claude CLI',
      command: 'claude',
      version: claudeMetadata.version,
      model: claudeMetadata.model,
    },
    codex: {
      provider: 'Codex',
      runtime: 'Codex CLI',
      command: 'codex',
      version: codexMetadata.version,
      model: codexMetadata.model,
    },
    gemini: {
      provider: 'Gemini',
      runtime: googleRuntime === 'antigravity' ? 'Antigravity CLI' : 'legacy Gemini CLI fallback',
      command: googleCommand,
      version: googleMetadata.version,
      model: googleMetadata.model,
    },
    localModel: collectLocalModelDiagnostics(options.localModel),
  };
}

function safeProviderMetadata(runVersion: VersionRunner, command: string): { version: string; model: string } {
  try {
    const output = runVersion(command, ['--version']);
    return {
      version: normalizeVersion(output),
      model: backendReportedModel(output) ?? 'local CLI/provider default; not selected by Veyra',
    };
  } catch {
    return {
      version: 'unavailable',
      model: 'local CLI/provider default; not selected by Veyra',
    };
  }
}

function normalizeVersion(output: string): string {
  return output.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? 'unavailable';
}

function backendReportedModel(output: string): string | null {
  try {
    const parsed = JSON.parse(output) as { model?: unknown; defaultModel?: unknown };
    const model = typeof parsed.model === 'string'
      ? parsed.model
      : typeof parsed.defaultModel === 'string'
        ? parsed.defaultModel
        : '';
    if (model.trim()) return `backend-reported model: ${model.trim()}`;
  } catch {
    // Most CLI --version output is plain text; fall through to line parsing.
  }

  const modelLine = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => /^(?:model|default model|active model)\s*[:=]/iu.test(line));
  if (!modelLine) return null;
  const model = modelLine.replace(/^(?:model|default model|active model)\s*[:=]\s*/iu, '').trim();
  return model ? `backend-reported model: ${model}` : null;
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

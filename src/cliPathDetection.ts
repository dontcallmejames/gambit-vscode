import { execSync as defaultExecSync } from 'node:child_process';
import { accessSync as defaultAccessSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeCliPathOverride, windowsNpmShimNames, type CliRuntimeName } from './cliPathValidation.js';

export type CliPathDetectionStatus = 'detected' | 'missing' | 'inaccessible' | 'unsupported';

export interface DetectedCliBundlePath {
  status: CliPathDetectionStatus;
  path?: string;
  detail: string;
}

export interface CliBundlePathDetection {
  codex: DetectedCliBundlePath;
  antigravity: DetectedCliBundlePath;
  gemini: DetectedCliBundlePath;
}

interface DetectCliBundlePathsOptions {
  platform?: NodeJS.Platform;
  execSync?: typeof defaultExecSync;
  accessSync?: typeof defaultAccessSync;
}

export function detectCliBundlePaths({
  platform = process.platform,
  execSync = defaultExecSync,
  accessSync = defaultAccessSync,
}: DetectCliBundlePathsOptions = {}): CliBundlePathDetection {
  if (platform !== 'win32') {
    const detail = 'Automatic CLI bundle path configuration is only needed on Windows; non-Windows hosts use codex, agy, and gemini from PATH.';
    return {
      codex: { status: 'unsupported', detail },
      antigravity: { status: 'unsupported', detail },
      gemini: { status: 'unsupported', detail },
    };
  }

  const codexNative = probeNativeExecutable('codex', execSync, accessSync);
  const antigravityNative = probeNativeExecutable('agy', execSync, accessSync);
  const geminiNative = probeNativeExecutable('gemini', execSync, accessSync);
  const codexShim = codexNative ?? probeWindowsNpmShim('codex', execSync, accessSync);
  const antigravity = antigravityNative ?? probeAntigravityInstallPath(execSync, accessSync);
  const geminiShim = geminiNative ?? probeWindowsNpmShim('gemini', execSync, accessSync);
  if (codexNative && geminiNative) {
    return {
      codex: codexNative,
      antigravity,
      gemini: geminiNative,
    };
  }
  if (codexShim && geminiShim) {
    return {
      codex: codexShim,
      antigravity,
      gemini: geminiShim,
    };
  }

  let npmRoot: string;
  try {
    npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  } catch {
    return {
      codex: codexShim ?? { status: 'missing', detail: 'Could not resolve npm root -g. Install Node/npm and the Codex CLI.' },
      antigravity,
      gemini: geminiShim ?? { status: 'missing', detail: 'Could not resolve npm root -g. Install Node/npm and the Gemini CLI.' },
    };
  }

  return {
    codex: codexShim ?? probeBundlePath(
      join(npmRoot, '@openai', 'codex', 'bin', 'codex.js'),
      'Codex',
      accessSync,
    ),
    antigravity,
    gemini: geminiShim ?? probeBundlePath(
      join(npmRoot, '@google', 'gemini-cli', 'bundle', 'gemini.js'),
      'Gemini',
      accessSync,
    ),
  };
}

function probeWindowsNpmShim(
  runtime: CliRuntimeName,
  execSync: typeof defaultExecSync,
  accessSync: typeof defaultAccessSync,
): DetectedCliBundlePath | null {
  for (const shimName of windowsNpmShimNames(runtime)) {
    let output: string;
    try {
      output = execSync(`where.exe ${shimName}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
    } catch {
      continue;
    }

    const shimPath = output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith(shimName));
    if (!shimPath) continue;

    const bundlePath = normalizeCliPathOverride(runtime, shimPath);
    const result = probeBundlePath(bundlePath, runtime === 'codex' ? 'Codex' : 'Gemini', accessSync);
    if (result.status === 'missing') continue;
    return result;
  }

  return null;
}

function probeNativeExecutable(
  baseName: 'codex' | 'gemini' | 'agy',
  execSync: typeof defaultExecSync,
  accessSync: typeof defaultAccessSync,
): DetectedCliBundlePath | null {
  let output: string;
  try {
    output = execSync(`where.exe ${baseName}.exe`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch {
    return null;
  }

  const expectedName = `${baseName}.exe`.toLowerCase();
  const executablePath = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith(expectedName));
  if (!executablePath) return null;

  try {
    accessSync(executablePath);
    return { status: 'detected', path: executablePath, detail: '' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        status: 'inaccessible',
        path: executablePath,
        detail: `Cannot inspect ${executablePath}. Check filesystem permissions or rerun outside the current sandbox.`,
      };
    }
    return null;
  }
}

function probeAntigravityInstallPath(
  execSync: typeof defaultExecSync,
  accessSync: typeof defaultAccessSync,
): DetectedCliBundlePath {
  const installPath = resolveWindowsAntigravityInstallPath(execSync);
  if (!installPath) {
    return {
      status: 'missing',
      detail: 'Antigravity CLI not found. Install it from https://antigravity.google/cli.',
    };
  }
  return probeBundlePath(installPath, 'Antigravity', accessSync);
}

function resolveWindowsAntigravityInstallPath(execSync: typeof defaultExecSync): string | null {
  try {
    const localAppData = execSync('powershell.exe -NoProfile -Command "[Environment]::GetFolderPath(\'LocalApplicationData\')"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!localAppData || !/[\\/]AppData[\\/]Local(?:[\\/]|$)/i.test(localAppData)) return null;
    return join(localAppData, 'agy', 'bin', 'agy.exe');
  } catch {
    return null;
  }
}

function probeBundlePath(
  bundlePath: string,
  label: 'Codex' | 'Gemini' | 'Antigravity',
  accessSync: typeof defaultAccessSync,
): DetectedCliBundlePath {
  try {
    accessSync(bundlePath);
    return { status: 'detected', path: bundlePath, detail: '' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        status: 'inaccessible',
        path: bundlePath,
        detail: `Cannot inspect ${bundlePath}. Check filesystem permissions or rerun outside the current sandbox.`,
      };
    }
    return {
      status: 'missing',
      path: bundlePath,
      detail: `${label} CLI bundle not found at ${bundlePath}.`,
    };
  }
}

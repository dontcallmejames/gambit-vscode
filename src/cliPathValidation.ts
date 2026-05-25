import { dirname, join } from 'node:path';

export type CliRuntimeName = 'codex' | 'gemini' | 'antigravity';

export function normalizeCliPathOverride(runtime: CliRuntimeName, filePath: string): string {
  const trimmed = filePath.trim();
  if (!isWindowsNpmShimPath(runtime, trimmed)) return trimmed;
  return join(dirname(trimmed), ...windowsNpmBundleSegments(runtime));
}

export function windowsNpmShimNames(runtime: CliRuntimeName): string[] {
  if (runtime === 'antigravity') return [];
  return [`${runtime}.cmd`, `${runtime}.bat`, `${runtime}.ps1`];
}

export function cliPathMisconfiguration(runtime: CliRuntimeName, filePath: string): string | null {
  const baseName = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const expected = expectedCliRuntimePathNames(runtime);
  if (expected.includes(baseName)) return null;
  const label = runtime === 'codex' ? 'Codex' : runtime === 'gemini' ? 'Gemini' : 'Antigravity';
  return `${label} CLI path override must point to ${formatExpectedNames(expected)}. Received ${filePath}.`;
}

export function expectedCliRuntimePathNames(runtime: CliRuntimeName): string[] {
  if (runtime === 'antigravity') return ['agy.exe', 'agy'];
  return [`${runtime}.js`, `${runtime}.exe`, runtime];
}

export function isWindowsNpmShimPath(runtime: CliRuntimeName, filePath: string): boolean {
  const baseName = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return windowsNpmShimNames(runtime).includes(baseName);
}

function windowsNpmBundleSegments(runtime: CliRuntimeName): string[] {
  if (runtime === 'codex') return ['node_modules', '@openai', 'codex', 'bin', 'codex.js'];
  if (runtime === 'gemini') return ['node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'];
  return [];
}

function formatExpectedNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}

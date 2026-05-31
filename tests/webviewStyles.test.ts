import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const stylesPath = path.join(repoRoot, 'src', 'webview', 'styles.css');
const styles = fs.readFileSync(stylesPath, 'utf8');

// WorkflowStateSeverity in src/shared/protocol.ts. The components build class names
// dynamically as `...-${severity}`, so every severity must have a matching CSS rule
// or the chip renders as unstyled bare text (the b00513b regression this guards against).
const SEVERITIES = ['warning', 'error', 'info'] as const;

const REQUIRED_CLASSES = [
  'mission-control-workflow-warnings',
  'mission-control-workflow-chip',
  ...SEVERITIES.map((s) => `mission-control-workflow-chip-${s}`),
  'trust-workflow-warning',
  ...SEVERITIES.map((s) => `trust-workflow-warning-${s}`),
];

describe('webview styles: workflow-state chip classes', () => {
  it.each(REQUIRED_CLASSES)('defines a CSS rule for .%s', (className) => {
    // Match the class as a selector token (followed by a separator), not a substring
    // of a longer class name.
    const selector = new RegExp(`\\.${className.replace(/[-]/g, '\\-')}(?![\\w-])`);
    expect(selector.test(styles)).toBe(true);
  });
});

// Enterprise Polish v0.1 — Phase 1 acceptance gate: raw color literals (#, rgb(,
// rgba() must live only in tokens.css. Everything else references --veyra-* tokens.
describe('webview styles: color token discipline', () => {
  const webviewDir = path.join(repoRoot, 'src', 'webview');
  const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

  function collectStyleFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...collectStyleFiles(full));
      } else if (/\.(css|tsx)$/.test(entry.name) && entry.name !== 'tokens.css') {
        out.push(full);
      }
    }
    return out;
  }

  it.each(collectStyleFiles(webviewDir).map((f) => path.relative(repoRoot, f)))(
    'has no raw color literal in %s',
    (relativePath) => {
      const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      const offenders = content
        .split(/\r?\n/)
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => RAW_COLOR.test(line));
      expect(offenders, `Move color literals to tokens.css: ${JSON.stringify(offenders)}`).toEqual([]);
    },
  );

  it('defines every Veyra token referenced in styles.css', () => {
    // Only validate Veyra-owned custom properties. --vscode-* vars are supplied by
    // VS Code at runtime; everything else must be defined in tokens.css.
    const isVeyraToken = (token: string) => !token.startsWith('--vscode-');
    const tokens = fs.readFileSync(path.join(webviewDir, 'tokens.css'), 'utf8');
    const defined = new Set(
      [...tokens.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    const referenced = new Set(
      [...styles.matchAll(/var\((--[A-Za-z0-9-]+)/g)].map((m) => m[1]).filter(isVeyraToken),
    );
    const missing = [...referenced].filter((token) => !defined.has(token));
    expect(missing, `Undefined Veyra tokens referenced in styles.css: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('webview styles: non-color design tokens (v0.2 Phase A)', () => {
  const tokens = fs.readFileSync(path.join(repoRoot, 'src', 'webview', 'tokens.css'), 'utf8');

  const REQUIRED_TOKENS = [
    '--veyra-space-1', '--veyra-space-2', '--veyra-space-3', '--veyra-space-4', '--veyra-space-5',
    '--veyra-text-micro', '--veyra-text-body', '--veyra-text-label',
    '--veyra-motion-fast', '--veyra-motion-base', '--veyra-ease',
  ];

  it.each(REQUIRED_TOKENS)('defines %s in tokens.css', (token) => {
    const re = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`);
    expect(re.test(tokens)).toBe(true);
  });

  it('includes a prefers-reduced-motion block', () => {
    expect(tokens.includes('prefers-reduced-motion')).toBe(true);
  });
});

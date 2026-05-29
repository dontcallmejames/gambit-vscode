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

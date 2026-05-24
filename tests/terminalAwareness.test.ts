import { describe, expect, it } from 'vitest';
import {
  formatTerminalDiagnosisPrompt,
  prepareTerminalOutputForPrompt,
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
});

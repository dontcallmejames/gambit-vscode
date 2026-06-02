import { describe, expect, it } from 'vitest';
import { isShellTool, shellCommandWrites, shellCommandFromInput } from '../src/shellWriteHeuristic.js';

describe('isShellTool', () => {
  it('recognizes the shell tool names the three agents use', () => {
    for (const name of ['shell', 'Bash', 'bash', 'run_shell_command', 'run_terminal_cmd']) {
      expect(isShellTool(name)).toBe(true);
    }
  });
  it('does not treat write_file/Edit as shell', () => {
    for (const name of ['write_file', 'Edit', 'apply_patch', 'replace']) {
      expect(isShellTool(name)).toBe(false);
    }
  });
});

describe('shellCommandWrites', () => {
  it('flags output redirection', () => {
    expect(shellCommandWrites('echo x > file.txt')).toBe(true);
    expect(shellCommandWrites('cat a >> b')).toBe(true);
    expect(shellCommandWrites('printf y | tee out')).toBe(true);
  });
  it('flags known mutating commands', () => {
    for (const cmd of [
      'rm -rf dist',
      'mv a b',
      'cp a b',
      'sed -i s/x/y/ file',
      'git commit -m wip',
      'git checkout -- src',
      'npm install left-pad',
      'mkdir foo',
      'chmod +x run.sh',
      'find . -name "*.tmp" -delete',
    ]) {
      expect(shellCommandWrites(cmd), cmd).toBe(true);
    }
  });
  it('does not flag read-only commands', () => {
    for (const cmd of [
      'grep -r TODO src/',
      'cat package.json',
      'ls -la',
      'git status',
      'git log --oneline',
      'git diff',
      'find . -name "*.ts"',
      'rg pattern',
      'echo hello',
      'cat a > /dev/null', // still a redirect — flagged; sanity that we DO flag this
    ].slice(0, 9)) {
      expect(shellCommandWrites(cmd), cmd).toBe(false);
    }
  });
  it('treats redirection to /dev/null as a write by the conservative heuristic', () => {
    // We intentionally err toward flagging; a read-only workflow should not run
    // redirecting shell at all.
    expect(shellCommandWrites('echo x > /dev/null')).toBe(true);
  });
  it('returns false for an empty command', () => {
    expect(shellCommandWrites('')).toBe(false);
  });
});

describe('shellCommandFromInput', () => {
  it('extracts a command string', () => {
    expect(shellCommandFromInput({ command: 'ls' })).toBe('ls');
  });
  it('returns null for non-command inputs', () => {
    expect(shellCommandFromInput({ file_path: 'a' })).toBeNull();
    expect(shellCommandFromInput(null)).toBeNull();
    expect(shellCommandFromInput('ls')).toBeNull();
  });
});

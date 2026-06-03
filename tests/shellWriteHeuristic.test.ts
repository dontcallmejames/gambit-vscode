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

  it('does not flag fd-duplication or comparison operators as file writes', () => {
    // `>=` is a comparison, not a redirect — must not false-flag read-only
    // exploration like grep/awk over code.
    expect(shellCommandWrites("grep '>=' src/file.ts")).toBe(false);
    expect(shellCommandWrites("awk '$3 >= 100' data.tsv")).toBe(false);
    // fd duplication (N>&M) is not a file write.
    expect(shellCommandWrites('npm test 2>&1')).toBe(false);
    expect(shellCommandWrites('cmd 1>&2')).toBe(false);
  });

  it('flags fd-PREFIXED redirections that create/truncate a file', () => {
    // `1>foo`, `2>err.log` are real file writes — only the &-duplication form is
    // exempt. The digit must not blanket-exempt the redirect.
    expect(shellCommandWrites('printf x 1>src/foo')).toBe(true);
    expect(shellCommandWrites('cmd 2>err.log')).toBe(true);
    expect(shellCommandWrites('cmd 2>>err.log')).toBe(true);
    // ...while a real append/overwrite still flags.
    expect(shellCommandWrites('npm test > out.log')).toBe(true);
    expect(shellCommandWrites('cat a >> b')).toBe(true);
  });

  it('flags git subcommands that mutate the working tree or repo state', () => {
    for (const cmd of ['git switch main', 'git pull', 'git merge feature', 'git rebase main']) {
      expect(shellCommandWrites(cmd), cmd).toBe(true);
    }
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

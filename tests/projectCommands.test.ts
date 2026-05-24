import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  detectProjectCommandHints,
  formatProjectCommandHintsBlock,
  ProjectCommandProvider,
} from '../src/projectCommands.js';

describe('project command hints', () => {
  it('detects verification-oriented npm package scripts', async () => {
    const root = tempWorkspace();
    writeJson(root, 'package.json', {
      scripts: {
        test: 'vitest run',
        typecheck: 'tsc --noEmit',
        lint: 'eslint .',
        dev: 'vite',
      },
    });
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');

    const result = await detectProjectCommandHints(root);

    expect(result.packageManager).toBe('npm');
    expect(result.hints.map((hint) => [hint.label, hint.command, hint.source])).toEqual([
      ['test', 'npm test', 'package.json#scripts.test'],
      ['typecheck', 'npm run typecheck', 'package.json#scripts.typecheck'],
      ['lint', 'npm run lint', 'package.json#scripts.lint'],
    ]);
  });

  it('uses lockfiles to choose the package manager command prefix', async () => {
    const root = tempWorkspace();
    writeJson(root, 'package.json', {
      scripts: {
        test: 'vitest run',
        build: 'tsc',
      },
    });
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');

    const result = await detectProjectCommandHints(root);

    expect(result.packageManager).toBe('pnpm');
    expect(result.hints.map((hint) => hint.command)).toEqual([
      'pnpm run test',
      'pnpm run build',
    ]);
  });

  it('formats command hints as suggestions rather than execution evidence', async () => {
    const block = formatProjectCommandHintsBlock({
      packageManager: 'npm',
      hints: [
        { label: 'test', command: 'npm test', source: 'package.json#scripts.test' },
      ],
    });

    expect(block).toContain('[Project command hints]');
    expect(block).toContain('Detected package manager: npm');
    expect(block).toContain('Suggested commands only');
    expect(block).toContain('Do not run these commands unless the user explicitly asks or approves.');
    expect(block).toContain('- test: npm test (package.json#scripts.test)');
    expect(block).toContain('[/Project command hints]');
  });

  it('adds post-implement verification suggestions with explicit approval semantics', () => {
    const block = formatProjectCommandHintsBlock({
      packageManager: 'npm',
      hints: [
        { label: 'test', command: 'npm test', source: 'package.json#scripts.test' },
        { label: 'verify', command: 'npm run verify', source: 'package.json#scripts.verify' },
        { label: 'format', command: 'npm run format', source: 'package.json#scripts.format' },
        { label: 'typecheck', command: 'npm run typecheck', source: 'package.json#scripts.typecheck' },
      ],
    }, { includePostImplementVerification: true });

    const postImplementMarker = block.indexOf('[Post-implement verification suggestions]');
    expect(postImplementMarker).toBeGreaterThan(-1);
    const postImplementBlock = block.slice(postImplementMarker);
    expect(postImplementBlock).toContain('After implementation work is complete, suggest one verification command from this list.');
    expect(postImplementBlock).toContain('Approval semantics: do not run verification commands automatically; ask the user to approve the exact command first.');
    expect(postImplementBlock.indexOf('- verify: npm run verify (package.json#scripts.verify)'))
      .toBeLessThan(postImplementBlock.indexOf('- test: npm test (package.json#scripts.test)'));
    expect(postImplementBlock).toContain('- typecheck: npm run typecheck (package.json#scripts.typecheck)');
    expect(postImplementBlock).not.toContain('- format: npm run format');
    expect(postImplementBlock).toContain('[/Post-implement verification suggestions]');
  });

  it('returns no prompt block when there are no command hints', () => {
    expect(formatProjectCommandHintsBlock({ packageManager: 'unknown', hints: [] })).toBe('');
  });

  it('does not throw on missing or malformed package metadata', async () => {
    const missing = tempWorkspace();
    await expect(detectProjectCommandHints(missing)).resolves.toEqual({
      packageManager: 'unknown',
      hints: [],
    });

    const malformed = tempWorkspace();
    fs.writeFileSync(path.join(malformed, 'package.json'), '{not json', 'utf8');

    await expect(detectProjectCommandHints(malformed)).resolves.toEqual({
      packageManager: 'unknown',
      hints: [],
    });
  });

  it('caches hints until invalidated', async () => {
    const root = tempWorkspace();
    writeJson(root, 'package.json', { scripts: { test: 'vitest run' } });
    const provider = new ProjectCommandProvider(root);

    expect((await provider.retrieve()).hints.map((hint) => hint.command)).toEqual(['npm test']);
    writeJson(root, 'package.json', { scripts: { verify: 'npm test' } });
    expect((await provider.retrieve()).hints.map((hint) => hint.command)).toEqual(['npm test']);

    provider.invalidate();
    expect((await provider.retrieve()).hints.map((hint) => hint.command)).toEqual(['npm run verify']);
  });
});

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'veyra-project-commands-'));
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

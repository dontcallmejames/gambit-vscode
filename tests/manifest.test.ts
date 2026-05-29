import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '../package.json';
import lockfile from '../package-lock.json';

vi.mock('vscode', () => ({
  ThemeIcon: class {
    constructor(public id: string) {}
  },
  chat: {
    createChatParticipant: vi.fn(),
  },
  lm: {
    registerLanguageModelChatProvider: vi.fn(),
  },
  LanguageModelChatMessageRole: {
    User: 1,
    Assistant: 2,
  },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
}));

import { NATIVE_CHAT_PARTICIPANTS } from '../src/nativeChat.js';
import { VEYRA_LANGUAGE_MODELS } from '../src/languageModelProvider.js';

function repoText(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), 'utf8');
}

function userGuideText(): string {
  return repoText('docs', 'user-guide.md');
}

function developerVerificationText(): string {
  return repoText('docs', 'developer-verification.md');
}

function packagedDocsText(): string {
  return [
    repoText('README.md'),
    userGuideText(),
    developerVerificationText(),
  ].join('\n');
}

describe('extension manifest', () => {
  it('declares the VS Code API floor used by native chat and language model providers', () => {
    expect(manifest.engines.vscode).toBe('^1.118.0');
    expect(manifest.devDependencies['@types/vscode']).toBe('^1.118.0');
  });

  it('describes the actual Claude, Codex, and Gemini backend set', () => {
    expect(manifest.description).toContain('Claude');
    expect(manifest.description).toContain('Codex');
    expect(manifest.description).toContain('Gemini');
    expect(manifest.description).toContain('VS Code Chat');
    expect(manifest.description).toContain('Language Model');
    expect(manifest.description).toContain('Local-first');
    expect(manifest.description).toContain('docked trust view');
    expect(manifest.description.length).toBeLessThanOrEqual(140);
    expect(manifest.description).not.toMatch(/chat panel/i);
    expect(manifest.description).not.toMatch(/\bGPT\b/i);
  });

  it('keeps manifest text ASCII-safe for VS Code packaging metadata', () => {
    const rawManifest = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(rawManifest).not.toMatch(/[^\x00-\x7F]/);
  });

  it('declares Marketplace stable listing metadata and assets', () => {
    const manifestRecord = manifest as Record<string, unknown>;
    const icon = readFileSync(join(process.cwd(), 'resources', 'icon.png'));

    expect(manifest.name).toBe('veyra-vscode');
    expect(manifest.displayName).toBe('Veyra');
    expect(manifestRecord.private).toBeUndefined();
    expect(manifest.version).toBe('1.0.21');
    expect(manifest.preview).toBe(false);
    expect(manifest.license).toBe('SEE LICENSE IN LICENSE.txt');
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'https://github.com/dontcallmejames/veyra-vscode.git',
    });
    expect(manifest.bugs).toEqual({
      url: 'https://github.com/dontcallmejames/veyra-vscode/issues',
    });
    expect(manifest.homepage).toBe('https://github.com/dontcallmejames/veyra-vscode#readme');
    expect(manifest.icon).toBe('resources/icon.png');
    expect(manifest.galleryBanner).toEqual({
      color: '#15171a',
      theme: 'dark',
    });
    expect(manifest.keywords).toEqual([
      'ai',
      'agents',
      'chat',
      'claude',
      'codex',
      'gemini',
      'workflow',
      'vscode',
    ]);
    expect(existsSync(join(process.cwd(), 'LICENSE.txt'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'CHANGELOG.md'))).toBe(true);
    expect(icon.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(icon.readUInt32BE(16)).toBe(128);
    expect(icon.readUInt32BE(20)).toBe(128);
  });

  it('documents the v1.0 release contents in the changelog', () => {
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');

    expect(changelog).toContain('## 1.0.0');
    expect(changelog).toContain('workflow templates');
    expect(changelog).toContain('workspace role customization');
    expect(changelog).toContain('post-implement verification suggestions');
    expect(changelog).toContain('v1.0 stabilization');
  });

  it('cross-links the repository README and the Marketplace overview', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

    expect(readme).toContain(
      'https://marketplace.visualstudio.com/items?itemName=dontcallmejames.veyra-vscode',
    );
    expect(readme).toContain('https://github.com/dontcallmejames/veyra-vscode');
    expect(readme).toContain('https://github.com/dontcallmejames/veyra-vscode/issues');
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'https://github.com/dontcallmejames/veyra-vscode.git',
    });
    expect(manifest.homepage).toBe('https://github.com/dontcallmejames/veyra-vscode#readme');
    expect(manifest.bugs).toEqual({
      url: 'https://github.com/dontcallmejames/veyra-vscode/issues',
    });
  });

  it('uses the package files allowlist as the single VSIX inclusion strategy', () => {
    expect(existsSync(join(process.cwd(), '.vscodeignore'))).toBe(false);
    expect(manifest.files).toContain('package.json');
    expect(manifest.files).not.toContain('.vscodeignore');
  });

  it('backs the Run Extension launch config with an explicit build task', () => {
    const launch = JSON.parse(readFileSync(join(process.cwd(), '.vscode', 'launch.json'), 'utf8'));
    const tasksPath = join(process.cwd(), '.vscode', 'tasks.json');
    expect(existsSync(tasksPath)).toBe(true);
    const tasks = JSON.parse(readFileSync(tasksPath, 'utf8'));
    const runExtension = launch.configurations.find(
      (configuration: { name?: string }) => configuration.name === 'Run Extension',
    );

    expect(runExtension).toMatchObject({
      type: 'extensionHost',
      request: 'launch',
      preLaunchTask: 'npm: build',
    });
    expect(runExtension.args).toContain('--extensionDevelopmentPath=${workspaceFolder}');
    expect(runExtension.outFiles).toContain('${workspaceFolder}/dist/**/*.js');

    const buildTask = tasks.tasks.find(
      (task: { label?: string }) => task.label === runExtension.preLaunchTask,
    );
    expect(buildTask).toMatchObject({
      label: 'npm: build',
      type: 'npm',
      script: 'build',
    });
    expect(buildTask.problemMatcher).toEqual([]);
  });

  it('keeps package-lock root metadata synchronized with package.json', () => {
    expect(lockfile.name).toBe(manifest.name);
    expect(lockfile.version).toBe(manifest.version);
    expect(lockfile.packages[''].name).toBe(manifest.name);
    expect(lockfile.packages[''].version).toBe(manifest.version);
    expect(lockfile.packages[''].engines).toEqual(manifest.engines);
    expect(lockfile.packages[''].devDependencies['@types/vscode']).toBe(
      manifest.devDependencies['@types/vscode'],
    );
  });

  it('provides a single local verification script for release readiness checks', () => {
    expect(manifest.scripts.verify).toBe(
      'npm run typecheck && npm test && npm run build && npm run verify:package && npm run test:integration && git diff --check',
    );
    expect(manifest.scripts.test).toBe(
      'vitest run --passWithNoTests --environment node --exclude "tests/integration/**" --exclude ".vscode-test/**" tests',
    );
    expect(manifest.scripts['verify:package']).toBe('node scripts/verify-package.mjs');
    expect(manifest.scripts['verify:live-ready']).toBe('node scripts/verify-live-ready.mjs');
    expect(manifest.scripts['verify:completion']).toBe('npm run verify && npm run test:vscode-smoke && npm run verify:live-ready');
    expect(manifest.scripts['preverify:goal']).toBe('node scripts/require-live-opt-in.mjs');
    expect(manifest.scripts['verify:goal']).toBe('npm run verify:completion && npm run test:integration:live');
    expect(manifest.scripts['package:vsix']).toBe(
      'npm run build && npm run verify:package && node scripts/package-vsix.mjs',
    );
    expect(manifest.scripts['test:vscode-smoke']).toBe('npm run build && node scripts/run-vscode-smoke.mjs');
    expect(manifest.scripts['test:integration']).toContain('--exclude ".vscode-test/**"');
    expect(manifest.scripts['pretest:integration:live']).toBe(
      'node scripts/require-live-opt-in.mjs && npm run verify:live-ready',
    );
    expect(manifest.scripts['test:integration:live']).toContain('--exclude ".vscode-test/**"');
    expect(manifest.scripts['test:integration:live']).toContain('tests/integration/veyra.live.test.ts');

    const vitestConfigPath = join(process.cwd(), 'vitest.config.mjs');
    expect(existsSync(vitestConfigPath)).toBe(true);
    const vitestConfig = readFileSync(vitestConfigPath, 'utf8');
    expect(vitestConfig).toContain('configDefaults.exclude');
    expect(vitestConfig).toContain("'**/.vscode/veyra/**'");

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const developerVerification = developerVerificationText();
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const liveReadme = readFileSync(join(process.cwd(), 'tests', 'integration', 'README.md'), 'utf8');
    expect(readme).toContain('docs/developer-verification.md');
    expect(readme).toContain('Run Extension');
    expect(readme).toContain('F5');
    expect(readme).toContain('.vscode/launch.json');
    expect(developerVerification).toContain('npm run verify:completion');
    expect(developerVerification).toContain('npm run verify:goal');
    expect(readme).toContain('Veyra: Configure Codex/Gemini CLI paths');
    expect(readme).toContain('Veyra view');
    expect(readme).toContain('Veyra: Open View');
    expect(readme).toContain('command id `veyra.openPanel` remains available');
    expect(developerVerification).toContain('Veyra: Show live validation guide');
    expect(readme).not.toContain('legacy Veyra panel');
    expect(readme).not.toContain('Use version `0.0.8` or newer');
    expect(readme).not.toContain('updated to `0.0.8` or newer');
    expect(developerVerification).toContain('explicit JS bundle, native executable, or npm shim paths');
    expect(developerVerification).toContain('stale PATH shims');
    expect(developerVerification).toContain('falls back to `npm root -g`');
    expect(developerVerification).toContain('shared-context relay');
    expect(developerVerification).toContain('write-capable implementation');
    expect(developerVerification).toContain("Remove-Item Env:\\VEYRA_RUN_LIVE -ErrorAction SilentlyContinue");
    expect(developerVerification).toContain("stays set for the current terminal session");
    expect(audit).toContain('npm run verify:completion');
    expect(audit).toContain('npm run verify:goal');
    expect(audit).toContain('Veyra: Show live validation guide');
    expect(audit).toContain('Veyra: Configure Codex/Gemini CLI paths');
    expect(audit).not.toContain('verifies `Veyra: Open Panel` reveals and validates the docked Veyra view');
    expect(audit).not.toContain('automated VS Code smoke test already validates docked Veyra view');
    expect(audit).not.toContain('docked Veyra view reveal, active-dispatch');
    expect(smokeChecklist).toContain('paste JS bundle paths, native executable paths, Antigravity `agy.exe`, or npm shim paths');
    expect(smokeChecklist).toContain('skips stale PATH shims');
    expect(smokeChecklist).toContain('Veyra: Show live validation guide');
    expect(smokeChecklist).toContain('Veyra: Open View');
    expect(smokeChecklist).toContain('Veyra docked view');
    expect(smokeChecklist).toContain('@veyra are you here?');
    expect(smokeChecklist).not.toContain('webview tab');
    expect(smokeChecklist).not.toContain('Use version `0.0.8` or newer');
    expect(smokeChecklist).not.toContain('reveals and validates the docked Veyra view');
    expect(smokeChecklist).toContain('reports inaccessible, misconfigured, or Node.js missing');
    expect(smokeChecklist).toContain('install Node.js or switch to native executable paths');
    expect(smokeChecklist).toContain('Before sending prompts that can reach paid backends');
    expect(smokeChecklist).toContain('npm run verify:goal');
    expect(smokeChecklist).toContain('npm: build');
    expect(smokeChecklist).toContain('.vscode/launch.json');
    expect(smokeChecklist).toContain('Continue only when Claude, Codex, and Gemini all report `ready`');
    expect(liveReadme).toContain('all-agent Veyra handoff');
    expect(liveReadme).toContain('first requires the explicit `VEYRA_RUN_LIVE=1` paid-prompt opt-in');
    expect(liveReadme).toContain('then automatically runs `npm run verify:live-ready`');
    expect(liveReadme).toContain('npm run verify:goal');
    expect(liveReadme).toContain("$env:VEYRA_RUN_LIVE = '1'");
    expect(liveReadme).toContain('In Bash-compatible shells');
    expect(liveReadme).toContain('Remove-Item Env:\\VEYRA_RUN_LIVE -ErrorAction SilentlyContinue');
    expect(liveReadme).toContain('VEYRA_CODEX_CLI_PATH');
    expect(liveReadme).toContain('VEYRA_ANTIGRAVITY_CLI_PATH');
    expect(liveReadme).toContain('VEYRA_GEMINI_CLI_PATH');
    expect(liveReadme).toContain('veyra.codexCliPath');
    expect(liveReadme).toContain('veyra.antigravityCliPath');
    expect(liveReadme).toContain('veyra.geminiCliPath');
    expect(liveReadme).toContain('JS bundle paths, native executables, or Windows npm shim paths');
    expect(liveReadme).toContain('resolved to the underlying JS bundle');
    expect(liveReadme).toContain('Node.js');
    expect(liveReadme).toContain('node` command is on PATH');
    expect(liveReadme).toContain('first uses native `codex.exe`, `agy.exe`, and `gemini.exe` executables on PATH');
    expect(liveReadme).toContain('then recognized PATH npm shims');
    expect(liveReadme).toContain('missing derived bundle targets are skipped');
    expect(liveReadme).toContain('Native executable paths do not need the JS-bundle Node launcher');
  });

  it('contributes settings for explicit Codex, Antigravity, and Gemini CLI paths', () => {
    const properties = manifest.contributes.configuration.properties;

    expect(properties['veyra.codexCliPath']).toMatchObject({
      type: 'string',
      default: '',
    });
    const codexPattern = new RegExp(properties['veyra.codexCliPath'].pattern);
    expect(codexPattern.test('')).toBe(true);
    expect(codexPattern.test('C:\\tools\\codex.js')).toBe(true);
    expect(codexPattern.test('C:\\tools\\codex.exe')).toBe(true);
    expect(codexPattern.test('/usr/local/bin/codex')).toBe(true);
    expect(codexPattern.test('C:\\tools\\not-codex.exe')).toBe(false);
    expect(codexPattern.test('C:\\Users\\tester\\AppData\\Roaming\\npm\\codex.cmd')).toBe(true);
    expect(codexPattern.test('C:\\Users\\tester\\AppData\\Roaming\\npm\\codex.ps1')).toBe(true);
    expect(properties['veyra.codexCliPath'].patternErrorMessage).toContain('codex.js, codex.exe, codex, codex.cmd, codex.bat, or codex.ps1');
    expect(properties['veyra.codexCliPath'].description).toContain('VEYRA_CODEX_CLI_PATH');
    expect(properties['veyra.codexCliPath'].description).toContain('Windows');
    expect(properties['veyra.codexCliPath'].description).toContain('.cmd');
    expect(properties['veyra.codexCliPath'].description).toContain('JS bundle');
    expect(properties['veyra.codexCliPath'].description).toContain('resolved to');
    expect(properties['veyra.codexCliPath'].description).toContain('codex.exe');

    expect(properties['veyra.antigravityCliPath']).toMatchObject({
      type: 'string',
      default: '',
    });
    const antigravityPattern = new RegExp(properties['veyra.antigravityCliPath'].pattern);
    expect(antigravityPattern.test('')).toBe(true);
    expect(antigravityPattern.test('C:\\tools\\agy.exe')).toBe(true);
    expect(antigravityPattern.test('/usr/local/bin/agy')).toBe(true);
    expect(antigravityPattern.test('C:\\tools\\not-agy.exe')).toBe(false);
    expect(properties['veyra.antigravityCliPath'].patternErrorMessage).toContain('agy.exe or agy');
    expect(properties['veyra.antigravityCliPath'].description).toContain('VEYRA_ANTIGRAVITY_CLI_PATH');
    expect(properties['veyra.antigravityCliPath'].description).toContain('Antigravity');
    expect(properties['veyra.antigravityCliPath'].description).toContain('agy.exe');

    expect(properties['veyra.geminiCliPath']).toMatchObject({
      type: 'string',
      default: '',
    });
    const geminiPattern = new RegExp(properties['veyra.geminiCliPath'].pattern);
    expect(geminiPattern.test('')).toBe(true);
    expect(geminiPattern.test('C:\\tools\\gemini.js')).toBe(true);
    expect(geminiPattern.test('C:\\tools\\gemini.exe')).toBe(true);
    expect(geminiPattern.test('/usr/local/bin/gemini')).toBe(true);
    expect(geminiPattern.test('C:\\tools\\not-gemini.exe')).toBe(false);
    expect(geminiPattern.test('C:\\Users\\tester\\AppData\\Roaming\\npm\\gemini.cmd')).toBe(true);
    expect(geminiPattern.test('C:\\Users\\tester\\AppData\\Roaming\\npm\\gemini.ps1')).toBe(true);
    expect(properties['veyra.geminiCliPath'].patternErrorMessage).toContain('gemini.js, gemini.exe, gemini, gemini.cmd, gemini.bat, or gemini.ps1');
    expect(properties['veyra.geminiCliPath'].description).toContain('VEYRA_GEMINI_CLI_PATH');
    expect(properties['veyra.geminiCliPath'].description).toContain('Windows');
    expect(properties['veyra.geminiCliPath'].description).toContain('.cmd');
    expect(properties['veyra.geminiCliPath'].description).toContain('JS bundle');
    expect(properties['veyra.geminiCliPath'].description).toContain('resolved to');
    expect(properties['veyra.geminiCliPath'].description).toContain('gemini.exe');
  });

  it('contributes workspace context settings documented in the README', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    const properties = manifest.contributes.configuration.properties;
    expect(properties['veyra.workspaceContext.maxFiles']).toMatchObject({
      type: 'number',
      default: 8,
      minimum: 1,
    });
    expect(properties['veyra.workspaceContext.maxSnippetLines']).toMatchObject({
      type: 'number',
      default: 80,
      minimum: 1,
    });
    expect(properties['veyra.workspaceContext.maxFileBytes']).toMatchObject({
      type: 'number',
      default: 1000000,
      minimum: 1024,
    });

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const userGuide = userGuideText();
    expect(readme).toContain('@codebase');
    expect(userGuide).toContain('Retrieval Quality and Embedding Readiness v0.1');
    expect(userGuide).toContain('why files were selected');
    expect(userGuide).toContain('where lexical retrieval may have missed context');
    expect(userGuide).toContain('no cloud indexing');
    expect(userGuide).toContain('no paid embedding calls');
    expect(userGuide).toContain('no background repository scans');
    expect(userGuide).toContain('veyra.workspaceContext.maxFiles');
    expect(userGuide).toContain('veyra.workspaceContext.maxSnippetLines');
    expect(userGuide).toContain('veyra.workspaceContext.maxFileBytes');
  });

  it('keeps the Enterprise Polish design doc aligned with the current workflow-first roadmap', () => {
    const design = repoText('docs', 'superpowers', 'specs', '2026-05-28-veyra-enterprise-polish-v0.1-design.md');

    expect(design).not.toContain('Tracked in Milestone 4');
    expect(design).not.toContain('Tracked in Milestone 5');
    expect(design).toContain('Workflow Professionalism v0.1 is a prerequisite pass before visual Phase 1');
    expect(design).toContain('current roadmap');
  });

  it('documents retrieval quality and embedding readiness guardrails', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, smokeChecklist, roadmap]) {
      expect(document).toContain('Retrieval Quality and Embedding Readiness v0.1');
      expect(document).toContain('local lexical');
      expect(document).toContain('no cloud indexing');
      expect(document).toContain('no background repository scans');
    }
    expect(userGuide).toContain('embedding readiness is inactive');
    expect(userGuide).toContain('attach known files with `@file`');
    expect(changelog).toContain('@codebase retrieval');
  });

  it('documents retrieval feedback as a local-only slice', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, smokeChecklist, roadmap]) {
      expect(document).toContain('Retrieval Feedback v0.3');
    }
    expect(userGuide).toContain('open selected files');
    expect(userGuide).toContain('preserves the original');
    expect(userGuide).toContain('does not silently send prompts');
    expect(userGuide).toContain('execute commands');
    expect(userGuide).toContain('upload code');
    expect(userGuide).toContain('call embeddings');
    expect(userGuide).toContain('create a background index');
    expect(userGuide).toContain('create hidden memory');
    expect(smokeChecklist).toContain('explicit open-file action');
    expect(smokeChecklist).toContain('visible refined `@codebase` and explicit `@file` drafts');
    expect(audit).toContain('selected-file reasons');
    expect(roadmap).toContain('do not silently dispatch prompts');
    expect(roadmap).toContain('create background indexes');
    expect(changelog).toContain('no hidden dispatches');
    expect(changelog).toContain('originating Veyra workflow command');
  });

  it('documents retrieval quality v0.4 missed-context feedback and ranking signals', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, smokeChecklist, roadmap]) {
      expect(document).toContain('Retrieval Quality v0.4');
      expect(document).toContain('Known missing files');
      expect(document).toContain('file-name');
      expect(document).toContain('symbol');
      expect(document).toContain('test');
      expect(document).toContain('import');
      expect(document).toContain('no embeddings');
      expect(document).toContain('no background indexing');
      expect(document).toContain('no hidden memory');
    }
    expect(userGuide).toContain('visible/manual missed-context feedback');
    expect(userGuide).toContain('does not persist marked missing files');
    expect(changelog).toContain('copyable retrieval reports');
    expect(audit).toContain('npx vitest run --environment node --exclude ".vscode-test/**" tests/retrievalFeedback.test.tsx');
    expect(roadmap).toContain('does not add embeddings, uploads, background indexing, hidden memory, or automatic dispatch');
  });

  it('keeps the README new-user overview compact while preserving detailed setup guidance', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const quickstartIndex = readme.indexOf('## Quickstart');
    const overviewIndex = readme.indexOf('## Feature Overview');
    const requirementsIndex = readme.indexOf('## Requirements');
    const overview = readme.slice(
      overviewIndex,
      requirementsIndex,
    );
    const opening = readme.slice(0, quickstartIndex);
    const quickstart = readme.slice(quickstartIndex, overviewIndex);
    const readmeLines = readme.trimEnd().split(/\r?\n/u);
    const topLevelBullets = overview.split(/\r?\n/u).filter((line) => line.startsWith('- '));
    const quickstartSteps = quickstart.split(/\r?\n/u).filter((line) => /^\d+\./u.test(line));

    expect(quickstartIndex).toBeGreaterThan(0);
    expect(overviewIndex).toBeGreaterThan(quickstartIndex);
    expect(requirementsIndex).toBeGreaterThan(overviewIndex);
    expect(opening).toContain('local-first');
    expect(opening).toContain('for developers');
    expect(opening).toContain('does not run hidden commands');
    expect(opening).toContain('does not upload your repository');
    expect(quickstartSteps.length).toBeLessThanOrEqual(8);
    expect(topLevelBullets.length).toBeLessThanOrEqual(6);
    expect(readmeLines.length).toBeLessThanOrEqual(95);
    expect(overview).not.toMatch(/\bv\d+\.\d+\b/u);
    expect(overview).not.toMatch(/Retrieval Feedback|Presentation Density|Workflow Artifact History|Inline Autocomplete|Local Model Support/u);
    expect(readme).toContain('## Requirements');
    expect(readme).toContain('## Quickstart');
    expect(readme).toContain('## Detailed Guides');
    expect(readme).toContain('docs/user-guide.md');
    expect(readme).toContain('docs/developer-verification.md');
    expect(readme).toContain('Veyra: Configure Codex/Gemini CLI paths');
    expect(readme).not.toContain('## Using Native Chat');
    expect(readme).not.toContain('### Context And Tuning');
    expect(readme).not.toContain('## Settings');
    expect(readme).not.toContain('## Verification');
  });

  it('keeps the Marketplace-facing README summary skimmable and trust-focused', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const summary = readme.slice(0, readme.indexOf('## Development'));

    for (const requiredText of [
      'local-first',
      'for developers',
      'Claude CLI',
      'Codex CLI',
      'Antigravity CLI',
      '/review',
      '/debate',
      '/consensus',
      '/implement',
      'docked',
      'Trust Center',
      '@codebase',
      'does not run hidden commands',
      'does not upload your repository',
      'does not approve destructive follow-up work',
    ]) {
      expect(summary).toContain(requiredText);
    }
    expect(summary).not.toMatch(/\bv0\.[12]\b/u);
  });

  it('keeps the packaged user guide navigable after moving detailed README content', () => {
    const userGuide = userGuideText();

    expect(userGuide).toContain('## Contents');
    for (const link of [
      '[Using Native Chat](#using-native-chat)',
      '[Composer Discovery](#composer-discovery)',
      '[Workflow Modes](#workflow-modes)',
      '[Context And Tuning](#context-and-tuning)',
      '[Terminal And Verification Context](#terminal-and-verification-context)',
      '[GitHub And CI Workflow Context](#github-and-ci-workflow-context)',
      '[Using Veyra As A Language Model](#using-veyra-as-a-language-model)',
      '[Edit Coordination](#edit-coordination)',
      '[Trust Center](#trust-center)',
      '[Workflow Replay](#workflow-replay)',
      '[Checkpoints And Rollback](#checkpoints-and-rollback)',
      '[Settings](#settings)',
    ]) {
      expect(userGuide).toContain(link);
    }
    expect(userGuide.match(/\[Back to top\]\(#veyra-user-guide\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('contributes opt-in inline autocomplete settings and docs', () => {
    const properties = manifest.contributes.configuration.properties;
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    expect(manifest.activationEvents).toContain('onStartupFinished');
    expect(properties['veyra.inlineAutocomplete.enabled']).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(properties['veyra.inlineAutocomplete.agent']).toMatchObject({
      type: 'string',
      enum: ['codex', 'claude', 'gemini'],
      default: 'codex',
    });
    expect(properties['veyra.inlineAutocomplete.maxContextLines']).toMatchObject({
      type: 'number',
      default: 40,
      minimum: 5,
      maximum: 200,
    });
    expect(properties['veyra.inlineAutocomplete.maxSuggestionChars']).toMatchObject({
      type: 'number',
      default: 240,
      minimum: 20,
      maximum: 1000,
    });
    expect(properties['veyra.inlineAutocomplete.minPrefixChars']).toMatchObject({
      type: 'number',
      default: 12,
      minimum: 0,
      maximum: 200,
    });
    expect(userGuide).toContain('Inline Autocomplete v0.1');
    expect(userGuide).toContain('veyra.inlineAutocomplete.enabled');
    expect(userGuide).toContain('manual inline suggestion');
    expect(userGuide).toContain('read-only direct-agent request');
    expect(changelog).toContain('Inline Autocomplete v0.1');
    expect(roadmap).toContain('Inline Autocomplete v0.1');
  });

  it('contributes diff preview commands and settings', () => {
    const properties = manifest.contributes.configuration.properties;
    const commands = new Map(manifest.contributes.commands.map((command) => [command.command, command.title]));
    const userGuide = userGuideText();

    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.openPendingChanges');
    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.acceptPendingChanges');
    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.rejectPendingChanges');
    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.acceptPendingChangeFile');
    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.rejectPendingChangeFile');
    expect(commands.get('veyra.openPendingChanges')).toBe('Veyra: Open Pending Changes');
    expect(commands.get('veyra.acceptPendingChanges')).toBe('Veyra: Accept Pending Changes');
    expect(commands.get('veyra.rejectPendingChanges')).toBe('Veyra: Reject Pending Changes');
    expect(commands.get('veyra.acceptPendingChangeFile')).toBe('Veyra: Accept Pending Change File');
    expect(commands.get('veyra.rejectPendingChangeFile')).toBe('Veyra: Reject Pending Change File');
    expect(manifest.activationEvents).toContain('onCommand:veyra.openPendingChanges');
    expect(manifest.activationEvents).toContain('onCommand:veyra.acceptPendingChanges');
    expect(manifest.activationEvents).toContain('onCommand:veyra.rejectPendingChanges');
    expect(manifest.activationEvents).toContain('onCommand:veyra.acceptPendingChangeFile');
    expect(manifest.activationEvents).toContain('onCommand:veyra.rejectPendingChangeFile');
    expect(properties['veyra.diffPreview.enabled']).toMatchObject({
      type: 'boolean',
      default: true,
    });
    expect(properties['veyra.diffPreview.maxFileBytes']).toMatchObject({
      type: 'number',
      default: 1000000,
      minimum: 1024,
    });
    expect(userGuide).toContain('Veyra: Open Pending Changes');
    expect(userGuide).toContain('Veyra: Accept Pending Changes');
    expect(userGuide).toContain('Veyra: Reject Pending Changes');
    expect(userGuide).toContain('Veyra: Accept Pending Change File');
    expect(userGuide).toContain('Veyra: Reject Pending Change File');
    expect(userGuide).toContain('individual files');
    expect(userGuide).toContain('veyra.diffPreview.enabled');
    expect(userGuide).toContain('veyra.diffPreview.maxFileBytes');
  });

  it('documents workflow synthesis output shapes', () => {
    const userGuide = userGuideText();

    expect(userGuide).toContain('Veyra Synthesis');
    expect(userGuide).toContain('Blocking issues');
    expect(userGuide).toContain('Advisory risks');
    expect(userGuide).toContain('Missing tests');
    expect(userGuide).toContain('Follow-up suggestions');
    expect(userGuide).toContain('None found');
    expect(userGuide).toContain('Recommended approach');
    expect(userGuide).toContain('Handoff Summary');
    expect(userGuide).toContain('Not run');
  });

  it('contributes conservative local-model support settings', () => {
    const properties = manifest.contributes.configuration.properties;

    expect(properties['veyra.localModels.mode']).toMatchObject({
      type: 'string',
      enum: ['disabled', 'informational'],
      default: 'disabled',
    });
    expect(properties['veyra.localModels.mode'].description).toContain('diagnostics and documentation only');
    expect(properties['veyra.localModels.mode'].description).toContain('does not replace Claude, Codex, or Gemini routing');
    expect(properties['veyra.localModels.provider']).toMatchObject({
      type: 'string',
      default: '',
    });
    expect(properties['veyra.localModels.endpoint']).toMatchObject({
      type: 'string',
      default: '',
    });
    const endpointPattern = new RegExp(properties['veyra.localModels.endpoint'].pattern);
    expect(endpointPattern.test('')).toBe(true);
    expect(endpointPattern.test('http://localhost:11434/v1')).toBe(true);
    expect(endpointPattern.test('https://models.example.test/v1')).toBe(true);
    expect(endpointPattern.test('file:///tmp/model')).toBe(false);
    expect(properties['veyra.localModels.model']).toMatchObject({
      type: 'string',
      default: '',
    });
  });

  it('contributes workflow template and workspace role customization settings', () => {
    const properties = manifest.contributes.configuration.properties;
    const userGuide = userGuideText();

    expect(properties['veyra.workflow.template']).toMatchObject({
      type: 'string',
      default: 'none',
      enum: [
        'none',
        'architecture-review',
        'security-review',
        'test-improvement',
        'refactor-plan',
        'implementation-with-review',
      ],
    });
    expect(properties['veyra.agentRoles.claude']).toMatchObject({ type: 'string', default: '' });
    expect(properties['veyra.agentRoles.codex']).toMatchObject({ type: 'string', default: '' });
    expect(properties['veyra.agentRoles.gemini']).toMatchObject({ type: 'string', default: '' });
    expect(userGuide).toContain('veyra.workflow.template');
    expect(userGuide).toContain('security-review');
    expect(userGuide).toContain('veyra.agentRoles.claude');
    expect(userGuide).toContain('workspace role customization');
  });

  it('documents terminal awareness guardrails', () => {
    const userGuide = userGuideText();
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const commands = new Map(manifest.contributes.commands.map((command) => [command.command, command.title]));

    for (const document of [userGuide, smokeChecklist]) {
      const normalized = document.toLowerCase();

      expect(normalized).toContain('terminal selections');
      expect(normalized).toContain('project command hints');
      expect(normalized).toContain('post-implement verification suggestions');
      expect(normalized).toContain('approve the exact command');
      expect(normalized).toContain('run verification command');
      expect(normalized).toContain('captured output');
      expect(document).toContain('Do not run');
    }
    expect(commands.get('veyra.diagnoseTerminalOutput')).toBe('Veyra: Diagnose Terminal Output');
    expect(commands.get('veyra.runVerificationCommand')).toBe('Veyra: Run Verification Command');
    expect(commands.get('veyra.reviewBrowserTestOutput')).toBe('Veyra: Review Browser/Test Output');
    expect(commands.get('veyra.summarizeGitStatus')).toBe('Veyra: Summarize Git Status');
    expect(commands.get('veyra.reviewCiWorkflowOutput')).toBe('Veyra: Review CI/PR Output');
    expect(manifest.activationEvents).toContain('onCommand:veyra.diagnoseTerminalOutput');
    expect(manifest.activationEvents).toContain('onCommand:veyra.runVerificationCommand');
    expect(manifest.activationEvents).toContain('onCommand:veyra.reviewBrowserTestOutput');
    expect(manifest.activationEvents).toContain('onCommand:veyra.summarizeGitStatus');
    expect(manifest.activationEvents).toContain('onCommand:veyra.reviewCiWorkflowOutput');
    expect(userGuide).toContain('Veyra: Diagnose Terminal Output');
    expect(userGuide).toContain('Veyra: Run Verification Command');
    expect(userGuide).toContain('Veyra: Review Browser/Test Output');
    expect(userGuide).toContain('copied or pasted terminal output');
    expect(userGuide).toContain('does not read terminal scrollback directly');
  });

  it('documents GitHub and CI workflow awareness guardrails', () => {
    const userGuide = userGuideText();
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const commands = new Map(manifest.contributes.commands.map((command) => [command.command, command.title]));

    for (const document of [userGuide, smokeChecklist]) {
      const normalized = document.toLowerCase();

      expect(normalized).toContain('github and ci workflow context');
      expect(normalized).toContain('summarize git status');
      expect(normalized).toContain('review ci/pr output');
      expect(normalized).toContain('prepare pr package draft');
      expect(normalized).toContain('review browser/test output');
      expect(normalized).toContain('draft pr summary');
      expect(normalized).toContain('changed-file explanation');
      expect(normalized).toContain('pr readiness checklist');
      expect(normalized).toContain('verification evidence');
      expect(normalized).toContain('no hidden network');
      expect(normalized).toContain('no automatic pushes');
      expect(normalized).toContain('read-only git');
    }
    expect(commands.get('veyra.summarizeGitStatus')).toBe('Veyra: Summarize Git Status');
    expect(commands.get('veyra.reviewCiWorkflowOutput')).toBe('Veyra: Review CI/PR Output');
    expect(commands.get('veyra.preparePrPackageDraft')).toBe('Veyra: Prepare PR Package Draft');
    expect(commands.get('veyra.reviewBrowserTestOutput')).toBe('Veyra: Review Browser/Test Output');
    expect(manifest.activationEvents).toContain('onCommand:veyra.summarizeGitStatus');
    expect(manifest.activationEvents).toContain('onCommand:veyra.reviewCiWorkflowOutput');
    expect(manifest.activationEvents).toContain('onCommand:veyra.preparePrPackageDraft');
    expect(manifest.activationEvents).toContain('onCommand:veyra.reviewBrowserTestOutput');
    expect(userGuide).toContain('Veyra: Summarize Git Status');
    expect(userGuide).toContain('Veyra: Review CI/PR Output');
    expect(userGuide).toContain('Veyra: Prepare PR Package Draft');
    expect(userGuide).toContain('Veyra: Review Browser/Test Output');
  });

  it('documents docked composer command discovery', () => {
    const userGuide = userGuideText();

    expect(userGuide).toContain('Type `/` in the docked Veyra composer');
    expect(userGuide).toContain('/review');
    expect(userGuide).toContain('Veyra: Open Pending Changes');
    expect(userGuide).toContain('Veyra: Run Verification Command');
    expect(userGuide).toContain('Veyra: Review Browser/Test Output');
    expect(userGuide).toContain('Veyra: Summarize Git Status');
    expect(userGuide).toContain('Veyra: Review CI/PR Output');
    expect(userGuide).toContain('Veyra: Prepare PR Package Draft');
    expect(userGuide).toContain('Veyra: Roll Back Latest Checkpoint');
    expect(userGuide).toContain('Veyra: Copy Diagnostic Report');
  });

  it('documents safe Markdown rendering and provider transparency', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, roadmap]) {
      expect(document).toContain('Markdown');
      expect(document).toContain('provider transparency');
      expect(document).toContain('Claude CLI');
      expect(document).toContain('Codex CLI');
      expect(document).toContain('Antigravity CLI');
    }
    expect(userGuide).toContain('Veyra renders agent Markdown safely');
    expect(userGuide).toContain('Veyra does not hardcode vendor model promises');
    expect(userGuide).toContain('CLI/provider versions');
  });

  it('documents Local Model Support v0.1 guardrails', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, smokeChecklist, roadmap]) {
      expect(document).toContain('Local Model Support v0.1');
      expect(document).toContain('local/self-hosted');
      expect(document).toContain('no automatic model downloads');
      expect(document).toContain('no hidden server launches');
      expect(document).toContain('no background network probing');
    }
    expect(userGuide).toContain('veyra.localModels.mode');
    expect(userGuide).toContain('veyra.localModels.endpoint');
    expect(userGuide).toContain('veyra.localModels.model');
    expect(userGuide).toContain('diagnostics only');
    expect(userGuide).toContain('does not replace Claude, Codex, or Gemini routing');
  });

  it('documents the Mission Control timeline presentation slice', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, roadmap]) {
      expect(document).toContain('Mission Control timeline');
      expect(document).toContain('Presentation Layer');
    }
    expect(userGuide).toContain('queued, active, complete, failed, cancelled, and waiting');
  });

  it('documents the Presentation Density docked-view slice', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, roadmap]) {
      expect(document).toContain('Presentation Density v0.1');
      expect(document).toContain('Mission Control');
      expect(document).toContain('Trust Center');
      expect(document).toContain('Workflows');
    }
    expect(userGuide).toContain('collapsed by default');
    expect(userGuide).toContain('opens automatically for urgent actionable signals');
    expect(changelog).toContain('combining replay/history');
    expect(roadmap).toContain('persists expanded/collapsed panel state');
  });

  it('documents the structured workflow artifact cards presentation slice', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, audit, roadmap]) {
      expect(document).toContain('Structured Workflow Artifact Cards');
      expect(document).toContain('Veyra Synthesis');
      expect(document).toContain('Handoff Summary');
    }
    expect(userGuide).toContain('blocking issues');
    expect(changelog).toContain('safe Markdown fallback');
  });

  it('documents workflow artifact history guardrails', () => {
    const userGuide = userGuideText();
    const changelog = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const roadmap = readFileSync(join(process.cwd(), 'docs', 'superpowers', 'specs', '2026-05-11-veyra-v1-roadmap-design.md'), 'utf8');

    for (const document of [userGuide, changelog, roadmap]) {
      expect(document).toContain('Workflow Artifact History v0.2');
      expect(document).toContain('existing session messages');
      expect(document).toContain('no separate source of truth');
    }
    expect(userGuide).toContain('local-only');
    expect(userGuide).toContain('Prepare replay');
    expect(userGuide).toContain('Copy summary');
    expect(userGuide).toContain('does not create a second source of truth');
    expect(roadmap).toContain('does not perform hidden terminal execution');
    expect(changelog).toContain('manual replay guardrails');
  });

  it('contributes checkpoint commands and settings', () => {
    const properties = manifest.contributes.configuration.properties;
    const commands = new Map(manifest.contributes.commands.map((command) => [command.command, command.title]));
    const userGuide = userGuideText();

    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.createCheckpoint');
    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.listCheckpoints');
    expect(manifest.contributes.commands.map((command) => command.command)).toContain('veyra.rollbackLatestCheckpoint');
    expect(commands.get('veyra.createCheckpoint')).toBe('Veyra: Create Checkpoint');
    expect(commands.get('veyra.listCheckpoints')).toBe('Veyra: List Checkpoints');
    expect(commands.get('veyra.rollbackLatestCheckpoint')).toBe('Veyra: Roll Back Latest Checkpoint');
    expect(manifest.activationEvents).toContain('onCommand:veyra.createCheckpoint');
    expect(manifest.activationEvents).toContain('onCommand:veyra.listCheckpoints');
    expect(manifest.activationEvents).toContain('onCommand:veyra.rollbackLatestCheckpoint');
    expect(properties['veyra.checkpoints.enabled']).toMatchObject({
      type: 'boolean',
      default: true,
    });
    expect(properties['veyra.checkpoints.maxFileBytes']).toMatchObject({
      type: 'number',
      default: 1000000,
      minimum: 1024,
    });
    expect(properties['veyra.checkpoints.maxCount']).toMatchObject({
      type: 'number',
      default: 20,
      minimum: 1,
      maximum: 100,
    });
    expect(userGuide).toContain('Veyra: Create Checkpoint');
    expect(userGuide).toContain('Veyra: List Checkpoints');
    expect(userGuide).toContain('Veyra: Roll Back Latest Checkpoint');
    expect(userGuide).toContain('veyra.checkpoints.enabled');
    expect(userGuide).toContain('veyra.checkpoints.maxFileBytes');
    expect(userGuide).toContain('veyra.checkpoints.maxCount');
  });

  it('contributes the docked Veyra webview in the Secondary Side Bar', () => {
    expect(manifest.activationEvents).toContain('onView:veyra.chatView');

    expect(manifest.contributes.viewsContainers.secondarySidebar).toContainEqual({
      id: 'veyra',
      title: 'Veyra',
      icon: 'resources/icon.png',
    });
    const contributedPanelViews = (manifest.contributes.viewsContainers as {
      panel?: Array<{ id: string }>;
    }).panel ?? [];
    expect(contributedPanelViews).not.toContainEqual(expect.objectContaining({
      id: 'veyra',
    }));

    expect(manifest.contributes.views.veyra).toContainEqual({
      id: 'veyra.chatView',
      name: 'Veyra',
      type: 'webview',
      visibility: 'visible',
      contextualTitle: 'Veyra',
    });
  });

  it('contributes command-palette entries for view, status, and commit-hook operations', () => {
    const commands = new Map(manifest.contributes.commands.map((command) => [command.command, command.title]));

    expect(commands.get('veyra.openPanel')).toBe('Veyra: Open View');
    expect(manifest.contributes.commands.map((command) => command.command)).toEqual([
      'veyra.openPanel',
      'veyra.checkStatus',
      'veyra.copyDiagnosticReport',
      'veyra.showSetupGuide',
      'veyra.showLiveValidationGuide',
      'veyra.configureCliPaths',
      'veyra.diagnoseTerminalOutput',
      'veyra.runVerificationCommand',
      'veyra.reviewBrowserTestOutput',
      'veyra.summarizeGitStatus',
      'veyra.reviewCiWorkflowOutput',
      'veyra.preparePrPackageDraft',
      'veyra.installCommitHook',
      'veyra.uninstallCommitHook',
      'veyra.showCommitHookSnippet',
      'veyra.openPendingChanges',
      'veyra.acceptPendingChanges',
      'veyra.rejectPendingChanges',
      'veyra.acceptPendingChangeFile',
      'veyra.rejectPendingChangeFile',
      'veyra.createCheckpoint',
      'veyra.listCheckpoints',
      'veyra.rollbackLatestCheckpoint',
    ]);
    expect(manifest.activationEvents).toContain('onCommand:veyra.checkStatus');
    expect(manifest.activationEvents).toContain('onCommand:veyra.copyDiagnosticReport');
    expect(manifest.activationEvents).toContain('onCommand:veyra.showSetupGuide');
    expect(manifest.activationEvents).toContain('onCommand:veyra.showLiveValidationGuide');
    expect(manifest.activationEvents).toContain('onCommand:veyra.configureCliPaths');
    expect(manifest.activationEvents).toContain('onCommand:veyra.diagnoseTerminalOutput');
    expect(manifest.activationEvents).toContain('onCommand:veyra.runVerificationCommand');
    expect(manifest.activationEvents).toContain('onCommand:veyra.reviewBrowserTestOutput');
    expect(manifest.activationEvents).toContain('onCommand:veyra.summarizeGitStatus');
    expect(manifest.activationEvents).toContain('onCommand:veyra.reviewCiWorkflowOutput');
    expect(manifest.activationEvents).toContain('onCommand:veyra.preparePrPackageDraft');
  });

  it('activates and contributes every native chat participant', () => {
    const activationEvents = new Set(manifest.activationEvents);
    const contributed = new Map(
      manifest.contributes.chatParticipants.map((participant) => [participant.id, participant]),
    );

    for (const participant of NATIVE_CHAT_PARTICIPANTS) {
      expect(activationEvents.has(`onChatParticipant:${participant.id}`)).toBe(true);
      expect(contributed.get(participant.id)).toMatchObject({
        id: participant.id,
        name: participant.name,
        fullName: participant.fullName,
        description: participant.description,
      });
    }
  });

  it('contributes the Veyra slash workflows on the orchestrator participant', () => {
    const veyra = manifest.contributes.chatParticipants.find(
      (participant) => participant.id === 'veyra.veyra',
    );

    expect(veyra?.commands?.map((command) => command.name)).toEqual([
      'review',
      'debate',
      'consensus',
      'implement',
    ]);
  });

  it('describes /review, /debate, and /consensus as read-only all-agent workflows', () => {
    const veyra = manifest.contributes.chatParticipants.find(
      (participant) => participant.id === 'veyra.veyra',
    );
    const review = veyra?.commands?.find((command) => command.name === 'review');
    const debate = veyra?.commands?.find((command) => command.name === 'debate');
    const consensus = veyra?.commands?.find((command) => command.name === 'consensus');

    for (const command of [review, debate, consensus]) {
      expect(command?.description).toMatch(/Claude, Codex, and Gemini/);
      expect(command?.description).toMatch(/read-only/i);
    }
  });

  it('describes /implement as a serial all-agent workflow', () => {
    const veyra = manifest.contributes.chatParticipants.find(
      (participant) => participant.id === 'veyra.veyra',
    );
    const implement = veyra?.commands?.find((command) => command.name === 'implement');

    expect(implement?.description).toMatch(/Claude, Codex, and Gemini/);
    expect(implement?.description).toMatch(/serial/i);
    expect(implement?.description).not.toMatch(/choose the right agent path/i);
  });

  it('activates the Veyra language model provider and exposes all local models', () => {
    expect(manifest.activationEvents).toContain('onLanguageModelChatProvider:veyra');
    expect(manifest.contributes.languageModelChatProviders).toContainEqual({
      vendor: 'veyra',
      displayName: 'Veyra',
    });
    expect(VEYRA_LANGUAGE_MODELS.map((model) => [model.id, model.forcedTarget])).toEqual([
      ['veyra-orchestrator', 'veyra'],
      ['veyra-review', 'veyra'],
      ['veyra-debate', 'veyra'],
      ['veyra-consensus', 'veyra'],
      ['veyra-implement', 'veyra'],
      ['veyra-claude', 'claude'],
      ['veyra-codex', 'codex'],
      ['veyra-gemini', 'gemini'],
    ]);
  });

  it('keeps the VS Code smoke checklist aligned with every exposed language model id', () => {
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');

    for (const model of VEYRA_LANGUAGE_MODELS) {
      expect(smokeChecklist).toContain(model.id);
    }
  });

  it('documents that VS Code smoke evidence includes language model metadata', () => {
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');

    for (const document of [smokeChecklist, audit]) {
      expect(document).toContain('language model metadata');
      expect(document).toContain('name, family, version, and maxInputTokens');
      expect(document).toContain('native chat registration evidence');
      expect(document).toContain('native chat workflow diagnostics');
    }
  });

  it('documents the autonomous workflow guardrails for broad implementation requests', () => {
    const userGuide = userGuideText();
    const smokeChecklist = readFileSync(join(process.cwd(), 'docs', 'vscode-smoke-test.md'), 'utf8');
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');

    for (const document of [userGuide, smokeChecklist, audit]) {
      expect(document).toContain('brainstorming or approval checkpoints');
      expect(document).toContain('available model and CLI capabilities');
      expect(document).toContain('read-only or edit-permitted instructions');
    }
  });

  it('keeps the goal audit as an explicit prompt-to-artifact checklist', () => {
    const audit = readFileSync(join(process.cwd(), 'docs', 'goal-completion-audit.md'), 'utf8');

    for (const requiredText of [
      '## Prompt-to-Artifact Checklist',
      'without losing context',
      'without stomping each other',
      'without making invisible changes',
      'Claude, Codex, and Gemini',
      'paid-backend validation',
      'Native VS Code Chat Participant API',
      'Language Model Chat Provider API',
      '/review',
      '/debate',
      '/consensus',
      '/implement',
      'bounded intervention',
      'shared-context relay',
      'write-capable implementation',
      'Residual Manual Extension Host Gate',
      'manual native chat prompt submission',
      'npm run verify:completion',
      'npm run verify:goal',
      "$env:VEYRA_RUN_LIVE = '1'",
      'VEYRA_RUN_LIVE=1 npm run test:integration:live',
      'Remove-Item Env:\\VEYRA_RUN_LIVE -ErrorAction SilentlyContinue',
      'stays set for the current terminal session',
    ]) {
      expect(audit).toContain(requiredText);
    }
  });

  it('keeps packaged artifacts focused on runtime extension files', () => {
    const packageVerifier = readFileSync(join(process.cwd(), 'scripts', 'verify-package.mjs'), 'utf8');
    expect(manifest.files).toEqual([
      'package.json',
      'README.md',
      'LICENSE.txt',
      'CHANGELOG.md',
      'resources/icon.png',
      'dist/extension.js',
      'dist/extension.js.map',
      'dist/index.html',
      'dist/webview.js',
      'dist/webview.js.map',
      'dist/codicon.css',
      'dist/codicon.ttf',
      'docs/user-guide.md',
      'docs/developer-verification.md',
      'docs/goal-completion-audit.md',
      'docs/preview-demo-script.md',
      'docs/vscode-smoke-test.md',
    ]);
    expect(packageVerifier).toContain("'LICENSE.txt'");
    expect(packageVerifier).toContain("'CHANGELOG.md'");
    expect(packageVerifier).toContain("'resources/icon.png'");
    expect(packageVerifier).toContain("'docs/user-guide.md'");
    expect(packageVerifier).toContain("'docs/developer-verification.md'");
    expect(packageVerifier).toContain("'docs/vscode-smoke-test.md'");
    expect(packageVerifier).toContain("'docs/goal-completion-audit.md'");
    expect(packageVerifier).toContain("'docs/preview-demo-script.md'");
    expect(packageVerifier).toContain("'.vscode/'");
    expect(packageVerifier).toContain("'.vscode-test/'");

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    expect(readme).toContain('## Quickstart');
    expect(readme).toContain('## Troubleshooting');
    expect(readme).toContain('docs/user-guide.md');
    expect(readme).toContain('docs/developer-verification.md');
    expect(readme).toContain('docs/preview-demo-script.md');

    const npmIgnore = readFileSync(join(process.cwd(), '.npmignore'), 'utf8');
    for (const pattern of [
      '.superpowers/',
      '.claude/',
      '.npm-cache/',
      'docs/superpowers/',
      'src/',
      'tests/',
      'foo.ts',
      'scripts/',
    ]) {
      expect(npmIgnore).toContain(pattern);
    }
  });
});

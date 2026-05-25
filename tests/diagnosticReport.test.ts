import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_COMMAND_IDS, formatDiagnosticReport } from '../src/diagnosticReport.js';

describe('diagnostic report', () => {
  it('formats redaction-safe tester evidence for commands, workspace, agents, and optional surfaces', () => {
    const report = formatDiagnosticReport({
      generatedAt: '2026-05-11T20:00:00.000Z',
      extensionId: 'dontcallmejames.veyra-vscode',
      extensionVersion: '0.0.8',
      vscodeVersion: '1.118.0',
      os: {
        platform: 'win32',
        arch: 'x64',
        release: '10.0.26100',
      },
      workspace: {
        trusted: true,
        folderCount: 1,
        folderNames: ['project-one'],
        folderSchemes: ['file'],
      },
      agents: {
        claude: 'ready',
        codex: 'unauthenticated',
        gemini: 'not-installed',
      },
      providers: {
        claude: {
          provider: 'Claude',
          runtime: 'Claude CLI',
          command: 'claude',
          version: '1.2.3',
          model: 'local CLI/provider default; not selected by Veyra',
        },
        codex: {
          provider: 'Codex',
          runtime: 'Codex CLI',
          command: 'codex',
          version: '0.42.0',
          model: 'local CLI/provider default; not selected by Veyra',
        },
        gemini: {
          provider: 'Gemini',
          runtime: 'Antigravity CLI',
          command: 'agy',
          version: '1.0.2',
          model: 'local CLI/provider default; not selected by Veyra',
        },
      },
      commands: {
        'veyra.openPanel': true,
        'veyra.copyDiagnosticReport': true,
        'veyra.internalMissing': false,
      },
      nativeChatRegistrations: ['veyra.veyra', 'veyra.claude'],
      optionalSurfaceFailures: [
        { label: 'language model provider', message: 'language model API unavailable' },
      ],
    });

    expect(report).toContain('# Veyra Diagnostic Report');
    expect(report).toContain('Generated: 2026-05-11T20:00:00.000Z');
    expect(report).toContain('Extension: dontcallmejames.veyra-vscode 0.0.8');
    expect(report).toContain('VS Code: 1.118.0');
    expect(report).toContain('OS: win32 x64 10.0.26100');
    expect(report).toContain('Workspace trusted: yes');
    expect(report).toContain('Workspace folders: 1 (project-one)');
    expect(report).toContain('Workspace schemes: file');
    expect(report).toContain('Claude: ready');
    expect(report).toContain('Codex: unauthenticated');
    expect(report).toContain('Gemini: not installed');
    expect(report).toContain('## Provider Transparency');
    expect(report).toContain('Claude: Claude CLI via claude; version 1.2.3; model: local CLI/provider default; not selected by Veyra');
    expect(report).toContain('Codex: Codex CLI via codex; version 0.42.0; model: local CLI/provider default; not selected by Veyra');
    expect(report).toContain('Gemini: Antigravity CLI via agy; version 1.0.2; model: local CLI/provider default; not selected by Veyra');
    expect(report).toContain('veyra.openPanel: registered');
    expect(report).toContain('veyra.copyDiagnosticReport: registered');
    expect(report).toContain('veyra.internalMissing: missing');
    expect(report).toContain('Native chat registrations: veyra.veyra, veyra.claude');
    expect(report).toContain('Optional surface failures: language model provider - language model API unavailable');
    expect(report).not.toContain('C:\\Users\\tester\\project-one');
  });

  it('tracks the commands external testers need for first-response diagnostics', () => {
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.openPanel');
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.checkStatus');
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.copyDiagnosticReport');
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.summarizeGitStatus');
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.reviewCiWorkflowOutput');
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.acceptPendingChangeFile');
    expect(DIAGNOSTIC_COMMAND_IDS).toContain('veyra.rejectPendingChangeFile');
  });
});

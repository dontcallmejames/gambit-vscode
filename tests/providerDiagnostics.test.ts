import { describe, expect, it, vi } from 'vitest';
import { collectProviderDiagnostics } from '../src/providerDiagnostics.js';

describe('provider diagnostics', () => {
  it('reports CLI runtimes, versions, and model-selection limits without hardcoded model claims', () => {
    const runVersion = vi.fn((command: string) => {
      if (command === 'claude') return '1.2.3\n';
      if (command === 'codex') return '0.42.0\n';
      if (command === 'agy') return '1.0.2\n';
      throw new Error(`unexpected command ${command}`);
    });

    const diagnostics = collectProviderDiagnostics({
      googleRuntime: 'antigravity',
      runVersion,
    });

    expect(diagnostics.claude).toMatchObject({
      provider: 'Claude',
      runtime: 'Claude CLI',
      command: 'claude',
      version: '1.2.3',
    });
    expect(diagnostics.codex).toMatchObject({
      provider: 'Codex',
      runtime: 'Codex CLI',
      command: 'codex',
      version: '0.42.0',
    });
    expect(diagnostics.gemini).toMatchObject({
      provider: 'Gemini',
      runtime: 'Antigravity CLI',
      command: 'agy',
      version: '1.0.2',
    });
    expect(diagnostics.gemini.model).toContain('local CLI/provider default');
    expect(diagnostics.gemini.model).not.toMatch(/Gemini 3\.5 Flash/);
    expect(diagnostics.localModel.status).toBe('disabled');
    expect(diagnostics.localModel.notes.join(' ')).toContain('Claude/Codex/Gemini routing unchanged');
  });

  it('falls back to legacy Gemini transparency when Antigravity is not selected', () => {
    const diagnostics = collectProviderDiagnostics({
      googleRuntime: 'legacy-gemini',
      runVersion: () => {
        throw new Error('version unavailable');
      },
    });

    expect(diagnostics.gemini).toMatchObject({
      provider: 'Gemini',
      runtime: 'legacy Gemini CLI fallback',
      command: 'gemini',
      version: 'unavailable',
    });
    expect(diagnostics.gemini.model).toContain('not selected by Veyra');
  });

  it('adds local-model transparency when a self-hosted target is configured', () => {
    const diagnostics = collectProviderDiagnostics({
      googleRuntime: 'antigravity',
      runVersion: () => 'ok',
      localModel: {
        mode: 'informational',
        provider: 'LM Studio',
        endpoint: 'http://127.0.0.1:1234/v1',
        model: 'qwen-coder',
      },
    });

    expect(diagnostics.localModel).toMatchObject({
      status: 'informational',
      active: false,
      provider: 'LM Studio',
      endpoint: 'http://127.0.0.1:1234/v1',
      model: 'qwen-coder',
    });
    expect(diagnostics.localModel.notes.join(' ')).toContain('not used for Claude/Codex/Gemini routing');
  });
});

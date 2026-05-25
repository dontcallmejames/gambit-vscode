import { describe, expect, it } from 'vitest';
import {
  collectLocalModelDiagnostics,
  normalizeLocalModelConfiguration,
} from '../src/localModelSupport.js';

describe('local model support', () => {
  it('defaults to disabled without probing or changing provider routing', () => {
    const diagnostics = collectLocalModelDiagnostics();

    expect(diagnostics.status).toBe('disabled');
    expect(diagnostics.active).toBe(false);
    expect(diagnostics.endpoint).toBe('not configured');
    expect(diagnostics.model).toBe('not configured');
    expect(diagnostics.notes.join(' ')).toContain('Claude/Codex/Gemini routing unchanged');
    expect(diagnostics.notes.join(' ')).toContain('does not download models, launch servers, or probe endpoints');
  });

  it('reports a configured local target as informational only', () => {
    const diagnostics = collectLocalModelDiagnostics({
      mode: 'informational',
      provider: 'Ollama',
      endpoint: 'http://localhost:11434/v1',
      model: 'llama3.1',
    });

    expect(diagnostics).toMatchObject({
      status: 'informational',
      active: false,
      provider: 'Ollama',
      endpoint: 'http://localhost:11434/v1',
      model: 'llama3.1',
    });
    expect(diagnostics.notes.join(' ')).toContain('informational only');
    expect(diagnostics.notes.join(' ')).toContain('not used for Claude/Codex/Gemini routing');
  });

  it('validates obvious unsafe or incomplete informational targets without echoing credentials', () => {
    const diagnostics = collectLocalModelDiagnostics({
      mode: 'informational',
      provider: 'OpenAI-compatible',
      endpoint: 'http://user:secret@localhost:8080/v1',
      model: '',
    });

    expect(diagnostics.status).toBe('misconfigured');
    expect(diagnostics.endpoint).toBe('http://localhost:8080/v1');
    expect(diagnostics.notes.join(' ')).toContain('model is required');
    expect(diagnostics.notes.join(' ')).toContain('must not include username or password');
    expect(diagnostics.notes.join(' ')).not.toContain('secret');
  });

  it('marks unsupported modes and non-http endpoints as misconfigured', () => {
    const diagnostics = collectLocalModelDiagnostics({
      mode: 'active',
      endpoint: 'file:///tmp/model',
      model: 'llama3.1',
    });

    expect(diagnostics.status).toBe('misconfigured');
    expect(diagnostics.notes.join(' ')).toContain('mode must be disabled or informational');
    expect(diagnostics.notes.join(' ')).toContain('endpoint must use http:// or https://');
  });

  it('normalizes settings strings from VS Code configuration', () => {
    expect(normalizeLocalModelConfiguration({
      mode: ' informational ',
      provider: '  LM Studio  ',
      endpoint: '  http://127.0.0.1:1234/v1  ',
      model: '  local-model  ',
    })).toEqual({
      mode: 'informational',
      provider: 'LM Studio',
      endpoint: 'http://127.0.0.1:1234/v1',
      model: 'local-model',
    });
  });
});

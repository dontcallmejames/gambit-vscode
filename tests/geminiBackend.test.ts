import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('vscode', () => ({
  workspace: { getConfiguration: vi.fn(() => ({ get: getMock })) },
}));

import { getGeminiBackend } from '../src/geminiBackend.js';

afterEach(() => getMock.mockReset());

describe('getGeminiBackend', () => {
  it('defaults to auto when unset', () => {
    getMock.mockImplementation((_key: string, dflt: unknown) => dflt);
    expect(getGeminiBackend()).toBe('auto');
  });

  it('returns the configured value when valid', () => {
    getMock.mockReturnValue('gemini');
    expect(getGeminiBackend()).toBe('gemini');
    getMock.mockReturnValue('antigravity');
    expect(getGeminiBackend()).toBe('antigravity');
  });

  it('falls back to auto for an unrecognized value', () => {
    getMock.mockReturnValue('banana');
    expect(getGeminiBackend()).toBe('auto');
  });

  it('falls back to auto when getConfiguration throws', () => {
    getMock.mockImplementation(() => { throw new Error('vscode not available'); });
    expect(getGeminiBackend()).toBe('auto');
  });
});

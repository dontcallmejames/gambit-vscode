import { describe, expect, it } from 'vitest';
import { DriftTracker, CLI_DRIFT_WARNING } from '../../src/agents/driftWarning.js';

describe('DriftTracker', () => {
  it('reports drift when non-empty lines parsed to zero chunks on a clean exit', () => {
    const t = new DriftTracker();
    t.observeLine('{"type":"unknown"}');
    t.observeLine('{"type":"also_unknown"}');
    // no observeChunk calls — the parser yielded nothing
    const chunk = t.driftChunk(true);
    expect(chunk).toEqual({ type: 'error', message: CLI_DRIFT_WARNING });
  });

  it('does not report drift when at least one chunk was recognized', () => {
    const t = new DriftTracker();
    t.observeLine('{"type":"text"}');
    t.observeChunk();
    expect(t.driftChunk(true)).toBeNull();
  });

  it('does not report drift when only blank/whitespace lines were seen', () => {
    const t = new DriftTracker();
    t.observeLine('');
    t.observeLine('   ');
    expect(t.driftChunk(true)).toBeNull();
  });

  it('does not report drift on a non-clean exit (the exit error already surfaces)', () => {
    const t = new DriftTracker();
    t.observeLine('{"type":"unknown"}');
    expect(t.driftChunk(false)).toBeNull();
  });
});

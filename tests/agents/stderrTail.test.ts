import { describe, expect, it } from 'vitest';
import { StderrTail } from '../../src/agents/stderrTail.js';

describe('StderrTail', () => {
  it('returns the full content when under the limit, with no marker', () => {
    const t = new StderrTail(100);
    t.append('warning: deprecated\n');
    t.append('done\n');
    expect(t.value()).toBe('warning: deprecated\ndone\n');
  });

  it('keeps only the last `limit` bytes and prefixes a truncation marker', () => {
    const t = new StderrTail(10);
    t.append('0123456789ABCDEF'); // 16 chars, limit 10
    const v = t.value();
    expect(v.startsWith('...(stderr truncated)')).toBe(true);
    expect(v.endsWith('6789ABCDEF')).toBe(true); // last 10 chars retained
    expect(v).not.toContain('012345'); // earliest bytes dropped
  });

  it('does not grow without bound across many appends', () => {
    const t = new StderrTail(64);
    for (let i = 0; i < 10_000; i++) t.append('noisy progress line\n');
    // The retained buffer (excluding the marker) never exceeds the limit.
    const retained = t.value().replace('...(stderr truncated)\n', '');
    expect(retained.length).toBeLessThanOrEqual(64);
  });
});

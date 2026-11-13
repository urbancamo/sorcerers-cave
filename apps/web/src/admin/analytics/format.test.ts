import { describe, expect, it } from 'vitest';
import { ago, niceScale, num, pct } from './format';

describe('format', () => {
  it('pct rounds to one decimal and survives a zero denominator', () => {
    expect(pct(1, 3)).toBe('33.3%');
    expect(pct(0, 0)).toBe('–');
  });
  it('num groups thousands and dashes out a missing value', () => {
    expect(num(12345)).toBe('12,345');
    expect(num(null)).toBe('–');
  });
  it('ago speaks in minutes, hours, then a date', () => {
    const now = Date.UTC(2026, 10, 13, 12);
    expect(ago(now - 10_000, now)).toBe('just now');
    expect(ago(now - 4 * 60_000, now)).toBe('4 min ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(ago(now - 3 * 86_400_000, now)).toMatch(/Nov 2026/);
  });
  it.each([[0, 1, [0, 1]], [7, 8, [0, 2, 4, 6, 8]], [43, 50, [0, 10, 20, 30, 40, 50]], [1234, 2000, [0, 1000, 2000]]] as const)(
    'niceScale(%i) tops out at %i with clean ticks', (max, top, ticks) => {
      const s = niceScale(max);
      expect(s.top).toBe(top);
      expect(s.ticks).toEqual(ticks);
    });
});

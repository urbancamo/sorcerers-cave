/** Whole-number percentage of `n` in `d`, one decimal place; a dash when there is nothing to divide by. */
export function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 1000) / 10}%` : '–';
}

export const num = (n: number | null | undefined): string => (n === null || n === undefined ? '–' : n.toLocaleString('en-GB'));

/** "just now", "4 min ago", "3 h ago", or the date for anything older than a day. */
export function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A round upper bound and evenly spaced ticks for a count axis (1, 2, 5 × a power of ten), always from zero. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const mag = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => max / s <= 5) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

export const OUTCOME_LABEL = { escaped: 'Escaped', dead: 'Died', quit: 'Quit' } as const;

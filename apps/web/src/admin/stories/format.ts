/** Dollars for the dashboard: cents precision for amounts, a little more for the tiny per-call ones. */
export const usd = (n: number | null | undefined): string => (n === null || n === undefined ? '–' : n < 1 ? `$${n.toFixed(n < 0.1 ? 3 : 2)}` : `$${n.toFixed(2)}`);

export const seconds = (ms: number | null): string => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

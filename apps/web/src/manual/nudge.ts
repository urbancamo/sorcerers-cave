const KEY = 'scv.howto.seen';

/** Has this device already been offered the "How to play" nudge? Storage can be blocked, so any failure counts as seen. */
export function nudgeSeen(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}

export function markNudgeSeen(): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable — the nudge may show again next visit */ }
}

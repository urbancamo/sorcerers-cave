// Where this browser is in the tutorial: nothing stored (never offered), a step (in progress), finished, or skipped.
// Storage can be blocked, so every failure reads as "never offered" and writes are best-effort.
const KEY = 'scv.tutorial.state';
// The script was reworked (2026-11-13), so a step saved by an earlier script no longer points at the same card: it is ignored.
const VERSION = 2;

export type TutorialProgress =
  | { status: 'step'; step: number; cursor: number; v?: number }
  | { status: 'done' }
  | { status: 'skipped' };

export function loadProgress(): TutorialProgress | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v?.status === 'done' || v?.status === 'skipped') return { status: v.status };
    if (v?.status === 'step' && v.v === VERSION && Number.isInteger(v.step) && Number.isInteger(v.cursor) && v.step >= 0 && v.cursor >= 0) return { status: 'step', step: v.step, cursor: v.cursor };
  } catch { /* unavailable or damaged: as if never offered */ }
  return null;
}

export function saveProgress(p: TutorialProgress | null): void {
  try { if (p) localStorage.setItem(KEY, JSON.stringify(p.status === 'step' ? { ...p, v: VERSION } : p)); else localStorage.removeItem(KEY); } catch { /* the tutorial still works; it just will not be remembered */ }
}

/** A tutorial left part-way, which the splash offers to continue. */
export const inProgress = (p: TutorialProgress | null): p is Extract<TutorialProgress, { status: 'step' }> => p?.status === 'step' && (p.step > 0 || p.cursor > 0);

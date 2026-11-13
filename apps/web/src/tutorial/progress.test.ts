import { beforeEach, describe, expect, it } from 'vitest';
import { inProgress, loadProgress, saveProgress } from './progress';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  } });
});

describe('tutorial progress', () => {
  it('is null until something is saved, then round-trips each state', () => {
    expect(loadProgress()).toBeNull();
    for (const p of [{ status: 'step', step: 4, cursor: 2 }, { status: 'done' }, { status: 'skipped' }] as const) {
      saveProgress(p);
      expect(loadProgress()).toEqual(p);
    }
    saveProgress(null);
    expect(loadProgress()).toBeNull();
  });
  it('ignores a step saved by an earlier script', () => {
    store.set('scv.tutorial.state', JSON.stringify({ status: 'step', step: 9, cursor: 5 }));
    expect(loadProgress()).toBeNull();
  });
  it('treats damaged storage as never offered', () => {
    store.set('scv.tutorial.state', '{nope');
    expect(loadProgress()).toBeNull();
    store.set('scv.tutorial.state', JSON.stringify({ status: 'step', step: -1, cursor: 'x' }));
    expect(loadProgress()).toBeNull();
  });
  it('offers to continue only a tutorial that has actually begun', () => {
    expect(inProgress({ status: 'step', step: 0, cursor: 0 })).toBe(false);
    expect(inProgress({ status: 'step', step: 1, cursor: 0 })).toBe(true);
    expect(inProgress({ status: 'done' })).toBe(false);
    expect(inProgress(null)).toBe(false);
  });
});

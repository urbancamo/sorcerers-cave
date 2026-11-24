import { useEffect, useRef } from 'react';
import { BORNEABLE, isBorne, reduce, wieldConflict, type GameAction, type GameState } from '@sorcerers-cave/engine';
import { noEffectFor } from './wielding';

const AUTO_WIELD_KEY = 'scv-auto-wield';

/** Whether items are wielded and worn automatically when a member gets them. ON unless the player has turned it off; storage can be
 *  blocked, in which case it stays on for the session. A per-player setting kept in the browser, the same in solo and multiplayer. */
export function readAutoWield(): boolean {
  try { return localStorage.getItem(AUTO_WIELD_KEY) !== '0'; } catch { return true; }
}

export function writeAutoWield(on: boolean): void {
  try { localStorage.setItem(AUTO_WIELD_KEY, on ? '1' : '0'); } catch { /* storage unavailable: the choice lasts this session */ }
}

const countOf = (xs: readonly number[], t: number): number => xs.filter((x) => x === t).length;

/**
 * The next wield or wear to do for an item a member has GAINED since `prev` (picked up, passed, traded or won): a weapon, shield, Ring or
 * Talisman the member is not yet using and would get something from. An item the player stowed is never put back, because it was not gained. `defer` is true when an
 * item was gained but the engine will not allow it just now (a fight is under way), so the caller should look again later.
 */
export function autoWieldPlan(prev: GameState, next: GameState): { action: GameAction | null; defer: boolean } {
  let defer = false;
  for (let mi = 0; mi < next.party.length; mi++) {
    const m = next.party[mi]!;
    if (m.status !== 0 && m.status !== 1) continue;
    const before = prev.party[mi]?.treasure ?? [];
    for (const tid of BORNEABLE) {
      if (countOf(m.treasure, tid) <= countOf(before, tid) || isBorne(m, tid)) continue;
      // Two attacking weapons cannot be wielded at once: the one already in use stays, and the new one is left for the player to choose.
      if (wieldConflict(m, tid) !== null) continue;
      // Wearing it would do nothing for this member (the Talisman on a Dwarf): leave it unworn, so it does not look as if it were working.
      if (noEffectFor(tid, m.creatureId)) continue;
      const action: GameAction = { type: 'setBorne', mi, idx: m.treasure.indexOf(tid), borne: true };
      if (reduce(next, action).events.some((e) => e.type === 'blocked')) { defer = true; continue; }
      return { action, defer };
    }
  }
  return { action: null, defer };
}

/**
 * Wield and wear automatically (when `enabled`): each time the party's treasure changes, do the next wield or wear for what was just gained.
 * `canAct` is false while it is not the player's turn or something is on screen; gains made meanwhile are picked up when it turns true.
 */
export function useAutoWield(state: GameState | null, enabled: boolean, canAct: boolean, dispatch: (a: GameAction) => unknown, gameKey: string | null = null): void {
  const baseline = useRef<GameState | null>(null);
  const lastKey = useRef(gameKey);
  const busy = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (lastKey.current !== gameKey) { lastKey.current = gameKey; baseline.current = null; } // a different game: start afresh
    if (!enabled) { baseline.current = state; return; } // nothing is gained "later": turning it on does not wield what is already carried
    if (baseline.current === null) { baseline.current = state; return; } // a game just opened or resumed: what is carried stays as it is
    if (!canAct || busy.current) return;
    const { action, defer } = autoWieldPlan(baseline.current, state);
    if (action) {
      busy.current = true;
      Promise.resolve(dispatch(action)).catch(() => undefined).finally(() => { busy.current = false; });
      return;
    }
    if (!defer) baseline.current = state;
  }, [state, enabled, canAct, dispatch, gameKey]);
}

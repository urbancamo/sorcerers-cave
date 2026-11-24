import { describe, it, expect, beforeEach } from 'vitest';
import { newGame, type GameState } from '@sorcerers-cave/engine';
import { autoWieldPlan, readAutoWield, writeAutoWield } from './autoWield';

const SWORD = 3, AXE = 9, TALISMAN = 7;

// A started game whose first member carries `items` (and has `borne` in use).
function withItems(items: number[], borne: number[] = []): GameState {
  const s = structuredClone(newGame(1, [1, 7])) as GameState;
  const m = s.party[0]!;
  m.status = 0;
  m.treasure = items;
  m.borne = borne;
  return s;
}

describe('autoWieldPlan', () => {
  it('wields a weapon the member has just gained', () => {
    const { action } = autoWieldPlan(withItems([]), withItems([SWORD]));
    expect(action).toEqual({ type: 'setBorne', mi: 0, idx: 0, borne: true });
  });

  it('does nothing for what was already carried (a stowed weapon stays stowed)', () => {
    expect(autoWieldPlan(withItems([SWORD]), withItems([SWORD])).action).toBeNull();
  });

  it('leaves a second attacking weapon for the player when one is already wielded', () => {
    expect(autoWieldPlan(withItems([SWORD], [SWORD]), withItems([SWORD, AXE], [SWORD])).action).toBeNull();
  });

  // Issue #132 (RLPW): a Dwarf was given the Talisman and it was "worn", yet it warded nothing, because only a human or magic user can use it.
  it('does not wear the Talisman for a member who cannot use it (a Dwarf), but does for one who can (the Woman Hero)', () => {
    const gained = (mi: number) => {
      const prev = withItems([]);
      const next = withItems([]);
      next.party[mi]!.status = 0;
      next.party[mi]!.treasure = [TALISMAN];
      return autoWieldPlan(prev, next);
    };
    expect(gained(1).action).toBeNull(); // party[1] is the Dwarf
    expect(gained(1).defer).toBe(false);
    expect(gained(0).action).toEqual({ type: 'setBorne', mi: 0, idx: 0, borne: true });
  });

  it('still wields a weapon for the Dwarf: only an item that does nothing in its hands is left alone', () => {
    const prev = withItems([]);
    const next = withItems([]);
    next.party[1]!.status = 0;
    next.party[1]!.treasure = [AXE];
    expect(autoWieldPlan(prev, next).action).toEqual({ type: 'setBorne', mi: 1, idx: 0, borne: true });
  });

  it('ignores items that cannot be wielded or worn', () => {
    expect(autoWieldPlan(withItems([]), withItems([0])).action).toBeNull();
  });
});

describe('Auto Wield/Wear setting', () => {
  beforeEach(() => localStorage.clear());
  it('is on by default and remembers a choice', () => {
    expect(readAutoWield()).toBe(true);
    writeAutoWield(false);
    expect(readAutoWield()).toBe(false);
    writeAutoWield(true);
    expect(readAutoWield()).toBe(true);
  });
});

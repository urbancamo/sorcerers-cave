import { ALL_CREATURES, ALL_TREASURES, BORNEABLE, WORN, axeBonus, isBorne, ringEligible, shieldEligible, staffBonus, swordBonus, wieldConflict, type GameState, type PartyMember } from '@sorcerers-cave/engine';

// Wielding weapons (docs/requirements/2026-11-05-wielding-weapons-spec.md): a Sword, Axe, Staff or Shield is wielded; the Ring and the
// Talisman are worn. An item's effect applies only while it is in use, so the party panel and the item card say which it is.

/** The words for putting an item in use and taking it out again, and the state it is then in. */
export function useVerbs(tid: number): { on: string; off: string; state: 'wielded' | 'worn' } {
  return WORN.includes(tid) ? { on: 'Wear', off: 'Remove', state: 'worn' } : { on: 'Wield', off: 'Stow', state: 'wielded' };
}

/** Why this member cannot wield `tid` now (two hands: one attacking weapon plus the Shield), or null. */
export function wieldRefusal(m: PartyMember, tid: number): string | null {
  const other = wieldConflict(m, tid);
  return other === null ? null : `Already wielding the ${ALL_TREASURES[other]?.name ?? 'weapon'} — stow it first.`;
}

// Would this item help its carrier if it were in use? (An Axe, for one, helps any bearer against a Demon, but that needs no bonus to show.)
const WOULD_HELP: Record<number, (creatureId: number) => boolean> = {
  3: (c) => swordBonus(c) > 0,
  17: (c) => axeBonus(c) > 0,
  9: (c) => staffBonus(c) > 0,
  20: (c) => shieldEligible(c),
  10: (c) => ringEligible(c),
  7: () => true,
};

/** A fight is about to be fought (or is under way) with gear that would help sitting unused: "Magic Sword (Hero) carried, not wielded".
 *  Information only: the game never puts anything in use for the player. */
export function unusedGear(state: GameState): string[] {
  const out: string[] = [];
  for (const m of state.party) {
    if (m.status !== 0 && m.status !== 1) continue;
    for (const tid of m.treasure) {
      if (!BORNEABLE.includes(tid) || isBorne(m, tid) || !WOULD_HELP[tid]?.(m.creatureId)) continue;
      out.push(`${ALL_TREASURES[tid]!.name} (${ALL_CREATURES[m.creatureId]!.name}) carried, not ${useVerbs(tid).state}`);
    }
  }
  return out;
}

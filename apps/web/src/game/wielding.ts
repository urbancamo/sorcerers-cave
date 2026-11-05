import { ALL_TREASURES, WORN, wieldConflict, type PartyMember } from '@sorcerers-cave/engine';

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

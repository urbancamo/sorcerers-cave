import { ALL_CREATURES, CHEST_KG, SHARE_UNIT, carriedWeight, decodeOpen, SPECIAL_DEEP_POOL, type GameAction, type GameState } from '@sorcerers-cave/engine';

// Sharing the Treasure Chest (docs/requirements/sharing-the-treasure-chest-load/plan.md): the picker's pure model. Shares are multiples of
// 25 kg (the lightest treasure) summing to the chest's 100 kg; each bearer is limited by what they carry apart from the chest.

// The Treasure Chest card marked as shared (art by Peter), shown against each member bearing a share.
export const SHARED_CHEST_CARD = '/assets/cards/treasure-chest-shared-v1.jpg';

export type ChestSource = { floor: number } | { member: number } | { chest: number };

const C_GIANT = 12;

export interface ChestRow {
  mi: number;
  base: number;        // kg this member carries apart from the chest
  cap: number;         // their carry capacity
  max: number;         // the most of the chest they can bear, in 25 kg steps (0 = none)
  why: string | null;  // why they cannot bear any, or null
}

/** One row per living member who can carry anything, with the most each can take of THIS chest (their load counted without it). */
export function chestRows(state: GameState, source: ChestSource): ChestRow[] {
  const poolOnlyGiants = 'floor' in source && decodeOpen(state.areas[state.partyArea]!).special === SPECIAL_DEEP_POOL;
  const rows: ChestRow[] = [];
  state.party.forEach((m, mi) => {
    if (m.status !== 0 && m.status !== 1) return;
    const cap = ALL_CREATURES[m.creatureId]!.carry;
    if (cap <= 0) return;
    const own = 'chest' in source ? (m.chestShares ?? []).find((s) => s.chest === source.chest)?.kg ?? 0 : 'member' in source && source.member === mi ? CHEST_KG : 0;
    const base = carriedWeight(m) - own;
    const max = Math.max(0, Math.min(CHEST_KG, Math.floor((cap - base) / SHARE_UNIT) * SHARE_UNIT));
    const why = poolOnlyGiants && m.creatureId !== C_GIANT ? 'Only a Giant can lift treasure from the Pool.' : max < SHARE_UNIT ? 'No room for another 25 kg.' : null;
    rows.push({ mi, base, cap, max: why ? 0 : max, why });
  });
  return rows;
}

/** The split the picker opens with: an existing group's own shares; a chest one member carries starts with them; a floor chest starts unassigned. */
export function initialShares(state: GameState, source: ChestSource, rows: ChestRow[]): Record<number, number> {
  const out: Record<number, number> = {};
  if ('chest' in source) state.party.forEach((m, mi) => { const s = (m.chestShares ?? []).find((x) => x.chest === source.chest); if (s) out[mi] = s.kg; });
  else if ('member' in source) { const r = rows.find((x) => x.mi === source.member); if (r && r.max >= CHEST_KG) out[r.mi] = CHEST_KG; }
  return out;
}

export const assigned = (amounts: Record<number, number>): number => Object.values(amounts).reduce((a, b) => a + b, 0);

/** The action for a finished split (zero shares left out). */
export function chestAction(source: ChestSource, amounts: Record<number, number>): GameAction {
  const shares = Object.entries(amounts).filter(([, kg]) => kg > 0).map(([mi, kg]) => ({ mi: Number(mi), kg }));
  return { type: 'setChestShares', source, shares };
}

/** A share's weight read aloud for the card: "50 kg of the Treasure Chest, shared with Ogre (25 kg)". */
export function shareSentence(kg: number, withOthers: { label: string; kg: number }[]): string {
  return `Bearing ${kg} kg of the Treasure Chest${withOthers.length ? `, shared with ${withOthers.map((o) => `${o.label} (${o.kg} kg)`).join(', ')}` : ''}.`;
}

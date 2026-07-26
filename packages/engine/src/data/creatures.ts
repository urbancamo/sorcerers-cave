export const FLAG_HUMAN = 1;
export const FLAG_CHARISMA = 2;
export const FLAG_BEFRIENDS_UNICORN = 4;
export const FLAG_GUIDES_PAST_TRAP = 8;
export const FLAG_INHUMAN = 16;

export interface Creature {
  id: number;
  name: string;
  fs: number; // fighting strength
  mp: number; // magical power
  carry: number; // kg capacity
  cost: number | null; // party-selection cost; null = not selectable
  points: number;
  flags: number;
  hostileMax: number | null; // reaction thresholds (cave strangers); null = n/a
  indiffMax: number | null;
  leaderPri: number;
}

// id order is normative (spec §3.2).
export const CREATURES: readonly Creature[] = [
  { id: 0, name: "Hero", fs: 5, mp: 0, carry: 75, cost: 6, points: 10, flags: FLAG_HUMAN | FLAG_CHARISMA, hostileMax: 3, indiffMax: 3, leaderPri: 7 },
  { id: 1, name: "W-Hero", fs: 4, mp: 0, carry: 50, cost: 5, points: 10, flags: FLAG_HUMAN | FLAG_CHARISMA | FLAG_BEFRIENDS_UNICORN, hostileMax: 3, indiffMax: 3, leaderPri: 7 },
  { id: 2, name: "Ogre", fs: 5, mp: 0, carry: 100, cost: 5, points: 5, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 3 },
  { id: 3, name: "Troll", fs: 4, mp: 0, carry: 75, cost: 4, points: 4, flags: FLAG_INHUMAN, hostileMax: 3, indiffMax: 4, leaderPri: 2 },
  { id: 4, name: "Priest", fs: 2, mp: 2, carry: 25, cost: 4, points: 8, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 4, leaderPri: 6 },
  { id: 5, name: "Man", fs: 3, mp: 0, carry: 50, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: 2, indiffMax: 4, leaderPri: 5 },
  { id: 6, name: "Woman", fs: 2, mp: 0, carry: 25, cost: 2, points: 5, flags: FLAG_HUMAN | FLAG_BEFRIENDS_UNICORN, hostileMax: 2, indiffMax: 4, leaderPri: 5 },
  { id: 7, name: "Dwarf", fs: 1, mp: 0, carry: 25, cost: 1, points: 2, flags: FLAG_INHUMAN | FLAG_GUIDES_PAST_TRAP, hostileMax: 0, indiffMax: 4, leaderPri: 1 },
  { id: 8, name: "Wizard", fs: 2, mp: 5, carry: 0, cost: null, points: 15, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 5, leaderPri: 8 },
  { id: 9, name: "Spectre", fs: 0, mp: 5, carry: 0, cost: null, points: 0, flags: 0, hostileMax: 5, indiffMax: 6, leaderPri: 10 },
  { id: 10, name: "Dragon", fs: 6, mp: 0, carry: 0, cost: null, points: 0, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 6, leaderPri: 9 }, // 1-4 hostile, 5-6 indifferent, never friendly
  { id: 11, name: "Sorcerer", fs: 4, mp: 9, carry: 0, cost: null, points: 0, flags: 0, hostileMax: 6, indiffMax: 6, leaderPri: 11 },
  { id: 12, name: "Giant", fs: 7, mp: 0, carry: 150, cost: null, points: 7, flags: FLAG_INHUMAN, hostileMax: 3, indiffMax: 5, leaderPri: 4 },
  { id: 13, name: "Unicorn", fs: 0, mp: 4, carry: 0, cost: null, points: 4, flags: FLAG_BEFRIENDS_UNICORN, hostileMax: 0, indiffMax: 0, leaderPri: 0 },
];

// Selectable starters (ids 0-7) and their stock counts (spec §3.2).
export const STARTING_STOCK: Readonly<Record<number, number>> = {
  0: 1, 1: 1, 2: 3, 3: 3, 4: 3, 5: 6, 6: 3, 7: 3,
};

// Extension-kit creature rows (ids 14-20), id order normative — costs per the official kit
// SELECTION TABLE (docs/specs/extension-kit-rules.md); Apprentice and Demon are never selectable
// (cost null). Kept as a SEPARATE table rather than appended onto `CREATURES` itself: the base
// array's length and contents are pinned verbatim by `data.test.ts`, which must stay green
// unmodified (SC-EXT-2). `ALL_CREATURES` below is the combined, id-indexed lookup for code that
// needs to resolve either a base or a kit creature.
export const KIT_CREATURES: readonly Creature[] = [
  { id: 14, name: "Apprentice", fs: 2, mp: 7, carry: 0, cost: null, points: 0, flags: FLAG_HUMAN, hostileMax: 5, indiffMax: 5, leaderPri: 10 }, // custom reaction: US-14 (6=friendly only while Sorcerer lives; no indifferent band)
  { id: 15, name: "Demon", fs: 0, mp: 6, carry: 0, cost: null, points: 0, flags: FLAG_INHUMAN, hostileMax: 6, indiffMax: 6, leaderPri: 10 },
  { id: 16, name: "Lion", fs: 3, mp: 0, carry: 0, cost: 2, points: 3, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 3 },
  { id: 17, name: "Scholar", fs: 2, mp: 1, carry: 25, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 4, leaderPri: 6 },
  { id: 18, name: "Witch", fs: 1, mp: 4, carry: 0, cost: 5, points: 10, flags: FLAG_HUMAN, hostileMax: 2, indiffMax: 4, leaderPri: 6 },
  { id: 19, name: "Thief", fs: 2, mp: 0, carry: 25, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: 2, indiffMax: 4, leaderPri: 5 },
  { id: 20, name: "Wolf", fs: 2, mp: 0, carry: 0, cost: 1, points: 2, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 2 },
];

/** Combined creature lookup, indexed by absolute id 0-20 (base ids at their own index, kit ids
 *  continuing directly after). Base game code paths keep indexing `CREATURES` directly; this
 *  exists for the variant-aware helpers below and for later kit tasks (SC-EXT-2). */
export const ALL_CREATURES: readonly Creature[] = [...CREATURES, ...KIT_CREATURES];

// Kit-on-only party-selection additions (official SELECTION TABLE). Stock: Witch 3, Scholar 1,
// Thief 1, Lion 1, Wolf 1; the kit's duplicate Woman/Dwarf copies raise base stock 3 → 4. Base
// code paths (setup.ts `validatePicks`) never read this — that rewiring is a later kit task; it
// exists now so `startingStock` below has one variant-aware source of truth.
export const KIT_STARTING_STOCK: Readonly<Record<number, number>> = {
  16: 1, 17: 1, 18: 3, 19: 1, 20: 1, // Lion, Scholar, Witch×3, Thief, Wolf
  6: 1, 7: 1,                        // +1 Woman, +1 Dwarf (kit copies) → 4 each
};

// Ogre 5→4, Troll 4→3 — kit-on ONLY (MSW ruling); the base game keeps 5/4.
export const KIT_COST_OVERRIDES: Readonly<Record<number, number>> = { 2: 4, 3: 3 };

/** Selection cost for `id`, honouring the kit-on Ogre/Troll revision. Returns null for
 *  never-selectable creatures (Apprentice, Demon, and every base id with `cost: null`). Base game
 *  code paths do not call this yet (SC-EXT-2); it's the variant-aware source of truth for later
 *  tasks (party-select validation, PartySelect UI). */
export function selectionCost(id: number, variants?: { extensionKit?: boolean }): number | null {
  if (variants?.extensionKit) {
    const override = KIT_COST_OVERRIDES[id];
    if (override !== undefined) return override;
  }
  return ALL_CREATURES[id]?.cost ?? null;
}

/** Starting stock, merged with `KIT_STARTING_STOCK` when the kit is on (Woman/Dwarf 3→4 means the
 *  merged value is 4, not a replacement). Absent/false variant returns `STARTING_STOCK` itself
 *  unchanged (SC-EXT-2). */
export function startingStock(variants?: { extensionKit?: boolean }): Readonly<Record<number, number>> {
  if (!variants?.extensionKit) return STARTING_STOCK;
  const merged: Record<number, number> = { ...STARTING_STOCK };
  for (const [key, n] of Object.entries(KIT_STARTING_STOCK)) {
    const id = Number(key);
    merged[id] = (merged[id] ?? 0) + n;
  }
  return merged;
}

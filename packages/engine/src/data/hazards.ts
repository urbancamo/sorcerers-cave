// Hazard ids 0-4 (spec §3.4). Resolution order/behaviour is Milestone C.
export const HAZARD_NAMES = ["Mutiny", "Trap", "Earthquake", "Medusa", "Ghouls"] as const;
export const HAZARD_MUTINY = 0;
export const HAZARD_TRAP = 1;
export const HAZARD_EARTHQUAKE = 2;
export const HAZARD_MEDUSA = 3;
export const HAZARD_GHOULS = 4;

// Extension-kit hazards (ids 5-8) — Spell IS a hazard per the official kit INVENTORY (not a usable
// artifact); the Crypt is no longer a hazard id (its card is treasure 21, Crypt/Gems, which parks
// as the crypt location when drawn). Kept as a SEPARATE tuple rather than appended onto
// `HAZARD_NAMES` itself: the base tuple's length is pinned by `data.test.ts`, which must stay
// green unmodified (SC-EXT-2). `ALL_HAZARD_NAMES` below is the combined, id-indexed name lookup.
export const KIT_HAZARD_NAMES = ["Desertion", "Harpies", "Quarrel", "Spell"] as const;
export const ALL_HAZARD_NAMES = [...HAZARD_NAMES, ...KIT_HAZARD_NAMES] as const;
export const HAZARD_DESERTION = 5;
export const HAZARD_HARPIES = 6;
export const HAZARD_QUARREL = 7;
export const HAZARD_SPELL = 8;

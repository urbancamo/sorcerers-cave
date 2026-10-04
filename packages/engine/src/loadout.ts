// Stranger default loadout — a pure allocation of the fight artefacts lying in a chamber to the
// strangers guarding it, following Peter's heuristic (docs/rules/strangers-default-loadout-v2-20261003.md).
// The preference lists are data, not code, so an order can be changed without touching the logic.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { swordBonus, axeBonus, staffBonus, ringEligible } from "./capabilities";

const T_SWORD = 3, T_STAFF = 9, T_RING = 10, T_AXE = 17, T_SHIELD = 20;

/** The fight artefacts a stranger can be given, in the order the loadout allocates them. */
export const LOADOUT_ARTIFACTS = [T_SWORD, T_AXE, T_STAFF, T_SHIELD, T_RING] as const;

// Creature ids for the types the preference lists name.
const HERO = 0, WHERO = 1, PRIEST = 4, MAN = 5, WOMAN = 6, DWARF = 7, WIZARD = 8;
const SORCERER = 11, APPRENTICE = 14, SCHOLAR = 17, WITCH = 18, THIEF = 19;

const HUMANS = [HERO, WHERO, MAN, WOMAN, THIEF]; // Hero, Woman-Hero, Man, Woman, Thief
type Bearing = "any" | "noSword" | "weapon" | "noWeapon";
/** One rank on a preference list: a creature type, optionally conditioned on what it already bears. */
interface Rank { type: number; when: Bearing }
const ranks = (types: number[], when: Bearing): Rank[] => types.map((type) => ({ type, when }));

const PREFERENCES: Record<number, Rank[]> = {
  [T_SWORD]: ranks(HUMANS, "any"),
  [T_AXE]: [{ type: DWARF, when: "any" }, ...ranks(HUMANS, "noSword")],
  [T_STAFF]: ranks([SORCERER, APPRENTICE, WIZARD, WITCH, PRIEST, SCHOLAR], "any"),
  [T_SHIELD]: [...ranks(HUMANS, "weapon"), ...ranks(HUMANS, "noWeapon")],
};

/** The Ring's tie-break order; also exactly the types that can wear it. */
const RING_TIE_ORDER = [SORCERER, APPRENTICE, WIZARD, HERO, WITCH, WHERO, PRIEST, MAN, SCHOLAR, WOMAN, THIEF, DWARF];

export interface Allocation { artifact: number; stranger: number }

export interface LoadoutInput {
  strangers: readonly number[];            // creature ids, by stranger index
  gear: readonly (readonly number[])[];    // what each stranger already bears (same indexing)
  floor: readonly number[];                // treasure ids lying in the chamber, unborne
  eyePresent: boolean;                     // the Eye of God is in the area: every fight artefact is powerless
  pick: (n: number) => number;             // random index in [0, n) — called ONLY to break a genuine tie
}

const bears = (gear: readonly number[], t: number) => gear.includes(t);

function qualifies(when: Bearing, gear: readonly number[]): boolean {
  const weapon = bears(gear, T_SWORD) || bears(gear, T_AXE);
  switch (when) {
    case "any": return true;
    case "noSword": return !bears(gear, T_SWORD);
    case "weapon": return weapon;
    case "noWeapon": return !weapon;
  }
}

/** A creature's strength plus whatever bonus its borne Sword, Axe or Staff gives (the Ring's "adjusted strength"). */
function adjustedStrength(creatureId: number, gear: readonly number[]): number {
  const c = CREATURES[creatureId]!;
  return c.fs + c.mp
    + (bears(gear, T_SWORD) ? swordBonus(creatureId) : 0)
    + (bears(gear, T_AXE) ? axeBonus(creatureId) : 0)
    + (bears(gear, T_STAFF) ? staffBonus(creatureId) : 0);
}

/**
 * Allocate the floor's fight artefacts to the strangers, strictly in order Sword, Axe, Staff, Shield, Ring,
 * each step seeing the earlier steps' results. An artefact nobody can bear stays on the floor (it is simply
 * absent from the result). Strangers that already bear something keep it and count as bearing it.
 */
export function defaultLoadout(input: LoadoutInput): Allocation[] {
  if (input.eyePresent) return []; // "All other artefacts relevant to fighting are powerless. Skip this procedure."
  const gear = input.gear.map((g) => [...g]);
  const out: Allocation[] = [];

  const choose = (candidates: number[]): number => (candidates.length === 1 ? candidates[0]! : candidates[input.pick(candidates.length)]!);
  const give = (artifact: number, stranger: number) => { gear[stranger]!.push(artifact); out.push({ artifact, stranger }); };

  for (const artifact of LOADOUT_ARTIFACTS) {
    const copies = input.floor.filter((t) => t === artifact).length;
    for (let n = 0; n < copies; n++) {
      if (artifact === T_RING) {
        const eligible = input.strangers.map((_, i) => i).filter((i) => ringEligible(input.strangers[i]!));
        if (eligible.length === 0) continue;
        const strength = (i: number) => adjustedStrength(input.strangers[i]!, gear[i]!);
        const top = Math.max(...eligible.map(strength));
        const tied = eligible.filter((i) => strength(i) === top);
        const bestRank = Math.min(...tied.map((i) => RING_TIE_ORDER.indexOf(input.strangers[i]!)));
        give(artifact, choose(tied.filter((i) => RING_TIE_ORDER.indexOf(input.strangers[i]!) === bestRank)));
        continue;
      }
      for (const rank of PREFERENCES[artifact]!) {
        const eligible = input.strangers.map((_, i) => i).filter((i) => input.strangers[i] === rank.type && qualifies(rank.when, gear[i]!));
        if (eligible.length === 0) continue;
        give(artifact, choose(eligible));
        break;
      }
    }
  }
  return out;
}

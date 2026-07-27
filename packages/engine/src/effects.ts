import { ALL_CREATURES as CREATURES, FLAG_BEFRIENDS_UNICORN } from "./data/creatures";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_TALISMAN = 7;
const T_THE_RING = 10;
const T_CHARMED_FLUTE = 12;
const T_EYE_OF_GOD = 13;
const C_SPECTRE = 9;
const C_UNICORN = 13;
const C_APPRENTICE = 14; // extension-kit creature — deserts to a hostile stranger the instant the Sorcerer dies (design US-14, SC-EXT-20)
// The Charmed Flute only works when played by a Man, Woman, Hero, Priest or Wizard (§ Charmed Flute).
const FLUTE_BASE = [0, 4, 5, 6, 8]; // Hero, Priest, Man, Woman, Wizard

/**
 * Extension kit (SC-EXT-17, design §1.3): a kit creature that "uses artifacts as" a base class
 * joins EVERY artifact-eligibility list the base class id appears in. Apprentice(14) uses
 * artifacts as Wizard(8); Scholar(17) and Witch(18) as Priest(4); Thief(19) as Man(5) (design
 * §1.3 table). Sword/Axe named-bonus tables are the sole exception (they name specific base
 * creatures, not a class) — deliberately NOT routed through this map. Strength Potion's TARGET
 * list (selectors.ts artifact 8) is likewise excluded: it names specific base creatures to boost,
 * not a class of artifact USERS, so it must never be extended here either.
 */
const CLASS_EXTENSIONS: Readonly<Record<number, readonly number[]>> = {
  8: [14],     // Wizard -> Apprentice
  4: [17, 18], // Priest -> Scholar, Witch
  5: [19],     // Man -> Thief
};

/** True when `creatureId` is eligible for an artifact list that names base class `classId` — the
 *  base creature itself, or a kit creature that "uses artifacts as" it (design §1.3, SC-EXT-17).
 *  Use in place of a bare `creatureId === classId` check in any Carpet/Balm/Staff/Flute-style
 *  eligibility test (findBearer, artifactActions, hasStaffWizard, reviveStoned, …). */
export function usesArtifactsAs(creatureId: number, classId: number): boolean {
  return creatureId === classId || (CLASS_EXTENSIONS[classId]?.includes(creatureId) ?? false);
}

function living(m: PartyMember): boolean {
  return m.status === 0 || m.status === 1;
}

function partyHolds(state: GameState, treasureId: number): boolean {
  return state.party.some((m) => living(m) && m.treasure.includes(treasureId));
}

/**
 * The Charmed Flute is held by a living player able to play it: it lulls Dragons (in a chamber) and
 * Vipers (the pit crossing) to sleep for as long as the party holds it (§ Charmed Flute). The lull is
 * therefore dynamic — re-evaluated whenever it matters — not a one-shot consumable effect.
 */
export function fluteLulls(state: GameState): boolean {
  return state.party.some(
    (m) => living(m) && FLUTE_BASE.some((base) => usesArtifactsAs(m.creatureId, base)) && m.treasure.includes(T_CHARMED_FLUTE),
  );
}

/**
 * The Eye of God is held by a living member: nullifies magic & artefacts, annihilates Spectres, stills the statue.
 * "Keep it or be cursed": dropping or transferring the Eye adds a (permanent) curse — see reduce.ts
 * drop/moveTreasure. The bearer-death edge (Eye lost on a slain carrier) is not yet modelled.
 */
export function eyeActive(state: GameState): boolean {
  return partyHolds(state, T_EYE_OF_GOD);
}

/**
 * Curses currently in force against the party. A curse normally subtracts 1 from every die roll and
 * 30 from the final score, but "a curse has no effect if the Sorcerer is dead" (§Curse) — slaying him
 * lifts every curse at once. So once the Sorcerer is slain this is 0 regardless of how many were taken.
 */
export function activeCurses(state: GameState): number {
  return state.sorcererKilled ? 0 : state.curses;
}

/**
 * When the Eye of God's bearer is slain, the gem is left behind involuntarily on the body and the party
 * falls under a curse until it is taken up again (§Eye of God). Call with the member who just fell;
 * mutates `state.curses` and returns the curse event (the Eye is the only one in the deck, so a slain
 * bearer means no living member still holds it).
 */
export function eyeForsakenByDeath(state: GameState, fallen: PartyMember): GameEvent[] {
  if (!fallen.treasure.includes(T_EYE_OF_GOD)) return [];
  state.curses += 1;
  return [{ type: "eyeForsaken" }];
}

/** The Talisman wards off Spectres on the 4th level or deeper (this edition's deck has no Zombies/Ghouls). */
export function talismanWardsSpectres(state: GameState): boolean {
  return state.level >= 4 && partyHolds(state, T_TALISMAN);
}

/** The Ring makes its bearer immune to killing die-rolls on the 4th level or deeper (negated by an active Eye). */
export function ringInvincible(member: PartyMember, state: GameState): boolean {
  return state.level >= 4 && member.treasure.includes(T_THE_RING) && !eyeActive(state);
}

/** A living Woman (id 6) or W-Hero (id 1) is in the party — required to win and keep a Unicorn's loyalty. */
export function hasWoman(state: GameState): boolean {
  return state.party.some(
    (m) => living(m) && m.creatureId !== C_UNICORN && (CREATURES[m.creatureId]!.flags & FLAG_BEFRIENDS_UNICORN) !== 0,
  );
}

/** Drive off every Spectre in the current encounter when the Talisman wards (level >= 4). Mutates `strangers`. */
export function wardOffSpectres(state: GameState): GameEvent[] {
  if (!talismanWardsSpectres(state)) return [];
  const events: GameEvent[] = [];
  for (let i = state.strangers.length - 1; i >= 0; i--) {
    if (state.strangers[i] === C_SPECTRE) {
      state.strangers.splice(i, 1);
      events.push({ type: "wardedOff", creatureId: C_SPECTRE });
    }
  }
  return events;
}

/** Permanently destroy every Spectre in the current encounter when the Eye is held. Mutates `strangers`. */
export function annihilateWithEye(state: GameState): GameEvent[] {
  if (!eyeActive(state)) return [];
  const events: GameEvent[] = [];
  for (let i = state.strangers.length - 1; i >= 0; i--) {
    if (state.strangers[i] === C_SPECTRE) {
      state.strangers.splice(i, 1);
      events.push({ type: "annihilated", creatureId: C_SPECTRE });
    }
  }
  return events;
}

/**
 * Extension kit (SC-EXT-20, design US-14/Resolved-7): the instant the Sorcerer dies, every
 * Apprentice ALLY's loyalty breaks — she deserts to a hostile stranger in the party's CURRENT
 * area (mirrors Mutiny's own ally->stranger reversion, `hazards.ts`'s `HAZARD_MUTINY` case,
 * exactly: pushed onto `state.strangers`, her carried treasure dropped into `state.treasures`).
 * Design ruling (flagged for review): she "takes nothing" — carried AND borne items alike spill,
 * not lost outright, same as a Mutiny deserter's loot. Called from the one solo kill site
 * (`combatPlan.ts`'s Sorcerer-slaying branch) the instant `sorcererKilled` flips true; a safe
 * no-op whenever no Apprentice is currently allied (there is normally at most one, but a
 * full-group friendly recruit could in principle bring more than one into the same party).
 */
export function revertApprenticesOnSorcererDeath(state: GameState): GameEvent[] {
  const turned = state.party.filter((m) => m.status === 1 && m.creatureId === C_APPRENTICE);
  if (turned.length === 0) return [];
  const dropped: number[] = [];
  for (const a of turned) {
    state.strangers.push(a.creatureId);
    dropped.push(...a.treasure);
  }
  if (dropped.length) state.treasures.push(...dropped);
  state.party = state.party.filter((m) => !turned.includes(m));
  return [{ type: "apprenticeTurned", count: turned.length, items: dropped }];
}

/** A Unicorn stays allied only while a Woman lives; otherwise it departs. Mutates `party`. */
export function reconcileUnicorns(state: GameState): GameEvent[] {
  if (hasWoman(state)) return [];
  const events: GameEvent[] = [];
  for (let i = state.party.length - 1; i >= 0; i--) {
    const m = state.party[i]!;
    if (m.creatureId === C_UNICORN && living(m)) {
      state.party.splice(i, 1);
      events.push({ type: "unicornDeparted", creatureId: C_UNICORN });
    }
  }
  return events;
}

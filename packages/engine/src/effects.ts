import { ALL_CREATURES as CREATURES, FLAG_BEFRIENDS_UNICORN, FLAG_HUMAN } from "./data/creatures";
import { HAZARD_MEDUSA } from "./data/hazards";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_TALISMAN = 7;
const T_THE_RING = 10;
const T_CHARMED_FLUTE = 12;
const T_EYE_OF_GOD = 13;
const C_SPECTRE = 9;
const C_SORCERER = 11; // extension-kit Holy Water target — WEAKEN mode (design US-20, SC-EXT-24)
const C_UNICORN = 13;
const C_APPRENTICE = 14; // extension-kit creature — deserts to a hostile stranger the instant the Sorcerer dies (design US-14, SC-EXT-20)
const C_DEMON = 15; // extension-kit creature — Holy Water's DESTROY mode target (design US-20, SC-EXT-24)
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

/** Extension kit (SC-EXT-25, design US-21/Resolved-10): the Scroll's reading condition — "a living
 *  HUMAN party member is present" — with NO reader selection (any human qualifies; the artifact's
 *  bearer need not be human themselves, `findBearer`'s default "any member" rule already covers
 *  who consumes the card). FLAG_HUMAN covers both base humans and the kit's Apprentice/Scholar/
 *  Witch/Thief rows (data/creatures.ts) — a plain flag check, not `usesArtifactsAs`, since "human"
 *  is a species trait here, not an artifact-class eligibility list (design §1.3 doesn't apply). */
export function hasLivingHuman(state: GameState): boolean {
  return state.party.some((m) => living(m) && (CREATURES[m.creatureId]!.flags & FLAG_HUMAN) !== 0);
}

// Extension kit (SC-EXT-24, design US-20): Holy Water's single `useArtifact(16, target)` target
// picker spans FOUR distinct pools — a stone PARTY member (by party index), a Gallery statue (by
// index into `state.statues`), the area's lurking Medusa marker (a singleton — at most one per
// area), and a stranger to destroy/weaken (by index into `state.strangers`) — which can be
// simultaneously legal (e.g. a stone member AND an unwoken statue in the same Gallery). A single
// `target: number` can't hold four independent index spaces without collision, so each pool is
// offset into its own numeric range, mirroring the codebase's existing `100+id`/`200+id`/…
// `area.contents` encoding (chamber.ts) rather than inventing a new convention. `holyWaterTargets`
// is the SHARED source of truth for both sides of this contract: `selectors.ts`'s `artifactActions`
// enumerates it to build the picker, and `reduce.ts`'s `useArtifact` case 16 looks up the SAME
// function's output to validate and interpret whichever `target` the player chose — so the two can
// never drift apart on what counts as a legal target.
export const HW_STATUE_BASE = 1000; // + index into state.statues (REANIMATE a Gallery statue)
export const HW_MEDUSA = 2000; // singleton sentinel (DESTROY the area's lurking Medusa marker)
export const HW_STRANGER_BASE = 3000; // + index into state.strangers (DESTROY Spectre/Demon, or WEAKEN Sorcerer/Apprentice)

export type HolyWaterMode = "revive" | "wake" | "destroyMedusa" | "destroy" | "weaken";

export interface HolyWaterTarget {
  target: number; // the value to pass/match as useArtifact's `target`
  creatureId?: number; // absent only for "destroyMedusa" — Medusa has no creature id (she's a hazard)
  mode: HolyWaterMode;
}

/** Every legal Holy Water target in the party's CURRENT area, for the state's CURRENT phase (design
 *  US-20: "target picker listing every legal target in the current area"). REVIVE/WAKE/destroyMedusa
 *  are offered at rest or while looting (explore/pickup — the same phases Balm/Staff use); DESTROY/
 *  WEAKEN need a live stranger to target, so they're offered only in encounter/fight (Lotus Dust's
 *  own phase gate). Any other phase (medusa pause, gameOver) yields no targets at all. */
export function holyWaterTargets(state: GameState): HolyWaterTarget[] {
  const out: HolyWaterTarget[] = [];
  if (state.phase === "explore" || state.phase === "pickup") {
    state.party.forEach((m, mi) => {
      if (m.status === 2 && m.stoneArea === state.partyArea) out.push({ target: mi, creatureId: m.creatureId, mode: "revive" });
    });
    (state.statues ?? []).forEach((creatureId, i) => out.push({ target: HW_STATUE_BASE + i, creatureId, mode: "wake" }));
    if (state.areas[state.partyArea]?.contents.includes(300 + HAZARD_MEDUSA)) {
      out.push({ target: HW_MEDUSA, mode: "destroyMedusa" });
    }
  }
  if (state.phase === "encounter" || state.phase === "fight") {
    state.strangers.forEach((sid, i) => {
      if (sid === C_SPECTRE || sid === C_DEMON) out.push({ target: HW_STRANGER_BASE + i, creatureId: sid, mode: "destroy" });
      else if (sid === C_SORCERER || sid === C_APPRENTICE) out.push({ target: HW_STRANGER_BASE + i, creatureId: sid, mode: "weaken" });
    });
  }
  return out;
}

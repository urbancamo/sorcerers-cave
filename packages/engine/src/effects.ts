import { CREATURES, FLAG_BEFRIENDS_UNICORN } from "./data/creatures";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_TALISMAN = 7;
const T_THE_RING = 10;
const T_EYE_OF_GOD = 13;
const C_SPECTRE = 9;
const C_UNICORN = 13;

function living(m: PartyMember): boolean {
  return m.status === 0 || m.status === 1;
}

function partyHolds(state: GameState, treasureId: number): boolean {
  return state.party.some((m) => living(m) && m.treasure.includes(treasureId));
}

/**
 * The Eye of God is held by a living member: nullifies magic & artefacts, annihilates Spectres, stills the statue.
 * NOTE: the Eye's "keep it or be cursed" rule is deferred (single-party game, no party-splitting; bearer-death edge).
 */
export function eyeActive(state: GameState): boolean {
  return partyHolds(state, T_EYE_OF_GOD);
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

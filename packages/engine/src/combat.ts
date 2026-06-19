import { CREATURES } from "./data/creatures";
import type { GameState, PartyMember } from "./state";
import { eyeActive, activeCurses } from "./effects";

const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;

export function isCaster(member: PartyMember): boolean {
  return CREATURES[member.creatureId]!.mp > 0;
}

function holds(member: PartyMember, treasureId: number): boolean {
  return member.treasure.includes(treasureId);
}

/** Front-line fighting strength: FS + dragon-kills + a caster's magical power + Magic Sword bonus (spec §9.3).
 *  A Priest or Wizard fighting hand-to-hand uses its TOTAL strength — fighting strength PLUS magical power
 *  (§FIGHTS) — just as an enemy caster does. The Eye nullifies magic & artefacts. */
export function frontStrength(member: PartyMember, state?: GameState): number {
  const c = CREATURES[member.creatureId]!;
  // A caster in the front line adds its magical power (staff-boosted, nullified by the Eye); 0 for non-casters.
  let s = c.fs + member.dragonKills + casterMP(member, state);
  const artefactsPowerless = state ? eyeActive(state) : false;
  if (!artefactsPowerless && holds(member, T_MAGIC_SWORD)) {
    if (member.creatureId === 0 || member.creatureId === 1) s += 2; // Hero / W-Hero
    else if (member.creatureId === 5 || member.creatureId === 6) s += 1; // Man / Woman
  }
  if (member.potionActive) s += 2; // Strength Potion (consumable; not nullified by the Eye)
  return s;
}

/** Background magical power a caster contributes: MP + Magic Staff bonus (spec §9.3). The Eye zeroes all magic. */
export function casterMP(member: PartyMember, state?: GameState): number {
  if (state && eyeActive(state)) return 0; // the Eye renders all magic powerless (§ Eye of God)
  const c = CREATURES[member.creatureId]!;
  let mp = c.mp;
  if (holds(member, T_MAGIC_STAFF)) {
    if (member.creatureId === 4) mp += 1; // Priest
    else if (member.creatureId === 8) mp += 2; // Wizard
  }
  return mp;
}

/** Bonus added to every PARTY die roll this fight: +1 if any living member holds The Ring (Eye negates it), minus curses. */
export function partyRollBonus(state: GameState): number {
  const ring = !eyeActive(state) && state.party.some((m) => (m.status === 0 || m.status === 1) && holds(m, T_THE_RING));
  return (ring ? 1 : 0) - activeCurses(state);
}

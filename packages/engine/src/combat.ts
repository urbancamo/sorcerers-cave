import { CREATURES } from "./data/creatures";
import type { GameState, PartyMember } from "./state";

const T_MAGIC_SWORD = 3;
const T_MAGIC_STAFF = 9;
const T_THE_RING = 10;

export function isCaster(member: PartyMember): boolean {
  return CREATURES[member.creatureId]!.mp > 0;
}

function holds(member: PartyMember, treasureId: number): boolean {
  return member.treasure.includes(treasureId);
}

/** Front-line fighting strength: FS + dragon-kills + Magic Sword bonus (spec §9.3). */
export function frontStrength(member: PartyMember): number {
  const c = CREATURES[member.creatureId]!;
  let s = c.fs + member.dragonKills;
  if (holds(member, T_MAGIC_SWORD)) {
    if (member.creatureId === 0 || member.creatureId === 1) s += 2; // Hero / W-Hero
    else if (member.creatureId === 5 || member.creatureId === 6) s += 1; // Man / Woman
  }
  return s;
}

/** Background magical power a caster contributes: MP + Magic Staff bonus (spec §9.3). */
export function casterMP(member: PartyMember): number {
  const c = CREATURES[member.creatureId]!;
  let mp = c.mp;
  if (holds(member, T_MAGIC_STAFF)) {
    if (member.creatureId === 4) mp += 1; // Priest
    else if (member.creatureId === 8) mp += 2; // Wizard
  }
  return mp;
}

/** Bonus added to every PARTY die roll this fight: +1 if any living member holds The Ring, minus curses. */
export function partyRollBonus(state: GameState): number {
  const ring = state.party.some((m) => (m.status === 0 || m.status === 1) && holds(m, T_THE_RING));
  return (ring ? 1 : 0) - state.curses;
}

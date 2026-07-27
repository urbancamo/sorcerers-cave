import { CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import type { GameState, PartyMember } from "./state";

/** Total kg of heavy treasure a member is carrying (artifacts weigh 0). Indexes `ALL_TREASURES`
 *  (base 0-14 + kit 15-21, e.g. the Crypt/Gems find, SC-EXT-13) rather than the base-only
 *  `TREASURES` — for ids 0-14 the two tables hold the identical objects, so this is byte-identical
 *  for every kit-off game (SC-EXT-1); a kit-off game can never carry a ≥15 id in the first place. */
export function carriedWeight(member: PartyMember): number {
  return member.treasure.reduce((sum, tid) => sum + ALL_TREASURES[tid]!.weight, 0);
}

/** Can the member take treasure `tid` without exceeding its carry capacity? */
export function canCarry(member: PartyMember, tid: number): boolean {
  const capacity = CREATURES[member.creatureId]!.carry;
  return carriedWeight(member) + ALL_TREASURES[tid]!.weight <= capacity;
}

/** Assign chamber treasure index `ti` to party member index `mi`. Returns false if it won't fit. */
export function takeTreasure(state: GameState, ti: number, mi: number): boolean {
  const tid = state.treasures[ti];
  const member = state.party[mi];
  if (tid === undefined || member === undefined) return false;
  if (!canCarry(member, tid)) return false;
  member.treasure.push(tid);
  state.treasures.splice(ti, 1);
  return true;
}

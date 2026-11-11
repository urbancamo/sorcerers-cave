// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` (base + kit, SC-EXT-2) — a kit ally with a
// nonzero carry stat (Scholar/Thief, 25 kg each) would otherwise crash this lookup against the
// base-only `CREATURES` table the moment it tries to pick anything up; byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";
import type { GameState, PartyMember } from "./state";

/** Total kg of heavy treasure a member is carrying (artifacts weigh 0). Indexes `ALL_TREASURES`
 *  (base 0-14 + kit 15-21, e.g. the Crypt/Gems find, SC-EXT-13) rather than the base-only
 *  `TREASURES` — for ids 0-14 the two tables hold the identical objects, so this is byte-identical
 *  for every kit-off game (SC-EXT-1); a kit-off game can never carry a ≥15 id in the first place. */
export function carriedWeight(member: PartyMember): number {
  return member.treasure.reduce((sum, tid) => sum + ALL_TREASURES[tid]!.weight, 0);
}

// The Unicorn, the Lion and the Wolf carry no artefact at all (Peter's Appendices 20261110: blank in every artefact row but for being the target of
// the Elixir and the Healing Balm; the Lion card: "Does not carry or use any artefact"). Artefacts weigh nothing, so capacity alone never stopped them.
const NO_ARTEFACTS = new Set([13, 16, 20]);

/** Can the member take treasure `tid` without exceeding its carry capacity (and, for an artefact, is it a creature that carries them)? */
export function canCarry(member: PartyMember, tid: number): boolean {
  if (ALL_TREASURES[tid]!.kind === "artifact" && NO_ARTEFACTS.has(member.creatureId)) return false;
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

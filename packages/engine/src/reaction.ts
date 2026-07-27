import { rollDie } from "./rng";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — the leader lookup indexes `state.strangers`
// and the charisma check indexes `state.party`, either of which may already hold a kit id (14-20)
// once the kit is on; byte-identical for ids 0-13 (the only ids a kit-off game can ever hold).
import { ALL_CREATURES as CREATURES, FLAG_CHARISMA } from "./data/creatures";
import { activeCurses } from "./effects";
import type { GameState } from "./state";

export type Reaction = "hostile" | "indifferent" | "friendly";

/** Index into `strangers` of the highest leader-priority creature (ties -> first, spec §8.2). */
export function findLeader(strangers: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < strangers.length; i++) {
    if (CREATURES[strangers[i]!]!.leaderPri > CREATURES[strangers[best]!]!.leaderPri) best = i;
  }
  return best;
}

/** Roll the leader's reaction (spec §8.3). Threads the seed. `roll` is the raw d6 (for display). */
export function reactionRoll(state: GameState): { seed: number; outcome: Reaction; roll: number } {
  const leader = CREATURES[state.strangers[findLeader(state.strangers)]!]!;
  const r = rollDie(state.seed);
  const natural1 = r.value === 1;
  let roll = r.value;
  const hasCharisma = state.party.some(
    (m) => (m.status === 0 || m.status === 1) && (CREATURES[m.creatureId]!.flags & FLAG_CHARISMA) !== 0,
  );
  if (hasCharisma) roll += 1;
  roll -= activeCurses(state);
  roll = Math.max(1, Math.min(6, roll));
  if (natural1) roll = 1; // a natural 1 always counts as 1 (spec §8.3)

  const hostileMax = leader.hostileMax ?? 0; // no table -> never hostile
  const indiffMax = leader.indiffMax ?? 6; // no table -> always indifferent
  const outcome: Reaction = roll <= hostileMax ? "hostile" : roll <= indiffMax ? "indifferent" : "friendly";
  return { seed: r.seed, outcome, roll: r.value };
}

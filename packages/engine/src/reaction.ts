import { rollDie } from "./rng";
// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — the leader lookup indexes `state.strangers`
// and the charisma check indexes `state.party`, either of which may already hold a kit id (14-20)
// once the kit is on; byte-identical for ids 0-13 (the only ids a kit-off game can ever hold).
import { ALL_CREATURES as CREATURES, FLAG_CHARISMA } from "./data/creatures";
import { activeCurses } from "./effects";
import type { GameState } from "./state";

export type Reaction = "hostile" | "indifferent" | "friendly";

// Extension kit — the Apprentice's loyalty is conditional on the Sorcerer's life (design US-14,
// SC-EXT-20): a plain data row can express "1-5 hostile, 6 friendly, never indifferent" (her
// hostileMax===indiffMax===5 already does, via the ordinary formula below), but not "that same
// roll of 6 flips to hostile once he's dead" — a context-dependent band the data table can't
// carry. This is the one custom reaction band the whole system needs.
const C_APPRENTICE = 14;

/** Index into `strangers` of the highest leader-priority creature (ties -> first, spec §8.2). */
export function findLeader(strangers: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < strangers.length; i++) {
    if (CREATURES[strangers[i]!]!.leaderPri > CREATURES[strangers[best]!]!.leaderPri) best = i;
  }
  return best;
}

/**
 * Roll the leader's reaction (spec §8.3). Threads the seed. `roll` is the raw d6 (for display).
 *
 * `forcedValue` (2026-09-11, Next Roll Selector, SC-Test-10): an optional pre-determined raw die
 * value, used by `reduce.ts`'s `case "test"` when a `testNextDie`/`testAllDiceRoll` override is
 * armed instead of a `testNextReaction` outcome — skips the real roll (returned `seed` equals
 * `state.seed`, untouched) but still runs the value through the SAME charisma/curse/natural-1
 * adjustment and leader-threshold banding a genuine roll would, so a forced raw die still produces
 * a mechanically honest outcome for THIS leader rather than duplicating this banding logic
 * elsewhere.
 */
export function reactionRoll(state: GameState, forcedValue?: number): { seed: number; outcome: Reaction; roll: number } {
  const leaderId = state.strangers[findLeader(state.strangers)]!;
  const leader = CREATURES[leaderId]!;
  let seed = state.seed;
  let value: number;
  if (forcedValue !== undefined) {
    value = forcedValue;
  } else {
    const r = rollDie(state.seed);
    seed = r.seed;
    value = r.value;
  }
  const natural1 = value === 1;
  let roll = value;
  const hasCharisma = state.party.some(
    (m) => (m.status === 0 || m.status === 1) && (CREATURES[m.creatureId]!.flags & FLAG_CHARISMA) !== 0,
  );
  if (hasCharisma) roll += 1;
  roll -= activeCurses(state);
  roll = Math.max(1, Math.min(6, roll));
  if (natural1) roll = 1; // a natural 1 always counts as 1 (spec §8.3)

  const hostileMax = leader.hostileMax ?? 0; // no table -> never hostile
  const indiffMax = leader.indiffMax ?? 6; // no table -> always indifferent
  let outcome: Reaction = roll <= hostileMax ? "hostile" : roll <= indiffMax ? "indifferent" : "friendly";
  // Extension kit (SC-EXT-20, design US-14): while the Sorcerer lives, the data row's hostileMax
  // (5) === indiffMax (5) already yields exactly "1-5 hostile, 6 friendly, no indifferent band" —
  // the ordinary formula above needs no help. The moment he's dead, that same roll of 6 must ALSO
  // read hostile instead of friendly (never indifferent either way) — the one context-dependent
  // band this reducer carries.
  if (leaderId === C_APPRENTICE && outcome === "friendly" && state.sorcererKilled) outcome = "hostile";
  return { seed, outcome, roll: value };
}

/**
 * Test Mode (§Test Mode): a representative d6 value that would have produced `outcome` for the
 * CURRENT leader — gives a forced reaction an honest-looking roll in the UI without consuming the
 * RNG. Picks the lowest value in the outcome's own band; clamped to 1-6 so an outcome that isn't
 * actually reachable for this particular leader (e.g. forcing "friendly" from an always-hostile
 * leader) still returns a sane display value rather than an out-of-range number.
 */
export function forcedReactionRoll(state: GameState, outcome: Reaction): number {
  const leaderId = state.strangers[findLeader(state.strangers)]!;
  const leader = CREATURES[leaderId]!;
  const hostileMax = leader.hostileMax ?? 0;
  const indiffMax = leader.indiffMax ?? 6;
  if (outcome === "hostile") return 1;
  if (outcome === "indifferent") return Math.min(6, hostileMax + 1);
  return Math.min(6, indiffMax + 1);
}

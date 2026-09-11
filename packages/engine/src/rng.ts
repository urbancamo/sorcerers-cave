import type { GameState } from "./state";

// Seeded linear-congruential generator (glibc constants), per design-spec §5.
// Deterministic: the RNG state lives in `seed` and is carried through GameState,
// so the engine never touches Math.random/Date.now. BigInt avoids 32-bit overflow.
const A = 1103515245n;
const C = 12345n;
const M = 1n << 31n; // 2^31

/** Advance the LCG one step and return the new 31-bit seed. */
export function nextSeed(seed: number): number {
  return Number((BigInt(seed) * A + C) % M);
}

/** Roll a fair d6 (1..6). Returns the advanced seed and the rolled value. */
export function rollDie(seed: number): { seed: number; value: number } {
  const s = nextSeed(seed);
  const bits = Math.floor(s / 32768) % 65536; // upper bits 15..30
  const value = Math.min(5, Math.floor(bits / 10923)) + 1; // 65536/6 ≈ 10923
  return { seed: s, value };
}

/**
 * Next Roll Selector (2026-09-11, SC-Test-10): the one shared entry point every SOLO d6 roll in the
 * engine goes through — combat, hazards, special areas, artifacts, and reactions (via `reactionRoll`)
 * alike — so a Test Mode override applies no matter which mechanism happens to roll next, without
 * that mechanism needing its own bespoke override logic. Mutates `state.seed` as a side effect
 * (mirroring every existing call site's own `state.seed = r.seed` pattern) UNLESS an override is
 * consumed, in which case the seed is left untouched — same rule `forcedReactionRoll`/
 * `testNextReaction` already established: a forced roll never perturbs the RNG stream.
 *
 * `testNextDie` takes priority (a ONE-SHOT override, deleted here on use) over `testAllDiceRoll`
 * (persists across every call until the turn advances or `testClearOverrides` runs) when both
 * happen to be armed. Checks `state.testMode` explicitly rather than trusting either field's mere
 * presence — defense in depth against a hand-crafted state, matching this codebase's established
 * pattern for every other Test Mode override (map.ts's `testNextArea`, chamber.ts's
 * `testNextChamber`, reduce.ts's `testNextReaction` check).
 *
 * Deliberately NOT used by `score.ts`'s Idol roll: that roll is an intentional, non-seed-advancing
 * "peek" at a FROZEN final state (repeatable by design — the same state must always score the same),
 * which a one-shot `testNextDie` consume-and-delete would break (a second `scoreBreakdown` call on
 * the identical state would then see no override and roll for real, diverging from the first call).
 * Also not used by `multi-fight.ts`'s PvP rolls — Test Mode is solo-only (SC-Test-1).
 */
export function rollDieForState(state: GameState): number {
  if (state.testMode) {
    if (state.testNextDie !== undefined) {
      const value = state.testNextDie;
      delete state.testNextDie;
      return value;
    }
    if (state.testAllDiceRoll !== undefined) {
      return state.testAllDiceRoll;
    }
  }
  const r = rollDie(state.seed);
  state.seed = r.seed;
  return r.value;
}

/** Uniform integer in [0, n). Returns the advanced seed (unchanged if n <= 0). */
export function randBelow(seed: number, n: number): { seed: number; value: number } {
  if (n <= 0) return { seed, value: 0 };
  const s = nextSeed(seed);
  const bits = Math.floor(s / 32768) % 65536; // upper bits 15..30
  return { seed: s, value: bits % n };
}

/** Fisher–Yates shuffle. Pure: returns a new array and the advanced seed. */
export function shuffle<T>(seed: number, arr: readonly T[]): { seed: number; result: T[] } {
  const result = arr.slice();
  let s = seed;
  for (let i = result.length - 1; i >= 1; i--) {
    const r = randBelow(s, i + 1);
    s = r.seed;
    const j = r.value;
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return { seed: s, result };
}

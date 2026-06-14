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

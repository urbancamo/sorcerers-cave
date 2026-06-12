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

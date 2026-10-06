// A small seeded generator (mulberry32). The engine's own `rollDie` does BigInt arithmetic on every roll, which is far
// too slow for a simulator that rolls millions of dice, and the lab never needs to match the engine's stream.
export interface Rng {
  next(): number;                 // float in [0, 1)
  die(): number;                  // 1..6
  int(n: number): number;         // 0..n-1
  shuffle<T>(a: T[]): T[];        // in place
}

export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    die: () => 1 + ((next() * 6) | 0),
    int: (n) => (next() * n) | 0,
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) { const j = (next() * (i + 1)) | 0; const t = arr[i]!; arr[i] = arr[j]!; arr[j] = t; }
      return arr;
    },
  };
}

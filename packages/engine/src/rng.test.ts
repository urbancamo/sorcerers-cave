import { describe, it, expect } from "vitest";
import { nextSeed, rollDie, randBelow, shuffle } from "./rng";

describe("rng (design-spec §5 LCG)", () => {
  it("nextSeed matches the glibc LCG recurrence", () => {
    // (1 * 1103515245 + 12345) mod 2^31 = 1103527590
    expect(nextSeed(1)).toBe(1103527590);
  });

  it("rollDie is deterministic for a given seed", () => {
    expect(rollDie(42)).toEqual(rollDie(42));
  });

  it("rollDie returns 1..6 and covers the full range", () => {
    const seen = new Set<number>();
    let s = 12345;
    for (let i = 0; i < 600; i++) {
      const r = rollDie(s);
      s = r.seed;
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(6);
      seen.add(r.value);
    }
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe("randBelow (spec §5)", () => {
  it("returns a value in [0, n)", () => {
    let s = 7;
    for (let i = 0; i < 500; i++) {
      const r = randBelow(s, 6);
      s = r.seed;
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
    }
  });
  it("returns 0 for n <= 0 without advancing the seed", () => {
    expect(randBelow(99, 0)).toEqual({ seed: 99, value: 0 });
  });
});

describe("shuffle (Fisher–Yates, spec §5)", () => {
  it("is a permutation (preserves the multiset)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { result } = shuffle(123, input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });
  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    shuffle(1, input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
  it("is deterministic for a given seed", () => {
    expect(shuffle(42, [1, 2, 3, 4, 5]).result).toEqual(shuffle(42, [1, 2, 3, 4, 5]).result);
  });
});

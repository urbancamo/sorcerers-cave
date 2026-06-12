import { describe, it, expect } from "vitest";
import { nextSeed, rollDie } from "./rng";

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

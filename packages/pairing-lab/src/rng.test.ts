import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";

describe("makeRng", () => {
  it("is deterministic for a seed", () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 50; i++) expect(a.die()).toBe(b.die());
  });
  it("differs between seeds", () => {
    const a = makeRng(1), b = makeRng(2);
    const sa = Array.from({ length: 20 }, () => a.die()).join("");
    const sb = Array.from({ length: 20 }, () => b.die()).join("");
    expect(sa).not.toBe(sb);
  });
  it("rolls a fair d6 (1..6, each about 1/6)", () => {
    const r = makeRng(7), n = 60000, c = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) c[r.die()]!++;
    expect(c[0]).toBe(0);
    for (let v = 1; v <= 6; v++) expect(Math.abs(c[v]! / n - 1 / 6)).toBeLessThan(0.01);
  });
  it("int(n) stays in range and shuffle keeps the elements", () => {
    const r = makeRng(3);
    for (let i = 0; i < 1000; i++) { const v = r.int(5); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); }
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

import { describe, it, expect } from "vitest";
import { newGame, validatePicks } from "./setup";
import { GATEWAY_START_COORD } from "./state";

describe("validatePicks (spec §3.2 — 6-point budget, stock limits)", () => {
  it("accepts a single Hero (cost 6)", () => {
    expect(validatePicks([0])).toBe(true);
  });
  it("accepts a Priest + Woman (cost 4 + 2 = 6)", () => {
    expect(validatePicks([4, 6])).toBe(true);
  });
  it("rejects exceeding the budget (two Priests = 8)", () => {
    expect(validatePicks([4, 4])).toBe(false);
  });
  it("rejects exceeding stock (two Heroes; only 1 in stock)", () => {
    expect(validatePicks([0, 0])).toBe(false);
  });
  it("rejects a non-selectable creature (Wizard id 8)", () => {
    expect(validatePicks([8])).toBe(false);
  });
  it("rejects an empty party", () => {
    expect(validatePicks([])).toBe(false);
  });
});

describe("newGame (spec §3 setup)", () => {
  it("places the Gateway and seats the chosen party", () => {
    const g = newGame(1, [4, 6]); // Priest + Woman
    expect(g.gs).toBe(0);
    expect(g.turn).toBe(1);
    expect(g.level).toBe(1);
    expect(g.partyArea).toBe(0);
    expect(g.areas).toHaveLength(1);
    expect(g.areas[0]).toMatchObject({ card: 175, coord: GATEWAY_START_COORD, faceUp: true, visited: false });
    expect(g.party.map((m) => m.creatureId)).toEqual([4, 6]);
    expect(g.party.every((m) => m.status === 0)).toBe(true);
  });
  it("builds a 60-card large pack and a 52-card small pack", () => {
    const g = newGame(1, [0]);
    expect(g.largePack).toHaveLength(60);
    expect(g.smallPack).toHaveLength(52);
    expect(g.largeIdx).toBe(0);
    expect(g.smallIdx).toBe(0);
  });
  it("throws on invalid picks", () => {
    expect(() => newGame(1, [0, 0])).toThrow();
  });
});

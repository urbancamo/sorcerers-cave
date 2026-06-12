import { describe, it, expect } from "vitest";
import { carriedWeight, canCarry, takeTreasure } from "./pickup";
import { makeState } from "./testkit";
import type { PartyMember } from "./state";

describe("treasure carry limits (spec §7.3)", () => {
  it("sums heavy weight carried, ignoring weightless artifacts", () => {
    const member = { creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [0, 3] }; // Silver(25) + Magic Sword(0)
    expect(carriedWeight(member)).toBe(25);
  });

  it("canCarry respects the member's capacity", () => {
    const man: PartyMember = { creatureId: 5, status: 0, dragonKills: 0, treasure: [] }; // Man carries 50
    expect(canCarry(man, 0)).toBe(true); // Silver 25 fits
    man.treasure = [0, 1]; // 50 kg used
    expect(canCarry(man, 2)).toBe(false); // no room for Gems
    expect(canCarry(man, 3)).toBe(true); // weightless artifact always fits
  });

  it("takeTreasure moves a chamber item to a member and removes it from the chamber", () => {
    const s = makeState({
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], // Giant carries 150
      treasures: [1, 2], // Gold, Gems
    });
    const ok = takeTreasure(s, 0, 0); // take treasures[0] (Gold) for member 0
    expect(ok).toBe(true);
    expect(s.party[0]!.treasure).toEqual([1]);
    expect(s.treasures).toEqual([2]);
  });

  it("takeTreasure refuses an over-weight assignment", () => {
    const s = makeState({
      party: [{ creatureId: 6, status: 0, dragonKills: 0, treasure: [0] }], // Woman carries 25, already holds Silver
      treasures: [1],
    });
    expect(takeTreasure(s, 0, 0)).toBe(false);
    expect(s.party[0]!.treasure).toEqual([0]);
    expect(s.treasures).toEqual([1]);
  });
});

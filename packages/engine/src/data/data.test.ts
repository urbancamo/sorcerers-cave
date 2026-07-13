import { describe, it, expect } from "vitest";
import { CREATURES, STARTING_STOCK, FLAG_CHARISMA, FLAG_GUIDES_PAST_TRAP } from "./creatures";
import { TREASURES } from "./treasures";
import { HAZARD_NAMES } from "./hazards";
import { AREA_CARDS, GATEWAY_INDEX } from "./areaCards";

describe("static data (spec §3, Appendix D)", () => {
  it("has 61 area cards and the Gateway (value 175) at index 21", () => {
    expect(AREA_CARDS).toHaveLength(61);
    expect(AREA_CARDS[GATEWAY_INDEX]).toBe(175);
  });
  it("has 14 creatures with normative key stats", () => {
    expect(CREATURES).toHaveLength(14);
    expect(CREATURES[0]).toMatchObject({ name: "Hero", fs: 5, cost: 6, points: 10 });
    expect(CREATURES[10]).toMatchObject({ name: "Dragon", fs: 6 });
    expect(CREATURES[0]!.flags & FLAG_CHARISMA).toBe(FLAG_CHARISMA);
    expect(CREATURES[7]!.flags & FLAG_GUIDES_PAST_TRAP).toBe(FLAG_GUIDES_PAST_TRAP);
  });
  it("creature table matches engine-spec Appendix A.1 verbatim (every field, every row)", () => {
    // The full table, pinned cell-by-cell so ports built from the spec's A.1 can trust it.
    // Row: [id, name, fs, mp, carry, cost, points, flags, hostileMax, indiffMax, leaderPri].
    const rows = CREATURES.map((c) => [c.id, c.name, c.fs, c.mp, c.carry, c.cost, c.points, c.flags, c.hostileMax, c.indiffMax, c.leaderPri]);
    expect(rows).toEqual([
      [0, "Hero", 5, 0, 75, 6, 10, 3, 3, 3, 7],
      [1, "W-Hero", 4, 0, 50, 5, 10, 7, 3, 3, 7],
      [2, "Ogre", 5, 0, 100, 5, 5, 16, 4, 5, 3],
      [3, "Troll", 4, 0, 75, 4, 4, 16, 3, 4, 2],
      [4, "Priest", 2, 2, 25, 4, 8, 1, 1, 4, 6],
      [5, "Man", 3, 0, 50, 3, 5, 1, 2, 4, 5],
      [6, "Woman", 2, 0, 25, 2, 5, 5, 2, 4, 5],
      [7, "Dwarf", 1, 0, 25, 1, 2, 24, 0, 4, 1],
      [8, "Wizard", 2, 5, 0, null, 15, 1, 1, 5, 8],
      [9, "Spectre", 0, 5, 0, null, 0, 0, 5, 6, 10],
      [10, "Dragon", 6, 0, 0, null, 0, 16, 4, 6, 9],
      [11, "Sorcerer", 4, 9, 0, null, 0, 0, 6, 6, 11],
      [12, "Giant", 7, 0, 150, null, 7, 16, 3, 5, 4],
      [13, "Unicorn", 0, 4, 0, null, 4, 4, 0, 0, 0],
    ]);
  });
  it("offers 8 selectable starters with the right stock", () => {
    expect(Object.keys(STARTING_STOCK)).toHaveLength(8);
    const totalStarters = Object.values(STARTING_STOCK).reduce((a, b) => a + b, 0);
    expect(totalStarters).toBe(1 + 1 + 3 + 3 + 3 + 6 + 3 + 3); // 23
  });
  it("has 15 treasures and 5 hazards", () => {
    expect(TREASURES).toHaveLength(15);
    expect(TREASURES[14]).toMatchObject({ name: "Treasure Chest", weight: 100, kind: "heavy" });
    expect(HAZARD_NAMES).toHaveLength(5);
  });
});

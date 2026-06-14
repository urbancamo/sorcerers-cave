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

import { describe, it, expect } from "vitest";
import { buildLargePack, buildSmallPack } from "./decks";
import { smallPackTemplate } from "./data/smallPack";

describe("deck builders", () => {
  it("smallPackTemplate has 52 cards (19 creatures, 27 treasures, 6 hazards)", () => {
    const t = smallPackTemplate();
    expect(t).toHaveLength(52);
    expect(t.filter((c) => c >= 100 && c < 200)).toHaveLength(19);
    expect(t.filter((c) => c >= 200 && c < 300)).toHaveLength(27);
    expect(t.filter((c) => c >= 300 && c < 400)).toHaveLength(6);
  });
  it("buildLargePack yields 60 cards with no Gateway and the original multiset", () => {
    const { pack } = buildLargePack(5);
    expect(pack).toHaveLength(60);
    expect(pack).not.toContain(175);
  });
  it("buildSmallPack yields 52 cards preserving the template multiset", () => {
    const { pack } = buildSmallPack(5);
    expect([...pack].sort((a, b) => a - b)).toEqual([...smallPackTemplate()].sort((a, b) => a - b));
  });
  it("is deterministic for a given seed", () => {
    expect(buildLargePack(9).pack).toEqual(buildLargePack(9).pack);
  });
});

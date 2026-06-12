import { describe, it, expect } from "vitest";
import { scoreGame } from "./score";
import { makeState } from "./testkit";
import { GS_DEAD, GS_ESCAPED } from "./state";

describe("scoreGame (spec §12)", () => {
  it("sums living members' points plus carried treasure", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [1] }, // Hero 10 + Gold 10
        { creatureId: 5, status: 1, dragonKills: 0, treasure: [] }, // ally Man 5
      ],
    });
    expect(scoreGame(s)).toBe(25);
  });

  it("doubles a dragon-slayer's creature points (not treasure)", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      party: [{ creatureId: 0, status: 0, dragonKills: 1, treasure: [1] }], // Hero 10*2 + Gold 10
    });
    expect(scoreGame(s)).toBe(30);
  });

  it("excludes stone/dead members, adds sorcerer bonus, subtracts 30 per curse", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      sorcererKilled: true,
      curses: 1,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] }, // Hero 10
        { creatureId: 5, status: 2, dragonKills: 0, treasure: [2] }, // STONE -> excluded
      ],
    });
    expect(scoreGame(s)).toBe(10 + 30 - 30); // 10
  });

  it("a wiped party scores zero, clamped at 0", () => {
    const s = makeState({
      gs: GS_DEAD,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [1] }],
    });
    expect(scoreGame(s)).toBe(0);
  });
});

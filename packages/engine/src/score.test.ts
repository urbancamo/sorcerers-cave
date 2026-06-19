import { describe, it, expect } from "vitest";
import { scoreGame, scoreBreakdown } from "./score";
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

  it("excludes stone/dead members and subtracts 30 per curse", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      curses: 2,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] }, // Hero 10
        { creatureId: 5, status: 2, dragonKills: 0, treasure: [2] }, // STONE -> excluded
      ],
    });
    expect(scoreGame(s)).toBe(0); // 10 - 60 clamped at 0
  });

  it("adds the 30-point Sorcerer bounty", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      sorcererKilled: true,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }], // Hero 10
    });
    expect(scoreGame(s)).toBe(40); // 10 + 30
  });

  it("lifts every curse penalty once the Sorcerer is slain (§Curse)", () => {
    const cursed = {
      gs: GS_ESCAPED,
      curses: 2,
      party: [{ creatureId: 0, status: 0 as const, dragonKills: 0, treasure: [] }], // Hero 10
    };
    expect(scoreGame(makeState(cursed))).toBe(0);                       // 10 - 60, clamped
    expect(scoreGame(makeState({ ...cursed, sorcererKilled: true }))).toBe(40); // +30, no curse penalty
    expect(scoreBreakdown(makeState({ ...cursed, sorcererKilled: true })).cursePenalty).toBe(0);
  });

  it("a wiped party scores zero, clamped at 0", () => {
    const s = makeState({
      gs: GS_DEAD,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [1] }],
    });
    expect(scoreGame(s)).toBe(0);
  });
});

describe("scoreBreakdown", () => {
  it("itemises each member, their carried items, and the bonuses", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      bonusScore: 7,
      party: [
        { creatureId: 0, status: 0, dragonKills: 1, treasure: [1, 3] }, // Hero 10*2 + Gold 10 + Magic Sword 15
        { creatureId: 5, status: 1, dragonKills: 0, treasure: [] }, // ally Man 5
      ],
    });
    const b = scoreBreakdown(s);
    expect(b.members).toHaveLength(2);
    const hero = b.members[0]!;
    expect(hero.name).toBe("Hero");
    expect(hero.dragonDoubled).toBe(true);
    expect(hero.creaturePoints).toBe(20);
    expect(hero.treasures.map((t) => [t.name, t.points, t.kind])).toEqual([
      ["Gold", 10, "heavy"],
      ["Magic Sword", 15, "artifact"],
    ]);
    expect(hero.subtotal).toBe(45); // 20 + 10 + 15
    expect(b.members[1]!.subtotal).toBe(5);
    expect(b.bonusScore).toBe(7);
    expect(b.total).toBe(57); // 45 + 5 + 7
    expect(b.total).toBe(scoreGame(s)); // total matches scoreGame
  });

  it("lists stone/dead members but scores them zero", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      curses: 1,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] }, // Hero 10
        { creatureId: 5, status: 2, dragonKills: 0, treasure: [2] }, // STONE — listed, 0
      ],
    });
    const b = scoreBreakdown(s);
    const stone = b.members[1]!;
    expect(stone.counts).toBe(false);
    expect(stone.subtotal).toBe(0);
    expect(stone.treasures).toHaveLength(1); // still listed for the record
    expect(b.cursePenalty).toBe(30);
    expect(b.total).toBe(0); // 10 - 30 clamped at 0
  });
});

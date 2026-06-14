import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { scoreGame } from "./score";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { GS_ESCAPED } from "./state";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("openChest (spec §11/§16)", () => {
  it("removes the chest and applies the rolled result, across seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = makeState({ phase: "explore", areas: [area], party: [member(0, [14])], seed });
      const { state, events } = reduce(s, { type: "openChest" });
      const opened = events.find((e) => e.type === "chestOpened") as { type: "chestOpened"; result: number } | undefined;
      expect(opened).toBeDefined();
      expect(state.party[0]!.treasure).not.toContain(14); // chest consumed
      if (opened!.result === 1) expect(state.curses).toBe(1);
      if (opened!.result === 2) { expect(state.phase).toBe("fight"); expect(state.strangers).toContain(9); }
      if (opened!.result === 4) expect(state.bonusScore).toBe(20);
      if (opened!.result === 5) expect(state.bonusScore).toBe(40);
      if (opened!.result === 6) expect(state.bonusScore).toBe(80);
    }
  });

  it("is rejected outside explore or when no living member carries the chest", () => {
    const noChest = makeState({ phase: "explore", areas: [area], party: [member(0)] });
    expect(reduce(noChest, { type: "openChest" }).events).toContainEqual({ type: "blocked" });
    const wrongPhase = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [member(0, [14])] });
    expect(reduce(wrongPhase, { type: "openChest" }).events).toContainEqual({ type: "blocked" });
  });

  it("scoreGame includes banked chest loot", () => {
    const s = makeState({ gs: GS_ESCAPED, bonusScore: 40, party: [member(0)] }); // Hero 10 + 40
    expect(scoreGame(s)).toBe(50);
  });
});

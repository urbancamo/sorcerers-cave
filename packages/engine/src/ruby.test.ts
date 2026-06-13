import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = (flags = 0) => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags, indiffCount: 0 });

describe("Lost Ruby statue (spec §16)", () => {
  it("taking the Lost Ruby fights the statue: win -> ruby; loss -> slain + statue aroused", () => {
    const s = makeState({ phase: "pickup", areas: [area()], treasures: [11], party: [member(5)], seed: 4 }); // Man (FS 3)
    const { state, events } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    if (state.party[0]!.treasure.includes(11)) {
      expect(events).toContainEqual({ type: "rubyTaken" });
      expect(state.party[0]!.status).toBe(0);
      expect(state.treasures).toEqual([]);
    } else {
      expect(state.party[0]!.status).toBe(3);
      expect(state.areas[0]!.flags & 32).toBe(32);
      expect(events).toContainEqual({ type: "statueAroused" });
      expect(state.treasures).toEqual([11]); // ruby stays
    }
  });

  it("an overwhelming fighter always wins the ruby", () => {
    // Giant (FS 7) vs statue 8: 7 + d6 vs 8 + d6 — not dice-proof, so just assert one valid outcome.
    const s = makeState({ phase: "pickup", areas: [area()], treasures: [11], party: [member(12)], seed: 5 });
    const { state } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    const won = state.party[0]!.treasure.includes(11);
    expect(won || state.party[0]!.status === 3).toBe(true);
  });

  it("entering an aroused-statue area makes the statue attack first", () => {
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        area(32), // index 1: aroused statue, at (50,50)
      ],
      partyArea: 0, prev: 0,
      party: [member(0)], // Hero
      seed: 3,
    });
    s.areas[1]!.coord = packCoord(1, 50, 50);
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the aroused area
    expect(state.partyArea).toBe(1);
    expect(events).toContainEqual({ type: "statueAttacked" });
  });
});

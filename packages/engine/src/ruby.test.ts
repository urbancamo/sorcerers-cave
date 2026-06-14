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
    // Giant (FS 7) + 6 dragonKills => frontStrength = 13.
    // Win condition: fighter_roll >= 8 + statue_roll. Worst case: 13 + 1 = 14 >= 8 + 6 = 14. Dice-proof.
    const fighter = { creatureId: 12, status: 0 as const, dragonKills: 6, treasure: [] };
    const s = makeState({ phase: "pickup", areas: [area()], treasures: [11], party: [fighter], seed: 5 });
    const { state, events } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.party[0]!.treasure).toContain(11);
    expect(events).toContainEqual({ type: "rubyTaken" });
    expect([0, 1]).toContain(state.party[0]!.status);
    // the fight against the strength-8 statue is surfaced as a combat roll (for UI feedback)
    expect(events).toContainEqual(expect.objectContaining({ type: "combatRoll", enemy: "Statue", result: "partyWon" }));
  });

  it("entering an aroused-statue area makes the statue attack first", () => {
    // seed=3: party roll pr=4, statue roll sr=2 → 8+2=10 > 5+4=9 → Hero (FS 5) dies.
    // Party is then empty → gameOver(GS_DEAD). Events: memberDied, statueAttacked, gameOver.
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        area(32), // index 1: aroused statue, at (50,50)
      ],
      partyArea: 0, prev: 0,
      party: [member(0)], // Hero (creatureId=0, FS=5)
      seed: 3,
    });
    s.areas[1]!.coord = packCoord(1, 50, 50);
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the aroused area
    expect(state.partyArea).toBe(1);
    // Statue fires (confirmed by pinned seed=3: statue beats Hero)
    expect(events).toContainEqual({ type: "statueAttacked" });
    // Hero is slain — deterministic at this seed
    expect(state.party[0]!.status).toBe(3);
    expect(events).toContainEqual({ type: "memberDied", creatureId: 0 });
    // Whole party dead → gameOver
    expect(events).toContainEqual({ type: "gameOver", gs: 2 });
  });
});

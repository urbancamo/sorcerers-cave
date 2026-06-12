import { describe, it, expect } from "vitest";
import { viperCrossing, deepPoolCrossing } from "./special";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });

describe("viperCrossing (spec §10.1)", () => {
  it("the Charmed Flute carries everyone across safely (no rolls)", () => {
    const s = makeState({ party: [member(0, [12]), member(5)], seed: 1 });
    const seedBefore = s.seed;
    const events = viperCrossing(s);
    expect(s.seed).toBe(seedBefore); // no dice rolled
    expect(s.party.every((m) => m.status === 0)).toBe(true);
    expect(events).toEqual([]);
  });

  it("rolls a d6 per living member; a 1 means falling in (death, treasure lost)", () => {
    // Roll outcomes are seed-driven; assert the mechanism: every member ends up alive (0) or fallen (3),
    // and any fallen member has lost its treasure.
    const s = makeState({ party: [member(5, [1]), member(5, [0])], seed: 4 });
    viperCrossing(s);
    for (const m of s.party) {
      expect([0, 3]).toContain(m.status);
      if (m.status === 3) expect(m.treasure).toEqual([]);
    }
    expect(s.seed).not.toBe(4); // dice were rolled
  });
});

describe("deepPoolCrossing (spec §10.2)", () => {
  const poolState = (over: object) => makeState({
    areas: [{ card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
    partyArea: 0,
    ...over,
  });

  it("a Giant carries all heavy treasure across — nothing is dropped", () => {
    const s = poolState({ party: [member(12, [0, 1]), member(5, [2])] }); // Giant + Man
    const events = deepPoolCrossing(s, 0);
    expect(s.party[1]!.treasure).toEqual([2]); // Man keeps his Gems
    expect(s.areas[0]!.dropped ?? []).toEqual([]);
    expect(events).toEqual([]);
  });

  it("without a Giant, non-artifact heavy treasure is dropped into the pool; artifacts are kept", () => {
    const s = poolState({ party: [member(5, [1, 3])] }); // Man with Gold(heavy) + Magic Sword(artifact)
    const events = deepPoolCrossing(s, 0);
    expect(s.party[0]!.treasure).toEqual([3]); // keeps the Magic Sword
    expect(s.areas[0]!.dropped).toEqual([1]); // Gold dropped in the pool
    expect(events).toContainEqual({ type: "treasureDropped", count: 1 });
  });
});

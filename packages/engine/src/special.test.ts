import { describe, it, expect } from "vitest";
import { viperCrossing, deepPoolCrossing } from "./special";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });

describe("viperCrossing (spec §10.1)", () => {
  it("the Charmed Flute carries everyone across safely (no rolls)", () => {
    const s = makeState({ party: [member(0, [12]), member(5)], seed: 1 }); // Hero may play it
    s.vipersLulledArea = s.partyArea;                                       // ...and has: lulling is a deliberate play, not just holding it
    const seedBefore = s.seed;
    const events = viperCrossing(s);
    expect(s.seed).toBe(seedBefore); // no dice rolled
    expect(s.party.every((m) => m.status === 0)).toBe(true);
    expect(events).toEqual([{ type: "vipersLulled" }]);
  });

  it("the Flute does not lull when only an ineligible creature carries it", () => {
    // An Ogre (id 2) cannot play the Flute, so the vipers are not lulled — the party rolls to cross.
    const s = makeState({ party: [member(2, [12])], seed: 4 });
    const events = viperCrossing(s);
    expect(events).not.toContainEqual({ type: "vipersLulled" });
    expect(s.seed).not.toBe(4); // dice were rolled
  });

  it("rolls a d6 per living member; a 1 or 2 means falling in (death, treasure lost)", () => {
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

  it("emits a viperPit event with a d6 per living member (for the dice display)", () => {
    const s = makeState({ party: [member(5, [1]), member(2), member(5)], seed: 4 });
    const events = viperCrossing(s);
    const pit = events.find((e) => e.type === "viperPit") as Extract<typeof events[number], { type: "viperPit" }>;
    expect(pit).toBeDefined();
    expect(pit.rolls).toHaveLength(3); // one per living member
    for (const r of pit.rolls) {
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(6);
      expect(r.died).toBe(r.roll <= 2); // a 1 or 2 is the fatal fall
    }
    // Every member that the rolls marked as died is dead in state, with its treasure lost.
    const deadIds = pit.rolls.filter((r) => r.died).length;
    expect(s.party.filter((m) => m.status === 3)).toHaveLength(deadIds);
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

  // GitHub #93: the Treasure Chest (100 kg), the Idol (50 kg) and Crypt/Gems are heavy treasure too, not only Silver, Gold and Gems.
  it("a Treasure Chest counts toward the loads: 325 kg across two Giants is two loads and one extra turn", () => {
    const s = poolState({ turn: 8, party: [member(12, [14, 0, 0]), member(12, [2, 2, 2, 1, 1]), member(5, [0]), member(5, [1])] });
    const events = deepPoolCrossing(s, 0);
    expect(events).toEqual([{ type: "deepPoolDelay", loads: 2, turns: 1 }]);
    expect(s.turn).toBe(9);
  });

  it("without a Giant, a Chest, an Idol and Crypt/Gems are left in the pool with the rest", () => {
    const s = poolState({ party: [member(5, [14, 3]), member(5, [18, 21])] });
    deepPoolCrossing(s, 0);
    expect(s.party.map((m) => m.treasure)).toEqual([[3], []]);
    expect(s.areas[0]!.dropped).toEqual([14, 18, 21]);
  });

  it("without a Giant, non-artifact heavy treasure is dropped into the pool; artifacts are kept", () => {
    const s = poolState({ party: [member(5, [1, 3])] }); // Man with Gold(heavy) + Magic Sword(artifact)
    const events = deepPoolCrossing(s, 0);
    expect(s.party[0]!.treasure).toEqual([3]); // keeps the Magic Sword
    expect(s.areas[0]!.dropped).toEqual([1]); // Gold dropped in the pool
    expect(events).toContainEqual({ type: "treasureDropped", count: 1 });
  });
});

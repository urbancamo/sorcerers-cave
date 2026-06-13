import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";

const heroWithFlute = () => ({ creatureId: 0, status: 0 as const, dragonKills: 0, treasure: [12] });
const area1 = () => ({ card: 31, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 });

describe("Charmed Flute — lull Dragons (§ Charmed Flute)", () => {
  it("puts a Dragon to sleep in an encounter, keeping the Flute", () => {
    const s = makeState({
      phase: "encounter",
      party: [heroWithFlute()],
      strangers: [10, 5], // Dragon + Man
      areas: [{ card: 31, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(state.strangers).toEqual([5]); // Dragon removed
    expect(state.areas[state.partyArea]!.contents).toContain(110); // asleep in the area (100 + 10)
    expect(state.party[0]!.treasure).toEqual([12]); // NOT consumed
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
    expect(state.phase).toBe("encounter"); // strangers remain -> stay to deal with them
  });

  it("resolves the encounter when the Dragon was the only stranger", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      party: [heroWithFlute()],
      strangers: [10],
      areas: [area1()],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(state.strangers).toEqual([]);
    expect(state.fight).toBeNull();
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
    // The lulled Dragon must be parked in the area so it re-appears on re-entry.
    expect(state.areas[state.partyArea]!.contents).toContain(110);
  });

  it("persists lulled Dragon alongside remaining working-set stranger on withdraw", () => {
    // Two strangers: Dragon (10) and Man (5). Lull the Dragon, then withdraw.
    // After withdraw the encounter area contents must include both the slept Dragon (110)
    // and the Man who was left in the working set (105).
    const { coord } = makeState().areas[0]!;
    const s = makeState({
      phase: "encounter",
      party: [heroWithFlute()],
      strangers: [10, 5],
      areas: [
        { card: 175, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // prev (area 0)
        { card: 31, coord: coord + 1, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // encounter chamber (area 1)
      ],
      partyArea: 1,
      prev: 0,
    });

    // Lull the Dragon — strangers becomes [5], Dragon parked to area 1 contents.
    const afterLull = reduce(s, { type: "useArtifact", artifact: 12 }).state;
    expect(afterLull.areas[1]!.contents).toContain(110);
    expect(afterLull.strangers).toEqual([5]);

    // Withdraw — must persist the Man (105) alongside the already-parked Dragon (110).
    const { state } = reduce(afterLull, { type: "withdraw" });
    expect(state.phase).toBe("explore");
    expect(state.partyArea).toBe(0);
    expect(state.areas[1]!.contents).toContain(110); // slept Dragon persisted
    expect(state.areas[1]!.contents).toContain(105); // withdrawn Man persisted
  });

  it("is blocked when no Dragon is present", () => {
    const s = makeState({ phase: "encounter", party: [heroWithFlute()], strangers: [5] });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("is blocked for a creature that cannot play it", () => {
    const s = makeState({ phase: "encounter", party: [{ creatureId: 2, status: 0, dragonKills: 0, treasure: [12] }], strangers: [10] }); // Ogre
    const { events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});

import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";

const heroWithFlute = () => ({ creatureId: 0, status: 0 as const, dragonKills: 0, treasure: [12] });

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
      areas: [{ card: 31, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(state.strangers).toEqual([]);
    expect(state.fight).toBeNull();
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
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

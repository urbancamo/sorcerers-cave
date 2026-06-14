import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord, DIR_E, DIR_UP } from "./coords";

const wizardWithCarpet = () => ({ creatureId: 8, status: 0 as const, dragonKills: 0, treasure: [4] });

// A plain N+E+S+W corridor (no chamber) so resolveArea just returns to explore.
const CORRIDOR = 15;

describe("Magic Carpet (treasure id 4, § Magic Carpet)", () => {
  it("teleports to an existing adjacent area ignoring doors, and is consumed", () => {
    const s = makeState({
      party: [wizardWithCarpet()],
      areas: [
        { card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: CORRIDOR, coord: packCoord(1, 51, 50), faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
      level: 1,
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(state.partyArea).toBe(1); // moved east despite no door requirement
    expect(state.party[0]!.treasure).toEqual([]); // carpet consumed
    expect(events).toContainEqual({ type: "carpetUsed", dir: DIR_E });
  });

  it("places a new area card when teleporting to unexplored space", () => {
    const s = makeState({
      party: [wizardWithCarpet()],
      areas: [{ card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [CORRIDOR],
      largeIdx: 0,
      partyArea: 0,
      level: 1,
    });
    const { state } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(state.areas.length).toBe(2);
    expect(state.partyArea).toBe(1);
    expect(state.areas[1]!.faceUp).toBe(true);
  });

  it("will not carry the party out of the cave (UP blocked on level 1)", () => {
    const s = makeState({ party: [wizardWithCarpet()], level: 1 });
    const { events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_UP });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("cannot be used to retreat (blocked outside explore)", () => {
    const s = makeState({ party: [wizardWithCarpet()], phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [5] });
    const { events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("only a Priest or Wizard may command it", () => {
    const s = makeState({ party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [4] }] }); // Hero
    const { events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(events).toEqual([{ type: "blocked" }]); // no valid bearer
  });
});

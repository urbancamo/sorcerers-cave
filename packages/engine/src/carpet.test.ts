import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord, DIR_E, DIR_W, DIR_UP, DIR_DOWN } from "./coords";
import { decodeArea } from "./decode";

const wizardWithCarpet = () => ({ creatureId: 8, status: 0 as const, dragonKills: 0, treasure: [4] });

// A plain N+E+S+W corridor (no chamber) so resolveArea just returns to explore.
const CORRIDOR = 15;

describe("Magic Carpet (treasure id 4, § Magic Carpet)", () => {
  it("teleports to an existing adjacent area ignoring doors, leaving the carpet behind", () => {
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
    expect(state.party[0]!.treasure).toEqual([]); // no longer carried
    expect(state.areas[0]!.contents).toContain(204); // 200+4 — left on the VACATED tile's floor
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

  it("bug fix 2026-08-09: a vertical teleport onto unexplored space mirrors no return stair", () => {
    const s = makeState({
      party: [wizardWithCarpet()],
      areas: [{ card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [CORRIDOR], // no stairUp/stairDown bits of its own
      largeIdx: 0,
      partyArea: 0,
      level: 1,
    });
    const { state } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_DOWN });
    const landed = state.areas[state.partyArea]!;
    expect(landed.card).toBe(CORRIDOR); // placed exactly as drawn/printed — no OR-ed stair bit
    expect(landed.mirroredStairs ?? 0).toBe(0); // no invented connectivity link either
    expect(decodeArea(landed.card).stairUp).toBe(false);

    // The rulebook is explicit: "you may not withdraw, and the carpet remains behind" — proving there
    // is no secret door back means an ORDINARY move can't retrace the carpet's own path either.
    const backUp = reduce(state, { type: "move", dir: DIR_UP });
    expect(backUp.events).toEqual([{ type: "blocked" }]);
  });

  describe("bug fix 2026-08-09 (QOTO-02/03): the carpet remains behind, not destroyed", () => {
    it("left as ordinary floor treasure on the vacated tile — never lands on the destination", () => {
      const s = makeState({
        party: [wizardWithCarpet()],
        areas: [{ card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
        largePack: [CORRIDOR],
        largeIdx: 0,
        partyArea: 0,
        level: 1,
      });
      const { state } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
      expect(state.areas[0]!.contents).toEqual([204]); // the departed tile, index 0
      expect(state.areas[1]!.contents).toEqual([]); // NOT on the freshly-drawn destination
    });

    it("can be retrieved on a later visit — the rulebook's own \"can be retrieved and used again\"", () => {
      const s = makeState({
        party: [wizardWithCarpet()],
        areas: [
          { card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
          { card: CORRIDOR, coord: packCoord(1, 51, 50), faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 },
        ],
        partyArea: 0,
        level: 1,
      });
      const used = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
      // Walk straight back west into the vacated tile — no door requirement either way (CORRIDOR).
      const back = reduce(used.state, { type: "move", dir: DIR_W });
      expect(back.state.phase).toBe("pickup");
      expect(back.state.treasures).toEqual([4]);
    });
  });
});

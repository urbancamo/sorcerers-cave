import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { GS_QUIT, GS_ESCAPED } from "./state";
import { DIR_S, packCoord } from "./coords";
import { makeState } from "./testkit";
import { legalActions } from "./selectors";

describe("reduce (spec §4 turn dispatch)", () => {
  it("quit ends the game and emits gameOver(QUIT)", () => {
    const { state, events } = reduce(makeState(), { type: "quit" });
    expect(state.gs).toBe(GS_QUIT);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_QUIT });
  });

  it("exitCave escapes when on level 1 with a stair-up (the Gateway)", () => {
    const { state, events } = reduce(makeState(), { type: "exitCave" });
    expect(state.gs).toBe(GS_ESCAPED);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_ESCAPED });
  });

  it("exitCave is blocked when the current card has no stair-up", () => {
    // Card 31 = NSEWC, no stair-up.
    const s = makeState({ areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "exitCave" });
    expect(state.gs).toBe(0);
    expect(events).toContainEqual({ type: "blocked" });
  });

  it("a successful move increments the turn and emits moved + drewChamber", () => {
    // Draw 31 (NSEWC, a chamber) moving South from the Gateway.
    const s = makeState({ largePack: [31], largeIdx: 0, turn: 1 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.turn).toBe(2);
    expect(state.partyArea).toBe(1);
    expect(events).toContainEqual({ type: "moved", area: 1, level: 1 });
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [], hazards: [] });
  });

  it("a dead-end move does not advance the turn and emits deadEnd", () => {
    // Draw 12 (SW, no north door) moving South -> dead-end.
    const s = makeState({ largePack: [12], largeIdx: 0, turn: 1 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.turn).toBe(1);
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_S });
  });

  it("ignores actions once the game is over", () => {
    const over = makeState({ gs: GS_QUIT });
    const { state, events } = reduce(over, { type: "move", dir: DIR_S });
    expect(state).toBe(over);
    expect(events).toEqual([]);
  });
});

describe("reduce — chamber resolution (C-1)", () => {
  it("moving into a chamber with only treasure enters the pickup phase", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]);
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [1], hazards: [] });
    expect(legalActions(state)).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });

  it("taking the last treasure returns to the explore phase and persists nothing", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.phase).toBe("explore");
    expect(state.party[0]!.treasure).toEqual([1]);
    expect(state.treasures).toEqual([]);
  });

  it("moving into a chamber with a stranger enters the encounter phase (withdraw only)", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("encounter");
    expect(state.strangers).toEqual([10]);
    expect(legalActions(state)).toEqual([{ type: "withdraw" }, { type: "quit" }]);
  });

  it("withdraw steps back to the previous area and leaves the strangers behind", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "withdraw" });
    expect(state.phase).toBe("explore");
    expect(state.partyArea).toBe(0);
    expect(state.areas[1]!.contents).toContain(110);
  });
});

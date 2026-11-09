import { describe, expect, it } from "vitest";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { DIR_E, DIR_W, packCoord } from "./coords";
import { AF_DESTROYED } from "./state";
import type { PlacedArea } from "./state";

// Peter's report 2026-11-06 (game XGBC): a doorway onto a tile already on the map whose far side shows no matching doorway (a revealed dead end)
// is not offered. Taking it could only waste the turn (SC-6.1-12).
const N = 1, E = 2, S = 4, W = 8;
const at = (card: number, x: number, y: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord: packCoord(1, x, y), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });
const moves = (s: ReturnType<typeof makeState>) => legalActions(s).filter((a) => a.type === "move").map((a) => (a as { dir: number }).dir).sort();

describe("a revealed dead end is not offered", () => {
  // The party stands at (50,50) with doorways W and E. West is a laid N-S tunnel (no east doorway); east is a laid tile with a west doorway.
  const here = at(W | E, 50, 50);
  const base = (west: PlacedArea, east: PlacedArea) => makeState({ areas: [here, west, east], partyArea: 0, prev: 0, phase: "explore" as const, largePack: [31, 31], largeIdx: 0 });

  it("hides a doorway onto a placed tile that shows no way back (Peter's case)", () => {
    const west = at(N | S, 49, 50);
    const east = at(W, 51, 50);
    expect(moves(base(west, east))).toEqual([DIR_E]);
  });

  it("still offers a doorway onto a placed tile that connects", () => {
    expect(moves(base(at(E, 49, 50), at(W, 51, 50)))).toEqual([DIR_E, DIR_W].sort());
  });

  it("hides a doorway onto a collapsed tile", () => {
    expect(moves(base(at(E, 49, 50, { flags: AF_DESTROYED }), at(W, 51, 50)))).toEqual([DIR_E]);
  });

  it("still offers a doorway toward empty space, which is not yet revealed", () => {
    expect(moves(makeState({ areas: [here], partyArea: 0, prev: 0, phase: "explore" as const, largePack: [31, 31], largeIdx: 0 }))).toEqual([DIR_E, DIR_W].sort());
  });
});

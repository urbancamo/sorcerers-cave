import { describe, expect, it } from "vitest";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { DIR_E, DIR_W, packCoord, targetCoord } from "./coords";
import type { PlacedArea } from "./state";

// Ruling R-15 (MSW, 2026-11-06; invariant soak B-04): once every tile has been placed, an unexplored exit is no longer viable. A move toward
// empty space has nothing to draw (SC-6.1-6), so it is not offered; exits onto tiles already on the map still are.
const tile = (card: number, x: number): PlacedArea => ({ card, coord: packCoord(1, x, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 });
const moves = (s: ReturnType<typeof makeState>) => legalActions(s).filter((a) => a.type === "move").map((a) => (a as { dir: number }).dir);

describe("a full cave (R-15)", () => {
  const east = targetCoord(DIR_E, 1, 50, 50);
  const placedEast = { ...tile(10, 0), coord: east };
  const base = { areas: [tile(10, 50), placedEast], partyArea: 0, prev: 0, phase: "explore" as const };

  it("offers every doorway while the large pack still has a card", () => {
    expect(moves(makeState({ ...base, largePack: [31, 31], largeIdx: 1 })).sort()).toEqual([DIR_E, DIR_W].sort());
  });

  it("offers only the doorways onto tiles already placed once the pack is used up", () => {
    expect(moves(makeState({ ...base, largePack: [31, 31], largeIdx: 2 }))).toEqual([DIR_E]);
  });
});

import { describe, it, expect } from "vitest";
import { enterChamber } from "./chamber";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

function chamberAt(level: number) {
  // card 31 = NSEWC (a chamber). Put the party on it.
  return makeState({
    level,
    areas: [{ card: 31, coord: packCoord(level, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
  });
}

describe("enterChamber (spec §7.1)", () => {
  it("draws min(level,4) cards on first visit and classifies them", () => {
    const s = chamberAt(1);
    s.smallPack = [110, 201, 301];
    s.smallIdx = 0;
    const events = enterChamber(s);
    expect(s.smallIdx).toBe(1);
    expect(s.strangers).toEqual([10]); // 110 - 100
    expect(s.treasures).toEqual([]);
    expect(s.hazards).toEqual([]);
    expect(s.areas[0]!.visited).toBe(true);
    expect(events).toContainEqual({ type: "drewChamber", strangers: [10], treasures: [], hazards: [] });
  });

  it("draws more cards on deeper levels and classifies each kind", () => {
    const s = chamberAt(3); // draw 3
    s.smallPack = [110, 201, 301, 202];
    s.smallIdx = 0;
    enterChamber(s);
    expect(s.smallIdx).toBe(3);
    expect(s.strangers).toEqual([10]); // Dragon
    expect(s.treasures).toEqual([1]); // Gold (201-200)
    expect(s.hazards).toEqual([1]); // Trap (301-300)
  });

  it("stops early when the small pack is exhausted", () => {
    const s = chamberAt(4); // would draw 4
    s.smallPack = [200];
    s.smallIdx = 0;
    enterChamber(s);
    expect(s.smallIdx).toBe(1);
    expect(s.treasures).toEqual([0]); // Silver (200-200=0)
  });

  it("does not redraw on a revisit; reloads persisted contents", () => {
    const s = chamberAt(2);
    s.areas[0]!.visited = true;
    s.areas[0]!.contents = [110, 201];
    s.smallPack = [301, 301];
    s.smallIdx = 0;
    enterChamber(s);
    expect(s.smallIdx).toBe(0);
    expect(s.strangers).toEqual([10]);
    expect(s.treasures).toEqual([1]);
  });
});

import { describe, it, expect } from "vitest";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { DIR_N, DIR_S, DIR_DOWN, packCoord } from "./coords";
import { makeState } from "./testkit";

// Gateway (175) has N,E,S,W exits and a stair-up. It starts at packCoord(1,50,50)=15050.

describe("tryMove (spec §6)", () => {
  it("returns false (no move, no dead-end) when the current card lacks that exit", () => {
    // Card value 3 = NE only. There is no South exit.
    const s = makeState({ areas: [{ card: 3, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }] });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(false);
  });

  it("draws and places a matching card face-up, then moves onto it", () => {
    // Move South from the Gateway; the drawn card (31 = NSEWC) has a North exit -> connects.
    const s = makeState({ largePack: [31], largeIdx: 0 });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    expect(r.state.areas).toHaveLength(2);
    expect(r.state.areas[1]).toMatchObject({ card: 31, coord: packCoord(1, 50, 51), faceUp: true });
    expect(r.state.partyArea).toBe(1);
    expect(r.state.largeIdx).toBe(1);
    expect(r.state.prev).toBe(0); // came from the Gateway
  });

  it("places a non-matching card face-down, prunes the exit, and reports a dead-end", () => {
    // Drawn card 12 = SW (no North exit) -> dead-end when moving South.
    const s = makeState({ largePack: [12], largeIdx: 0 });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(true);
    expect(r.state.areas[1]).toMatchObject({ card: 12, faceUp: false });
    // The Gateway's South exit bit (4) is now pruned.
    expect(decodeArea(r.state.areas[0]!.card).s).toBe(false);
    expect(r.state.partyArea).toBe(0); // party did not move
  });

  it("moves into an already-placed adjacent area without drawing", () => {
    // Two areas: Gateway at 15050, and a NSEWC chamber at 15051 (north exit matches).
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 51), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [],
    });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(true);
    expect(r.state.partyArea).toBe(1);
    expect(r.state.largeIdx).toBe(0); // nothing drawn
  });

  it("descending creates the area below at the same x,y with a mirrored stair-up", () => {
    // Current card 71 = NESD (has a stair-down). Drawn card 7 = NES (no stairs).
    const s = makeState({
      areas: [{ card: 71, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [7],
      largeIdx: 0,
    });
    const r = tryMove(s, DIR_DOWN);
    expect(r.moved).toBe(true);
    expect(r.state.level).toBe(2);
    expect(r.state.areas[1]!.coord).toBe(packCoord(2, 50, 50));
    expect(decodeArea(r.state.areas[1]!.card).stairUp).toBe(true); // mirrored so you can climb back
  });

  it("suppresses a stair-up on a freshly drawn level-1 card", () => {
    // Card 39 = NESU: it has a South door (so it connects when we move North) AND a
    // stair-up (which must be suppressed because the destination is on level 1).
    const s = makeState({ largePack: [39], largeIdx: 0 });
    const r = tryMove(s, DIR_N); // target is level 1
    expect(r.moved).toBe(true);
    expect(decodeArea(r.state.areas[1]!.card).stairUp).toBe(false);
  });

  it("returns false when the large pack is exhausted", () => {
    const s = makeState({ largePack: [31], largeIdx: 1 }); // already past the end
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(false);
  });
});

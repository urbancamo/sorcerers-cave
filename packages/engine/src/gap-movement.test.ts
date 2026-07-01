import { describe, it, expect } from "vitest";
import { tryMove } from "./map";
import { reduce } from "./reduce";
import { decodeArea } from "./decode";
import { makeState } from "./testkit";
import { packCoord, DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN } from "./coords";
import { GS_ESCAPED } from "./state";

// Card-value bitfield (spec §3.1): N=1 E=2 S=4 W=8 chamber=16 stairUp=32 stairDown=64.
// Gateway (175) = N|E|S|W|stairUp + the Gateway special flag; it starts at packCoord(1,50,50).

describe("map/reduce gap behaviour (spec §6)", () => {
  // SC-6.1-4 — an EXISTING lateral neighbour that does not show the matching reverse doorway is a
  // dead end: the party cannot enter, and the current card's exit bit toward it is pruned so it is
  // never offered again. (Mirrors the earthquake-rubble fixture shape in map.test.ts:59-72.)
  it("SC-6.1-4: an existing lateral neighbour without a reverse door is a dead end and prunes the exit", () => {
    // Gateway (175) has an East exit. The east neighbour is card 1 = North only — no West door back.
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 1, coord: packCoord(1, 51, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [],
    });
    // Sanity: the neighbour genuinely lacks the reverse (West) door.
    expect(decodeArea(1).w).toBe(false);

    const r = tryMove(s, DIR_E);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(true);
    // The party did not move, and nothing was drawn (an existing neighbour, not a fresh tile).
    expect(r.state.partyArea).toBe(0);
    expect(r.state.largeIdx).toBe(0);
    // The Gateway's East exit bit (2) is now pruned so it is no longer offered.
    expect(decodeArea(r.state.areas[0]!.card).e).toBe(false);
  });

  // SC-6.2-1 — exitCave via reduce. On level 1 standing on a card that shows a stair up, in the
  // explore phase, leaving the cave wins the game (gs → GS_ESCAPED, gameOver phase, gameOver event).
  it("SC-6.2-1: exitCave escapes on a level-1 stair-up card in explore, and is blocked otherwise", () => {
    // The Gateway (175) shows a stair up; confirm by decoding.
    expect(decodeArea(175).stairUp).toBe(true);

    const s = makeState(); // Gateway at level 1, phase "explore"
    const { state, events } = reduce(s, { type: "exitCave" });
    expect(state.gs).toBe(GS_ESCAPED);
    expect(state.phase).toBe("gameOver");
    expect(events).toContainEqual({ type: "gameOver", gs: GS_ESCAPED });

    // Blocked: the current card has no stair up (15 = N|E|S|W, no stair bit).
    expect(decodeArea(15).stairUp).toBe(false);
    const noStair = makeState({
      areas: [{ card: 15, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
    });
    const rNoStair = reduce(noStair, { type: "exitCave" });
    expect(rNoStair.state.gs).toBe(0); // unchanged (still GS_PLAYING)
    expect(rNoStair.events).toEqual([{ type: "blocked" }]);

    // Blocked: on a deeper level even a stair-up card cannot exit the cave.
    const deeper = makeState({
      level: 2,
      areas: [{ card: 175, coord: packCoord(2, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
    });
    const rDeeper = reduce(deeper, { type: "exitCave" });
    expect(rDeeper.state.gs).toBe(0);
    expect(rDeeper.events).toEqual([{ type: "blocked" }]);

    // Blocked: wrong phase — exitCave is only valid while exploring.
    const notExploring = makeState({ phase: "encounter" });
    const rPhase = reduce(notExploring, { type: "exitCave" });
    expect(rPhase.state.gs).toBe(0);
    expect(rPhase.events).toEqual([{ type: "blocked" }]);
  });

  // SC-6.2-2 — once the party has escaped (gs !== GS_PLAYING) the reducer is inert: any further
  // action leaves the state exactly as-is and produces no events.
  it("SC-6.2-2: after escaping, a further reduce action is inert (state unchanged, empty events)", () => {
    const escaped = reduce(makeState(), { type: "exitCave" }).state;
    expect(escaped.gs).toBe(GS_ESCAPED);

    const after = reduce(escaped, { type: "move", dir: DIR_S });
    expect(after.events).toEqual([]);
    expect(after.state).toBe(escaped); // same reference — nothing was cloned or mutated
  });

  // SC-6.3-1 — no forced-redraw soft-lock (deliberately-unimplemented §6.3). A tile with no exits in
  // any direction and an empty draw pack simply refuses every move: no direction connects, nothing is
  // drawn, largeIdx never advances, and no reshuffle occurs. Characterises the absence of the feature.
  it("SC-6.3-1: a fully sealed tile with an empty pack refuses every move without drawing or reshuffling", () => {
    // Card 0 has no N/E/S/W doors and no stairs — the party is boxed in.
    const sealed = decodeArea(0);
    expect(sealed.n || sealed.e || sealed.s || sealed.w || sealed.stairUp || sealed.stairDown).toBe(false);

    const s = makeState({
      areas: [{ card: 0, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [],
      largeIdx: 0,
    });

    for (const dir of [DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN]) {
      const r = tryMove(s, dir);
      expect(r.moved).toBe(false);
      // No tile was ever drawn: the pack index never advances (no forced redraw / reshuffle).
      expect(r.state.largeIdx).toBe(0);
      expect(r.state.largePack).toHaveLength(0);
      // Party stays put on the sealed tile — no new area was appended.
      expect(r.state.partyArea).toBe(0);
      expect(r.state.areas).toHaveLength(1);
    }
  });
});

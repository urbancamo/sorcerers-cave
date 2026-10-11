import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_TRAP } from "./data/hazards";
import { SPECIAL_CHASM } from "./data/areaCards";
import type { GameState, PartyMember, PlacedArea } from "./state";

/**
 * Surprise after a deliberate trap fall (`variants.trapRules`, spec 2026-10-11-dwarf-deliberate-trap-fall,
 * Task 3). A fall is DELIBERATE when the Dwarf's player chose `fallThroughTrap`, or when the party walked into
 * a chamber it knew held a trap (the trap was reloaded, not drawn on this entry). A deliberate arrival counts
 * as a new route even into a visited chamber, and into a chamber the party once retreated from the party —
 * not the strangers — gains the +1. A fall from a trap drawn on that entry stays accidental: no surprise.
 */

const MAN = 5;
const DWARF = 7;
const STRANGER = 110; // parked stranger code (100 + creature 10)
const TRAP = 300 + HAZARD_TRAP;
const ON = { trapRules: true };
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

const BELOW = packCoord(2, 51, 50);

/** A (exit E) → B (W-door chamber, `contents`) with a chamber below B holding a stranger. */
function scene(opts: { contents: number[]; party: PartyMember[]; belowVisited?: boolean; level?: number } & Partial<GameState>): GameState {
  const { contents, party, belowVisited = false, level = 1, ...over } = opts;
  const A = area(2, packCoord(level, 50, 50));
  const B = area(8 | 16, packCoord(level, 51, 50), { contents, visited: contents.length > 0 });
  const L = area(8 | 16, packCoord(level + 1, 51, 50), { contents: [STRANGER], visited: belowVisited });
  return makeState({ variants: ON, party, areas: [A, B, L], partyArea: 0, prev: 0, prev2: 0, level, ...over });
}
const enter = (s: GameState) => reduce(s, { type: "move", dir: 2 });

describe("deliberate fall — Dwarf's choice", () => {
  it("falling on purpose into an unvisited chamber below earns surprise, and an attack gets +1", () => {
    const paused = enter(scene({ contents: [TRAP], party: [member(DWARF)] })).state;
    const { state } = reduce(paused, { type: "fallThroughTrap" });
    expect(state.deliberateFall).toBe(true);
    expect(state.fellThroughTrap).toBe(true);
    expect(state.phase).toBe("encounter");
    expect(state.surpriseReady).toBe(true);
    expect(reduce(state, { type: "attack" }).state.fight?.surprise).toBe(1);
  });

  it("falling on purpose into a chamber already visited still counts as a new route", () => {
    const paused = enter(scene({ contents: [TRAP], party: [member(DWARF)], belowVisited: true })).state;
    const { state } = reduce(paused, { type: "fallThroughTrap" });
    expect(state.surpriseReady).toBe(true);
  });

  it("being guided past the trap sets no deliberateFall", () => {
    const paused = enter(scene({ contents: [TRAP], party: [member(DWARF)] })).state;
    expect(reduce(paused, { type: "avoidTrap" }).state.deliberateFall).toBeUndefined();
  });

  it("a retreated-from chamber below: the party, not the strangers, gets the +1 and the fight starts at once", () => {
    const s = scene({ contents: [TRAP], party: [member(DWARF)], belowVisited: true, hostileAreas: [2] });
    const paused = enter(s).state;
    const { state } = reduce(paused, { type: "fallThroughTrap" });
    expect(state.phase).toBe("fight");
    expect(state.fight?.surprise).toBe(1);
  });
});

describe("deliberate fall — knowing re-entry", () => {
  it("a party with no Dwarf walking back into a trap chamber falls with surprise below", () => {
    const { state } = enter(scene({ contents: [TRAP], party: [member(MAN)] }));
    expect(state.level).toBe(2);
    expect(state.deliberateFall).toBe(true);
    expect(state.surpriseReady).toBe(true);
  });

  it("the same into a visited chamber, with a retreat history, gives the party surprise", () => {
    const { state } = enter(scene({ contents: [TRAP], party: [member(MAN)], belowVisited: true, hostileAreas: [2] }));
    expect(state.phase).toBe("fight");
    expect(state.fight?.surprise).toBe(1);
  });

  it("two standing traps, entered knowingly, are still a deliberate fall", () => {
    const { state } = enter(scene({ contents: [TRAP, TRAP], party: [member(DWARF)] }));
    expect(state.deliberateFall).toBe(true);
    expect(state.surpriseReady).toBe(true);
  });
});

describe("accidental falls gain nothing", () => {
  it("a trap drawn on this entry: the fall gains no surprise", () => {
    const { state } = enter(scene({ contents: [], party: [member(MAN)], smallPack: [TRAP], smallIdx: 0 }));
    expect(state.level).toBe(2);
    expect(state.deliberateFall).toBeUndefined();
    expect(state.surpriseReady).toBe(false);
  });

  it("two traps drawn on this entry (a Dwarf cannot avoid them): no surprise", () => {
    // Level 2 draws two cards, so both traps arrive fresh.
    const { state } = enter(scene({ contents: [], party: [member(DWARF)], level: 2, smallPack: [TRAP, TRAP], smallIdx: 0 }));
    expect(state.level).toBe(3);
    expect(state.deliberateFall).toBeUndefined();
    expect(state.surpriseReady).toBe(false);
  });

  it("an accidental fall into a retreated-from chamber still hands the strangers the surprise", () => {
    const { state } = enter(scene({ contents: [], party: [member(MAN)], smallPack: [TRAP], smallIdx: 0, belowVisited: true, hostileAreas: [2] }));
    expect(state.fight?.surprise).toBe(-1);
  });

  it("flag off: a fall never sets deliberateFall", () => {
    const { state } = enter(scene({ contents: [TRAP], party: [member(MAN)], variants: undefined }));
    expect(state.level).toBe(2);
    expect("deliberateFall" in state).toBe(false);
    expect(state.surpriseReady).toBe(false);
  });
});

describe("deliberateFall lifetime", () => {
  it("is deleted on the next normal move", () => {
    const L = area(2, packCoord(2, 50, 50));
    const s = makeState({ variants: ON, areas: [L, area(8 | 16, packCoord(2, 51, 50))], partyArea: 0, level: 2, fellThroughTrap: true, deliberateFall: true });
    const { state } = reduce(s, { type: "move", dir: 2 });
    expect(state.deliberateFall).toBeUndefined();
    expect(state.fellThroughTrap).toBe(false);
  });

  it("another relocation (a Chasm descent) clears it, so that landing earns nothing", () => {
    const CHASM = (SPECIAL_CHASM << 7) | 31;
    const s = makeState({
      variants: ON,
      areas: [area(CHASM, packCoord(1, 50, 50)), area(8 | 16, packCoord(2, 50, 50), { contents: [STRANGER], visited: false })],
      partyArea: 0, level: 1, deliberateFall: true,
    });
    const { state } = reduce(s, { type: "descendChasm" });
    expect(state.level).toBe(2);
    expect(state.deliberateFall).toBeUndefined();
    expect(state.surpriseReady).toBe(false);
  });
});

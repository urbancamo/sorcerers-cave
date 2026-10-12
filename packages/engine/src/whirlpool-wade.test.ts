import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { packCoord, unpackCoord, DIR_N, DIR_E, DIR_S, DIR_W } from "./coords";
import { getSubLocation } from "./subLocation";
import { SPECIAL_WHIRLPOOL } from "./data/areaCards";
import { GS_PLAYING, type GameState, type PlacedArea } from "./state";

/**
 * Whirlpool wading (bug fix 2026-10-12, docs/bug-reports/2026-10-12-whirlpool-no-way-forward-bug.md):
 * a dead-end attempt from a ledge still wades the party to THAT doorway's ledge (one segment per
 * move), so W>S then S>E are two separate moves and the Dead End rule never calls it stuck.
 */

const WHIRLPOOL_CARD = (SPECIAL_WHIRLPOOL << 7) | 31;
const E_ONLY = 2;  // no north doorway: a dead end for a southward move
const EW_TUNNEL = 10;
const PLAIN_CHAMBER = 31;

const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });
const member = { creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [] };

function seedForRoll(want: (v: number) => boolean): number {
  for (let seed = 1; seed < 100000; seed++) if (want(rollDie(seed).value)) return seed;
  throw new Error("no matching seed found");
}

/** Party on the Whirlpool (50,50), entered from the west; north already proved dead; east is a
 *  passable tunnel; south is unexplored and will draw `E_ONLY` (a dead end). */
function state(over: Partial<GameState> = {}): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      area(WHIRLPOOL_CARD, packCoord(1, 50, 50), { deadDoors: 1 }),
      area(E_ONLY, packCoord(1, 49, 50)),
      area(EW_TUNNEL, packCoord(1, 51, 50)),
    ],
    partyArea: 0,
    prev: 1,
    party: [member],
    largePack: [E_ONLY, PLAIN_CHAMBER, PLAIN_CHAMBER],
    largeIdx: 0,
    ...over,
  });
}

describe("Whirlpool wading onto a dead-end ledge", () => {
  it("3-6: the party wades to the south ledge and stays on the Whirlpool", () => {
    const { state: s, events } = reduce(state({ seed: seedForRoll((v) => v >= 3) }), { type: "move", dir: DIR_S });
    expect(events.find((e) => e.type === "whirlpoolRoll")).toMatchObject({ dragged: false });
    expect(events.some((e) => e.type === "deadEnd")).toBe(true);
    expect(s.partyArea).toBe(0);
    expect(getSubLocation(s)).toEqual({ at: "doorway", dir: DIR_S });
    expect(s.turn).toBe(state().turn + 1);
  });

  it("1-2: dragged down a level; the attempt is undone (tile returned, doorway reopened)", () => {
    const { state: s, events } = reduce(state({ seed: seedForRoll((v) => v <= 2) }), { type: "move", dir: DIR_S });
    expect(events.find((e) => e.type === "whirlpoolRoll")).toMatchObject({ dragged: true });
    expect(s.level).toBe(2);
    expect(s.areas[0]!.deadDoors).toBe(1); // only the original north closure
    expect(s.areas.some((a) => unpackCoord(a.coord).level === 1 && unpackCoord(a.coord).y === 51)).toBe(false);
  });

  it("from the south ledge W and E are open (north is opposite), each a fresh crossing", () => {
    const wade = reduce(state({ seed: seedForRoll((v) => v >= 3) }), { type: "move", dir: DIR_S }).state;
    const dirs = legalActions(wade).filter((a) => a.type === "move").map((a: any) => a.dir).sort();
    expect(dirs).toEqual([DIR_E, DIR_W]);
    const { events } = reduce(wade, { type: "move", dir: DIR_E });
    expect(events.some((e) => e.type === "whirlpoolRoll")).toBe(true);
  });

  it("the Dead End rule does not call it stuck: no swap, no warning, the dead end stays", () => {
    const s = state({ seed: seedForRoll((v) => v >= 3), variants: { forcedRedraw: true } });
    const { state: after, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(events.some((e) => e.type === "deadEndCardSwapped")).toBe(false);
    expect(events.some((e) => e.type === "deadEndNoViableExits")).toBe(false);
    expect(getSubLocation(after)).toEqual({ at: "doorway", dir: DIR_S });
  });
});

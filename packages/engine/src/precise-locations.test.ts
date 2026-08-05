import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { getSubLocation, oppositeDir } from "./subLocation";
import { makeState } from "./testkit";
import { packCoord, DIR_N, DIR_E, DIR_S, DIR_W } from "./coords";
import { rollDie } from "./rng";
import { GS_DEAD, type GameState, type PlacedArea } from "./state";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL, SPECIAL_CHASM } from "./data/areaCards";

/**
 * Precise Locations (§10.5): the sub-location model (doorway/centre/island), Viper-Pit/Whirlpool
 * adjacency-gated crossing (§8.1), the jumpToIsland house rule (§8.2), and precise dropped treasure
 * for all four special areas (§8.3) — designer sign-off 2026-07-30
 * (docs/requirements/precise-locations/2026-07-29-precise-locations-plan.html,
 * 2026-07-30-precise-locations-plan-answers.md).
 */

const DEEP_POOL_CARD = (SPECIAL_DEEP_POOL << 7) | 31; // NESW + chamber
const VIPER_PIT_CARD = (SPECIAL_VIPER_PIT << 7) | 31;
const WHIRLPOOL_CARD = (SPECIAL_WHIRLPOOL << 7) | 31;
const CHASM_CARD = (SPECIAL_CHASM << 7) | 31;
const PLAIN_CHAMBER = 31; // NESW + chamber, no special

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });
const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

/** Sweep seeds until `rollDie` produces a value satisfying `want` (mirrors kit-descents.test.ts). */
function seedForRoll(want: (v: number) => boolean, start = 1): number {
  for (let seed = start; seed < 100000; seed++) if (want(rollDie(seed).value)) return seed;
  throw new Error("no matching seed found");
}

/** A party standing on `card` at (50,50), having entered from a neighbour due WEST (49,50) — so
 *  the party's sub-location is the WEST doorway. */
function westEntryState(card: number, over: Partial<GameState> = {}): GameState {
  return makeState({
    areas: [area(card, packCoord(1, 50, 50)), area(2 /* E-only */, packCoord(1, 49, 50))],
    partyArea: 0,
    prev: 1,
    ...over,
  });
}

/** A party about to move SOUTH from a plain northern tile (idx 0) into `card` (idx 1) at (50,50),
 *  which may already carry `sunkTreasure` from an earlier visit — for reclaim-on-(re)entry tests. */
function reenterState(card: number, sunkTreasure: NonNullable<PlacedArea["sunkTreasure"]>, party: object[], over: Partial<GameState> = {}): GameState {
  return makeState({
    areas: [
      area(175, packCoord(1, 50, 49)), // north neighbour (the Gateway card — connects every way)
      area(card, packCoord(1, 50, 50), { sunkTreasure }),
    ],
    partyArea: 0,
    prev: 0,
    party: party as any,
    ...over,
  });
}

describe("getSubLocation (§10.5)", () => {
  it("an ordinary chamber: doorway (with direction) while an encounter is unresolved", () => {
    const s = westEntryState(PLAIN_CHAMBER, { phase: "encounter" });
    expect(getSubLocation(s)).toEqual({ at: "doorway", dir: DIR_W });
  });

  it("an ordinary chamber: centre once settled (not mid-encounter)", () => {
    const s = westEntryState(PLAIN_CHAMBER, { phase: "explore" });
    expect(getSubLocation(s)).toEqual({ at: "centre" });
  });

  it.each([
    [DIR_N, { x: 50, y: 49 }],
    [DIR_E, { x: 51, y: 50 }],
    [DIR_S, { x: 50, y: 51 }],
    [DIR_W, { x: 49, y: 50 }],
  ])("derives doorway direction %i from the neighbour it arrived from", (dir, prevXY) => {
    const s = makeState({
      areas: [area(DEEP_POOL_CARD, packCoord(1, 50, 50)), area(PLAIN_CHAMBER, packCoord(1, prevXY.x, prevXY.y))],
      partyArea: 0,
      prev: 1,
    });
    expect(getSubLocation(s)).toEqual({ at: "doorway", dir });
  });

  it("a special area: island when the arrival was vertical (a secret stair — level differs, same x,y)", () => {
    const s = makeState({
      areas: [area(VIPER_PIT_CARD, packCoord(2, 50, 50)), area(PLAIN_CHAMBER, packCoord(1, 50, 50))],
      partyArea: 0,
      prev: 1,
      level: 2,
    });
    expect(getSubLocation(s)).toEqual({ at: "island" });
  });

  it("a special area: island whenever fellThroughTrap is set, even with a lateral-looking prev", () => {
    const s = westEntryState(DEEP_POOL_CARD, { fellThroughTrap: true });
    expect(getSubLocation(s)).toEqual({ at: "island" });
  });

  it("a special area is never 'centre' — always doorway or island, even at rest", () => {
    expect(getSubLocation(westEntryState(CHASM_CARD, { phase: "explore" })).at).not.toBe("centre");
    expect(getSubLocation(westEntryState(WHIRLPOOL_CARD, { phase: "encounter" })).at).not.toBe("centre");
  });

  it("the jumpToIsland override wins over geometry while it matches the current area", () => {
    const s = westEntryState(VIPER_PIT_CARD, { subLocation: { area: 0, at: "island" } });
    expect(getSubLocation(s)).toEqual({ at: "island" });
  });

  it("a stale override left over from a different area is ignored", () => {
    const s = westEntryState(VIPER_PIT_CARD, { subLocation: { area: 5, at: "island" } });
    expect(getSubLocation(s)).toEqual({ at: "doorway", dir: DIR_W });
  });
});

describe("oppositeDir (§8.1)", () => {
  it("maps N<->S and E<->W", () => {
    expect(oppositeDir(DIR_N)).toBe(DIR_S);
    expect(oppositeDir(DIR_S)).toBe(DIR_N);
    expect(oppositeDir(DIR_E)).toBe(DIR_W);
    expect(oppositeDir(DIR_W)).toBe(DIR_E);
  });
});

describe("adjacency-gated crossing (§10.5, §8.1)", () => {
  it("Viper Pit: from a West doorway, only the two adjacent doorways (N/S) and retrace (W) are legal moves — never the opposite (E)", () => {
    const s = westEntryState(VIPER_PIT_CARD, { party: [member(5)] });
    const dirs = legalActions(s).filter((a) => a.type === "move").map((a) => (a as { dir: number }).dir);
    expect(dirs).toEqual(expect.arrayContaining([DIR_N, DIR_S, DIR_W]));
    expect(dirs).not.toContain(DIR_E);
  });

  it("Whirlpool: the same adjacent-only restriction applies", () => {
    const s = westEntryState(WHIRLPOOL_CARD, { party: [member(5)] });
    const dirs = legalActions(s).filter((a) => a.type === "move").map((a) => (a as { dir: number }).dir);
    expect(dirs).not.toContain(DIR_E);
  });

  it("Deep Pool: no adjacency limit — every doorway, including the 'opposite' one, stays legal", () => {
    const s = westEntryState(DEEP_POOL_CARD, { party: [member(5)] });
    const dirs = legalActions(s).filter((a) => a.type === "move").map((a) => (a as { dir: number }).dir);
    expect(dirs).toEqual(expect.arrayContaining([DIR_N, DIR_E, DIR_S, DIR_W]));
  });

  it("the reducer itself blocks a directly-dispatched opposite-direction move (defense in depth, not just hidden from the UI)", () => {
    const s = westEntryState(VIPER_PIT_CARD, { party: [member(5)] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(events).toEqual([{ type: "blocked" }]);
    expect(state.partyArea).toBe(0); // never moved
  });

  it("retracing the entry doorway is unaffected by the adjacency gate", () => {
    const s = westEntryState(VIPER_PIT_CARD, { party: [member(5)] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_W });
    expect(events).not.toEqual([{ type: "blocked" }]);
    expect(state.partyArea).toBe(1);
  });

  it("a crossing sourced from the island is unrestricted, including the direction that would be 'opposite' from a doorway", () => {
    const s = makeState({
      areas: [area(VIPER_PIT_CARD, packCoord(2, 50, 50)), area(PLAIN_CHAMBER, packCoord(1, 50, 50))],
      partyArea: 0,
      prev: 1,
      level: 2,
      party: [member(5)],
      largePack: [PLAIN_CHAMBER],
    });
    expect(getSubLocation(s)).toEqual({ at: "island" });
    const { events } = reduce(s, { type: "move", dir: DIR_E });
    expect(events).not.toEqual([{ type: "blocked" }]);
  });
});

describe("jumpToIsland (§10.5, §8.2)", () => {
  it("is offered only for Viper Pit / Deep Pool, from a doorway, in explore phase", () => {
    expect(legalActions(westEntryState(VIPER_PIT_CARD, { party: [member(5)] }))).toContainEqual({ type: "jumpToIsland" });
    expect(legalActions(westEntryState(DEEP_POOL_CARD, { party: [member(5)] }))).toContainEqual({ type: "jumpToIsland" });
    expect(legalActions(westEntryState(WHIRLPOOL_CARD, { party: [member(5)] }))).not.toContainEqual({ type: "jumpToIsland" });
    expect(legalActions(westEntryState(CHASM_CARD, { party: [member(5)] }))).not.toContainEqual({ type: "jumpToIsland" });
  });

  it("is not offered once already on the island", () => {
    const s = westEntryState(VIPER_PIT_CARD, { party: [member(5)], subLocation: { area: 0, at: "island" } });
    expect(legalActions(s)).not.toContainEqual({ type: "jumpToIsland" });
  });

  it("Viper Pit: reuses the ordinary crossing's per-creature fatal d6, and sets the island sub-location without leaving the tile", () => {
    const seed = seedForRoll((v) => v >= 3); // a safe roll — survives
    const s = westEntryState(VIPER_PIT_CARD, { party: [member(5)], seed });
    const { state, events } = reduce(s, { type: "jumpToIsland" });

    expect(events).toContainEqual({ type: "islandJump", special: SPECIAL_VIPER_PIT });
    expect(events.some((e) => e.type === "viperPit")).toBe(true);
    expect(state.partyArea).toBe(0); // never left the tile
    expect(state.prev).toBe(1);
    expect(getSubLocation(state)).toEqual({ at: "island" });
  });

  it("Viper Pit: a fatal roll can wipe the party on the jump itself, exactly like an ordinary crossing", () => {
    const seed = seedForRoll((v) => v <= 2);
    const s = westEntryState(VIPER_PIT_CARD, { party: [member(5)], seed });
    const { state, events } = reduce(s, { type: "jumpToIsland" });
    expect(events).toContainEqual({ type: "gameOver", gs: GS_DEAD });
    expect(state.gs).toBe(GS_DEAD);
  });

  it("Deep Pool: auto-drops non-Giant-carried heavy treasure exactly like an ordinary crossing, no roll", () => {
    const s = westEntryState(DEEP_POOL_CARD, { party: [member(5, [1])], seed: 1 }); // Man carrying Gold
    const seedBefore = s.seed;
    const { state, events } = reduce(s, { type: "jumpToIsland" });
    expect(state.seed).toBe(seedBefore); // no dice
    expect(state.party[0]!.treasure).toEqual([]);
    expect(state.areas[0]!.dropped).toEqual([1]);
    expect(events).toContainEqual({ type: "islandJump", special: SPECIAL_DEEP_POOL });
    expect(events).toContainEqual({ type: "treasureDropped", count: 1 });
    expect(getSubLocation(state)).toEqual({ at: "island" });
  });

  it("Deep Pool: a Giant carries everything across — nothing is left behind", () => {
    const s = westEntryState(DEEP_POOL_CARD, { party: [member(12, [0, 1])] });
    const { state } = reduce(s, { type: "jumpToIsland" });
    expect(state.party[0]!.treasure).toEqual([0, 1]);
    expect(state.areas[0]!.dropped ?? []).toEqual([]);
  });

  it("is blocked outside explore phase, off the eligible specials, and once already on the island", () => {
    expect(reduce(westEntryState(WHIRLPOOL_CARD, { party: [member(5)] }), { type: "jumpToIsland" }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(westEntryState(VIPER_PIT_CARD, { party: [member(5)], phase: "encounter" }), { type: "jumpToIsland" }).events).toEqual([{ type: "blocked" }]);
    expect(
      reduce(westEntryState(VIPER_PIT_CARD, { party: [member(5)], subLocation: { area: 0, at: "island" } }), { type: "jumpToIsland" }).events,
    ).toEqual([{ type: "blocked" }]);
  });
});

describe("precise dropped treasure — sinking a deliberate drop (§10.5, §8.3)", () => {
  it("an ordinary (non-special) chamber is unaffected — a drop never sinks, and opens pickup at rest (bug fix 2026-08-05)", () => {
    const s = makeState({ party: [member(5, [1])] }); // the Gateway — no special
    const { state } = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(state.phase).toBe("pickup"); // at rest, no guards — offered straight back, not parked
    expect(state.treasures).toContain(1);
    expect(state.areas[0]!.contents).not.toContain(200 + 1);
    expect(state.areas[0]!.sunkTreasure ?? []).toEqual([]);
  });

  it.each([
    ["Deep Pool", DEEP_POOL_CARD],
    ["Viper Pit", VIPER_PIT_CARD],
    ["Whirlpool", WHIRLPOOL_CARD],
    ["Chasm", CHASM_CARD],
  ])("%s: a deliberate drop from a doorway sinks into that doorway's bucket, not ordinary contents", (_name, card) => {
    const s = westEntryState(card, { party: [member(5, [1])] });
    const { state } = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(state.areas[0]!.contents).toEqual([]);
    expect(state.areas[0]!.sunkTreasure).toEqual([{ at: DIR_W, items: [1] }]);
  });

  it("a drop from the island sinks into the island's own bucket", () => {
    const s = westEntryState(DEEP_POOL_CARD, { party: [member(5, [1])], subLocation: { area: 0, at: "island" } });
    const { state } = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(state.areas[0]!.sunkTreasure).toEqual([{ at: "island", items: [1] }]);
  });

  it("a drop during an active pickup still lands on the live floor, even on a special tile", () => {
    const s = westEntryState(DEEP_POOL_CARD, { party: [member(5, [1])], phase: "pickup" });
    const { state } = reduce(s, { type: "dropTreasure", mi: 0, idx: 0 });
    expect(state.treasures).toEqual([1]);
    expect(state.areas[0]!.sunkTreasure ?? []).toEqual([]);
  });
});

describe("precise dropped treasure — reclaim on (re)entry (§10.5, §8.3)", () => {
  it("Deep Pool: a capable Giant reclaims the doorway it re-enters through, leaving other doorways' stashes untouched", () => {
    const s = reenterState(
      DEEP_POOL_CARD,
      [{ at: DIR_N, items: [1] }, { at: DIR_E, items: [2] }],
      [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], // a Giant
    );
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]);
    expect(events).toContainEqual({ type: "treasureReclaimed", count: 1 });
    expect(state.areas[1]!.sunkTreasure).toEqual([{ at: DIR_E, items: [2] }]); // the other doorway waits
  });

  it("Deep Pool: without a Giant, the sunk treasure stays exactly where it was left", () => {
    const s = reenterState(DEEP_POOL_CARD, [{ at: DIR_N, items: [1] }], [
      { creatureId: 5, status: 0, dragonKills: 0, treasure: [] }, // a Man — no Giant
    ]);
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("explore");
    expect(state.treasures).toEqual([]);
    expect(state.areas[1]!.sunkTreasure).toEqual([{ at: DIR_N, items: [1] }]);
    expect(events).toContainEqual({ type: "enteredSpecial", special: SPECIAL_DEEP_POOL });
  });

  it("Viper Pit: a Charmed-Flute-eligible carrier reclaims it; without the Flute it stays sunk", () => {
    const withFlute = reenterState(VIPER_PIT_CARD, [{ at: DIR_N, items: [12] }], [
      { creatureId: 0, status: 0, dragonKills: 0, treasure: [12] }, // a Hero carrying the Charmed Flute
    ]);
    const { state: reclaimed, events } = reduce(withFlute, { type: "move", dir: DIR_S });
    expect(reclaimed.phase).toBe("pickup");
    expect(reclaimed.treasures).toEqual([12]);
    expect(events).toContainEqual({ type: "treasureReclaimed", count: 1 });

    const withoutFlute = reenterState(VIPER_PIT_CARD, [{ at: DIR_N, items: [12] }], [
      { creatureId: 0, status: 0, dragonKills: 0, treasure: [] },
    ]);
    const { state: stillSunk } = reduce(withoutFlute, { type: "move", dir: DIR_S });
    expect(stillSunk.phase).toBe("explore");
    expect(stillSunk.areas[1]!.sunkTreasure).toEqual([{ at: DIR_N, items: [12] }]);
  });

  it("Whirlpool: sunk treasure has no creature gate — it folds straight into the ordinary chamber draw on re-entry", () => {
    const s = reenterState(WHIRLPOOL_CARD, [{ at: DIR_N, items: [1] }], [
      { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
    ], { smallPack: [] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.treasures).toEqual([1]);
    expect(state.areas[1]!.sunkTreasure ?? []).toEqual([]);
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [1], hazards: [] });
  });

  it("Chasm: the same ungated fold-in as Whirlpool", () => {
    const s = reenterState(CHASM_CARD, [{ at: DIR_N, items: [1] }], [
      { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
    ], { smallPack: [] });
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.treasures).toEqual([1]);
    expect(state.areas[1]!.sunkTreasure ?? []).toEqual([]);
  });
});

describe("stationary reclaim — Deep Pool/Viper Pit (bug fix 2026-08-02)", () => {
  // Before this fix, reclaim only ran on (re-)entry (resolveAreaLoop) — a party already PARKED on
  // the tile (having just dropped treasure there themselves, or simply resting there with an
  // earlier visit's sunk treasure still waiting) had no legal way to pick it back up without first
  // leaving by a doorway and walking back in.

  it("legalActions offers reclaimTreasure when a capable Giant is parked at a Deep Pool doorway with sunk treasure there", () => {
    const s = makeState({
      areas: [
        area(DEEP_POOL_CARD, packCoord(1, 50, 50), { sunkTreasure: [{ at: DIR_W, items: [1] }] }),
        area(2, packCoord(1, 49, 50)),
      ],
      partyArea: 0, prev: 1, party: [member(12)], // a Giant
    });
    expect(legalActions(s)).toContainEqual({ type: "reclaimTreasure" });
  });

  it("does not offer reclaimTreasure without an eligible carrier", () => {
    const s = makeState({
      areas: [
        area(DEEP_POOL_CARD, packCoord(1, 50, 50), { sunkTreasure: [{ at: DIR_W, items: [1] }] }),
        area(2, packCoord(1, 49, 50)),
      ],
      partyArea: 0, prev: 1, party: [member(5)], // a Man — no Giant
    });
    expect(legalActions(s)).not.toContainEqual({ type: "reclaimTreasure" });
  });

  it("does not offer reclaimTreasure when there's nothing sunk/dropped to reclaim", () => {
    const s = westEntryState(DEEP_POOL_CARD, { party: [member(12)] });
    expect(legalActions(s)).not.toContainEqual({ type: "reclaimTreasure" });
  });

  it("dispatching reclaimTreasure transitions to pickup, populates state.treasures, and empties the sunk bucket", () => {
    const s = makeState({
      areas: [
        area(DEEP_POOL_CARD, packCoord(1, 50, 50), { sunkTreasure: [{ at: DIR_W, items: [1] }] }),
        area(2, packCoord(1, 49, 50)),
      ],
      partyArea: 0, prev: 1, party: [member(12)],
    });
    const { state, events } = reduce(s, { type: "reclaimTreasure" });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]);
    expect(state.areas[0]!.sunkTreasure ?? []).toEqual([]);
    expect(events).toContainEqual({ type: "treasureReclaimed", count: 1 });
  });

  it("blocks reclaimTreasure when ineligible or when there's nothing to reclaim", () => {
    const noGiant = makeState({
      areas: [
        area(DEEP_POOL_CARD, packCoord(1, 50, 50), { sunkTreasure: [{ at: DIR_W, items: [1] }] }),
        area(2, packCoord(1, 49, 50)),
      ],
      partyArea: 0, prev: 1, party: [member(5)],
    });
    expect(reduce(noGiant, { type: "reclaimTreasure" }).events).toEqual([{ type: "blocked" }]);

    const nothingThere = westEntryState(DEEP_POOL_CARD, { party: [member(12)] });
    expect(reduce(nothingThere, { type: "reclaimTreasure" }).events).toEqual([{ type: "blocked" }]);
  });

  it("blocks reclaimTreasure off a non-Deep-Pool/Viper-Pit tile, even with sunk treasure somehow present", () => {
    const s = makeState({
      areas: [area(PLAIN_CHAMBER, packCoord(1, 50, 50), { sunkTreasure: [{ at: DIR_W, items: [1] }] })],
      partyArea: 0, party: [member(12)],
    });
    expect(reduce(s, { type: "reclaimTreasure" }).events).toEqual([{ type: "blocked" }]);
  });

  it("also works for the Viper Pit, gated by the Charmed Flute instead of a Giant", () => {
    const s = makeState({
      areas: [
        area(VIPER_PIT_CARD, packCoord(1, 50, 50), { sunkTreasure: [{ at: DIR_W, items: [12] }] }),
        area(2, packCoord(1, 49, 50)),
      ],
      partyArea: 0, prev: 1, party: [member(0, [12])], // Hero carrying the Charmed Flute
    });
    expect(legalActions(s)).toContainEqual({ type: "reclaimTreasure" });
    const { state } = reduce(s, { type: "reclaimTreasure" });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([12]);
  });

  it("also reclaims the auto-dropped pile (crossing without a Giant), not just a deliberate sunk bucket, while stationary", () => {
    const s = makeState({
      areas: [
        area(DEEP_POOL_CARD, packCoord(1, 50, 50), { dropped: [1, 2] }),
        area(2, packCoord(1, 49, 50)),
      ],
      partyArea: 0, prev: 1, party: [member(12)],
    });
    expect(legalActions(s)).toContainEqual({ type: "reclaimTreasure" });
    const { state } = reduce(s, { type: "reclaimTreasure" });
    expect(state.treasures).toEqual([1, 2]);
    expect(state.areas[0]!.dropped ?? []).toEqual([]);
  });
});

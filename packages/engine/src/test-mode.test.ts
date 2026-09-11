import { describe, it, expect } from "vitest";
import {
  decodeArea, newGame,
  SPECIAL_CANONICAL_CARD, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
  AREA_TILE_CANONICAL_CARD, TILE_CHAMBER, TILE_TUNNEL_NE, TILE_TUNNEL_NS, TILE_TUNNEL_NW,
  TILE_TUNNEL_EW, TILE_TUNNEL_SW, TILE_TUNNEL_NES, TILE_TUNNEL_NEW, TILE_TUNNEL_NSW,
  TILE_TUNNEL_ESW, TILE_TUNNEL_NESW, TILE_TUNNEL_ES, TILE_MAX,
  TILE_TUNNEL_NE_D, TILE_TUNNEL_NS_D, TILE_TUNNEL_EW_U, TILE_TUNNEL_SW_D,
  TILE_TUNNEL_NES_U, TILE_TUNNEL_NES_D, TILE_TUNNEL_NEW_U, TILE_TUNNEL_NEW_D,
  TILE_TUNNEL_NSW_U, TILE_TUNNEL_NSW_D, TILE_TUNNEL_ESW_U, TILE_TUNNEL_ESW_D,
  TILE_TUNNEL_NESW_U, TILE_TUNNEL_NESW_D, TILE_TUNNEL_NESW_UD,
} from "./index";
import type { GameState } from "./index";

describe("SPECIAL_CANONICAL_CARD", () => {
  it("has exactly one entry per real special (2-11), each decoding back to that special", () => {
    const ids = [
      SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
      SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
    ];
    expect(Object.keys(SPECIAL_CANONICAL_CARD).map(Number).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      expect(decodeArea(SPECIAL_CANONICAL_CARD[id]!).special).toBe(id);
    }
  });

  it("every canonical card has all four exits, so a test placement always connects on its own merits", () => {
    for (const card of Object.values(SPECIAL_CANONICAL_CARD)) {
      const d = decodeArea(card);
      expect(d.n && d.e && d.s && d.w).toBe(true);
    }
  });
});

describe("AREA_TILE_CANONICAL_CARD (SC-Test-8, up/down variants SC-Test-9)", () => {
  type Shape = { n: boolean; e: boolean; s: boolean; w: boolean; chamber: boolean; stairUp: boolean; stairDown: boolean };
  const noStairs = { stairUp: false, stairDown: false };
  const shapes: Record<number, Shape> = {
    [TILE_CHAMBER]: { n: true, e: true, s: true, w: true, chamber: true, ...noStairs },
    [TILE_TUNNEL_NE]: { n: true, e: true, s: false, w: false, chamber: false, ...noStairs },
    [TILE_TUNNEL_NS]: { n: true, e: false, s: true, w: false, chamber: false, ...noStairs },
    [TILE_TUNNEL_NW]: { n: true, e: false, s: false, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_EW]: { n: false, e: true, s: false, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_SW]: { n: false, e: false, s: true, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_NES]: { n: true, e: true, s: true, w: false, chamber: false, ...noStairs },
    [TILE_TUNNEL_NEW]: { n: true, e: true, s: false, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_NSW]: { n: true, e: false, s: true, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_ESW]: { n: false, e: true, s: true, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_NESW]: { n: true, e: true, s: true, w: true, chamber: false, ...noStairs },
    [TILE_TUNNEL_ES]: { n: false, e: true, s: true, w: false, chamber: false, ...noStairs },
    // Up/down variants (SC-Test-9) — same shapes as above, with a printed stairUp and/or stairDown.
    [TILE_TUNNEL_NE_D]: { n: true, e: true, s: false, w: false, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_NS_D]: { n: true, e: false, s: true, w: false, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_EW_U]: { n: false, e: true, s: false, w: true, chamber: false, stairUp: true, stairDown: false },
    [TILE_TUNNEL_SW_D]: { n: false, e: false, s: true, w: true, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_NES_U]: { n: true, e: true, s: true, w: false, chamber: false, stairUp: true, stairDown: false },
    [TILE_TUNNEL_NES_D]: { n: true, e: true, s: true, w: false, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_NEW_U]: { n: true, e: true, s: false, w: true, chamber: false, stairUp: true, stairDown: false },
    [TILE_TUNNEL_NEW_D]: { n: true, e: true, s: false, w: true, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_NSW_U]: { n: true, e: false, s: true, w: true, chamber: false, stairUp: true, stairDown: false },
    [TILE_TUNNEL_NSW_D]: { n: true, e: false, s: true, w: true, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_ESW_U]: { n: false, e: true, s: true, w: true, chamber: false, stairUp: true, stairDown: false },
    [TILE_TUNNEL_ESW_D]: { n: false, e: true, s: true, w: true, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_NESW_U]: { n: true, e: true, s: true, w: true, chamber: false, stairUp: true, stairDown: false },
    [TILE_TUNNEL_NESW_D]: { n: true, e: true, s: true, w: true, chamber: false, stairUp: false, stairDown: true },
    [TILE_TUNNEL_NESW_UD]: { n: true, e: true, s: true, w: true, chamber: false, stairUp: true, stairDown: true },
  };

  it("has exactly one entry per plain-tile id (TILE_CHAMBER..TILE_MAX), each decoding to special:0 with the named exit shape and stairs", () => {
    const ids = Object.keys(shapes).map(Number);
    expect(Object.keys(AREA_TILE_CANONICAL_CARD).map(Number).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    expect(Math.max(...ids)).toBe(TILE_MAX);
    for (const id of ids) {
      const d = decodeArea(AREA_TILE_CANONICAL_CARD[id]!);
      expect(d.special).toBe(0);
      expect({ n: d.n, e: d.e, s: d.s, w: d.w, chamber: d.chamber, stairUp: d.stairUp, stairDown: d.stairDown }).toEqual(shapes[id]);
    }
  });

  it("TILE_TUNNEL_NW and the kit-only TILE_TUNNEL_ES have no up/down siblings — every NW/ES tile in the deck is plain", () => {
    const ids = Object.keys(shapes).map(Number);
    // No id whose base (plain-shape) counterpart is NW or ES ever appears among the stair variants —
    // proven by there being no _U/_D/_UD sibling for either in the fixed set above; this test pins
    // that omission is intentional (matches the deck), not an accidental gap.
    expect(ids.filter((id) => shapes[id]!.n && !shapes[id]!.e && !shapes[id]!.s && shapes[id]!.w)).toEqual([TILE_TUNNEL_NW]);
    expect(ids.filter((id) => !shapes[id]!.n && shapes[id]!.e && shapes[id]!.s && !shapes[id]!.w)).toEqual([TILE_TUNNEL_ES]);
  });
});

describe("newGame testMode flag", () => {
  it("is absent by default (byte-identical to today)", () => {
    const s = newGame(1, [0]);
    expect(s.testMode).toBeUndefined();
    expect("testMode" in s).toBe(false);
  });

  it("is set to true (never false) when requested", () => {
    const s = newGame(1, [0], undefined, true);
    expect(s.testMode).toBe(true);
  });
});

import { reduce } from "./index";

describe("test-* action gating (SC-Test-1)", () => {
  it("rejects all four test-* actions with `blocked` on a non-test game", () => {
    const s = newGame(1, [0]);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testSetChamber", strangers: [10], treasures: [], hazards: [] }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testForceReaction", outcome: "friendly" }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testClearOverrides" }).events).toEqual([{ type: "blocked" }]);
  });

  it("testPlaceArea arms testNextArea and announces testAreaQueued on a test game", () => {
    // Kit-on (SC-Test-6): SPECIAL_WHIRLPOOL is a kit-only special — a kit-off game rejects it (see
    // the dedicated SC-Test-6 tests below), so this general arm/consume test needs the kit on.
    const s = newGame(1, [0], { extensionKit: true }, true);
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL });
    expect(state.testNextArea).toEqual({ dir: 1, special: SPECIAL_WHIRLPOOL });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: SPECIAL_WHIRLPOOL }]);
  });

  it("rejects an out-of-range special (SPECIAL_NONE/SPECIAL_GATEWAY) even on a test game", () => {
    const s = newGame(1, [0], undefined, true);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: 0 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: 1 }).events).toEqual([{ type: "blocked" }]);
  });

  it("rejects a special beyond TILE_MAX even on a test game (SC-Test-8)", () => {
    const s = newGame(1, [0], { extensionKit: true }, true);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: TILE_MAX + 1 }).events).toEqual([{ type: "blocked" }]);
  });

  it("testPlaceArea also arms a plain-tile id (TILE_CHAMBER..TILE_MAX, SC-Test-8) — no kit needed for a base-available shape", () => {
    const s = newGame(1, [0], undefined, true); // kit-off
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: TILE_CHAMBER });
    expect(state.testNextArea).toEqual({ dir: 1, special: TILE_CHAMBER });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: TILE_CHAMBER }]);
  });

  it("testSetChamber arms testNextChamber and announces testChamberQueued", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testSetChamber", strangers: [10], treasures: [3], hazards: [] });
    expect(state.testNextChamber).toEqual({ strangers: [10], treasures: [3], hazards: [] });
    expect(events).toEqual([{ type: "testChamberQueued", strangers: [10], treasures: [3], hazards: [] }]);
  });

  it("testForceReaction arms testNextReaction and announces testReactionQueued", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testForceReaction", outcome: "hostile" });
    expect(state.testNextReaction).toBe("hostile");
    expect(events).toEqual([{ type: "testReactionQueued", outcome: "hostile" }]);
  });

  it("testClearOverrides drops all three armed overrides at once", () => {
    // Kit-on (SC-Test-6): SPECIAL_WHIRLPOOL is kit-only — needs the kit on so testPlaceArea
    // actually arms (rather than blocks) testNextArea, which this test's assertions depend on.
    let s = newGame(1, [0], { extensionKit: true }, true);
    s = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).state;
    s = reduce(s, { type: "testSetChamber", strangers: [10], treasures: [], hazards: [] }).state;
    s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
    const { state, events } = reduce(s, { type: "testClearOverrides" });
    expect(state.testNextArea).toBeUndefined();
    expect(state.testNextChamber).toBeUndefined();
    expect(state.testNextReaction).toBeUndefined();
    expect(events).toEqual([{ type: "testOverridesCleared" }]);
  });

  it("queuing a second testPlaceArea replaces the first (single slot, not a queue)", () => {
    // Kit-on (SC-Test-6): both SPECIAL_WHIRLPOOL and SPECIAL_CHASM are kit-only.
    let s = newGame(1, [0], { extensionKit: true }, true);
    s = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).state;
    const { state } = reduce(s, { type: "testPlaceArea", dir: 2, special: SPECIAL_CHASM });
    expect(state.testNextArea).toEqual({ dir: 2, special: SPECIAL_CHASM });
  });
});

describe("testPlaceArea/testSetChamber reject kit-only content on a kit-off game (SC-Test-6)", () => {
  it("testPlaceArea rejects a kit-only special (Chasm) on a kit-off game", () => {
    const s = newGame(1, [0], undefined, true); // kit-off
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_CHASM });
    expect(events).toEqual([{ type: "blocked" }]);
    expect(state.testNextArea).toBeUndefined();
  });

  it("testPlaceArea accepts the SAME kit-only special (Chasm) on a kit-on game", () => {
    const s = newGame(1, [0], { extensionKit: true }, true); // kit-on
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_CHASM });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: SPECIAL_CHASM }]);
    expect(state.testNextArea).toEqual({ dir: 1, special: SPECIAL_CHASM });
  });

  it("testPlaceArea still accepts a BASE special (Deep Pool) on a kit-off game", () => {
    const s = newGame(1, [0], undefined, true); // kit-off
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_DEEP_POOL });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: SPECIAL_DEEP_POOL }]);
    expect(state.testNextArea).toEqual({ dir: 1, special: SPECIAL_DEEP_POOL });
  });

  // SC-Test-8: TILE_TUNNEL_ES is the one plain-tile shape that exists only on an extension-kit
  // tile (x05-3) — every other TILE_* shape has a same-shape base AREA_CARDS entry too, so this is
  // the sole plain-tile id that needs the same kit gate as a real kit-only special.
  it("testPlaceArea rejects the kit-only tunnel shape (ES) on a kit-off game", () => {
    const s = newGame(1, [0], undefined, true); // kit-off
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: TILE_TUNNEL_ES });
    expect(events).toEqual([{ type: "blocked" }]);
    expect(state.testNextArea).toBeUndefined();
  });

  it("testPlaceArea accepts the SAME kit-only tunnel shape (ES) on a kit-on game", () => {
    const s = newGame(1, [0], { extensionKit: true }, true); // kit-on
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: TILE_TUNNEL_ES });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: TILE_TUNNEL_ES }]);
    expect(state.testNextArea).toEqual({ dir: 1, special: TILE_TUNNEL_ES });
  });

  it("testPlaceArea still accepts a BASE-available plain tile (a normal chamber) on a kit-off game", () => {
    const s = newGame(1, [0], undefined, true); // kit-off
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: TILE_CHAMBER });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: TILE_CHAMBER }]);
    expect(state.testNextArea).toEqual({ dir: 1, special: TILE_CHAMBER });
  });

  it("testSetChamber rejects kit-only content (a kit-only hazard id, with strangers/treasures left base-only) on a kit-off game", () => {
    const s = newGame(1, [0], undefined, true); // kit-off
    // strangers/treasures are base-only (Dragon 10, Magic Sword 3); only hazards carries a kit-only
    // id (5 = Desertion) — proves each of the three fields is checked independently.
    const { state, events } = reduce(s, { type: "testSetChamber", strangers: [10], treasures: [3], hazards: [5] });
    expect(events).toEqual([{ type: "blocked" }]);
    expect(state.testNextChamber).toBeUndefined();
  });

  it("testSetChamber accepts the SAME kit-only chamber content on a kit-on game", () => {
    const s = newGame(1, [0], { extensionKit: true }, true); // kit-on
    const { state, events } = reduce(s, { type: "testSetChamber", strangers: [10], treasures: [3], hazards: [5] });
    expect(events).toEqual([{ type: "testChamberQueued", strangers: [10], treasures: [3], hazards: [5] }]);
    expect(state.testNextChamber).toEqual({ strangers: [10], treasures: [3], hazards: [5] });
  });
});

import { tryMove } from "./index";
import { DIR_N, DIR_E } from "./index";

describe("testNextArea consumed by tryMove (SC-Test-2)", () => {
  // Kit-on (SC-Test-6): SPECIAL_WHIRLPOOL is kit-only — a kit-off game's testPlaceArea would
  // reject it outright (see the dedicated SC-Test-6 tests below), so these general arm/consume
  // tests need the kit on to actually arm testNextArea in the first place.
  it("places the canonical special card, connects regardless of orientation, and clears the override", () => {
    let s = newGame(1, [0], { extensionKit: true }, true); // Gateway has all 4 exits — every direction is open
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    const placed = r.state.areas[r.state.partyArea]!;
    expect(placed.card).toBe(SPECIAL_CANONICAL_CARD[SPECIAL_WHIRLPOOL]);
    expect(placed.faceUp).toBe(true);
    expect(r.state.testNextArea).toBeUndefined();
  });

  it("leaves the override armed when the party moves a DIFFERENT direction first", () => {
    let s = newGame(1, [0], { extensionKit: true }, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const r = tryMove(s, DIR_E); // an ordinary draw — override is for North, not East
    expect(r.state.testNextArea).toEqual({ dir: DIR_N, special: SPECIAL_WHIRLPOOL });
    expect(decodeArea(r.state.areas[r.state.partyArea]!.card).special).not.toBe(SPECIAL_WHIRLPOOL);
  });

  it("does not consume the large pack (largeIdx unchanged) when placing from the override", () => {
    let s = newGame(1, [0], { extensionKit: true }, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const before = s.largeIdx;
    const r = tryMove(s, DIR_N);
    expect(r.state.largeIdx).toBe(before);
  });

  it("ignores an armed testNextArea on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = newGame(1, [0]); // testMode absent — testNextArea can never be armed this way through
    s.testNextArea = { dir: DIR_N, special: SPECIAL_WHIRLPOOL }; // real play; set directly to prove map.ts doesn't just trust its presence
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true); // an ordinary draw still happens
    expect(decodeArea(r.state.areas[r.state.partyArea]!.card).special).not.toBe(SPECIAL_WHIRLPOOL);
    expect(r.state.testNextArea).toEqual({ dir: DIR_N, special: SPECIAL_WHIRLPOOL }); // left untouched, not silently consumed
  });
});

describe("testNextArea consumed by tryMove — plain tiles (SC-Test-8)", () => {
  it("places the canonical chamber card, connects, and clears the override", () => {
    let s = newGame(1, [0], undefined, true); // Gateway has all 4 exits — every direction is open
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: TILE_CHAMBER }).state;
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    const placed = r.state.areas[r.state.partyArea]!;
    expect(placed.card).toBe(AREA_TILE_CANONICAL_CARD[TILE_CHAMBER]);
    expect(placed.faceUp).toBe(true);
    expect(r.state.testNextArea).toBeUndefined();
  });

  it("places a tunnel shape and connects even though its printed orientation would not otherwise face back", () => {
    // TILE_TUNNEL_EW has no south exit, so an ordinary North draw would never connect on its own —
    // the override forces it anyway, exactly like a real special (SC-Test-2).
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: TILE_TUNNEL_EW }).state;
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    const placed = r.state.areas[r.state.partyArea]!;
    expect(placed.card).toBe(AREA_TILE_CANONICAL_CARD[TILE_TUNNEL_EW]);
    expect(decodeArea(placed.card).s).toBe(false); // proves it connected DESPITE lacking the reverse door
  });

  it("does not consume the large pack when placing a plain tile from the override", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: TILE_TUNNEL_NS }).state;
    const before = s.largeIdx;
    const r = tryMove(s, DIR_N);
    expect(r.state.largeIdx).toBe(before);
  });

  it("places an up/down variant of a tunnel shape, carrying the stairs onto the placed card (SC-Test-9)", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: TILE_TUNNEL_NESW_UD }).state;
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true);
    const placed = r.state.areas[r.state.partyArea]!;
    expect(placed.card).toBe(AREA_TILE_CANONICAL_CARD[TILE_TUNNEL_NESW_UD]);
    const d = decodeArea(placed.card);
    expect(d.stairUp).toBe(true);
    expect(d.stairDown).toBe(true);
  });
});

import { enterChamber } from "./index";

describe("testNextChamber consumed by enterChamber (SC-Test-3)", () => {
  it("replaces the normal draw with exactly the named strangers/treasures/hazards, leaving smallIdx untouched", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextChamber = { strangers: [10, 12], treasures: [3], hazards: [1] };
    const beforeSmallIdx = s.smallIdx;
    const area = s.areas[s.partyArea]!;
    area.visited = false;
    const events = enterChamber(s);
    expect(s.strangers).toEqual([10, 12]);
    expect(s.treasures).toEqual([3]);
    expect(s.hazards).toEqual([1]);
    expect(s.smallIdx).toBe(beforeSmallIdx);
    expect(s.testNextChamber).toBeUndefined();
    expect(events).toContainEqual({ type: "drewChamber", strangers: [10, 12], treasures: [3], hazards: [1] });
  });

  it("still petrifies an overridden creature drawn into a Gallery (classify() reused verbatim)", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextChamber = { strangers: [10], treasures: [], hazards: [] }; // a Dragon (not Spectre/Sorcerer-exempt)
    const area = s.areas[s.partyArea]!;
    area.card = SPECIAL_CANONICAL_CARD[SPECIAL_GALLERY]!;
    area.visited = false;
    enterChamber(s);
    expect(s.strangers).toEqual([]); // never joins strangers — arrives as a statue instead
    expect(s.statues).toEqual([10]);
  });

  it("does nothing when the area was already visited (a revisit reloads parked contents as normal)", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextChamber = { strangers: [10], treasures: [], hazards: [] };
    const area = s.areas[s.partyArea]!;
    area.visited = true; // already resolved once
    enterChamber(s);
    expect(s.strangers).toEqual([]); // the override is only for a FRESH draw — untouched here
    expect(s.testNextChamber).toEqual({ strangers: [10], treasures: [], hazards: [] }); // still armed
  });

  it("ignores an armed testNextChamber on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = newGame(1, [0]); // testMode absent — testNextChamber can never be armed this way through
    s.testNextChamber = { strangers: [10], treasures: [], hazards: [] }; // real play; set directly to prove chamber.ts doesn't just trust its presence
    const beforeSmallIdx = s.smallIdx;
    const area = s.areas[s.partyArea]!;
    area.visited = false;
    enterChamber(s);
    // Seed-independent check: the override path NEVER advances smallIdx (Task 4's own first test
    // asserts this directly), so an advance here proves the ordinary small-pack draw ran instead — regardless
    // of what that draw's first card actually was.
    expect(s.smallIdx).toBeGreaterThan(beforeSmallIdx);
    expect(s.testNextChamber).toEqual({ strangers: [10], treasures: [], hazards: [] }); // left untouched
  });
});

import { forcedReactionRoll } from "./index";

describe("testNextReaction consumed by the test action (SC-Test-4)", () => {
  const withEncounter = (): GameState => {
    const s = newGame(1, [0], undefined, true);
    s.phase = "encounter";
    // a Giant (hostileMax 3 / indiffMax 5) — unlike a Dragon (hostileMax 4 / indiffMax 6, for whom
    // "friendly" is UNREACHABLE: a roll of 6 bands as indifferent, never friendly), all three bands
    // are genuinely reachable, so a forced outcome can actually be checked to re-band correctly.
    s.strangers = [12];
    return s;
  };

  it("forces the exact declared outcome, does not touch state.seed, and clears the override", () => {
    const s = withEncounter();
    s.testNextReaction = "friendly";
    const before = s.seed;
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).toMatchObject({ type: "reaction", outcome: "friendly" });
    expect(state.seed).toBe(before);
    expect(state.testNextReaction).toBeUndefined();
  });

  it("forcedReactionRoll returns a value that re-bands to the SAME outcome for hostile/indifferent/friendly", () => {
    const s = withEncounter();
    // Giant bands: 1-3 hostile, 4-5 indifferent, 6 friendly (mirrors reaction.ts's own reactionRoll
    // formula) — a mis-banded forcedReactionRoll would still satisfy a mere 1-6 range check, so this
    // re-derives the band from the returned roll and checks it matches the outcome that was forced.
    const band = (roll: number) => (roll <= 3 ? "hostile" : roll <= 5 ? "indifferent" : "friendly");
    for (const outcome of ["hostile", "indifferent", "friendly"] as const) {
      const roll = forcedReactionRoll(s, outcome);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
      expect(band(roll)).toBe(outcome);
    }
  });

  it("falls back to an ordinary rolled reaction when no override is armed", () => {
    const s = withEncounter(); // testNextReaction absent
    const before = s.seed;
    const { state } = reduce(s, { type: "test" });
    expect(state.seed).not.toBe(before); // the die was genuinely rolled
  });

  it("ignores an armed testNextReaction on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = withEncounter();
    delete (s as { testMode?: true }).testMode; // real play can never reach `test` with testMode absent
    s.testNextReaction = "friendly"; // AND testNextReaction armed at once — set directly to prove reduce.ts doesn't just trust its presence
    const before = s.seed;
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).not.toMatchObject({ outcome: "friendly" }); // the die was genuinely rolled instead
    expect(state.seed).not.toBe(before);
  });
});

import { rollDieForState, reactionRoll } from "./index";

describe("Next Roll Selector — testForceDie/testForceAllDice action gating (SC-Test-10)", () => {
  it("rejects both actions with `blocked` on a non-test game", () => {
    const s = newGame(1, [0]);
    expect(reduce(s, { type: "testForceDie", value: 3 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testForceAllDice", value: 3 }).events).toEqual([{ type: "blocked" }]);
  });

  it("testForceDie arms testNextDie and announces testDieQueued", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testForceDie", value: 4 });
    expect(state.testNextDie).toBe(4);
    expect(events).toEqual([{ type: "testDieQueued", value: 4 }]);
  });

  it("testForceAllDice arms testAllDiceRoll and announces testAllDiceQueued", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testForceAllDice", value: 6 });
    expect(state.testAllDiceRoll).toBe(6);
    expect(events).toEqual([{ type: "testAllDiceQueued", value: 6 }]);
  });

  it("rejects an out-of-range value (0 or 7) for either action even on a test game", () => {
    const s = newGame(1, [0], undefined, true);
    expect(reduce(s, { type: "testForceDie", value: 0 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testForceDie", value: 7 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testForceAllDice", value: 0 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testForceAllDice", value: 7 }).events).toEqual([{ type: "blocked" }]);
  });

  it("testClearOverrides also drops testNextDie and testAllDiceRoll", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testForceDie", value: 4 }).state;
    s = reduce(s, { type: "testForceAllDice", value: 6 }).state;
    const { state } = reduce(s, { type: "testClearOverrides" });
    expect(state.testNextDie).toBeUndefined();
    expect(state.testAllDiceRoll).toBeUndefined();
  });
});

describe("rollDieForState (SC-Test-10)", () => {
  const testState = (): GameState => newGame(1, [0], undefined, true);

  it("consumes testNextDie once (one-shot) and does not touch state.seed", () => {
    const s = testState();
    s.testNextDie = 5;
    const before = s.seed;
    expect(rollDieForState(s)).toBe(5);
    expect(s.testNextDie).toBeUndefined();
    expect(s.seed).toBe(before);
    // Second call: no longer armed — rolls for real (seed now advances).
    const beforeSecond = s.seed;
    rollDieForState(s);
    expect(s.seed).not.toBe(beforeSecond);
  });

  it("returns testAllDiceRoll on every call without consuming it, and without touching state.seed", () => {
    const s = testState();
    s.testAllDiceRoll = 2;
    const before = s.seed;
    expect(rollDieForState(s)).toBe(2);
    expect(rollDieForState(s)).toBe(2);
    expect(rollDieForState(s)).toBe(2);
    expect(s.testAllDiceRoll).toBe(2); // still armed
    expect(s.seed).toBe(before);
  });

  it("testNextDie takes priority over testAllDiceRoll when both are armed", () => {
    const s = testState();
    s.testNextDie = 3;
    s.testAllDiceRoll = 6;
    expect(rollDieForState(s)).toBe(3); // the one-shot override wins
    expect(s.testNextDie).toBeUndefined();
    expect(rollDieForState(s)).toBe(6); // falls through to the all-dice override next
  });

  it("rolls for real (advancing the seed) when neither override is armed", () => {
    const s = testState();
    const before = s.seed;
    const value = rollDieForState(s);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(6);
    expect(s.seed).not.toBe(before);
  });

  it("ignores armed overrides on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = newGame(1, [0]); // testMode absent
    s.testNextDie = 5;
    s.testAllDiceRoll = 2;
    const before = s.seed;
    const value = rollDieForState(s);
    expect(value).not.toBe(5); // essentially certain — real d6, not the armed override
    expect(s.seed).not.toBe(before); // the die was genuinely rolled
    expect(s.testNextDie).toBe(5); // left untouched, not silently consumed
  });
});

describe("Next Roll Selector consumed by reactions — reactionRoll(state, forcedValue) (SC-Test-10)", () => {
  const withEncounter = (): GameState => {
    const s = newGame(1, [0], undefined, true);
    s.phase = "encounter";
    s.strangers = [12]; // Giant: hostileMax 3 / indiffMax 5 — all three bands genuinely reachable
    return s;
  };

  it("reactionRoll bands a forcedValue exactly like a genuine roll, leaving seed untouched", () => {
    const s = withEncounter();
    const before = s.seed;
    const forced = reactionRoll(s, 6); // Giant: 6 -> friendly
    expect(forced.outcome).toBe("friendly");
    expect(forced.roll).toBe(6);
    expect(forced.seed).toBe(before);
  });

  it("case \"test\" prefers testNextReaction over testNextDie/testAllDiceRoll when both are armed", () => {
    const s = withEncounter();
    s.testNextReaction = "hostile";
    s.testNextDie = 6; // would band to "friendly" if it were consulted instead
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).toMatchObject({ type: "reaction", outcome: "hostile" });
    expect(state.testNextDie).toBe(6); // untouched — testNextReaction alone was consumed
    expect(state.testNextReaction).toBeUndefined();
  });

  it("case \"test\" consumes testNextDie (one-shot), banding it through the leader's own thresholds", () => {
    const s = withEncounter();
    // Hero (party[0]) has FLAG_CHARISMA (+1), so a raw 2 bands as an effective 3 -> hostile
    // (Giant hostileMax 3) — proves the forced value goes through the SAME adjustment a genuine
    // roll would, not banded as a raw, unadjusted 2.
    s.testNextDie = 2;
    const before = s.seed;
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).toMatchObject({ type: "reaction", outcome: "hostile", roll: 2 });
    expect(state.testNextDie).toBeUndefined();
    expect(state.seed).toBe(before);
  });

  it("case \"test\" consumes testAllDiceRoll WITHOUT clearing it — armed for the next roll too", () => {
    const s = withEncounter();
    s.testAllDiceRoll = 4; // Giant: 4 -> indifferent (hostileMax 3, indiffMax 5)
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).toMatchObject({ type: "reaction", outcome: "indifferent", roll: 4 });
    expect(state.testAllDiceRoll).toBe(4); // still armed
  });
});

describe("Next Roll Selector — \"until end of turn\" auto-clears on turn advance (SC-Test-10)", () => {
  it("clears testAllDiceRoll on an ordinary move that advances the turn", () => {
    // Dispatched via reduce()'s "move" case (not the lower-level tryMove helper directly) — turn
    // advance and the auto-clear both live in that case, not in tryMove itself.
    const s = newGame(1, [0], undefined, true); // Gateway has all 4 exits — every direction is open
    s.testAllDiceRoll = 5;
    const before = s.turn;
    const { state, events } = reduce(s, { type: "move", dir: DIR_N });
    expect(events[0]).toMatchObject({ type: "moved" });
    expect(state.turn).toBe(before + 1);
    expect(state.testAllDiceRoll).toBeUndefined();
  });

  it("does not clear testNextDie on turn advance (a one-shot override outlives the turn until consumed)", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextDie = 4;
    const { state, events } = reduce(s, { type: "move", dir: DIR_N });
    expect(events[0]).toMatchObject({ type: "moved" });
    expect(state.testNextDie).toBe(4);
  });

  it("testClearOverrides still works mid-turn, before any turn advance", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testForceAllDice", value: 5 }).state;
    const { state } = reduce(s, { type: "testClearOverrides" });
    expect(state.testAllDiceRoll).toBeUndefined();
  });
});

describe("Next Roll Selector — end-to-end through a non-reaction roll site (SC-Test-10)", () => {
  // openChest (reduce.ts) is representative of the ~15 other rollDieForState call sites (combat,
  // hazards, special areas) — proves the override actually reaches a real gameplay roll, not just
  // the rollDieForState unit itself.
  const withChest = (): GameState => {
    const s = newGame(1, [0], undefined, true);
    s.party[0]!.treasure = [14]; // the Chest (treasure 14)
    return s;
  };

  it("forces the chest's outcome via testNextDie", () => {
    const s = withChest();
    s.testNextDie = 6; // -> Gems, +80 bonusScore
    const { state, events } = reduce(s, { type: "openChest" });
    expect(events[0]).toEqual({ type: "chestOpened", result: 6 });
    expect(state.bonusScore).toBe(80);
    expect(state.testNextDie).toBeUndefined();
  });
});

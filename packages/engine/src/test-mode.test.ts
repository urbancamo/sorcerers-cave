import { describe, it, expect } from "vitest";
import {
  decodeArea, newGame,
  SPECIAL_CANONICAL_CARD, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
} from "./index";

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
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL });
    expect(state.testNextArea).toEqual({ dir: 1, special: SPECIAL_WHIRLPOOL });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: SPECIAL_WHIRLPOOL }]);
  });

  it("rejects an out-of-range special (SPECIAL_NONE/SPECIAL_GATEWAY) even on a test game", () => {
    const s = newGame(1, [0], undefined, true);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: 0 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: 1 }).events).toEqual([{ type: "blocked" }]);
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
    let s = newGame(1, [0], undefined, true);
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
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).state;
    const { state } = reduce(s, { type: "testPlaceArea", dir: 2, special: SPECIAL_CHASM });
    expect(state.testNextArea).toEqual({ dir: 2, special: SPECIAL_CHASM });
  });
});

import { tryMove } from "./index";
import { DIR_N, DIR_E } from "./index";

describe("testNextArea consumed by tryMove (SC-Test-2)", () => {
  it("places the canonical special card, connects regardless of orientation, and clears the override", () => {
    let s = newGame(1, [0], undefined, true); // Gateway has all 4 exits — every direction is open
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
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const r = tryMove(s, DIR_E); // an ordinary draw — override is for North, not East
    expect(r.state.testNextArea).toEqual({ dir: DIR_N, special: SPECIAL_WHIRLPOOL });
    expect(decodeArea(r.state.areas[r.state.partyArea]!.card).special).not.toBe(SPECIAL_WHIRLPOOL);
  });

  it("does not consume the large pack (largeIdx unchanged) when placing from the override", () => {
    let s = newGame(1, [0], undefined, true);
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

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
    s.strangers = [10]; // a Dragon — hostileMax/indiffMax give it a real 3-band split
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

  it("forcedReactionRoll returns a value in the correct band for hostile/indifferent/friendly", () => {
    const s = withEncounter();
    const hostileRoll = forcedReactionRoll(s, "hostile");
    const indiffRoll = forcedReactionRoll(s, "indifferent");
    const friendlyRoll = forcedReactionRoll(s, "friendly");
    expect(hostileRoll).toBeGreaterThanOrEqual(1);
    expect(hostileRoll).toBeLessThanOrEqual(6);
    expect(indiffRoll).toBeGreaterThanOrEqual(1);
    expect(indiffRoll).toBeLessThanOrEqual(6);
    expect(friendlyRoll).toBeGreaterThanOrEqual(1);
    expect(friendlyRoll).toBeLessThanOrEqual(6);
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

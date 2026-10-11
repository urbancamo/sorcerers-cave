import { describe, it, expect } from "vitest";
import { tryMove } from "./map";
import { moveWithRedraw, viableExitsCheck } from "./redraw";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord, DIR_E, DIR_S, DIR_UP } from "./coords";
import { AF_DESTROYED, type GameState, type PlacedArea } from "./state";
import { SPECIAL_CANONICAL_CARD, SPECIAL_WHIRLPOOL, SPECIAL_CHASM } from "./data/areaCards";

// The Dead End rule ("forced redraw", §6.3.2) — docs/requirements/2026-09-30-swap-dead-end-area-card-reimplemented-v2.md.
// Card-value bitfield (spec §3.1): N=1 E=2 S=4 W=8 chamber=16 stairUp=32 stairDown=64.
// "Scenario n" below is that document's Test Scenario n.

const at = (card: number, x: number, y: number, over: Partial<PlacedArea> = {}, level = 1): PlacedArea =>
  ({ card, coord: packCoord(level, x, y), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, ...over });
const noEnter = (): void => undefined;
/** A party boxed in on a single East-only tile at (50,50): it can only try East. */
const boxed = (pack: number[], seed = 1): GameState =>
  makeState({ areas: [at(2, 50, 50)], partyArea: 0, largePack: pack, largeIdx: 0, seed });
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const WHIRLPOOL = SPECIAL_CANONICAL_CARD[SPECIAL_WHIRLPOOL]!;
const CHASM = SPECIAL_CANONICAL_CARD[SPECIAL_CHASM]!;

describe("viableExitsCheck — the whole reachable region is searched", () => {
  it("a lone tile with every doorway closed, and an empty pack, has no way on", () => {
    expect(viableExitsCheck(makeState({ areas: [at(0, 50, 50)], largePack: [] }), 0)).toBe(false);
  });

  it("a doorway toward empty space is a way on while the pack has a card to draw for it", () => {
    expect(viableExitsCheck(makeState({ areas: [at(1, 50, 50)], largePack: [999] }), 0)).toBe(true);
  });

  it("…but not once the pack is empty (a move there is a permanent no-op, SC-6.1-6)", () => {
    expect(viableExitsCheck(makeState({ areas: [at(2, 50, 50)], largePack: [] }), 0)).toBe(false);
  });

  it("a doorway to a tile the party can already walk to is a route, never a way on by itself", () => {
    const s = makeState({ areas: [at(2, 50, 50), at(8, 51, 50)], largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(false);
  });

  // Scenario 4 — the old rule looked only at the tile the party stands on; the printed rule says backtracking counts.
  it("scenario 4: backtracking finds another way — a neighbour's untried doorway counts", () => {
    const s = makeState({ areas: [at(2, 50, 50), at(8 | 1 | 4, 51, 50)], largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(true);
    expect(viableExitsCheck(s, 1)).toBe(true);
  });

  // Scenario 5 — rubble is impassable.
  it("scenario 5: a collapsed neighbour isolates the party", () => {
    const s = makeState({ areas: [at(4, 50, 50), at(1 | 2, 50, 51, { flags: AF_DESTROYED })], largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(false);
  });

  // Scenario 6 — a stairway up from level 1 leaves the Cave; that is not exploring.
  it("scenario 6: a Cave exit is not a way on", () => {
    expect(viableExitsCheck(makeState({ areas: [at(32, 50, 50)], largePack: [999] }), 0)).toBe(false);
  });

  it("a stairway onto the Whirlpool is a Blocked Doorway", () => {
    const s = makeState({ areas: [at(32, 50, 50, {}, 2), at(WHIRLPOOL, 50, 50)], partyArea: 0, level: 2, largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(false);
  });

  it("an already-known dead end on the table is not a way on, even with cards in the pack", () => {
    const s = makeState({ areas: [at(2, 50, 50), at(1, 51, 50, { faceUp: false })], largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(false);
  });

  it("a doorway the party has closed (deadDoors) is not a way on, and the printed card is untouched", () => {
    const s = makeState({ areas: [at(1 | 2, 50, 50, { deadDoors: 1 })], largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(true); // E is still open and toward empty space
    s.areas[0]!.deadDoors = 3;
    expect(viableExitsCheck(s, 0)).toBe(false);
    expect(s.areas[0]!.card).toBe(3);
  });

  // Scenarios 15 / 15c — Whirlpool: the doorway opposite the one the party came in by is unusable, and the
  // Whirlpool itself is never a way forward.
  describe("the Whirlpool", () => {
    // Party in the Whirlpool, arrived from the tile to the NORTH. E and W lead to known dead ends; the only
    // untried doorway is S, straight across — which the shallows do not allow.
    const whirl = (): GameState => makeState({
      areas: [
        at(WHIRLPOOL, 50, 50),
        at(4, 50, 49),                              // 1: the North tile it came from (S doorway only)
        at(1, 51, 50, { faceUp: false }),           // 2: East — a dead end
        at(1, 49, 50, { faceUp: false }),           // 3: West — a dead end
      ],
      partyArea: 0, prev: 1, largePack: [999],
    });

    it("scenario 15: the doorway directly opposite the arrival doorway is not usable", () => {
      expect(viableExitsCheck(whirl(), 0)).toBe(false);
    });

    it("…but an adjacent doorway is", () => {
      const s = whirl();
      s.areas[2] = at(1, 51, 50, { faceUp: false });
      s.areas.splice(2, 1); // East becomes empty space, so it is a frontier exit
      expect(viableExitsCheck(s, 0)).toBe(true);
    });

    it("scenario 15c: a crossable Whirlpool is not a way forward on its own", () => {
      const s = makeState({ areas: [at(8, 49, 50), at(WHIRLPOOL, 50, 50, {}, 1)], partyArea: 0, largePack: [] });
      s.areas[0]!.card = 2; // East tile → Whirlpool, which has doorways but no card beyond them and no pack
      expect(viableExitsCheck(s, 0)).toBe(false);
    });
  });

  // Scenario 16 — descending a Chasm is deliberate and reusable.
  it("scenario 16: a Chasm is a way on even when its doorways are all closed", () => {
    const s = makeState({ areas: [at(CHASM, 50, 50, { deadDoors: 15 })], largePack: [999] });
    expect(viableExitsCheck(s, 0)).toBe(true);
    const plain = makeState({ areas: [at(15, 50, 50, { deadDoors: 15 })], largePack: [999] });
    expect(viableExitsCheck(plain, 0)).toBe(false);
  });
});

describe("moveWithRedraw — a dead end that leaves no way on is swapped", () => {
  // Scenario 1
  it("scenario 1: swaps for a card that connects and leaves a way on, putting the original back", () => {
    const s = boxed([1 /* N only — fails E */, 9 /* W|N — connects, N is open */, 1]);
    const r = moveWithRedraw(s, DIR_E, noEnter);
    expect(r.moved).toBe(true);
    expect(r.swap).toEqual({ removed: 1, drawn: 9, reason: "deadEnd" });
    expect(r.noViableExits).toBe(false);
    expect(r.state.areas[r.state.partyArea]!.card).toBe(9);
    expect(r.state.areas[0]!.deadDoors).toBeUndefined(); // the doorway worked, nothing was closed
  });

  // Scenario 2
  it("scenario 2: with no card that connects, it is an ordinary dead end — and the party is told", () => {
    const s = boxed([1, 1, 1]);
    const r = moveWithRedraw(s, DIR_E, noEnter);
    expect(r.deadEnd).toBe(true);
    expect(r.swap).toBeUndefined();
    expect(r.noViableExits).toBe(true);
    expect(r.state.largePack).toEqual([1, 1, 1]); // untouched
    expect(r.state.largeIdx).toBe(1);
    expect(r.state.areas[0]!.deadDoors).toBe(2); // East closed; the printed card stays as dealt
    expect(r.state.areas[0]!.card).toBe(2);
    expect(r.state.areas[r.state.areas.length - 1]!.faceUp).toBe(false);
  });

  // Scenario 22 (dead-end half)
  it("scenario 22: on the very last card there is nothing to swap and no warning", () => {
    const r = moveWithRedraw(boxed([1]), DIR_E, noEnter);
    expect(r.deadEnd).toBe(true);
    expect(r.noViableExits).toBe(false);
  });

  it("another way on blocks the swap: the card is laid as an ordinary dead end", () => {
    // Boxed at (50,50) with E and S; trying E. S is still untried, so no swap.
    const s = makeState({ areas: [at(2 | 4, 50, 50)], largePack: [1, 9, 9], seed: 1 });
    const r = moveWithRedraw(s, DIR_E, noEnter);
    expect(r.deadEnd).toBe(true);
    expect(r.swap).toBeUndefined();
    expect(r.noViableExits).toBe(false);
    expect(r.state.largePack).toEqual([1, 9, 9]);
  });

  // Scenario 8
  it("scenario 8: the laid card is part of the map — a face-down card another tile's doorway now matches opens a route", () => {
    // X(50,50) has E and S. Trying E draws N-only (dead end), laid at (51,50). Its N doorway faces (51,49), empty,
    // but it is a dead end — the point is the check includes the new card: X's S doorway still counts.
    const s = makeState({ areas: [at(2 | 4, 50, 50)], largePack: [1, 9], seed: 1 });
    expect(moveWithRedraw(s, DIR_E, noEnter).swap).toBeUndefined();
  });

  // Scenario 7 — vertical
  it("scenario 7: a Whirlpool drawn for a stairway is a dead end", () => {
    // Party on level 2 with a stair up only; the card drawn for the level above is the Whirlpool, which blocks it.
    const s = makeState({
      areas: [at(32, 50, 50, {}, 2)], partyArea: 0, level: 2,
      largePack: [WHIRLPOOL, 32 | 64 | 1, 1], largeIdx: 0, seed: 1,
    });
    const r = moveWithRedraw(s, DIR_UP, noEnter);
    expect(r.swap?.removed).toBe(WHIRLPOOL);
    expect(r.swap?.drawn).toBe(32 | 64 | 1);
    expect(r.moved).toBe(true);
  });
});

describe("moveWithRedraw — a Sealing Card (connects, but closes the party in)", () => {
  // Scenario 18
  it("scenario 18: a valid card that closes a loop with no way out is swapped for one that leaves a way", () => {
    const s = boxed([8 /* W only — connects E but leads nowhere */, 9, 1]);
    const r = moveWithRedraw(s, DIR_E, noEnter);
    expect(r.swap).toEqual({ removed: 8, drawn: 9, reason: "sealed" });
    expect(r.state.areas[r.state.partyArea]!.card).toBe(9);
    expect(r.noViableExits).toBe(false);
  });

  // Scenario 19
  it("scenario 19: when no card avoids sealing, the original is laid and the party moves in, with a warning", () => {
    const s = boxed([8, 8, 8]);
    const r = moveWithRedraw(s, DIR_E, noEnter);
    expect(r.swap).toBeUndefined();
    expect(r.moved).toBe(true);
    expect(r.state.areas[r.state.partyArea]!.card).toBe(8);
    expect(r.noViableExits).toBe(true);
    expect(r.state.largePack).toEqual([8, 8, 8]);
  });

  // Scenario 20
  it("scenario 20: a dead-end swap does not choose a Sealing Card while a better card exists", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = moveWithRedraw(boxed([1, 8, 9], seed), DIR_E, noEnter);
      expect(r.swap?.drawn).toBe(9);
      expect(r.noViableExits).toBe(false);
    }
  });

  // Scenario 21
  it("scenario 21: if only sealing cards connect, a dead end takes one anyway — 'until a way is found' — with a warning", () => {
    const r = moveWithRedraw(boxed([1, 8, 1]), DIR_E, noEnter);
    expect(r.swap).toEqual({ removed: 1, drawn: 8, reason: "deadEnd" });
    expect(r.moved).toBe(true);
    expect(r.noViableExits).toBe(true);
  });

  // Scenario 22 (sealing half)
  it("scenario 22: on the last card a sealing card is simply laid — exploration is over by the rules", () => {
    const r = moveWithRedraw(boxed([8]), DIR_E, noEnter);
    expect(r.moved).toBe(true);
    expect(r.swap).toBeUndefined();
    expect(r.noViableExits).toBe(false);
  });

  // Scenarios 23 / 25 — a hazard drawn on entry.
  describe("a hazard drawn on entry", () => {
    // X(50,50) has E and N (N is untried). The card drawn for E is W-only: without a quake the party can walk back to
    // X and use its N. An Earthquake destroys the tile the party came from, so on entry it would be sealed in.
    const state = (pack: number[]) => makeState({ areas: [at(2 | 1, 50, 50)], largePack: pack, seed: 1 });
    const quake = (s: GameState): void => { s.areas[s.prev]!.flags |= AF_DESTROYED; };

    it("with no hazard the same card is fine", () => {
      const r = moveWithRedraw(state([8, 9, 9, 9]), DIR_E, noEnter);
      expect(r.swap).toBeUndefined();
      expect(r.moved).toBe(true);
    });

    it("scenario 23: an Earthquake that would seal the party in makes the card a Sealing Card, and it is swapped", () => {
      const r = moveWithRedraw(state([8, 9, 9, 9]), DIR_E, quake);
      expect(r.swap).toEqual({ removed: 8, drawn: 9, reason: "sealed" });
      expect(r.state.areas[r.state.partyArea]!.card).toBe(9);
    });

    it("scenario 25: if no card avoids the sealing, the original is laid", () => {
      const r = moveWithRedraw(state([8, 8, 8, 8]), DIR_E, quake);
      expect(r.swap).toBeUndefined();
      expect(r.noViableExits).toBe(true);
    });

    // Scenario 26 — a trap in the same chamber drops the party; it is judged from where it lands.
    describe("scenario 26: a trap drops the party a level", () => {
      // Only the W-only card (8) has the trap; the party lands on Z, directly below.
      const withFloor = (below: number, pack: number[]) => {
        const s = state(pack);
        s.areas.push(at(below, 50, 50, {}, 2));
        return s;
      };
      const fall = (s: GameState): void => {
        if (s.areas[s.partyArea]!.card !== 8) return;
        s.partyArea = 1; // Z, laid before the new card
        s.level = 2;
      };

      it("it lands where a doorway is open: the card is fine", () => {
        expect(moveWithRedraw(withFloor(1, [8, 9, 9]), DIR_E, fall).swap).toBeUndefined();
      });

      it("it lands in a sealed pocket: the card is a Sealing Card and is swapped for one without the trap", () => {
        const r = moveWithRedraw(withFloor(0, [8, 9, 9]), DIR_E, fall);
        expect(r.swap).toEqual({ removed: 8, drawn: 9, reason: "sealed" });
      });
    });
  });
});

describe("moveWithRedraw — bookkeeping", () => {
  // Scenario 10
  it("scenario 10: a swap keeps the pack a valid permutation: same cards, same size, same draw index", () => {
    const pack = [1, 9, 8, 1, 9, 5];
    for (let seed = 1; seed <= 20; seed++) {
      const r = moveWithRedraw(boxed(pack, seed), DIR_E, noEnter);
      expect(r.swap).toBeDefined();
      expect(sorted(r.state.largePack)).toEqual(sorted(pack));
      expect(r.state.largeIdx).toBe(1);
    }
  });

  // Scenario 11
  it("scenario 11: determinism — the same state gives the same swap, and the generator moves on", () => {
    const a = moveWithRedraw(boxed([1, 9, 9, 9, 9], 7), DIR_E, noEnter);
    const b = moveWithRedraw(boxed([1, 9, 9, 9, 9], 7), DIR_E, noEnter);
    expect(a).toEqual(b);
    expect(a.state.seed).not.toBe(7);
  });

  // Scenario 28
  it("scenario 28: the rehearsal leaves no trace on the state it was given", () => {
    const s = boxed([8, 9, 9, 9]);
    const before = structuredClone(s);
    moveWithRedraw(s, DIR_E, (x) => { x.areas[x.prev]!.flags |= AF_DESTROYED; x.largeIdx += 1; x.seed += 99; });
    expect(s).toEqual(before);
  });

  it("a doorway toward a card already laid is the plain move, never a swap", () => {
    const s = makeState({ areas: [at(2, 50, 50), at(1, 51, 50, { faceUp: false })], largePack: [9, 9], seed: 1 });
    const r = moveWithRedraw(s, DIR_E, noEnter);
    expect(r.swap).toBeUndefined();
    expect(r.deadEnd).toBe(true);
    expect(r.state.largeIdx).toBe(0);
  });

  it("byte-identity: the plain move is unaffected, and never grows the pack", () => {
    const r = tryMove(boxed([1, 1, 1], 42), DIR_E);
    expect(r.deadEnd).toBe(true);
    expect(r.state.largeIdx).toBe(1);
    expect(r.state.largePack).toHaveLength(3);
  });
});

describe("the move action under variants.forcedRedraw", () => {
  const on = (s: GameState): GameState => ({ ...s, variants: { forcedRedraw: true } });

  it("narrates a swap with its reason", () => {
    const { events, state } = reduce(on(boxed([1, 9, 1])), { type: "move", dir: DIR_E });
    expect(events).toContainEqual({ type: "deadEndCardSwapped", removed: 1, drawn: 9, reason: "deadEnd" });
    expect(state.partyArea).toBe(1);
  });

  it("warns when the party is left with no way on and cards remain", () => {
    const { events } = reduce(on(boxed([1, 1, 1])), { type: "move", dir: DIR_E });
    expect(events.map((e) => e.type)).toEqual(["deadEnd", "deadEndNoViableExits"]);
  });

  it("does not warn on the last card", () => {
    const { events } = reduce(on(boxed([1])), { type: "move", dir: DIR_E });
    expect(events.map((e) => e.type)).toEqual(["deadEnd"]);
  });

  // Scenario 13
  it("scenario 13: with the flag off nothing changes — an ordinary dead end, no swap, no warning", () => {
    const { events, state } = reduce(boxed([1, 9, 1]), { type: "move", dir: DIR_E });
    expect(events.map((e) => e.type)).toEqual(["deadEnd"]);
    expect(state.largePack).toEqual([1, 9, 1]);
  });

  // Scenario 12
  it("scenario 12: retreat is excluded on purpose — the same rescuable scenario still dead-ends and locks retreat", () => {
    const s = boxed([1, 9, 9]);
    s.phase = "fight";
    s.fight = { surprise: 0, round: 2, focus: 0 }; // retreat is only legal after round 1
    s.variants = { forcedRedraw: true };
    const { state, events } = reduce(s, { type: "retreat", dir: DIR_E });
    expect(events).toEqual([{ type: "deadEnd", dir: DIR_E, retreat: true }]);
    expect(state.fight?.retreatBlocked).toBe(true);
    expect(state.largePack).toEqual([1, 9, 9]);
  });
});

describe("a failed move never rewrites the placed card", () => {
  it("scenario: the tile keeps the card it was dealt; only deadDoors records the closed doorway", () => {
    const s = makeState({ areas: [at(1 | 2 | 4, 50, 50)], largePack: [1, 8], seed: 1 });
    const a = tryMove(s, DIR_E); // N-only: no West door to meet it
    const b = tryMove(a.state, DIR_S); // W-only: no North door to meet it
    expect(b.state.areas[0]!.card).toBe(7);
    expect(b.state.areas[0]!.deadDoors).toBe(2 | 4);
    expect(tryMove(b.state, DIR_E).moved).toBe(false); // a closed doorway offers nothing
  });
});

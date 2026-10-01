import { describe, it, expect } from "vitest";
import { isPartyStuck, tryMove } from "./map";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord, DIR_N, DIR_E, DIR_S, DIR_W } from "./coords";
import { AF_DESTROYED } from "./state";
import { SPECIAL_CANONICAL_CARD, SPECIAL_WHIRLPOOL } from "./data/areaCards";

// Card-value bitfield (spec §3.1): N=1 E=2 S=4 W=8 chamber=16 stairUp=32 stairDown=64.

describe("isPartyStuck (§6.3.2 Dead End rule — 'forced redraw')", () => {
  it("a single area with every bit pruned, and an empty pack, is stuck", () => {
    const s = makeState({
      areas: [{ card: 0, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(true);
  });

  it("a single area with one live bit toward unexplored space, and cards remaining, is NOT stuck", () => {
    const s = makeState({
      areas: [{ card: 1 /* N */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [999],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(false);
  });

  // A SUCCESSFUL connection's exit bit is never pruned (pruning only ever fires on failure), so a
  // door back to a neighbour the party can already walk into must NOT count as "still available" —
  // it is a way out, not a way forward. A naive "any unpruned bit counts" rule would say `false` here.
  it("a tile whose only remaining door leads to a connected neighbour IS stuck", () => {
    const s = makeState({
      areas: [
        { card: 2 /* E only */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 8 /* W only */, coord: packCoord(1, 51, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(true);
  });

  // Regression (docs/bugs/ZICR-log.json): the party sits in a room whose every other door has been
  // tried; the one door left leads back to a neighbour that STILL has untried exits. Only the tile the
  // party occupies counts — the rule does not backtrack — so this is stuck.
  it("does NOT backtrack: a connected neighbour's live bits toward unexplored space are ignored", () => {
    const s = makeState({
      areas: [
        { card: 2 /* E only — the way back */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 8 | 1 | 4 /* W (connects back) + N + S (both unexplored, live) */, coord: packCoord(1, 51, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [999],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(true);
    expect(isPartyStuck(s, 1)).toBe(false); // standing on the tile that has them, they DO count
  });

  // Regression (docs/bugs/ZICR-log.json): an earthquake collapsed the tile the party came through, so
  // the room's one remaining door leads only to rubble. That is permanently impassable — nothing to
  // "try" — so it must not count as an untried option.
  it("a door toward a DESTROYED neighbour (rubble) does not count — the party is stuck", () => {
    const s = makeState({
      areas: [
        { card: 4 /* S only */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 1 | 2 /* N (would connect back) + E */, coord: packCoord(1, 50, 51), faceUp: true, visited: false, contents: [], flags: AF_DESTROYED, indiffCount: 0 },
      ],
      largePack: [999],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(true);
  });

  it("a stairway toward a Whirlpool (permanently blocked) does not count", () => {
    const s = makeState({
      areas: [
        { card: 32 /* stair up */, coord: packCoord(2, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: SPECIAL_CANONICAL_CARD[SPECIAL_WHIRLPOOL]!, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [999],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(true);
  });

  it("a live bit toward an already-placed, NON-connecting neighbor counts as available even with an empty pack", () => {
    const s = makeState({
      areas: [
        { card: 2 /* E only */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 1 /* N only — no W, so it does NOT connect back */, coord: packCoord(1, 51, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(false);
  });

  it("a live bit toward UNEXPLORED space with an empty pack does NOT count as available (SC-6.1-6)", () => {
    const s = makeState({
      areas: [{ card: 2 /* E, nothing placed there, pack empty */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [],
      largeIdx: 0,
    });
    expect(isPartyStuck(s, 0)).toBe(true);
  });
});

describe("tryMove(..., allowDeadEndSwap) — the swap-and-redraw loop", () => {
  // Gateway-shaped: East only, so the party is fully boxed in the instant this one draw fails.
  const boxedIn = () => makeState({
    areas: [{ card: 2 /* E only */, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
    partyArea: 0,
  });

  it("rejects a non-connecting draw, reshuffles it back, and connects on the redraw — pinning the exact splice arithmetic", () => {
    // seed=1's first randBelow(_, 3) call deterministically returns value=1 (computed directly from
    // the LCG) — reinserting the rejected card `1` at largeIdx(1)+1 = index 2 of [1,8,8].
    const s = boxedIn();
    s.largePack = [1 /* N only — fails E */, 8 /* W only — connects E */, 8];
    s.seed = 1;

    const r = tryMove(s, DIR_E, true);

    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    expect(r.swaps).toEqual([{ removed: 1, drawn: 8 }]);
    // Exact splice: [1,8,8] with the rejected `1` reinserted at index 2 → [1,8,1,8]; the connecting
    // `8` at index 1 was then drawn, advancing largeIdx to 2 (one stale copy of `1` sits behind it,
    // never revisited — the pack grows by one per swap, as documented).
    expect(r.state.largePack).toEqual([1, 8, 1, 8]);
    expect(r.state.largeIdx).toBe(2);
    // The party actually moved onto the connecting card, not the rejected one.
    const placed = r.state.areas[r.state.partyArea]!;
    expect(placed.card).toBe(8);
  });

  it("exhausts the attempt budget when every remaining card fails, falling back to an ordinary dead end", () => {
    const s = boxedIn();
    s.largePack = [1, 1, 1]; // North only — none of these ever connect East
    s.seed = 42;

    const r = tryMove(s, DIR_E, true);

    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(true);
    // 3 attempts total (the loop's own bound: largePack.length(3) - largeIdx(0) at entry); the first
    // 2 rejections each produced a completed reject-and-redraw cycle, the 3rd exhausted the budget
    // and was kept as the ordinary, permanent dead-end placement (no further reinsertion).
    expect(r.swaps).toHaveLength(2);
    expect(r.state.largeIdx).toBe(3);
    expect(r.state.largePack).toHaveLength(5); // grew by exactly the 2 completed swaps
    // The final (kept) card is placed face-down and the exit is pruned, exactly like an ordinary
    // (non-swap) dead end.
    const placed = r.state.areas[r.state.areas.length - 1]!;
    expect(placed.faceUp).toBe(false);
    expect(placed.card).toBe(1);
  });

  it("byte-identity: tryMove(state, dir) and tryMove(state, dir, false) match exactly", () => {
    const s = boxedIn();
    s.largePack = [1, 1, 1];
    s.seed = 42;

    const withoutArg = tryMove(s, DIR_E);
    const explicitFalse = tryMove(s, DIR_E, false);
    expect(explicitFalse).toEqual(withoutArg);
    // A single, ordinary dead end — no swap loop ever engaged.
    expect(withoutArg.moved).toBe(false);
    expect(withoutArg.deadEnd).toBe(true);
    expect(withoutArg.swaps).toEqual([]);
    expect(withoutArg.state.largeIdx).toBe(1); // exactly one card drawn, never reinserted
    expect(withoutArg.state.largePack).toHaveLength(3); // pack never grows when the variant is off
  });

  it("retreat is excluded on purpose: the same rescuable scenario still dead-ends and locks retreat", () => {
    const s = boxedIn();
    s.largePack = [1, 8, 8]; // identical to the rescuable fixture above
    s.seed = 1;
    s.phase = "fight";
    s.fight = { surprise: 0, round: 2, focus: 0 }; // retreat is only legal after round 1
    s.variants = { forcedRedraw: true };

    const { state, events } = reduce(s, { type: "retreat", dir: DIR_E });

    // Blocked exactly as an ordinary dead end would be — no rescue, no swap, retreat locked out.
    expect(events).toEqual([{ type: "deadEnd", dir: DIR_E, retreat: true }]);
    expect(state.fight?.retreatBlocked).toBe(true);
    expect(state.largeIdx).toBe(1); // only the one card was ever drawn — no reshuffle loop ran
    expect(state.largePack).toEqual([1, 8, 8]); // untouched
  });
});

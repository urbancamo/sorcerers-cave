import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { packCoord, unpackCoord } from "./coords";
import { decodeArea } from "./decode";
import { SPECIAL_CHASM, SPECIAL_WHIRLPOOL } from "./data/areaCards";
import { GS_PLAYING, type GameState, type PartyMember } from "./state";

/**
 * Extension kit — Chasm one-way descent (US-02, SC-EXT-5) and Whirlpool crossing (US-05, SC-EXT-6).
 * Both reuse `relocateDown` (reduce.ts) verbatim: a fresh card one level down, no mirrored stair-up,
 * `fellThroughTrap` blocks withdraw at the landing (design Resolved-12).
 */

const HERO = 0;
const MAN = 5;
const DIR_N = 1;
const DIR_E = 2;
const DIR_S = 3;
const DIR_W = 4;

const member = (creatureId: number, treasure: number[] = []): PartyMember => ({
  creatureId,
  status: 0,
  dragonKills: 0,
  treasure,
});

// A Chasm tile with all four doorways: card = (SPECIAL_CHASM << 7) | NESW(15) | chamber(16) = 799,
// matching EXT_AREA_CARDS' x06-2 tile exactly (kit-data.test.ts pins decodeArea(799)).
const CHASM_CARD = (SPECIAL_CHASM << 7) | 31;
// A Whirlpool tile, same shape — matches EXT_AREA_CARDS' x07-2 tile (decodeArea(1183)).
const WHIRLPOOL_CARD = (SPECIAL_WHIRLPOOL << 7) | 31;
// A plain NESW chamber, no special — the landing card relocateDown draws.
const PLAIN_CHAMBER = 31;
// A tunnel with only a west doorway (bit 8): sits EAST of a special tile, connects back on an
// eastward move (mirrors gap-special.test.ts's PLAIN_WEST_TUNNEL).
const PLAIN_WEST_TUNNEL = 8;
// A tunnel with only a north doorway (bit 1): sits SOUTH of a special tile, connects back on a
// southward move.
const PLAIN_NORTH_TUNNEL = 1;

/** Sweep seeds until `rollDie` produces a value satisfying `want`. */
function seedForRoll(want: (v: number) => boolean, start = 1): number {
  for (let seed = start; seed < 100000; seed++) {
    if (want(rollDie(seed).value)) return seed;
  }
  throw new Error("no matching seed found");
}
const seedForSafeRoll = (start = 1) => seedForRoll((v) => v >= 3, start);
const seedForDragRoll = (start = 1) => seedForRoll((v) => v <= 2, start);

// ---------------------------------------------------------------------------------------------
// Chasm (US-02, SC-EXT-5)
// ---------------------------------------------------------------------------------------------

function chasmState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: CHASM_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    largePack: [PLAIN_CHAMBER],
    largeIdx: 0,
    ...over,
  });
}

describe("The Chasm — one-way descent (US-02, SC-EXT-5)", () => {
  it("descendChasm relocates the party one level down, onto a fresh card, with no mirrored stair-up", () => {
    const s = chasmState({ party: [member(HERO)], smallPack: [] });
    const { state, events } = reduce(s, { type: "descendChasm" });

    expect(events).toContainEqual({ type: "chasmDescend" });
    expect(state.level).toBe(2);
    const landing = state.areas[state.partyArea]!;
    expect(unpackCoord(landing.coord)).toEqual({ level: 2, x: 50, y: 50 });
    expect(landing.card).toBe(PLAIN_CHAMBER); // drawn fresh from the large pack
    expect(landing.mirroredStairs).toBeUndefined(); // no return stair mirrored (one-way trap semantics)
    expect(decodeArea(landing.card).stairUp).toBe(false);
    expect(state.fellThroughTrap).toBe(true);
  });

  it("withdraw is illegal at the landing (fellThroughTrap blocks it, same as any trap fall)", () => {
    // Populate the landing chamber with a stranger so it lands in "encounter" phase.
    const s = chasmState({ party: [member(HERO)], smallPack: [100 + MAN] });
    const { state } = reduce(s, { type: "descendChasm" });

    expect(state.phase).toBe("encounter");
    expect(legalActions(state)).not.toContainEqual({ type: "withdraw" });
    const blocked = reduce(state, { type: "withdraw" });
    expect(blocked.events).toEqual([{ type: "blocked" }]);
  });

  it("legalActions offers descendChasm on a Chasm tile but not on an ordinary tile", () => {
    const onChasm = chasmState({ party: [member(HERO)] });
    expect(legalActions(onChasm)).toContainEqual({ type: "descendChasm" });

    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)] });
    expect(decodeArea(gateway.areas[0]!.card).special).not.toBe(SPECIAL_CHASM);
    expect(legalActions(gateway)).not.toContainEqual({ type: "descendChasm" });
  });

  it("reduce blocks descendChasm off a non-Chasm tile", () => {
    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)] });
    expect(decodeArea(gateway.areas[0]!.card).special).not.toBe(SPECIAL_CHASM);
    const { events } = reduce(gateway, { type: "descendChasm" });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("descendChasm is legal mid-encounter too, and parks the pending strangers back onto the chasm tile", () => {
    const s = chasmState({
      party: [member(HERO)],
      phase: "encounter",
      strangers: [MAN],
      smallPack: [], // the landing chamber draws nothing, so it resolves straight to explore
    });
    expect(legalActions(s)).toContainEqual({ type: "descendChasm" });

    const { state, events } = reduce(s, { type: "descendChasm" });
    expect(events).toContainEqual({ type: "chasmDescend" });
    expect(state.strangers).toEqual([]); // the working set was cleared before descending
    expect(state.areas[0]!.contents).toContain(100 + MAN); // parked on the chasm tile, not lost
    expect(state.level).toBe(2); // still fell through, undeterred by the abandoned encounter
  });

  it("a FRESH arrival draws nothing — unlike Whirlpool, the Chasm never draws a chamber (bug fix 2026-08-02)", () => {
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      areas: [
        { card: PLAIN_CHAMBER, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
      prev: 0,
      party: [member(HERO)],
      largePack: [CHASM_CARD],
      largeIdx: 0,
      smallPack: [100 + MAN], // present so a bugged draw would be visible
      smallIdx: 0,
    });
    const { state } = reduce(s, { type: "move", dir: DIR_E });

    const landed = state.areas[state.partyArea]!;
    expect(decodeArea(landed.card).special).toBe(SPECIAL_CHASM);
    expect(landed.visited).toBe(true); // still marked visited, so a later re-entry isn't "fresh" again
    expect(state.strangers).toEqual([]);
    expect(state.treasures).toEqual([]);
    expect(state.hazards).toEqual([]);
    expect(state.smallIdx).toBe(0); // the small pack is never touched by a Chasm entry
    expect(state.phase).toBe("explore"); // no encounter/pickup triggered by an (absent) draw
  });
});

// ---------------------------------------------------------------------------------------------
// Whirlpool (US-05, SC-EXT-6)
// ---------------------------------------------------------------------------------------------

/** A game where the party stands ON the Whirlpool (idx 0), having entered from the west (idx 1,
 *  already placed) — so moving west again is a retrace, and any other exit is a genuine crossing. */
function whirlpoolState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: WHIRLPOOL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      { card: 2 /* E-only */, coord: packCoord(1, 49, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 1,
    largePack: [PLAIN_WEST_TUNNEL],
    largeIdx: 0,
    ...over,
  });
}

describe("The Whirlpool — crossing roll (US-05, SC-EXT-6)", () => {
  it("leaving by the entry direction (retracing) fires no roll", () => {
    const s = whirlpoolState({ party: [member(HERO)] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_W });

    expect(events.some((e) => e.type === "whirlpoolRoll")).toBe(false);
    expect(state.partyArea).toBe(1);
  });

  // Precise Locations (§10.5, §8.1): entering from the west, the ledge only reaches the two
  // ADJACENT doorways (N/S) — straight across to E is now blocked (kit-descents.test.ts was
  // written before that gate existed and used E throughout; the crossings below moved to S,
  // reusing PLAIN_NORTH_TUNNEL — "sits SOUTH of a special tile, connects back on a southward
  // move" — as the freshly-drawn landing card). See precise-locations.test.ts for the gate itself.

  it("a roll of 1-2 drags the whole party down one level, cancelling the lateral move", () => {
    const seed = seedForDragRoll();
    const s = whirlpoolState({ party: [member(HERO)], seed, largePack: [PLAIN_NORTH_TUNNEL, PLAIN_CHAMBER] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });

    const roll = events.find((e) => e.type === "whirlpoolRoll");
    expect(roll).toMatchObject({ dragged: true });
    expect((roll as { roll: number }).roll).toBeLessThanOrEqual(2);
    // The lateral move never happened: the party is one level below the WHIRLPOOL's own coords,
    // not below the southward tile it tried to move onto.
    expect(state.level).toBe(2);
    expect(unpackCoord(state.areas[state.partyArea]!.coord)).toEqual({ level: 2, x: 50, y: 50 });
    expect(state.fellThroughTrap).toBe(true);
    // The cancelled lateral move must leave no trace: tryMove already placed a fresh, face-up
    // tile at (1,50,51) and burned largePack[0] for it BEFORE the roll — undoing the move must pop
    // that phantom tile and give its card back, so only relocateDown's OWN landing draw remains.
    // Areas: whirlpool(0) + west origin(1) [both pre-placed by whirlpoolState] + relocateDown's
    // landing = 3, not 4 (the leaked phantom southward tile would make it 4). largeIdx: exactly one
    // draw consumed (the landing, off the now-restored largePack[0]) = 1, not 2.
    expect(state.areas.length).toBe(3);
    expect(state.areas.some((a) => unpackCoord(a.coord).y === 51 && unpackCoord(a.coord).level === 1)).toBe(false);
    expect(state.largeIdx).toBe(1);
  });

  it("an explored-target drag pops nothing and burns no extra card (undo is a no-op when tryMove found an existing area)", () => {
    const seed = seedForDragRoll();
    // Pre-place the southward target (already explored) so tryMove takes its "existing area" branch —
    // no push, no largePack draw — before the whirlpool roll ever fires.
    const southTile = { card: PLAIN_NORTH_TUNNEL, coord: packCoord(1, 50, 51), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = whirlpoolState({
      party: [member(HERO)],
      seed,
      areas: [
        { card: WHIRLPOOL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 2, coord: packCoord(1, 49, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        southTile,
      ],
      largePack: [PLAIN_CHAMBER], // nothing to draw for the (already-placed) lateral target
      largeIdx: 0,
    });
    const areasBefore = s.areas.length; // 3: whirlpool, origin, pre-placed south tile

    const { state } = reduce(s, { type: "move", dir: DIR_S });

    // Only relocateDown's landing is new — the pre-existing south tile is untouched, not popped.
    expect(state.areas.length).toBe(areasBefore + 1);
    expect(state.areas.some((a) => unpackCoord(a.coord).level === 1 && unpackCoord(a.coord).y === 51)).toBe(true);
    expect(state.largeIdx).toBe(1); // exactly one draw — the landing — nothing consumed for the lateral part
  });

  it("a roll of 3-6 lets the lateral move complete normally", () => {
    const seed = seedForSafeRoll();
    const s = whirlpoolState({ party: [member(HERO)], seed, largePack: [PLAIN_NORTH_TUNNEL] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });

    const roll = events.find((e) => e.type === "whirlpoolRoll");
    expect(roll).toMatchObject({ dragged: false });
    expect((roll as { roll: number }).roll).toBeGreaterThanOrEqual(3);
    expect(state.level).toBe(1); // no descent — the party arrives on the lateral tile
    expect(unpackCoord(state.areas[state.partyArea]!.coord)).toEqual({ level: 1, x: 50, y: 51 });
    expect(state.fellThroughTrap).toBe(false);
  });

  it("withdraw is illegal at a dragged-down landing (fellThroughTrap), same as a trap fall", () => {
    const seed = seedForDragRoll();
    // A single card: PLAIN_CHAMBER (a NESW chamber) has a N-facing door, so tryMove accepts it for
    // the (soon-cancelled) southward attempt; the fix gives it back, and relocateDown redraws the
    // SAME card off the top of the pack for the landing — which must be a real chamber so the
    // landing can actually draw a stranger into an encounter.
    const s = whirlpoolState({
      party: [member(HERO)],
      seed,
      largePack: [PLAIN_CHAMBER],
      smallPack: [100 + MAN],
    });
    const { state } = reduce(s, { type: "move", dir: DIR_S });

    expect(state.phase).toBe("encounter");
    expect(legalActions(state)).not.toContainEqual({ type: "withdraw" });
  });

  it("repeated crossings of the same Whirlpool each roll their own d6", () => {
    // Cross south safely (a genuine crossing — prev was the west tile; S is adjacent to a W entry),
    // then come back onto the Whirlpool (a retrace, no roll — now entering via the SOUTH doorway),
    // then leave again to the east (adjacent to a S entry — a second genuine crossing).
    const seed = seedForSafeRoll();
    const s = whirlpoolState({ party: [member(HERO)], seed, largePack: [PLAIN_NORTH_TUNNEL, PLAIN_WEST_TUNNEL] });

    const first = reduce(s, { type: "move", dir: DIR_S });
    const firstRoll = first.events.find((e) => e.type === "whirlpoolRoll");
    expect(firstRoll).toMatchObject({ dragged: false });
    expect(first.state.partyArea).toBe(2); // the freshly-drawn southward tile
    expect(first.state.prev).toBe(0); // came from the Whirlpool

    const back = reduce(first.state, { type: "move", dir: DIR_N });
    expect(back.events.some((e) => e.type === "whirlpoolRoll")).toBe(false); // entering, not a crossing
    expect(back.state.partyArea).toBe(0);
    expect(back.state.prev).toBe(2);

    const second = reduce(back.state, { type: "move", dir: DIR_E });
    const secondRoll = second.events.find((e) => e.type === "whirlpoolRoll");
    expect(secondRoll).toBeDefined(); // a fresh roll fires again — not a one-time/cached flag
    expect(second.state.seed).not.toBe(back.state.seed); // the seed genuinely advanced for this roll
  });
});

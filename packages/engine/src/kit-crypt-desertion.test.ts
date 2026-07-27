import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { packCoord } from "./coords";
import { applyHazards } from "./hazards";
import { HAZARD_DESERTION, HAZARD_TRAP } from "./data/hazards";
import { GS_DEAD, GS_PLAYING, type GameState, type PartyMember } from "./state";

/**
 * Extension kit — the Crypt's draw-classify park + turn-start entry roll (US-08, SC-EXT-13) and
 * Desertion's per-ally hazard rolls (US-09, SC-EXT-14). Neither is tied to a tile special: the Crypt
 * is an ordinary TREASURE card (id 21) that can be drawn in any chamber; Desertion is an ordinary
 * HAZARD card (id 5) resolved by `applyHazards` like Mutiny/Trap. kit-descents/kit-well-bell/
 * kit-lair-gallery's fixture style (force the exact card into a small `smallPack`) is reused here.
 */

const HERO = 0;
const MAN = 5;
const WOMAN = 6;
const DWARF = 7;
const WIZARD = 8;
const WOLF = 20;
const T_CRYPT = 21;

const DIR_E = 2;

const member = (creatureId: number, status: 0 | 1 | 2 | 3 = 0, treasure: number[] = [], borne?: number[]): PartyMember => ({
  creatureId,
  status,
  dragonKills: 0,
  treasure,
  ...(borne ? { borne } : {}),
});

/** Sweep seeds until `rollDie` produces a value satisfying `want` (kit-descents.test.ts pattern). */
function seedForRoll(want: (v: number) => boolean, start = 1): number {
  for (let seed = start; seed < 100000; seed++) {
    if (want(rollDie(seed).value)) return seed;
  }
  throw new Error("no matching seed found");
}
const seedForTrap = (start = 1) => seedForRoll((v) => v <= 2, start);
const seedForFind = (start = 1) => seedForRoll((v) => v >= 3, start);

/** Sweep seeds until a SEQUENCE of `rollDie` calls (each seeded by the previous one's output)
 *  satisfies one predicate per roll, in order — for pinning multi-roll hazards like Desertion. */
function seedForSequence(wants: ((v: number) => boolean)[], start = 1): number {
  outer: for (let seed = start; seed < 200000; seed++) {
    let s = seed;
    for (const want of wants) {
      const r = rollDie(s);
      if (!want(r.value)) continue outer;
      s = r.seed;
    }
    return seed;
  }
  throw new Error("no matching seed sequence found");
}
const DESERTS = (v: number) => v <= 2;
const STAYS = (v: number) => v >= 3;

// ---------------------------------------------------------------------------------------------
// The Crypt (US-08, SC-EXT-13)
// ---------------------------------------------------------------------------------------------

// A plain NESW chamber — the Crypt isn't tied to a tile special; it's a treasure CARD (id 21) that
// can be drawn in any chamber. `level: 1` draws exactly one code on first entry (min(level,4)=1).
const PLAIN_CHAMBER = 31;
const START_CARD = 2; // East-only doorway, matching the other kit test files' convention

function cryptState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    level: 1,
    areas: [
      { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    largePack: [PLAIN_CHAMBER],
    largeIdx: 0,
    smallPack: [200 + T_CRYPT],
    smallIdx: 0,
    ...over,
  });
}

describe("The Crypt — draw-classify park (US-08, SC-EXT-13)", () => {
  it("parks as the crypt when drawn — it never lies as floor treasure, and nothing else fires", () => {
    const s = cryptState({ party: [member(HERO)] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.cryptCoord).toBe(packCoord(1, 51, 50));
    expect(state.treasures).toEqual([]);
    expect(state.phase).toBe("explore"); // nothing else was drawn — the party moves straight through
    const drew = events.find((e) => e.type === "drewChamber") as { treasures: number[] };
    expect(drew.treasures).toEqual([]); // the crypt is invisible to the ordinary chamber-draw report
  });

  it("legalActions offers enterCrypt only at rest on the crypt's own area — not elsewhere, not mid-encounter/pickup", () => {
    const parked = reduce(cryptState({ party: [member(HERO)] }), { type: "move", dir: DIR_E });
    expect(legalActions(parked.state)).toContainEqual({ type: "enterCrypt" });

    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)] });
    expect(legalActions(gateway)).not.toContainEqual({ type: "enterCrypt" });

    const midEncounter: GameState = { ...parked.state, phase: "encounter", strangers: [MAN] };
    expect(legalActions(midEncounter)).not.toContainEqual({ type: "enterCrypt" });

    const midPickup: GameState = { ...parked.state, phase: "pickup", treasures: [1] };
    expect(legalActions(midPickup)).not.toContainEqual({ type: "enterCrypt" });
  });

  it("reduce blocks enterCrypt off the crypt's area, and when there is no parked crypt at all", () => {
    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)] });
    expect(reduce(gateway, { type: "enterCrypt" }).events).toEqual([{ type: "blocked" }]);

    const parked = reduce(cryptState({ party: [member(HERO)] }), { type: "move", dir: DIR_E });
    // Standing back on the START tile (crypt is one area over): blocked.
    const backAtStart: GameState = { ...parked.state, partyArea: 0 };
    expect(reduce(backAtStart, { type: "enterCrypt" }).events).toEqual([{ type: "blocked" }]);
  });

  it("reduce blocks enterCrypt outside explore phase, even while standing on the crypt's own area", () => {
    const parked = reduce(cryptState({ party: [member(HERO)] }), { type: "move", dir: DIR_E });
    const midEncounter: GameState = { ...parked.state, phase: "encounter", strangers: [MAN] };
    expect(reduce(midEncounter, { type: "enterCrypt" }).events).toEqual([{ type: "blocked" }]);
  });

  it("a roll of 1-2 is an unavoidable trap: the WHOLE party falls, a living Dwarf does NOT save them, and withdraw is blocked at the landing", () => {
    const seed = seedForTrap();
    const s = cryptState({ party: [member(HERO), member(DWARF)], seed, largePack: [PLAIN_CHAMBER, PLAIN_CHAMBER] });
    const parked = reduce(s, { type: "move", dir: DIR_E });
    expect(parked.state.cryptCoord).toBeDefined();

    const { state, events } = reduce(parked.state, { type: "enterCrypt" });
    const roll = events.find((e) => e.type === "cryptRoll") as { roll: number };
    expect(roll.roll).toBeLessThanOrEqual(2);
    expect(events).toContainEqual({ type: "cryptRoll", roll: roll.roll, outcome: "trap" });
    expect(events.some((e) => e.type === "trapAvoided")).toBe(false); // the Dwarf's guide-past-trap does not apply here
    expect(state.level).toBe(2); // the WHOLE party fell, Dwarf included
    expect(state.party).toHaveLength(2);
    expect(state.fellThroughTrap).toBe(true);
    expect(state.cryptCoord).toBeUndefined(); // spent — no second entry
    expect(legalActions(state)).not.toContainEqual({ type: "withdraw" });
    expect(reduce(state, { type: "withdraw" }).events).toEqual([{ type: "blocked" }]);
  });

  it("a roll of 3-6 finds gems: the crypt converts to floor treasure 21, gated by carry capacity", () => {
    const seed = seedForFind();
    const s = cryptState({ party: [member(HERO)], seed });
    const parked = reduce(s, { type: "move", dir: DIR_E });

    const { state, events } = reduce(parked.state, { type: "enterCrypt" });
    const roll = events.find((e) => e.type === "cryptRoll") as { roll: number };
    expect(roll.roll).toBeGreaterThanOrEqual(3);
    expect(events).toContainEqual({ type: "cryptRoll", roll: roll.roll, outcome: "find" });
    expect(state.treasures).toEqual([T_CRYPT]);
    expect(state.phase).toBe("pickup");
    expect(state.cryptCoord).toBeUndefined(); // spent — no second entry
    // 25 kg, carry-gated like any heavy treasure: a Hero (carry 75) may take it, a Wizard (carry 0) may not.
    expect(legalActions(state)).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });

  it("the 25 kg find respects carry capacity — an empty-handed carrier is offered it, a zero-capacity one is not", () => {
    const seed = seedForFind();
    const s = cryptState({ party: [member(WIZARD)], seed }); // Wizard: carry 0
    const parked = reduce(s, { type: "move", dir: DIR_E });
    const { state } = reduce(parked.state, { type: "enterCrypt" });
    expect(state.treasures).toEqual([T_CRYPT]);
    expect(legalActions(state)).not.toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });

  it("either outcome removes the parked crypt — legalActions never offers enterCrypt again on a later visit", () => {
    const seed = seedForFind();
    const s = cryptState({ party: [member(HERO)], seed });
    const parked = reduce(s, { type: "move", dir: DIR_E });
    const found = reduce(parked.state, { type: "enterCrypt" });
    const left = reduce({ ...found.state, treasures: [] }, { type: "move", dir: 4 }); // withdraw west back to start
    const back = reduce(left.state, { type: "move", dir: DIR_E }); // re-enter the (already-visited) crypt area
    expect(legalActions(back.state)).not.toContainEqual({ type: "enterCrypt" });
  });

  it("a Well/Bell extra draw parks the crypt exactly like a fresh chamber entry (shared classify)", () => {
    const s = cryptState({
      party: [member(HERO)],
      areas: [
        { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      smallPack: [], // nothing on first entry
    });
    const entered = reduce(s, { type: "move", dir: DIR_E });
    expect(entered.state.cryptCoord).toBeUndefined();
    expect(entered.state.phase).toBe("explore");

    // Force an extra draw into the now-current (already-visited) area via the internal draw helper's
    // public surface: simulate by re-entering with the crypt code now sitting in the small pack and
    // `visited` reset would re-run the fresh-entry path instead — so exercise the shared `classify`
    // codepath directly through a Well tile instead, proving it isn't Gallery/Lair-special-cased.
    const wellArea = { card: (11 << 7) | 31, coord: packCoord(1, 52, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const onWell: GameState = {
      ...entered.state,
      areas: [...entered.state.areas, wellArea],
      partyArea: entered.state.areas.length,
      smallPack: [200 + T_CRYPT],
      smallIdx: 0,
    };
    const drawn = reduce(onWell, { type: "drawFromWell" });
    expect(drawn.state.cryptCoord).toBe(wellArea.coord);
    expect(drawn.state.treasures).toEqual([]); // still parked, not floor treasure
    expect(legalActions(drawn.state)).toContainEqual({ type: "enterCrypt" });
  });
});

// ---------------------------------------------------------------------------------------------
// Desertion (US-09, SC-EXT-14)
// ---------------------------------------------------------------------------------------------

describe("Desertion — per-ally rolls, removal, Wolf immunity (US-09, SC-EXT-14)", () => {
  it("rolls once per ally in roster order; original (status 0) members never roll", () => {
    const seed = seedForSequence([DESERTS, STAYS]);
    const s = makeState({
      party: [
        member(HERO, 0),                 // original — never rolls
        member(MAN, 1, [1]),             // ally, carrying Gold — will desert
        member(WOMAN, 1, [3], [3]),      // ally, BEARING the Magic Sword — will stay
      ],
      hazards: [HAZARD_DESERTION],
      seed,
    });
    const { events } = applyHazards(s);

    const rolls = events.filter((e) => e.type === "desertionRoll");
    expect(rolls).toHaveLength(2); // only the two allies rolled
    expect(rolls).toContainEqual(expect.objectContaining({ creatureId: MAN, deserted: true }));
    expect(rolls).toContainEqual(expect.objectContaining({ creatureId: WOMAN, deserted: false }));
  });

  it("a deserting ally is removed from the game WITH everything carried, borne included — not dropped, not dead", () => {
    const seed = seedForRoll((v) => v <= 2);
    const s = makeState({
      party: [
        member(HERO, 0),
        member(MAN, 1, [1, 3], [3]), // ally carrying Gold + a BORNE Magic Sword
      ],
      hazards: [HAZARD_DESERTION],
      treasures: [],
      seed,
    });
    const { events } = applyHazards(s);

    expect(s.party.map((m) => m.creatureId)).toEqual([HERO]); // the deserter is gone entirely
    expect(events.some((e) => e.type === "memberDied")).toBe(false); // Desertion, not death
    expect(s.treasures).toEqual([]); // nothing spills to the floor — it leaves the game with them
  });

  it("skips a Wolf ally with a visible notice — no roll for it, and it never deserts", () => {
    const s = makeState({
      party: [member(HERO, 0), member(WOLF, 1)],
      hazards: [HAZARD_DESERTION],
    });
    const { events } = applyHazards(s);

    expect(events).toContainEqual({ type: "wolfUnmoved" });
    expect(events.some((e) => e.type === "desertionRoll")).toBe(false);
    expect(s.party).toHaveLength(2); // the Wolf stays, unconditionally
  });

  it("emits a desertionRoll for every ally and removes no one when every roll stays (all-stay path)", () => {
    const seed = seedForSequence([STAYS, STAYS]);
    const s = makeState({
      party: [member(HERO, 0), member(MAN, 1), member(WOMAN, 1)],
      hazards: [HAZARD_DESERTION],
      seed,
    });
    const { events } = applyHazards(s);

    const rolls = events.filter((e) => e.type === "desertionRoll");
    expect(rolls).toHaveLength(2);
    expect(rolls.every((r) => "deserted" in r && r.deserted === false)).toBe(true);
    expect(s.party).toHaveLength(3); // nobody removed
  });

  it("does nothing (no rolls, no removals) when the party has no allies at all", () => {
    const s = makeState({ party: [member(HERO, 0)], hazards: [HAZARD_DESERTION] });
    const { events } = applyHazards(s);
    expect(events.some((e) => e.type === "desertionRoll")).toBe(false);
    expect(events.some((e) => e.type === "wolfUnmoved")).toBe(false);
    expect(s.party).toHaveLength(1);
  });

  it("fires strictly AFTER Trap in the fixed hazard order, in the same pass", () => {
    const s = makeState({
      party: [member(DWARF, 0), member(MAN, 1)], // Dwarf avoids the trap; the Man ally still rolls
      hazards: [HAZARD_DESERTION, HAZARD_TRAP], // insertion order is irrelevant — `order` decides
    });
    const { events, fell } = applyHazards(s);
    expect(fell).toBe(false); // the Dwarf guides the party past the trap
    const trapIdx = events.findIndex((e) => e.type === "hazardFired" && e.hazard === HAZARD_TRAP);
    const desertionIdx = events.findIndex((e) => e.type === "hazardFired" && e.hazard === HAZARD_DESERTION);
    expect(trapIdx).toBeGreaterThanOrEqual(0);
    expect(desertionIdx).toBeGreaterThan(trapIdx);
  });

  it("fires immediately when drawn in a chamber, via the normal hazard-phase pipeline", () => {
    const seed = seedForRoll((v) => v <= 2);
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      level: 1,
      party: [member(HERO, 0), member(MAN, 1)],
      areas: [{ card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0,
      prev: 0,
      largePack: [31],
      largeIdx: 0,
      smallPack: [300 + HAZARD_DESERTION],
      smallIdx: 0,
      seed,
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(events).toContainEqual({ type: "hazardFired", hazard: HAZARD_DESERTION });
    expect(events.some((e) => e.type === "desertionRoll")).toBe(true);
    expect(state.party.map((m) => m.creatureId)).toEqual([HERO]); // the ally deserted immediately
  });

  it("ends the game if Desertion removes the last living member", () => {
    const seed = seedForRoll((v) => v <= 2);
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      level: 1,
      party: [member(MAN, 1)], // sole member is an ALLY — no originals left in this hypothetical
      areas: [{ card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0,
      prev: 0,
      largePack: [31],
      largeIdx: 0,
      smallPack: [300 + HAZARD_DESERTION],
      smallIdx: 0,
      seed,
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.party).toHaveLength(0);
    expect(state.gs).toBe(GS_DEAD);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_DEAD });
  });
});

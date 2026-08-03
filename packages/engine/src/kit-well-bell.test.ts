import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { rollDie } from "./rng";
import { packCoord, DIR_E } from "./coords";
import { SPECIAL_WELL, SPECIAL_BELL_ROPE } from "./data/areaCards";
import { HAZARD_TRAP, HAZARD_MEDUSA } from "./data/hazards";
import { GS_PLAYING, GS_DEAD, AF_BELL_SPENT, type GameState, type PartyMember } from "./state";

/**
 * Extension kit — the Well's repeatable draw (US-07, SC-EXT-7) and the Bell Rope's one-shot d6
 * (US-03, SC-EXT-8), plus the shared no-withdraw-turn condition (SC-EXT-9). Both reuse the chamber
 * draw path (`drawSmallCards`, chamber.ts) and the same tail as a fresh chamber entry
 * (`resolveExtraDraw`, reduce.ts) — kit-descents.test.ts pioneered the force-placed-special-tile
 * fixture style this file follows.
 */

const HERO = 0;
const MAN = 5;

const member = (creatureId: number, treasure: number[] = [], status: 0 | 1 | 2 | 3 = 0): PartyMember => ({
  creatureId,
  status,
  dragonKills: 0,
  treasure,
});

// A Well/Bell Rope tile with all four doorways: card = (SPECIAL << 7) | NESW(15) | chamber(16),
// matching EXT_AREA_CARDS' x07-4 (1439) / x06-4 (927) tiles exactly (kit-data.test.ts pins both).
const WELL_CARD = (SPECIAL_WELL << 7) | 31;
const BELL_CARD = (SPECIAL_BELL_ROPE << 7) | 31;

/** Sweep seeds until `rollDie` produces a value satisfying `want` (kit-descents.test.ts pattern). */
function seedForRoll(want: (v: number) => boolean, start = 1): number {
  for (let seed = start; seed < 100000; seed++) {
    if (want(rollDie(seed).value)) return seed;
  }
  throw new Error("no matching seed found");
}
const seedForVanish = (start = 1) => seedForRoll((v) => v === 1, start);
const seedForToll = (start = 1) => seedForRoll((v) => v === 2 || v === 3, start);
const seedForStir = (start = 1) => seedForRoll((v) => v >= 4, start);

// ---------------------------------------------------------------------------------------------
// The Well (US-07, SC-EXT-7)
// ---------------------------------------------------------------------------------------------

function wellState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: WELL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    smallPack: [],
    smallIdx: 0,
    ...over,
  });
}

describe("The Well — repeatable draw, no-withdraw turn (US-07, SC-EXT-7, SC-EXT-9)", () => {
  it("legalActions offers drawFromWell on a Well tile with a non-empty pack, not off it or once exhausted", () => {
    const onWell = wellState({ party: [member(HERO)], smallPack: [100 + MAN] });
    expect(legalActions(onWell)).toContainEqual({ type: "drawFromWell" });

    const exhausted = wellState({ party: [member(HERO)], smallPack: [100 + MAN], smallIdx: 1 });
    expect(legalActions(exhausted)).not.toContainEqual({ type: "drawFromWell" });

    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)], smallPack: [100 + MAN] });
    expect(legalActions(gateway)).not.toContainEqual({ type: "drawFromWell" });
  });

  it("reduce blocks drawFromWell off a Well tile and when the small pack is exhausted", () => {
    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)], smallPack: [100 + MAN] });
    expect(reduce(gateway, { type: "drawFromWell" }).events).toEqual([{ type: "blocked" }]);

    const exhausted = wellState({ party: [member(HERO)], smallPack: [100 + MAN], smallIdx: 1 });
    expect(reduce(exhausted, { type: "drawFromWell" }).events).toEqual([{ type: "blocked" }]);
  });

  it("draws exactly one code into the area and blocks withdraw for the turn only", () => {
    const s = wellState({ party: [member(HERO)], smallPack: [100 + MAN, 100 + MAN], turn: 3 });
    const { state, events } = reduce(s, { type: "drawFromWell" });

    expect(events).toContainEqual({ type: "wellDraw" });
    expect(state.smallIdx).toBe(1); // exactly one card consumed, not two
    expect(state.strangers).toEqual([MAN]); // strangers resolve normally afterward
    expect(state.phase).toBe("encounter");
    expect(state.noWithdrawTurn).toBe(3);
    expect(legalActions(state)).not.toContainEqual({ type: "withdraw" });
    expect(reduce(state, { type: "withdraw" }).events).toEqual([{ type: "blocked" }]);
  });

  it("withdraw is legal again once the turn has moved past the draw", () => {
    const s = wellState({ party: [member(HERO)], smallPack: [100 + MAN], turn: 3 });
    const { state } = reduce(s, { type: "drawFromWell" });
    expect(state.noWithdrawTurn).toBe(3);

    const nextTurn = { ...state, turn: 4 };
    expect(legalActions(nextTurn)).toContainEqual({ type: "withdraw" });
    expect(reduce(nextTurn, { type: "withdraw" }).events).not.toEqual([{ type: "blocked" }]);
  });

  it("is repeatable: successive draws each pull one more code into the area, even mid-encounter", () => {
    const s = wellState({ party: [member(HERO)], smallPack: [100 + MAN, 100 + MAN] });
    const first = reduce(s, { type: "drawFromWell" });
    expect(first.state.strangers).toEqual([MAN]);
    expect(legalActions(first.state)).toContainEqual({ type: "drawFromWell" }); // no spent flag

    const second = reduce(first.state, { type: "drawFromWell" });
    expect(second.events).toContainEqual({ type: "wellDraw" });
    expect(second.state.strangers).toEqual([MAN, MAN]);
    expect(second.state.smallIdx).toBe(2);
  });

  it("a FRESH arrival draws nothing — drawing is conditional on the player choosing drawFromWell (bug fix 2026-08-03)", () => {
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      areas: [
        { card: 31 /* plain NESW chamber */, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
      prev: 0,
      party: [member(HERO)],
      largePack: [WELL_CARD],
      largeIdx: 0,
      smallPack: [100 + MAN], // present so a bugged draw would be visible
      smallIdx: 0,
    });
    const { state } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.strangers).toEqual([]);
    expect(state.treasures).toEqual([]);
    expect(state.hazards).toEqual([]);
    expect(state.smallIdx).toBe(0); // the small pack is never touched by mere arrival
    expect(state.phase).toBe("explore"); // no encounter triggered by an (absent) arrival draw
    expect(legalActions(state)).toContainEqual({ type: "drawFromWell" }); // still available, on demand
  });
});

// ---------------------------------------------------------------------------------------------
// The Bell Rope (US-03, SC-EXT-8)
// ---------------------------------------------------------------------------------------------

function bellState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: BELL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    smallPack: [],
    smallIdx: 0,
    ...over,
  });
}

describe("The Bell Rope — a visible d6 in three bands (US-03, SC-EXT-8)", () => {
  it("legalActions offers pullBellRope for each living member on an unspent Bell Rope tile", () => {
    const onBell = bellState({ party: [member(HERO), member(MAN, [], 3)] }); // 2nd member is dead
    expect(legalActions(onBell)).toContainEqual({ type: "pullBellRope", mi: 0 });
    expect(legalActions(onBell)).not.toContainEqual({ type: "pullBellRope", mi: 1 }); // dead — not offered

    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)] });
    expect(legalActions(gateway)).not.toContainEqual({ type: "pullBellRope", mi: 0 });
  });

  it("legalActions no longer offers pullBellRope once the rope is spent (AF_BELL_SPENT)", () => {
    const spent = bellState({
      party: [member(HERO)],
      areas: [{ card: BELL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: AF_BELL_SPENT, indiffCount: 0 }],
    });
    expect(legalActions(spent)).not.toContainEqual({ type: "pullBellRope", mi: 0 });
  });

  it("reduce blocks pullBellRope off a Bell Rope tile, for a dead/missing member, or once spent", () => {
    const gateway = makeState({ gs: GS_PLAYING, phase: "explore", party: [member(HERO)] });
    expect(reduce(gateway, { type: "pullBellRope", mi: 0 }).events).toEqual([{ type: "blocked" }]);

    const s = bellState({ party: [member(HERO)] });
    expect(reduce(s, { type: "pullBellRope", mi: 5 }).events).toEqual([{ type: "blocked" }]); // no such member

    const dead = bellState({ party: [member(HERO, [], 3)] });
    expect(reduce(dead, { type: "pullBellRope", mi: 0 }).events).toEqual([{ type: "blocked" }]);

    const spent = bellState({
      party: [member(HERO)],
      areas: [{ card: BELL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: AF_BELL_SPENT, indiffCount: 0 }],
    });
    expect(reduce(spent, { type: "pullBellRope", mi: 0 }).events).toEqual([{ type: "blocked" }]);
  });

  it("roll 1: the puller vanishes with everything carried, including a BORNE item — not dead, not revivable (Resolved-3)", () => {
    const GOLD = 1;
    const MAGIC_SWORD = 3;
    const seed = seedForVanish();
    const puller: PartyMember = { creatureId: HERO, status: 0, dragonKills: 0, treasure: [GOLD, MAGIC_SWORD], borne: [MAGIC_SWORD] };
    const s = bellState({ party: [puller, member(MAN)], seed });
    const { state, events } = reduce(s, { type: "pullBellRope", mi: 0 });

    expect(events).toContainEqual({ type: "bellRoll", roll: 1, outcome: "vanish", creatureId: HERO });
    expect(events.some((e) => e.type === "memberDied")).toBe(false); // Desertion semantics, not death
    expect(state.party).toHaveLength(1);
    expect(state.party[0]!.creatureId).toBe(MAN); // the Hero — and their Gold — are simply gone
    expect((state.areas[0]!.flags & AF_BELL_SPENT) !== 0).toBe(true);
    // Everything carried leaves the game with them — not spilled to the floor (unlike a death), not
    // picked up by anyone, and the BORNE Magic Sword is just as gone as the merely-carried Gold.
    expect(state.treasures).toEqual([]);
    expect(state.areas[0]!.contents).not.toContain(200 + GOLD);
    expect(state.areas[0]!.contents).not.toContain(200 + MAGIC_SWORD);
    expect(state.party.every((m) => !m.treasure.includes(GOLD) && !m.treasure.includes(MAGIC_SWORD))).toBe(true);
  });

  it("roll 1 on the last living member empties the party and ends the game", () => {
    const seed = seedForVanish();
    const s = bellState({ party: [member(HERO)], seed });
    const { state, events } = reduce(s, { type: "pullBellRope", mi: 0 });

    expect(state.party).toHaveLength(0);
    expect(state.gs).toBe(GS_DEAD);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_DEAD });
  });

  it("roll 2-3: foreboding narration only — no mechanical effect", () => {
    const seed = seedForToll();
    const s = bellState({ party: [member(HERO)], seed, smallPack: [100 + MAN] });
    const { state, events } = reduce(s, { type: "pullBellRope", mi: 0 });

    const roll = events.find((e) => e.type === "bellRoll") as { roll: number };
    expect(roll.roll).toBeGreaterThanOrEqual(2);
    expect(roll.roll).toBeLessThanOrEqual(3);
    expect(events).toContainEqual({ type: "bellRoll", roll: roll.roll, outcome: "toll", creatureId: HERO });
    expect(state.party).toHaveLength(1); // the puller is unaffected
    expect(state.smallIdx).toBe(0); // no cards drawn
    expect(state.strangers).toEqual([]);
    expect(state.noWithdrawTurn).toBeUndefined();
    expect(state.phase).toBe("explore"); // unchanged
    expect((state.areas[0]!.flags & AF_BELL_SPENT) !== 0).toBe(true); // still spent — one pull, ever
  });

  it("roll 4-6: two cards are drawn into the area and withdraw is blocked this turn", () => {
    const seed = seedForStir();
    const s = bellState({ party: [member(HERO)], seed, smallPack: [100 + MAN, 100 + MAN], turn: 2 });
    const { state, events } = reduce(s, { type: "pullBellRope", mi: 0 });

    const roll = events.find((e) => e.type === "bellRoll") as { roll: number };
    expect(roll.roll).toBeGreaterThanOrEqual(4);
    expect(events).toContainEqual({ type: "bellRoll", roll: roll.roll, outcome: "stir", creatureId: HERO });
    expect(state.smallIdx).toBe(2); // both codes drawn
    expect(state.strangers).toEqual([MAN, MAN]); // strangers test/fight as usual
    expect(state.phase).toBe("encounter");
    expect(state.noWithdrawTurn).toBe(2);
    expect(legalActions(state)).not.toContainEqual({ type: "withdraw" });
  });

  it("is legal mid-encounter too, combining with any strangers already pending", () => {
    const seed = seedForStir();
    const s = bellState({ party: [member(HERO)], seed, phase: "encounter", strangers: [MAN], smallPack: [100 + MAN] });
    expect(legalActions(s)).toContainEqual({ type: "pullBellRope", mi: 0 });

    const { state, events } = reduce(s, { type: "pullBellRope", mi: 0 });
    expect(events).toContainEqual(expect.objectContaining({ type: "bellRoll", outcome: "stir" }));
    expect(state.strangers).toEqual([MAN, MAN]); // the pending stranger plus the freshly drawn one
    expect(state.phase).toBe("encounter");
  });

  it("the action disappears after use, whatever the roll — spent per area, not per pull", () => {
    const seed = seedForToll();
    const s = bellState({ party: [member(HERO)], seed });
    const { state } = reduce(s, { type: "pullBellRope", mi: 0 });

    expect(legalActions(state)).not.toContainEqual({ type: "pullBellRope", mi: 0 });
    expect(reduce(state, { type: "pullBellRope", mi: 0 }).events).toEqual([{ type: "blocked" }]);
  });

  it("a FRESH arrival draws nothing — drawing is conditional on the player choosing pullBellRope (bug fix 2026-08-03)", () => {
    const s = makeState({
      gs: GS_PLAYING,
      phase: "explore",
      areas: [
        { card: 31 /* plain NESW chamber */, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
      prev: 0,
      party: [member(HERO)],
      largePack: [BELL_CARD],
      largeIdx: 0,
      smallPack: [100 + MAN], // present so a bugged draw would be visible
      smallIdx: 0,
    });
    const { state } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.strangers).toEqual([]);
    expect(state.treasures).toEqual([]);
    expect(state.hazards).toEqual([]);
    expect(state.smallIdx).toBe(0); // the small pack is never touched by mere arrival
    expect(state.phase).toBe("explore"); // no encounter triggered by an (absent) arrival draw
    expect((state.areas[0]!.flags & AF_BELL_SPENT) === 0).toBe(true); // arrival never spends the rope
    expect(legalActions(state)).toContainEqual({ type: "pullBellRope", mi: 0 }); // still available, on demand
  });
});

// ---------------------------------------------------------------------------------------------
// Extra draws must never corrupt surprise eligibility, and must still announce a freshly-drawn
// dragon (code review fix, SC-4-16). Both bugs share one root cause: `resolveExtraDraw` used to
// call `finishChamber` with `freshEntry=false`, which (a) unconditionally overwrote
// `surpriseReady` with `false` — clobbering surprise already earned by the chamber's ORIGINAL
// fresh entry and not yet consumed — and (b) suppressed the `dragonsLulled` notice, which is
// gated on the same `freshEntry` flag even though a well/bell-drawn dragon is always genuinely
// new information to the player (never previously shown in `strangers`).
// ---------------------------------------------------------------------------------------------

describe("Extra draws never corrupt surprise, and still announce a freshly-drawn dragon (SC-4-16)", () => {
  it("preserves an existing, unconsumed surpriseReady across a Well draw — the draw itself earns no surprise but must not clear one already earned", () => {
    const s = wellState({
      party: [member(HERO)],
      phase: "encounter",
      strangers: [MAN],
      surpriseReady: true,
      smallPack: [100 + MAN],
    });
    const { state } = reduce(s, { type: "drawFromWell" });

    expect(state.surpriseReady).toBe(true); // NOT clobbered by the extra draw
    expect(state.strangers).toEqual([MAN, MAN]);
    const attacked = reduce(state, { type: "attack" });
    expect(attacked.events).toContainEqual({ type: "fightStarted", surprise: 1 }); // the earned edge still lands
  });

  it("leaves surpriseReady false when it was false — a Well draw never grants surprise on its own", () => {
    const s = wellState({
      party: [member(HERO)],
      phase: "encounter",
      strangers: [MAN],
      surpriseReady: false,
      smallPack: [100 + MAN],
    });
    const { state } = reduce(s, { type: "drawFromWell" });

    expect(state.surpriseReady).toBe(false); // NOT upgraded false -> true by the extra draw
    const attacked = reduce(state, { type: "attack" });
    expect(attacked.events).toContainEqual({ type: "fightStarted", surprise: 0 });
  });

  it("also preserves surpriseReady across a Bell Rope 'stir' draw (same shared resolveExtraDraw path)", () => {
    const seed = seedForStir();
    const s = bellState({
      party: [member(HERO)],
      seed,
      phase: "encounter",
      strangers: [MAN],
      surpriseReady: true,
      smallPack: [100 + MAN, 100 + MAN],
    });
    const { state } = reduce(s, { type: "pullBellRope", mi: 0 });

    expect(state.surpriseReady).toBe(true);
  });

  it("announces dragonsLulled for a dragon drawn via the Well while the Charmed Flute is held", () => {
    const CHARMED_FLUTE = 12;
    const DRAGON = 10;
    const s = wellState({ party: [member(HERO, [CHARMED_FLUTE])], smallPack: [100 + DRAGON] });
    const { state, events } = reduce(s, { type: "drawFromWell" });

    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 }); // NOT suppressed for new information
    expect(state.strangers).toEqual([]); // lulled — no longer a live stranger to fight
    // Nothing else to encounter, so the party simply moves on; the lulled dragon parks AWAKE on the
    // tile for a future visit (persistAndExplore clears the WORKING `lulled` set once it's parked —
    // pre-existing §Charmed Flute behaviour, not special to the Well).
    expect(state.phase).toBe("explore");
    expect(state.areas[0]!.contents).toContain(100 + DRAGON);
  });
});

// ---------------------------------------------------------------------------------------------
// Extra draws resolve hazards exactly like any chamber draw (design brief: "strangers/hazards
// resolve normally"), not just strangers.
// ---------------------------------------------------------------------------------------------

describe("Extra draws resolve a drawn hazard normally, not just strangers", () => {
  it("a well-drawn Trap drops the party a level, same as any trap hazard", () => {
    const s = wellState({
      party: [member(HERO)],
      smallPack: [300 + HAZARD_TRAP],
      largePack: [31], // a plain chamber for the trap-fall landing
      largeIdx: 0,
    });
    const { state, events } = reduce(s, { type: "drawFromWell" });

    expect(events).toContainEqual({ type: "hazardFired", hazard: HAZARD_TRAP });
    expect(events.some((e) => e.type === "trapSprung")).toBe(true);
    expect(state.level).toBe(2);
    expect(state.fellThroughTrap).toBe(true);
  });

  it("a well-drawn Medusa fires her gaze with normal effects (petrify roll, item spill)", () => {
    const seed = seedForRoll((v) => v <= 2); // a petrifying roll for the sole member
    const s = wellState({ party: [member(HERO, [1])], seed, smallPack: [300 + HAZARD_MEDUSA] });
    const { state, events } = reduce(s, { type: "drawFromWell" });

    expect(events).toContainEqual({ type: "hazardFired", hazard: HAZARD_MEDUSA });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(true);
    expect(state.party[0]!.status).toBe(2); // petrified
    expect(state.treasures).toContain(1); // carried Gold spills to the chamber floor, same as any petrify
  });
});

// ---------------------------------------------------------------------------------------------
// A drawn Medusa can open the pre-hazard Medusa pause mid-draw (a living member holds Lotus Dust) —
// the resumed tail (proceed / throw the dust) must carry the SAME surprise-preservation and forced
// dragon-lull-announcement contract as the non-paused extra-draw path, or the pause reintroduces
// the SC-4-16 bug for exactly the case SC-EXT-7's own spec text calls out (code review round 2).
// ---------------------------------------------------------------------------------------------

const LOTUS_DUST = 5;

describe("A Medusa pause opened by an extra draw resumes without re-breaking SC-4-16", () => {
  it("preserves surpriseReady through the pause when resumed via proceed", () => {
    const seed = seedForRoll((v) => v >= 3); // a safe (non-petrifying) gaze roll — keeps the party intact
    const s = wellState({
      party: [member(HERO, [LOTUS_DUST])], // Lotus Dust held — opens the pause
      seed,
      phase: "encounter",
      strangers: [MAN],
      surpriseReady: true,
      smallPack: [300 + HAZARD_MEDUSA],
    });
    const drawn = reduce(s, { type: "drawFromWell" });
    expect(drawn.state.phase).toBe("medusa");
    expect(drawn.events).toContainEqual({ type: "medusaLooms" });

    const resumed = reduce(drawn.state, { type: "proceed" });
    expect(resumed.events.some((e) => e.type === "medusaGaze")).toBe(true);
    expect(resumed.state.surpriseReady).toBe(true); // NOT clobbered by the resumed finishChamber call
    expect(resumed.state.phase).toBe("encounter"); // the original stranger (MAN) is still pending
  });

  it("preserves surpriseReady through the same pause when resumed via the Lotus Dust throw", () => {
    const s = wellState({
      party: [member(HERO, [LOTUS_DUST])],
      phase: "encounter",
      strangers: [MAN],
      surpriseReady: true,
      smallPack: [300 + HAZARD_MEDUSA],
    });
    const drawn = reduce(s, { type: "drawFromWell" });
    expect(drawn.state.phase).toBe("medusa");

    const resumed = reduce(drawn.state, { type: "useArtifact", artifact: LOTUS_DUST });
    expect(resumed.events.some((e) => e.type === "medusaSlept")).toBe(true);
    expect(resumed.state.surpriseReady).toBe(true); // NOT clobbered by the resumed finishChamber call
    expect(resumed.state.phase).toBe("encounter");
  });

  it("announces dragonsLulled for a dragon drawn alongside a paused Medusa (Bell Rope 'stir' band)", () => {
    const CHARMED_FLUTE = 12;
    const DRAGON = 10;
    // Sweep for a seed whose FIRST roll selects the "stir" band (>=4) and whose SECOND roll (the
    // resumed Medusa gaze, drawn from the same advancing seed) is safe — so the sole, item-holding
    // member survives and the Flute keeps working, isolating the assertion to the lull mechanism.
    let seed = 1;
    for (; seed < 100000; seed++) {
      const r1 = rollDie(seed);
      if (r1.value < 4) continue;
      if (rollDie(r1.seed).value >= 3) break;
    }
    const s = bellState({
      party: [member(HERO, [LOTUS_DUST, CHARMED_FLUTE])],
      seed,
      smallPack: [300 + HAZARD_MEDUSA, 100 + DRAGON],
    });
    const pulled = reduce(s, { type: "pullBellRope", mi: 0 });
    expect(pulled.state.phase).toBe("medusa"); // Medusa opened the pause before the lull could resolve
    expect(pulled.state.strangers).toEqual([DRAGON]); // drawn, but not yet lulled — that's on resume

    const resumed = reduce(pulled.state, { type: "proceed" });
    expect(resumed.events).toContainEqual({ type: "dragonsLulled", count: 1 }); // NOT suppressed by the pause
    expect(resumed.state.strangers).toEqual([]); // lulled away on resume
  });
});

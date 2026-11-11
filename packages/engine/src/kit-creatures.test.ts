import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { applyHazards } from "./hazards";
import { frontStrength, casterMP } from "./combat";
import { scoreBreakdown } from "./score";
import { makeState, inUseGear } from "./testkit";
import { packCoord, DIR_E, DIR_S, DIR_DOWN } from "./coords";
import { decodeArea } from "./decode";
import { SPECIAL_GALLERY } from "./data/areaCards";
import { HAZARD_MEDUSA, HAZARD_MUTINY } from "./data/hazards";
import { GS_PLAYING, type GameState, type PartyMember } from "./state";
import type { GameEvent } from "./actions";

/**
 * Extension kit — creature behaviors (US-12, US-15..18, SC-EXT-17..19): class-based artifact
 * eligibility ("uses artifacts as X" joins every list X appears in, design §1.3), Wolf's remaining
 * immunities (Medusa's petrify loop, Mutiny's desertion — Quarrel/Desertion landed in Tasks 8-9),
 * and the Thief's non-violent pickup of guarded treasure in an indifference-pacified area.
 */

// Base classes
const PRIEST = 4;
const MAN = 5;
const WOMAN = 6;
const WIZARD = 8;

// Kit creatures (§1.3)
const APPRENTICE = 14;
const DEMON = 15;
const LION = 16;
const SCHOLAR = 17;
const WITCH = 18;
const THIEF = 19;
const WOLF = 20;

// Treasures
const SILVER = 0;
const MAGIC_SWORD = 3;
const MAGIC_CARPET = 4;
const HEALING_BALM = 6;
const STRENGTH_POTION = 8;
const MAGIC_STAFF = 9;
const CHARMED_FLUTE = 12;

const member = (creatureId: number, treasure: number[] = [], status: 0 | 1 | 2 | 3 = 0): PartyMember => ({
  creatureId,
  status,
  dragonKills: 0,
  treasure,
  borne: inUseGear(treasure),
});

const AREA = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

// ---------------------------------------------------------------------------------------------
// Class-based artifact eligibility (US-12, US-14, US-16, US-17; SC-EXT-17)
// ---------------------------------------------------------------------------------------------

describe("Class-based artifact eligibility — Apprentice uses artifacts as a Wizard (SC-EXT-17)", () => {
  it("bears the Magic Carpet (Priest/Wizard list)", () => {
    const s = makeState({ phase: "explore", areas: [AREA], party: [member(APPRENTICE, [MAGIC_CARPET])] });
    const { events } = reduce(s, { type: "useArtifact", artifact: MAGIC_CARPET, dir: DIR_E });
    expect(events).toContainEqual({ type: "carpetUsed", dir: DIR_E });
  });

  it("uses the Healing Balm (Woman/W-Hero/Priest/Wizard list)", () => {
    const s = makeState({ phase: "explore", areas: [AREA], party: [member(APPRENTICE, [HEALING_BALM]), { ...member(MAN, [], 3), diedTurn: 1, diedArea: 0 }] });
    const { state } = reduce(s, { type: "useArtifact", artifact: HEALING_BALM, target: 1 });
    expect(state.party[1]!.status).toBe(0); // revived
  });

  it("reanimates a stoned member with the Magic Staff (Wizard-only)", () => {
    const s = makeState({
      phase: "explore", areas: [AREA],
      party: [member(APPRENTICE, [MAGIC_STAFF]), { ...member(MAN, [], 2), stoneArea: 0 }],
    });
    const { state } = reduce(s, { type: "useArtifact", artifact: MAGIC_STAFF, target: 1 });
    expect(state.party[1]!.status).toBe(0);
    expect(state.party[1]!.stoneArea).toBeUndefined();
  });

  it("auto-revives a stoned member on RETURN to the chamber (reviveStoned, closes the Task 7 seam)", () => {
    // Mirrors reduce.test.ts's Wizard+Staff pin exactly, substituting the Apprentice — proves
    // `reviveStoned`'s own bearer check (not just `useArtifact`'s findBearer path) now counts her.
    const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 1, prev: 0, level: 1,
      party: [
        member(APPRENTICE, [MAGIC_STAFF]),               // Apprentice bearing the Magic Staff
        { ...member(MAN, [], 2), stoneArea: 0 },           // Man, left as stone in A
      ],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S }); // B(50,49) -> A(50,50)
    expect(state.partyArea).toBe(0);
    expect(state.party[1]!.status).toBe(0);            // revived on arrival, no explicit useArtifact
    expect(state.party[1]!.stoneArea).toBeUndefined();
    expect(events).toContainEqual({ type: "memberRevived", creatureId: MAN });
  });

  it("plays the Charmed Flute to reveal a secret door (Hero/W-Hero/Priest/Man/Woman/Wizard list)", () => {
    const PLAIN = 15; // N+E+S+W, no stairs
    const STAIR_UP_CARD = 15 | 32; // shows a stair up
    const s = makeState({
      phase: "explore", level: 1, partyArea: 0,
      party: [member(APPRENTICE, [CHARMED_FLUTE])],
      areas: [
        { card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: STAIR_UP_CARD, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: CHARMED_FLUTE, dir: DIR_DOWN });
    expect(decodeArea(state.areas[0]!.card).stairDown).toBe(true);
    expect(events).toContainEqual({ type: "secretDoorRevealed", dir: DIR_DOWN });
  });

  it("lulls a Dragon when the Flute is played (FLUTE_PLAYERS, effects.ts)", () => {
    const s = makeState({
      phase: "explore", level: 2,
      party: [member(APPRENTICE, [CHARMED_FLUTE])],
      areas: [{ card: 31, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [17], largeIdx: 0,
      smallPack: [110], smallIdx: 0, // Dragon
      seed: 1,
    });
    const met = reduce(s, { type: "move", dir: 3 }).state; // south — the fresh chamber draw: the Dragon is met, not lulled
    expect(met.phase).toBe("encounter");
    const { state, events } = reduce(met, { type: "useArtifact", artifact: CHARMED_FLUTE }); // the player plays the Flute
    expect(state.phase).toBe("explore"); // acts empty — the Dragon is lulled
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
  });

  it("bearing the Magic Staff averts Medusa's gaze for the whole party (hasStaffWizard)", () => {
    const s = makeState({
      party: [member(APPRENTICE, [MAGIC_STAFF]), member(MAN)],
      hazards: [HAZARD_MEDUSA],
      seed: 1,
    });
    const { events } = applyHazards(s);
    expect(s.party.every((m) => m.status === 0)).toBe(true);
    expect(events).toContainEqual({ type: "medusaAverted" });
  });

  it("bearing the Magic Staff wakes every Gallery statue on entry (staff-wake, SC-EXT-11)", () => {
    const GALLERY_CARD = (SPECIAL_GALLERY << 7) | 31;
    const s = makeState({
      gs: GS_PLAYING, phase: "explore",
      areas: [{ card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      partyArea: 0, prev: 0,
      largePack: [GALLERY_CARD], largeIdx: 0,
      party: [member(APPRENTICE, [MAGIC_STAFF])],
      smallPack: [100 + MAN], smallIdx: 0,
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.statues).toEqual([]);
    expect(state.strangers).toEqual([MAN]);
    expect(events).toContainEqual({ type: "staffWake", creatureIds: [MAN] });
  });

  it("DOES gain the Wizard's Magic-Staff combat mp bonus — she uses artefacts as a Wizard (Peter, 03-OCT-2026; supersedes SC-EXT-17's named-creature reading)", () => {
    const wizardWithStaff = member(WIZARD, [MAGIC_STAFF]);
    const apprenticeWithStaff = member(APPRENTICE, [MAGIC_STAFF]);
    expect(casterMP(wizardWithStaff)).toBe(7); // Wizard: base mp 5 + staff bonus 2
    expect(casterMP(apprenticeWithStaff)).toBe(9); // Apprentice: base mp 7 + the same +2
    expect(casterMP({ ...apprenticeWithStaff, treasure: [] })).toBe(7); // her own base mp without it
  });
});

describe("Class-based artifact eligibility — Scholar & Witch use artifacts as a Priest (SC-EXT-17)", () => {
  for (const [name, id] of [["Scholar", SCHOLAR], ["Witch", WITCH]] as const) {
    it(`${name} bears the Magic Carpet`, () => {
      const s = makeState({ phase: "explore", areas: [AREA], party: [member(id, [MAGIC_CARPET])] });
      const { events } = reduce(s, { type: "useArtifact", artifact: MAGIC_CARPET, dir: DIR_E });
      expect(events).toContainEqual({ type: "carpetUsed", dir: DIR_E });
    });

    it(`${name} uses the Healing Balm`, () => {
      const s = makeState({ phase: "explore", areas: [AREA], party: [member(id, [HEALING_BALM]), { ...member(MAN, [], 3), diedTurn: 1, diedArea: 0 }] });
      const { state } = reduce(s, { type: "useArtifact", artifact: HEALING_BALM, target: 1 });
      expect(state.party[1]!.status).toBe(0);
    });

    it(`${name} plays the Charmed Flute to lull a Dragon`, () => {
      const s = makeState({
        phase: "explore", level: 2,
        party: [member(id, [CHARMED_FLUTE])],
        areas: [{ card: 31, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
        largePack: [17], largeIdx: 0,
        smallPack: [110], smallIdx: 0,
        seed: 1,
      });
      const met = reduce(s, { type: "move", dir: 3 }).state;
      const { state, events } = reduce(met, { type: "useArtifact", artifact: CHARMED_FLUTE });
      expect(state.phase).toBe("explore");
      expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
    });

    it(`${name} does NOT reanimate a stoned member with the Magic Staff (Priest is not Wizard)`, () => {
      const s = makeState({
        phase: "explore", areas: [AREA],
        party: [member(id, [MAGIC_STAFF]), { ...member(MAN, [], 2), stoneArea: 0 }],
      });
      expect(reduce(s, { type: "useArtifact", artifact: MAGIC_STAFF, target: 1 }).events).toEqual([{ type: "blocked" }]);
    });

    it(`${name} bearing the Magic Staff does NOT avert Medusa's gaze (Wizard-only ward)`, () => {
      const s = makeState({ party: [member(id, [MAGIC_STAFF])], hazards: [HAZARD_MEDUSA], seed: 3 });
      const { events } = applyHazards(s);
      expect(events.some((e) => e.type === "medusaAverted")).toBe(false);
    });
  }
});

describe("Class-based artifact eligibility — Thief uses artifacts as a Man (SC-EXT-17)", () => {
  it("plays the Charmed Flute to lull a Dragon (Man is a Flute player)", () => {
    const s = makeState({
      phase: "explore", level: 2,
      party: [member(THIEF, [CHARMED_FLUTE])],
      areas: [{ card: 31, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [17], largeIdx: 0,
      smallPack: [110], smallIdx: 0,
      seed: 1,
    });
    const met = reduce(s, { type: "move", dir: 3 }).state;
    const { state, events } = reduce(met, { type: "useArtifact", artifact: CHARMED_FLUTE });
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
  });

  it("does NOT bear the Magic Carpet (Man was never a Carpet bearer)", () => {
    const s = makeState({ phase: "explore", areas: [AREA], party: [member(THIEF, [MAGIC_CARPET])] });
    expect(reduce(s, { type: "useArtifact", artifact: MAGIC_CARPET, dir: DIR_E }).events).toEqual([{ type: "blocked" }]);
  });

  it("does NOT use the Healing Balm (Man was never a Balm user)", () => {
    const s = makeState({ phase: "explore", areas: [AREA], party: [member(THIEF, [HEALING_BALM]), member(MAN, [], 3)] });
    expect(reduce(s, { type: "useArtifact", artifact: HEALING_BALM, target: 1 }).events).toEqual([{ type: "blocked" }]);
  });
});

describe("Class-based artifact eligibility — negative cases: Lion, Wolf, Demon appear in NO list", () => {
  for (const [name, id] of [["Lion", LION], ["Wolf", WOLF], ["Demon", DEMON]] as const) {
    it(`${name} cannot bear the Magic Carpet`, () => {
      const s = makeState({ phase: "explore", areas: [AREA], party: [member(id, [MAGIC_CARPET])] });
      expect(reduce(s, { type: "useArtifact", artifact: MAGIC_CARPET, dir: DIR_E }).events).toEqual([{ type: "blocked" }]);
    });

    it(`${name} does not lull a Dragon on entry (not a Flute player)`, () => {
      const s = makeState({
        phase: "explore", level: 2,
        party: [member(id, [CHARMED_FLUTE])],
        areas: [{ card: 31, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
        largePack: [17], largeIdx: 0,
        smallPack: [110], smallIdx: 0,
        seed: 1,
      });
      const { state, events } = reduce(s, { type: "move", dir: 3 });
      expect(state.phase).toBe("encounter"); // the Dragon fights normally
      expect(events.some((e) => e.type === "dragonsLulled")).toBe(false);
    });
  }
});

describe("Class-based artifact eligibility — explicit exceptions stay untouched (SC-EXT-17)", () => {
  it("Strength Potion's TARGET list DOES extend to the Man-class Thief (MSW 2026-11-08, R-23; supersedes SC-EXT-17)", () => {
    const s = makeState({
      phase: "fight", fight: { surprise: 0, round: 1, focus: 0 },
      areas: [AREA], strangers: [10],
      party: [member(THIEF, [STRENGTH_POTION])],
    });
    expect(reduce(s, { type: "useArtifact", artifact: STRENGTH_POTION, target: 0 }).state.party[0]!.potionActive).toBe(true);
    expect(legalActions(s).some((a) => a.type === "useArtifact" && a.artifact === STRENGTH_POTION)).toBe(true);
  });

  it("the Magic Sword's bonus DOES extend to the Thief, who uses artefacts as a Man (Peter, 03-OCT-2026; supersedes SC-EXT-17)", () => {
    const thiefWithSword = member(THIEF, [MAGIC_SWORD]);
    const manWithSword = member(MAN, [MAGIC_SWORD]);
    expect(frontStrength(manWithSword)).toBe(3 + 1); // Man fs 3 + 1
    expect(frontStrength(thiefWithSword)).toBe(2 + 1); // Thief fs 2 + the same 1
  });
});

// ---------------------------------------------------------------------------------------------
// Wolf immunities (US-18, SC-EXT-18) — Medusa's petrify loop and Mutiny's desertion.
// Quarrel's picker exclusion and Desertion's per-ally skip landed in Tasks 8-9 and already emit
// the same `wolfUnmoved` event reused here, now discriminated by a `hazard` field (review fix,
// Task 10) so the presentation layer's Desertion-only "party holds together" summary
// (apps/web/eventNotices.ts) can't mistake a Medusa or Mutiny skip for Desertion activity.
// ---------------------------------------------------------------------------------------------

describe("Wolf immunities (US-18, SC-EXT-18)", () => {
  it("is skipped by Medusa's petrify dice — no roll, a visible notice, status untouched", () => {
    const s = makeState({ party: [member(WOLF)], hazards: [HAZARD_MEDUSA], seed: 1 });
    const { events } = applyHazards(s);
    expect(s.party[0]!.status).toBe(0);
    expect(events).toContainEqual({ type: "wolfUnmoved", hazard: HAZARD_MEDUSA });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(false); // no roll was made for anyone
  });

  it("other members still roll normally alongside an immune Wolf", () => {
    const s = makeState({ party: [member(WOLF), member(MAN)], hazards: [HAZARD_MEDUSA], seed: 3 });
    const { events } = applyHazards(s);
    expect(events).toContainEqual({ type: "wolfUnmoved", hazard: HAZARD_MEDUSA });
    const gaze = events.find((e) => e.type === "medusaGaze") as { rolls: { creatureId: number }[] } | undefined;
    expect(gaze?.rolls.map((r) => r.creatureId)).toEqual([MAN]); // only the Man was rolled for
  });

  it("stays through Mutiny while other allies desert — a visible notice, remains in the party", () => {
    const s = makeState({
      party: [member(0, [], 0), member(WOLF, [], 1), member(MAN, [SILVER], 1)], // Hero original + Wolf/Man allies
      strangers: [], treasures: [],
      hazards: [HAZARD_MUTINY],
    });
    const { events } = applyHazards(s);
    expect(events).toContainEqual({ type: "wolfUnmoved", hazard: HAZARD_MUTINY });
    expect(s.party.some((m) => m.creatureId === WOLF && m.status === 1)).toBe(true); // still an ally
    expect(s.strangers).toContain(MAN); // the Man deserted
    expect(s.treasures).toContain(SILVER);
    expect(events).toContainEqual({ type: "mutinied", deserters: [MAN], treasures: [SILVER] });
  });
});

// ---------------------------------------------------------------------------------------------
// Thief pickup (US-17, SC-EXT-19)
// ---------------------------------------------------------------------------------------------

describe("Thief pickup — unlocks guarded treasure in an indifference-pacified area (US-17, SC-EXT-19)", () => {
  it("with a living Thief ally, the 3rd indifferent test goes straight to a live pickup instead of guarding", () => {
    // Same seed/shape as the pinned base-game test (reduce.test.ts) but with a Thief ally added.
    let s = makeState({
      phase: "encounter", strangers: [6], treasures: [1], seed: 9,
      party: [member(MAN), member(THIEF)],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    let lastEvents: GameEvent[] = [];
    for (let i = 0; i < 3; i++) { const r = reduce(s, { type: "test" }); s = r.state; lastEvents = r.events; }
    expect(lastEvents).toContainEqual({ type: "pacified" });
    expect(s.pacifiedAreas).toContain(0);
    expect(s.phase).toBe("pickup"); // unlocked, not guarded
    expect(s.thiefPickup).toBe(true);
    expect(s.treasures).toEqual([1]); // still live to take
    expect(s.areas[0]!.contents).toContain(100 + 6); // the indifferent guard parks, unengaged

    // R-33 (Peter, §Thief): only the Thief steals, one treasure; the strangers turn hostile.
    expect(reduce(s, { type: "takeTreasure", ti: 0, mi: 0 }).events).toEqual([{ type: "blocked" }]); // the Man may not
    const took = reduce(s, { type: "takeTreasure", ti: 0, mi: 1 });
    expect(took.state.party[1]!.treasure).toEqual([1]);
    expect(took.events).toContainEqual({ type: "thiefPalmed", tid: 1 });
    expect(took.events).toContainEqual({ type: "thiefDetected" });
    expect(took.state.thiefPickup).toBeUndefined();
    expect(took.state.phase).toBe("encounter");
    expect(took.state.strangers).toEqual([6]);
    expect(took.state.hostileAreas).toContain(0);
    expect(took.state.pacifiedAreas ?? []).not.toContain(0);
    // Leaving at once is allowed; staying and testing or attacking starts the fight, strangers having the surprise.
    expect(legalActions(took.state).some((a) => a.type === "move")).toBe(true);
    expect(reduce(took.state, { type: "test" }).state.fight?.surprise).toBe(-1);
  });
  it("R-33: the theft takes one treasure only; the rest stays for later", () => {
    let s2 = makeState({
      phase: "encounter", strangers: [6], treasures: [1, 0], seed: 9,
      party: [member(THIEF)],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    for (let i = 0; i < 3; i++) s2 = reduce(s2, { type: "test" }).state;
    const took = reduce(s2, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(took.state.party[0]!.treasure).toHaveLength(1);
    expect(took.state.treasures).toHaveLength(1);
  });

  it("with a living Thief ally, RE-ENTERING an already-pacified area also unlocks the guarded treasure", () => {
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 6, 200 + 1], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 0, prev: 0,
      party: [member(MAN), member(THIEF)], pacifiedAreas: [1],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.phase).toBe("pickup");
    expect(state.thiefPickup).toBe(true);
    expect(state.treasures).toEqual([1]);
    expect(state.areas[1]!.contents).toContain(100 + 6);
    expect(legalActions(state).filter((a) => a.type === "takeTreasure")).toEqual([{ type: "takeTreasure", ti: 0, mi: 1 }]); // R-33: the Thief alone
    expect(events.some((e) => e.type === "thiefPalmed")).toBe(false); // no lift happened yet, just the unlock
  });

  it("without a Thief, the SAME re-entry stays guarded (base behaviour pinned)", () => {
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 6, 200 + 1], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 0, prev: 0,
      party: [member(MAN)], pacifiedAreas: [1],
    });
    const { state } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.phase).toBe("explore"); // no Thief — no unlock
    expect(state.thiefPickup).toBeUndefined();
    expect(legalActions(state).some((a) => a.type === "takeTreasure")).toBe(false);
  });

  it("a womanless Unicorn is INDIFFERENT, not a friendly guard (Peter's feedback #13; GitHub #37): no join, no unicornGuards, normal indifference count", () => {
    const s = makeState({
      phase: "encounter", strangers: [13], treasures: [1], seed: 1,
      party: [member(THIEF)], // no Woman/W-Hero — the Unicorn cannot join
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "test" });
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "indifferent" }));
    expect(events.some((e) => e.type === "unicornGuards")).toBe(false);
    expect(state.party.map((m) => m.creatureId)).not.toContain(13);
    expect(state.strangers).toEqual([13]); // still there, guarding, until the third indifferent test
  });

  it("a Thief may steal from a pacified womanless-Unicorn guard on re-entry, like any indifferent guard (GitHub #38)", () => {
    const A = { card: 2, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 31, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + 13, 200 + 1], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "explore", areas: [A, B], partyArea: 0, prev: 0,
      party: [member(THIEF)], pacifiedAreas: [1],
    });
    const { state } = reduce(s, { type: "move", dir: DIR_E });
    expect(state.phase).toBe("pickup");
    expect(state.thiefPickup).toBe(true);
  });

  it("a Thief ally present does NOT unlock an ordinary post-fight pickup (only indifference-pacified guarding is relaxed)", () => {
    // A won fight's pickup is unrelated to `pacifiedAreas`/indifference — per the design text
    // ("pacified BY INDIFFERENCE"), a fight-cleared area needs no Thief-unlock at all. Reuses the
    // pinned Giant-vs-Dwarf guaranteed-win fixture (reduce.test.ts) with a bystander Thief ally
    // added and treasure left in the chamber, so the win lands in "pickup" the ordinary way.
    const s = makeState({
      phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, seed: 5,
      party: [member(12), member(THIEF)], strangers: [7], treasures: [1], // Giant + Thief ally vs Dwarf
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(state.phase).toBe("pickup");
    expect(state.thiefPickup).toBeUndefined();
    const took = reduce(state, { type: "takeTreasure", ti: 0, mi: 1 }); // the Thief takes it himself
    expect(took.events).toEqual([]); // no thiefPalmed — this was never a Thief-unlocked session
  });

  it("the Thief himself can carry the unlocked treasure (canCarry works for a kit creature, ALL_CREATURES fix)", () => {
    let s = makeState({
      phase: "encounter", strangers: [6], treasures: [1], seed: 9,
      party: [member(THIEF)],
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    for (let i = 0; i < 3; i++) s = reduce(s, { type: "test" }).state;
    expect(s.phase).toBe("pickup");
    const { state, events } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.party[0]!.treasure).toEqual([1]); // the Thief (carry 25) holds the Gold (25kg) himself
    expect(events).toContainEqual({ type: "thiefPalmed", tid: 1 });
  });
});

// ---------------------------------------------------------------------------------------------
// Kit creatures don't crash core systems — an enabling fix for every story above (ALL_CREATURES,
// SC-EXT-17): reaction/combat/scoring all indexed the base-only `CREATURES` table by an arbitrary
// creatureId, which already crashed for a kit id (14-20) once one appeared as a stranger or ally
// (wired since Tasks 1-9's small-pack additions) — confirmed reachable today, so fixed in this task.
// ---------------------------------------------------------------------------------------------

describe("Kit creatures no longer crash reaction/combat/scoring (ALL_CREATURES enabling fix)", () => {
  it("a kit creature drawn as the sole stranger can be reacted to without throwing", () => {
    const s = makeState({ phase: "encounter", strangers: [WITCH], party: [member(0)], areas: [AREA], seed: 2 });
    expect(() => reduce(s, { type: "test" })).not.toThrow();
  });

  it("a kit ally's frontStrength/casterMP resolve correctly (no crash) — Wolf: fs 2, mp 0", () => {
    expect(frontStrength(member(WOLF))).toBe(2);
    expect(casterMP(member(WOLF))).toBe(0);
  });

  it("scoring a game with a living kit ally does not crash and counts their points", () => {
    const s = makeState({ party: [member(0), member(SCHOLAR)] }); // Scholar: 5 pts
    const breakdown = scoreBreakdown(s);
    const scholarRow = breakdown.members.find((m) => m.creatureId === SCHOLAR)!;
    expect(scholarRow.name).toBe("Scholar");
    expect(scholarRow.creaturePoints).toBe(5);
  });
});

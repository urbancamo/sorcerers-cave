import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { reactionRoll } from "./reaction";
import { validatePlan, resolvePlannedRound } from "./combatPlan";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { SPECIAL_GALLERY } from "./data/areaCards";
import { AF_DESTROYED, GS_PLAYING, GS_ESCAPED, type GameState, type PartyMember, type BattlePlan } from "./state";
import type { GameEvent } from "./actions";

/**
 * Extension kit — the Apprentice's conditional loyalty (US-14, SC-EXT-20) and the Demon's
 * draw-relocation + magic-only fight gating (US-13, SC-EXT-21). The Apprentice is female — every
 * notice below matches the design's own she/her wording verbatim.
 */

const HERO = 0;
const MAN = 5;
const GIANT = 12;
const WIZARD = 8;
const SORCERER = 11;
const APPRENTICE = 14;
const DEMON = 15;
const GOLD = 1;
const MAGIC_SWORD = 3;
const MAGIC_STAFF = 9;
const MAGIC_AXE = 17;

const DIR_E = 2;
const DIR_W = 4;

const member = (creatureId: number, treasure: number[] = []): PartyMember => ({
  creatureId,
  status: 0,
  dragonKills: 0,
  treasure,
});
const ally = (creatureId: number, treasure: number[] = []): PartyMember => ({
  creatureId,
  status: 1,
  dragonKills: 0,
  treasure,
});

// ---------------------------------------------------------------------------------------------
// The Apprentice — custom reaction band (US-14, SC-EXT-20)
// ---------------------------------------------------------------------------------------------

describe("The Apprentice's reaction (US-14, SC-EXT-20)", () => {
  it("while the Sorcerer lives: 1-5 hostile, 6 friendly, never indifferent", () => {
    const seen = new Map<number, string>();
    for (let seed = 1; seed <= 100; seed++) {
      const s = makeState({ strangers: [APPRENTICE], party: [member(MAN)], sorcererKilled: false, seed });
      const { roll, outcome } = reactionRoll(s);
      seen.set(roll, outcome);
    }
    expect(seen.size).toBe(6); // every face reachable
    for (const [roll, outcome] of seen) expect(outcome).toBe(roll <= 5 ? "hostile" : "friendly");
    expect([...seen.values()]).not.toContain("indifferent");
  });

  it("once the Sorcerer is dead: every roll (including 6) reads hostile — never friendly", () => {
    const seen = new Map<number, string>();
    for (let seed = 1; seed <= 100; seed++) {
      const s = makeState({ strangers: [APPRENTICE], party: [member(MAN)], sorcererKilled: true, seed });
      const { roll, outcome } = reactionRoll(s);
      seen.set(roll, outcome);
    }
    expect(seen.size).toBe(6);
    for (const outcome of seen.values()) expect(outcome).toBe("hostile");
  });
});

// ---------------------------------------------------------------------------------------------
// The Apprentice — Sorcerer-death revert (US-14/Resolved-7, SC-EXT-20)
// ---------------------------------------------------------------------------------------------

const fightS = (over: Partial<GameState> = {}): GameState =>
  makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });
// Deep-ish clone so a resolution mutates its own copy, not the test fixture.
const clone = (s: GameState): GameState => ({ ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m, treasure: [...m.treasure] })) });

describe("Apprentice ally reverts the instant the Sorcerer dies (US-14/Resolved-7, SC-EXT-20)", () => {
  it("deserts to a hostile stranger, drops her loot, and leaves the party", () => {
    // Same winning setup as combatPlan.test.ts's "slaying the Sorcerer" case (Giant+Sword front,
    // Wizard+Staff backer, surprise + Lotus weakening) — plus an uncommitted Apprentice ally
    // carrying Gold, present but not engaged this round.
    const s = clone(fightS({
      fight: { surprise: 1, round: 1, focus: 0 },
      lotusOnSorcerer: true,
      party: [member(GIANT, [MAGIC_SWORD]), member(WIZARD, [MAGIC_STAFF]), ally(APPRENTICE, [GOLD])],
      strangers: [SORCERER],
      seed: 1,
    }));
    const events = resolvePlannedRound(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] });

    expect(s.sorcererKilled).toBe(true);
    expect(s.party.some((m) => m.creatureId === APPRENTICE)).toBe(false); // gone from the party
    expect(s.strangers).toEqual([APPRENTICE]); // present as a hostile stranger in this same area
    expect(s.treasures).toContain(GOLD); // her carried loot spills, not lost outright
    expect(events).toContainEqual({ type: "apprenticeTurned", count: 1, items: [GOLD] });
  });

  it("does nothing when no Apprentice is allied", () => {
    const s = clone(fightS({
      fight: { surprise: 1, round: 1, focus: 0 },
      lotusOnSorcerer: true,
      party: [member(GIANT, [MAGIC_SWORD]), member(WIZARD, [MAGIC_STAFF])],
      strangers: [SORCERER],
      seed: 1,
    }));
    const events = resolvePlannedRound(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] });

    expect(s.sorcererKilled).toBe(true);
    expect(s.strangers).toEqual([]); // no Apprentice to revert — a normal, total victory
    expect(events.some((e) => e.type === "apprenticeTurned")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The Apprentice — never leaves the cave (US-14, SC-EXT-20)
// ---------------------------------------------------------------------------------------------

describe("exitCave drops an Apprentice ally, unscored (US-14, SC-EXT-20)", () => {
  it("escapes successfully but she stays behind", () => {
    const s = makeState({ party: [member(HERO), ally(APPRENTICE, [GOLD])] });
    const { state, events } = reduce(s, { type: "exitCave" });

    expect(state.gs).toBe(GS_ESCAPED);
    expect(state.party.some((m) => m.creatureId === APPRENTICE)).toBe(false);
    expect(state.party.some((m) => m.creatureId === HERO)).toBe(true); // the rest of the party escapes fine
    expect(events).toContainEqual({ type: "apprenticeStaysBehind", count: 1 });
  });

  it("fires no apprenticeStaysBehind notice when no Apprentice is allied", () => {
    const s = makeState({ party: [member(HERO)] });
    const { state, events } = reduce(s, { type: "exitCave" });

    expect(state.gs).toBe(GS_ESCAPED);
    expect(events.some((e) => e.type === "apprenticeStaysBehind")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The Demon — draw-classify relocation (US-13/Resolved-6, SC-EXT-21)
// ---------------------------------------------------------------------------------------------

// A start tile with only an EAST doorway (bit 2) — the party begins here and moves east onto the
// freshly-drawn target chamber, matching kit-lair-gallery.test.ts's fixture convention.
const START_CARD = 2;
const PLAIN_CHAMBER = 31; // NESW chamber, no special
const GALLERY_CARD = (SPECIAL_GALLERY << 7) | 31;
const PLAIN_WEST_TUNNEL = 8; // a west-only tunnel — sits east of the start tile, no chamber draw

function demonState(over: Partial<GameState>): GameState {
  return makeState({
    gs: GS_PLAYING,
    phase: "explore",
    areas: [
      { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
    ],
    partyArea: 0,
    prev: 0,
    largePack: [PLAIN_CHAMBER],
    largeIdx: 0,
    smallPack: [],
    smallIdx: 0,
    ...over,
  });
}

describe("A drawn Demon never joins the chamber — it materializes into prev (US-13, SC-EXT-21)", () => {
  it("appears in prev's contents, not the chamber", () => {
    const s = demonState({ party: [member(HERO)], smallPack: [100 + DEMON] });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.strangers).toEqual([]); // never a live stranger in the chamber it was drawn in
    expect(state.areas[0]!.contents).toEqual([100 + DEMON]); // parked on prev (the start tile) instead
    expect(events).toContainEqual({ type: "demonSpawned" });
    expect(state.phase).toBe("explore"); // nothing else drawn here — the party carries on
  });

  it("disperses instead when prev was collapsed by an Earthquake", () => {
    const s = demonState({
      party: [member(HERO)],
      smallPack: [100 + DEMON],
      areas: [{ card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: AF_DESTROYED, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.areas[0]!.contents).toEqual([]); // never parked — discarded outright
    expect(state.strangers).toEqual([]);
    expect(events).toContainEqual({ type: "demonDispersed" });
  });

  it("relocates even out of a Gallery draw — closing Task 7's plain-exemption seam", () => {
    // The draw count is min(level,4), and level is derived from the AREA's own coord (not a
    // free-floating field) — level 4 on both the start tile and the target lets one entry draw
    // both codes below (mirrors kit-lair-gallery.test.ts's own `galleryState` fixture).
    const s = demonState({
      level: 4,
      areas: [
        { card: START_CARD, coord: packCoord(4, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      party: [member(HERO)],
      largePack: [GALLERY_CARD],
      smallPack: [100 + MAN, 100 + DEMON],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    // With the Demon relocated away and nothing else drawn, this visit has no live stranger and
    // no treasure — the statue is immediately re-parked (500+id) exactly like any other
    // nothing-to-do Gallery entry (kit-lair-gallery.test.ts's own "ONLY statues... behaves like no
    // strangers at all" case), so the Gallery's ordinary petrify-on-draw is checked on the PARKED
    // form here rather than the live (already-cleared) `state.statues`.
    expect(state.areas[1]!.contents).toContainEqual(500 + MAN);
    expect(state.strangers).toEqual([]); // the Demon is NOT a plain exempt stranger here anymore
    expect(state.areas[0]!.contents).toEqual([100 + DEMON]); // it relocated to prev instead
    expect(events).toContainEqual({ type: "galleryStone", creatureIds: [MAN] });
    expect(events).toContainEqual({ type: "demonSpawned" });
  });
});

describe("Entering (or withdrawing into) the Demon's area forces an ambush (US-13, SC-EXT-21)", () => {
  it("forces a hostile fight on entry into a CHAMBER holding a parked Demon — no reaction test", () => {
    const s = demonState({
      party: [member(HERO)],
      areas: [
        { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: PLAIN_CHAMBER, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + DEMON], flags: 0, indiffCount: 0 },
      ],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.phase).toBe("fight");
    expect(state.strangers).toEqual([DEMON]);
    expect(events).toContainEqual({ type: "demonUnfolds" });
  });

  it("forces the SAME ambush entering a plain TUNNEL holding a parked Demon", () => {
    const s = demonState({
      party: [member(HERO)],
      areas: [
        { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: PLAIN_WEST_TUNNEL, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [100 + DEMON], flags: 0, indiffCount: 0 },
      ],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_E });

    expect(state.phase).toBe("fight");
    expect(state.strangers).toEqual([DEMON]);
    expect(events).toContainEqual({ type: "demonUnfolds" });
  });

  it("forces the ambush when the party WITHDRAWS back into a Demon-holding area", () => {
    // The party stands in an ordinary encounter (a Man, not yet tested) whose prev area already
    // holds a parked Demon from an earlier draw elsewhere.
    const s = makeState({
      phase: "encounter",
      partyArea: 1,
      prev: 0,
      areas: [
        { card: START_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [100 + DEMON], flags: 0, indiffCount: 0 },
        { card: PLAIN_CHAMBER, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      party: [member(HERO)],
      strangers: [MAN],
    });
    const { state, events } = reduce(s, { type: "withdraw" });

    expect(state.partyArea).toBe(0);
    expect(state.phase).toBe("fight");
    expect(state.strangers).toEqual([DEMON]);
    expect(events).toContainEqual({ type: "demonUnfolds" });
  });
});

// ---------------------------------------------------------------------------------------------
// The Demon — magic-only fight gating (US-13/US-24, SC-EXT-21)
// ---------------------------------------------------------------------------------------------

const ok = (s: GameState, p: BattlePlan) => validatePlan(s, p).ok;
const reason = (s: GameState, p: BattlePlan) => { const r = validatePlan(s, p); return r.ok ? null : r.reason; };

describe("The Demon can only be touched by magic or a Magic Axe bearer (US-13/US-24, SC-EXT-21)", () => {
  it("rejects an ordinary fighter set against it", () => {
    const s = fightS({ party: [member(MAN)], strangers: [DEMON] });
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("demonNeedsMagic");
  });

  it("accepts a caster or a Magic Axe bearer (any species) against it", () => {
    expect(ok(fightS({ party: [member(WIZARD)], strangers: [DEMON] }), { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
    expect(ok(fightS({ party: [member(MAN, [MAGIC_AXE])], strangers: [DEMON] }), { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });

  it("with no mage and no Axe: an empty plan is legal, and the round auto-slays the strongest", () => {
    const s = fightS({ party: [member(GIANT), member(MAN)], strangers: [DEMON] }); // no magic, no Axe
    expect(validatePlan(s, { matches: [] }).ok).toBe(true);
    const c = clone(s);
    const events = resolvePlannedRound(c, { matches: [] });
    expect(events.some((e) => e.type === "demonSlew")).toBe(true);
    expect(c.party[0]!.status).toBe(3); // the Giant (strongest, fs 7) falls; the Man survives
    expect(c.party[1]!.status).toBe(0);
  });

  it("an Axe bearer fights the Demon with front strength, like any ordinary foe", () => {
    const s = clone(fightS({ party: [member(MAN, [MAGIC_AXE])], strangers: [DEMON], seed: 5 }));
    const events = resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    const roll = events.find((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll")!;
    expect(roll.partyTotal - roll.partyRoll).toBe(3); // Man fs 3 (no Axe strength bonus wiring yet — Task 12)
    expect(roll.enemyTotal - roll.enemyRoll).toBe(6); // Demon fs 0 + mp 6
  });
});

import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { enemyMP } from "./combatPlan";
import { HW_STATUE_BASE, HW_MEDUSA, HW_STRANGER_BASE } from "./effects";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_MEDUSA } from "./data/hazards";
import type { PartyMember } from "./state";

/**
 * Extension kit — Holy Water (artifact 16, US-20, SC-EXT-24) and the Scroll (artifact 19, US-21,
 * SC-EXT-25). Holy Water's single `useArtifact(16, target)` target picker spans four pools (a
 * stone party member, a Gallery statue, the area's lurking Medusa marker, a stranger to
 * destroy/weaken) encoded via `holyWaterTargets`' shared offset scheme (effects.ts); the Scroll
 * needs no target at all (any living human reads it, Resolved-10).
 */

const HERO = 0;
const MAN = 5;
const OGRE = 2;
const SPECTRE = 9;
const SORCERER = 11;
const APPRENTICE = 14;
const DEMON = 15;
const T_EYE = 13;
const T_HOLY_WATER = 16;
const T_SCROLL = 19;

const member = (creatureId: number, treasure: number[] = [], overrides: Partial<PartyMember> = {}): PartyMember => ({
  creatureId,
  status: 0,
  dragonKills: 0,
  treasure,
  ...overrides,
});

const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

const DIR_E = 2;
const DIR_W = 4;

// ---------------------------------------------------------------------------------------------
// Holy Water (US-20, SC-EXT-24)
// ---------------------------------------------------------------------------------------------

describe("Holy Water (US-20, SC-EXT-24)", () => {
  describe("REANIMATE — stone party member", () => {
    it("revives a member stoned in the CURRENT area back to full status, no Wizard needed", () => {
      const s = makeState({
        phase: "explore",
        areas: [area],
        partyArea: 0,
        party: [member(HERO, [T_HOLY_WATER]), member(MAN, [], { status: 2, stoneArea: 0 })],
      });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: 1 });

      expect(state.party[1]!.status).toBe(0);
      expect(state.party[1]!.stoneArea).toBeUndefined();
      expect(state.party[0]!.treasure).toEqual([]); // consumed
      expect(events).toContainEqual({ type: "artifactUsed", artifact: T_HOLY_WATER });
      expect(events).toContainEqual({ type: "holyWaterRevived", creatureId: MAN });
    });

    it("is blocked on a member stoned in a DIFFERENT area", () => {
      const s = makeState({
        phase: "explore",
        areas: [area, { ...area, coord: packCoord(1, 51, 50) }],
        partyArea: 0,
        party: [member(HERO, [T_HOLY_WATER]), member(MAN, [], { status: 2, stoneArea: 1 })],
      });
      const { events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: 1 });
      expect(events).toEqual([{ type: "blocked" }]);
    });

    it("is blocked on a living (non-stone) member", () => {
      const s = makeState({ phase: "explore", areas: [area], partyArea: 0, party: [member(HERO, [T_HOLY_WATER]), member(MAN)] });
      const { events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: 1 });
      expect(events).toEqual([{ type: "blocked" }]);
    });
  });

  describe("REANIMATE — a Gallery statue", () => {
    it("wakes it into strangers for an immediate, normal reaction test", () => {
      const s = makeState({
        phase: "explore",
        areas: [area],
        partyArea: 0,
        statues: [MAN],
        party: [member(HERO, [T_HOLY_WATER])],
      });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STATUE_BASE });

      expect(state.statues).toEqual([]);
      expect(state.strangers).toEqual([MAN]);
      expect(state.phase).toBe("encounter");
      expect(events).toContainEqual({ type: "holyWaterStatueWoke", creatureId: MAN });
      expect(legalActions(state)).toContainEqual({ type: "test" }); // the standard reaction flow follows
    });

    it("targets the correct statue by index when more than one is present", () => {
      const s = makeState({
        phase: "explore",
        areas: [area],
        partyArea: 0,
        statues: [MAN, OGRE],
        party: [member(HERO, [T_HOLY_WATER])],
      });
      const { state } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STATUE_BASE + 1 });

      expect(state.statues).toEqual([MAN]); // OGRE (index 1) woke — MAN stays stone
      expect(state.strangers).toEqual([OGRE]);
    });
  });

  describe("DESTROY — a lurking Medusa marker", () => {
    it("removes the marker permanently — no dice, no re-gaze on a later revisit", () => {
      const START = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };
      const MEDUSA_ROOM = { card: 8 | 16, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [300 + HAZARD_MEDUSA], flags: 0, indiffCount: 0 };
      // A Wolf (immune to Medusa's gaze — SC-EXT-18) rides along so the reload-and-gaze on first
      // entry can never petrify the WHOLE party away, keeping this test deterministic regardless of
      // seed, while the Hero still rolls (so `medusaGaze` actually fires — a pure-Wolf roster rolls
      // no dice at all and never emits it, per hazards.ts's `rolls.length` guard).
      const WOLF = 20;
      const s = makeState({
        areas: [START, MEDUSA_ROOM],
        partyArea: 0,
        prev: 0,
        party: [member(HERO, [T_HOLY_WATER]), member(WOLF)],
        seed: 1,
      });

      const entered = reduce(s, { type: "move", dir: DIR_E });
      expect(entered.events.some((e) => e.type === "medusaGaze")).toBe(true); // she reloads and gazes
      expect(entered.state.areas[1]!.contents).toContain(300 + HAZARD_MEDUSA); // re-parked after firing

      const destroyed = reduce(entered.state, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_MEDUSA });
      expect(destroyed.events).toContainEqual({ type: "artifactUsed", artifact: T_HOLY_WATER });
      expect(destroyed.events).toContainEqual({ type: "holyWaterMedusaDestroyed" });
      expect(destroyed.state.areas[1]!.contents).not.toContain(300 + HAZARD_MEDUSA);
      expect(destroyed.state.party[0]!.treasure).toEqual([]); // consumed

      const left = reduce(destroyed.state, { type: "move", dir: DIR_W });
      const back = reduce(left.state, { type: "move", dir: DIR_E });
      expect(back.events.some((e) => e.type === "medusaGaze")).toBe(false); // gone for good
    });

    it("is blocked when no Medusa marker is present in the area", () => {
      const s = makeState({ phase: "explore", areas: [area], partyArea: 0, party: [member(HERO, [T_HOLY_WATER])] });
      const { events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_MEDUSA });
      expect(events).toEqual([{ type: "blocked" }]);
    });
  });

  describe("DESTROY — a Spectre or Demon stranger/lurker", () => {
    it("destroys a Spectre outright — no fight, no score", () => {
      const s = makeState({
        phase: "encounter",
        areas: [area],
        partyArea: 0,
        strangers: [SPECTRE],
        party: [member(HERO, [T_HOLY_WATER])],
      });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STRANGER_BASE });

      expect(state.strangers).toEqual([]);
      expect(state.phase).toBe("explore"); // nothing else here — settles straight to explore
      expect(events).toContainEqual({ type: "holyWaterFoeDestroyed", creatureId: SPECTRE });
    });

    it("destroys an engaged Demon mid-fight — the fight ends with no survivors", () => {
      const s = makeState({
        phase: "fight",
        fight: { surprise: 0, round: 1, focus: 0 },
        areas: [area],
        partyArea: 0,
        strangers: [DEMON],
        party: [member(HERO, [T_HOLY_WATER])],
      });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STRANGER_BASE });

      expect(state.strangers).toEqual([]);
      expect(state.fight).toBeNull();
      expect(state.phase).toBe("explore");
      expect(events).toContainEqual({ type: "holyWaterFoeDestroyed", creatureId: DEMON });
    });
  });

  describe("WEAKEN — Sorcerer/Apprentice", () => {
    it("Sorcerer: -2 stacks additively with an existing Lotus Dust weaken", () => {
      const s = makeState({
        phase: "encounter",
        areas: [area],
        partyArea: 0,
        strangers: [SORCERER],
        lotusOnSorcerer: true,
        party: [member(HERO, [T_HOLY_WATER])],
      });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STRANGER_BASE });

      expect(state.holyWaterOnSorcerer).toBe(true);
      expect(enemyMP(state, SORCERER)).toBe(5); // 9 - 2 (lotus) - 2 (holy water)
      expect(events).toContainEqual({ type: "holyWaterWeakened", creatureId: SORCERER });
    });

    it("Sorcerer: every stacking source together still never drives mp negative (floor 0)", () => {
      const s = makeState({ strangers: [SORCERER], lotusOnSorcerer: true, holyWaterOnSorcerer: true, party: [member(HERO, [T_EYE])] });
      expect(enemyMP(s, SORCERER)).toBe(3); // 9 - 2 (eye) - 2 (lotus) - 2 (holy water), Math.max(0, …) never underflows
    });

    it("Apprentice: -2 from her base mp", () => {
      const s = makeState({
        phase: "encounter",
        areas: [area],
        partyArea: 0,
        strangers: [APPRENTICE],
        party: [member(HERO, [T_HOLY_WATER])],
      });
      const { state, events } = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STRANGER_BASE });

      expect(state.holyWaterOnApprentice).toBe(true);
      expect(enemyMP(state, APPRENTICE)).toBe(5); // 7 - 2
      expect(events).toContainEqual({ type: "holyWaterWeakened", creatureId: APPRENTICE });
    });

    it("Apprentice: floored at 0 once the Eye of God is also active", () => {
      const s = makeState({ strangers: [APPRENTICE], holyWaterOnApprentice: true, party: [member(HERO, [T_EYE])] });
      expect(enemyMP(s, APPRENTICE)).toBe(0); // the Eye nullifies her entirely, same as any non-Sorcerer foe
    });
  });

  it("is consumed on ANY use — a second use afterward is blocked (no one bears it anymore)", () => {
    const s = makeState({
      phase: "explore",
      areas: [area],
      partyArea: 0,
      party: [member(HERO, [T_HOLY_WATER]), member(MAN, [], { status: 2, stoneArea: 0 })],
    });
    const first = reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: 1 });
    expect(first.state.party[0]!.treasure).toEqual([]);

    const second = reduce(first.state, { type: "useArtifact", artifact: T_HOLY_WATER, target: 1 });
    expect(second.events).toEqual([{ type: "blocked" }]);
  });

  it("is blocked with no target, or a target matching no legal pool", () => {
    const s = makeState({ phase: "explore", areas: [area], partyArea: 0, party: [member(HERO, [T_HOLY_WATER])] });
    expect(reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "useArtifact", artifact: T_HOLY_WATER, target: 999999 }).events).toEqual([{ type: "blocked" }]);
  });

  it("legalActions offers every legal target together — a stone member, a statue, AND a lurking Medusa marker at once", () => {
    const medusaArea = { ...area, contents: [300 + HAZARD_MEDUSA] };
    const s = makeState({
      phase: "explore",
      areas: [medusaArea],
      partyArea: 0,
      statues: [MAN],
      party: [member(HERO, [T_HOLY_WATER]), member(OGRE, [], { status: 2, stoneArea: 0 })],
    });
    const acts = legalActions(s);

    expect(acts).toContainEqual({ type: "useArtifact", artifact: T_HOLY_WATER, target: 1 }); // revive the stone Ogre
    expect(acts).toContainEqual({ type: "useArtifact", artifact: T_HOLY_WATER, target: HW_STATUE_BASE }); // wake the statue
    expect(acts).toContainEqual({ type: "useArtifact", artifact: T_HOLY_WATER, target: HW_MEDUSA }); // destroy the Medusa marker
  });
});

// ---------------------------------------------------------------------------------------------
// Scroll (US-21, SC-EXT-25)
// ---------------------------------------------------------------------------------------------

describe("Scroll (US-21, SC-EXT-25)", () => {
  it("removes every mp===0 stranger with no score change; mp>0 strangers remain", () => {
    const s = makeState({
      phase: "encounter",
      areas: [area],
      partyArea: 0,
      strangers: [MAN, SPECTRE, OGRE], // Man/Ogre mp 0 (mundane); Spectre mp 5 (magical)
      party: [member(HERO, [T_SCROLL])],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });

    expect(state.strangers).toEqual([SPECTRE]);
    expect(state.party.some((m) => m.creatureId === MAN || m.creatureId === OGRE)).toBe(false); // destroyed, never recruited
    expect(state.party[0]!.treasure).toEqual([]); // consumed
    expect(events).toContainEqual({ type: "artifactUsed", artifact: T_SCROLL });
    expect(events).toContainEqual({ type: "scrollRead", destroyed: [MAN, OGRE], survivors: [SPECTRE] });
  });

  it("curses the party — visible as -1 on the party's next roll", () => {
    const s = makeState({ phase: "encounter", areas: [area], partyArea: 0, strangers: [MAN], party: [member(HERO, [T_SCROLL])] });
    const { state } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });
    expect(state.curses).toBe(1); // the standing curse — activeCurses/partyRollBonus already apply -1 per curse
  });

  it("is illegal without a living human present", () => {
    const s = makeState({ phase: "encounter", areas: [area], partyArea: 0, strangers: [MAN], party: [member(OGRE, [T_SCROLL])] });
    const { events } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("is illegal with no strangers present", () => {
    const s = makeState({ phase: "encounter", areas: [area], partyArea: 0, strangers: [], party: [member(HERO, [T_SCROLL])] });
    const { events } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("is illegal outside encounter/fight phase", () => {
    const s = makeState({ phase: "explore", areas: [area], partyArea: 0, party: [member(HERO, [T_SCROLL])] });
    const { events } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("mid-fight: survivors remain and the fight continues", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 2, focus: 0 },
      areas: [area],
      partyArea: 0,
      strangers: [MAN, SPECTRE],
      party: [member(HERO, [T_SCROLL])],
    });
    const { state } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });

    expect(state.strangers).toEqual([SPECTRE]);
    expect(state.phase).toBe("fight"); // still fighting the survivor
    expect(state.fight).not.toBeNull();
  });

  it("mid-fight: destroying every stranger ends the fight", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 2, focus: 0 },
      areas: [area],
      partyArea: 0,
      strangers: [MAN, OGRE],
      party: [member(HERO, [T_SCROLL])],
    });
    const { state } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });

    expect(state.strangers).toEqual([]);
    expect(state.fight).toBeNull();
    expect(state.phase).toBe("explore");
  });

  it("needs no reader selection — any living human anywhere in the party satisfies the gate (Resolved-10)", () => {
    const s = makeState({
      phase: "encounter",
      areas: [area],
      partyArea: 0,
      strangers: [MAN],
      party: [member(OGRE, [T_SCROLL]), member(HERO)], // the Ogre carries it; the Hero is simply present
    });
    const { events } = reduce(s, { type: "useArtifact", artifact: T_SCROLL });
    expect(events).toContainEqual({ type: "artifactUsed", artifact: T_SCROLL });
  });

  it("legalActions offers the Scroll only when a human is present and strangers remain", () => {
    const withHuman = makeState({ phase: "encounter", areas: [area], partyArea: 0, strangers: [MAN], party: [member(HERO, [T_SCROLL])] });
    expect(legalActions(withHuman)).toContainEqual({ type: "useArtifact", artifact: T_SCROLL });

    const noHuman = makeState({ phase: "encounter", areas: [area], partyArea: 0, strangers: [MAN], party: [member(OGRE, [T_SCROLL])] });
    expect(legalActions(noHuman)).not.toContainEqual({ type: "useArtifact", artifact: T_SCROLL });

    const noStrangers = makeState({ phase: "encounter", areas: [area], partyArea: 0, strangers: [], party: [member(HERO, [T_SCROLL])] });
    expect(legalActions(noStrangers)).not.toContainEqual({ type: "useArtifact", artifact: T_SCROLL });
  });
});
describe("Holy Water pre-gaze destroy in the Medusa pause (design answer 2026-07-27)", () => {
  // The pause opens when Medusa is drawn while Lotus Dust is held (SC-7.2-14). With Holy Water
  // ALSO held, the player may destroy her outright before her gaze lands — a third pause option.
  const pauseState = (withHolyWater: boolean) => {
    const s = makeState({
      phase: "medusa",
      medusaPause: { freshEntry: true },
      party: [{ creatureId: HERO, status: 0, dragonKills: 0, treasure: withHolyWater ? [5, T_HOLY_WATER] : [5] }],
      hazards: [3], // HAZARD_MEDUSA pending, pre-gaze
      strangers: [],
    });
    return s;
  };

  it("offers useArtifact(16) in the pause only when Holy Water is held", () => {
    const withHw = legalActions(pauseState(true));
    expect(withHw).toContainEqual({ type: "useArtifact", artifact: 16 });
    expect(withHw).toContainEqual({ type: "useArtifact", artifact: 5 });
    expect(withHw).toContainEqual({ type: "proceed" });
    const without = legalActions(pauseState(false));
    expect(without).toEqual([{ type: "useArtifact", artifact: 5 }, { type: "proceed" }]);
  });

  it("destroys Medusa before her gaze: no petrification, consumed, pause resumes, gone for good", () => {
    const s = pauseState(true);
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 16 });
    expect(events).toContainEqual({ type: "holyWaterMedusaDestroyed" });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(false);
    expect(state.phase).not.toBe("medusa");
    expect(state.party[0]!.status).toBe(0); // nobody petrified
    expect(state.party[0]!.treasure).toEqual([5]); // Holy Water consumed, Lotus kept
    expect(state.hazards.includes(3)).toBe(false);
    // Permanent: the area's persisted contents never re-park her.
    expect(state.areas[state.partyArea]!.contents.includes(303)).toBe(false);
  });
});


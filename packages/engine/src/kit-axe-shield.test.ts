import { describe, it, expect } from "vitest";
import { frontStrength } from "./combat";
import { previewPlan, resolvePlannedRound } from "./combatPlan";
import { reduce } from "./reduce";
import { applyHazards } from "./hazards";
import { HAZARD_MEDUSA } from "./data/hazards";
import { BORNEABLE } from "./loot";
import { makeState } from "./testkit";
import type { PartyMember } from "./state";
import type { GameEvent } from "./actions";

/**
 * Extension kit — Magic Axe (artifact 17, US-24, SC-EXT-26) and Magic Shield (artifact 20, US-23,
 * SC-EXT-27). Both mirror the Magic Sword's possession-based, borne-on-death/petrify shape
 * (loot.ts's BORNEABLE, combat.ts's frontStrength) but bring their own rosters and, for the
 * Shield, an entirely new PAIRING-scoped mechanic: the Axe's fs bonus (+1 Hero/W-Hero/Man/Woman,
 * +3 Dwarf) plus its Demon-engagement bypass (already wired in Task 11 — verified, not
 * re-implemented, here); the Shield's ward, which zeroes (or, vs the Sorcerer/Apprentice, −2s) ONLY
 * the mp of the stranger paired against the Shield's own eligible bearer (Man/Woman/Hero/W-Hero,
 * Resolved-9/15) — never a stranger paired against a different match. An active Eye of God
 * nullifies both artefacts, same as the Sword.
 */

const HERO = 0;
const W_HERO = 1;
const OGRE = 2;
const TROLL = 3;
const MAN = 5;
const WOMAN = 6;
const DWARF = 7;
const WIZARD = 8;
const SORCERER = 11;
const T_GOLD = 1;
const T_EYE = 13;
const T_AXE = 17;
const T_SHIELD = 20;

const member = (creatureId: number, treasure: number[] = [], overrides: Partial<PartyMember> = {}): PartyMember => ({
  creatureId,
  status: 0,
  dragonKills: 0,
  treasure,
  ...overrides,
});

const fightS = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });

const clone = (s: ReturnType<typeof makeState>) =>
  ({ ...s, fight: s.fight ? { ...s.fight } : null, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m })) });

// ---------------------------------------------------------------------------------------------
// Magic Axe (US-24, SC-EXT-26)
// ---------------------------------------------------------------------------------------------

describe("Magic Axe (US-24, SC-EXT-26)", () => {
  it("gives +1 fs to Hero/W-Hero/Man/Woman, +3 to a Dwarf, and nothing to an Ogre", () => {
    expect(frontStrength(member(HERO, [T_AXE]))).toBe(6);   // Hero FS 5 + 1
    expect(frontStrength(member(W_HERO, [T_AXE]))).toBe(5); // W-Hero FS 4 + 1
    expect(frontStrength(member(MAN, [T_AXE]))).toBe(4);    // Man FS 3 + 1
    expect(frontStrength(member(WOMAN, [T_AXE]))).toBe(3);  // Woman FS 2 + 1
    expect(frontStrength(member(DWARF, [T_AXE]))).toBe(4);  // Dwarf FS 1 + 3
    expect(frontStrength(member(OGRE, [T_AXE]))).toBe(5);   // Ogre FS 5 + 0 — bears it, no bonus
  });

  it("is nullified by an active Eye of God", () => {
    const s = makeState({ party: [member(DWARF, [T_AXE, T_EYE])] });
    expect(frontStrength(s.party[0]!, s)).toBe(1); // Dwarf FS 1 only — the +3 is powerless
  });

  it("shows its own bonus-table chip in the fight-plan preview, mirroring the Sword's", () => {
    const s = fightS({ party: [member(DWARF, [T_AXE])], strangers: [TROLL] });
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.modifiers.find((m) => m.label === "Magic Axe · Dwarf")).toMatchObject({ value: 3, side: "party", roll: false });
    expect(pv.matches[0]!.partyStr).toBe(4); // Dwarf FS 1 + Axe +3
  });

  it("is BORNEABLE and petrifies WITH a stoned bearer (carried items still spill)", () => {
    expect(BORNEABLE).toContain(T_AXE);
    for (let seed = 1; seed < 500; seed++) {
      const s = makeState({
        seed,
        party: [member(HERO, [T_AXE, T_GOLD], { borne: [T_AXE] })],
        hazards: [HAZARD_MEDUSA],
      });
      const events = applyHazards(s).events;
      const rolls = events.find((e) => e.type === "medusaGaze") as { rolls: { petrified: boolean }[] } | undefined;
      if (!rolls?.rolls[0]?.petrified) continue;
      expect(s.party[0]!.status).toBe(2);
      expect(s.party[0]!.treasure).toEqual([T_AXE]); // the borne Axe stays on the statue
      expect(s.treasures).toContain(T_GOLD);          // the carried Gold spills to the floor
      return;
    }
    throw new Error("no petrifying seed found");
  });
});

// ---------------------------------------------------------------------------------------------
// Magic Shield (US-23, SC-EXT-27)
// ---------------------------------------------------------------------------------------------

describe("Magic Shield (US-23, SC-EXT-27)", () => {
  it("is BORNEABLE, and setBorne is legal for ANY member — even one ineligible for the ward", () => {
    expect(BORNEABLE).toContain(T_SHIELD);
    const s = makeState({ party: [member(WIZARD, [T_SHIELD])] }); // a Wizard: never ward-eligible
    const r = reduce(s, { type: "setBorne", mi: 0, idx: 0, borne: true });
    expect(r.events).not.toContainEqual({ type: "blocked" });
    expect(r.state.party[0]!.borne).toEqual([T_SHIELD]);
  });

  it("is inert when held by an ineligible bearer (a Wizard) — the paired enemy's mp counts in full", () => {
    const s = fightS({ party: [member(WIZARD, [T_SHIELD])], strangers: [WIZARD] }); // stranger Wizard: FS 2 + MP 5
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.shieldWard).toEqual([]);
    expect(pv.matches[0]!.enemyStr).toBe(7); // FS 2 + MP 5, unwarded
  });

  it("held by a Woman: nullifies the paired enemy's mp, while an enemy paired against someone else keeps its mp", () => {
    const s = fightS({
      party: [member(WOMAN, [T_SHIELD]), member(HERO)],
      strangers: [WIZARD, WIZARD], // two ordinary mp-5 strangers, one per match
    });
    const pv = previewPlan(s, {
      matches: [
        { front: [0], backers: [], strangers: [0] }, // Woman+Shield vs stranger 0 — paired, warded
        { front: [1], backers: [], strangers: [1] }, // Hero vs stranger 1 — not paired against the Shield
      ],
    });
    expect(pv.matches[0]!.shieldWard).toEqual([{ creatureId: WIZARD, mode: "nullify" }]);
    expect(pv.matches[0]!.enemyStr).toBe(2);  // FS 2 + MP 0 — nullified
    expect(pv.matches[1]!.shieldWard).toEqual([]);
    expect(pv.matches[1]!.enemyStr).toBe(7);  // FS 2 + MP 5 — untouched, paired against the Hero instead
  });

  it("vs the Sorcerer: −2 instead of a full nullify, stacking additively with an existing Lotus Dust weaken", () => {
    const s = fightS({ party: [member(WOMAN, [T_SHIELD])], strangers: [SORCERER], lotusOnSorcerer: true });
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.shieldWard).toEqual([{ creatureId: SORCERER, mode: "weaken" }]);
    expect(pv.matches[0]!.enemyStr).toBe(9); // FS 4 + MP (9 − 2 lotus − 2 shield = 5)
  });

  it("does not fire a notice for a stranger it never bites (mp already 0)", () => {
    const s = clone(fightS({ party: [member(WOMAN, [T_SHIELD])], strangers: [TROLL], seed: 5 })); // Troll: MP 0
    const events = resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events.some((e) => e.type === "shieldWarded")).toBe(false);
  });

  it("fires one shieldWarded notice per round it actually bites, and none for an unwarded pairing", () => {
    const s = clone(fightS({
      party: [member(WOMAN, [T_SHIELD]), member(HERO)],
      strangers: [WIZARD, WIZARD],
      seed: 5,
    }));
    const events = resolvePlannedRound(s, {
      matches: [
        { front: [0], backers: [], strangers: [0] },
        { front: [1], backers: [], strangers: [1] },
      ],
    });
    const warded = events.filter((e): e is Extract<GameEvent, { type: "shieldWarded" }> => e.type === "shieldWarded");
    expect(warded).toEqual([{ type: "shieldWarded", creatureId: WIZARD, mode: "nullify" }]);
  });

  it("an active Eye of God nullifies the ward (Sword/Axe precedent) — only the Eye's own Sorcerer penalty applies", () => {
    // The Eye already weakens the Sorcerer by 2 on its own (SC-9.4-8) — isolate the Shield's OWN
    // extra -2 by checking the total stops at 7, not 5 (which would mean the ward fired anyway).
    const s = fightS({ party: [member(WOMAN, [T_SHIELD, T_AXE, T_EYE])], strangers: [SORCERER] });
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.shieldWard).toEqual([]);
    expect(pv.matches[0]!.enemyStr).toBe(11); // FS 4 + MP (9 − 2 eye only)
    // The same Eye nullifies the Axe's fs bonus on the very same member.
    expect(pv.matches[0]!.partyStr).toBe(2); // Woman FS 2 only — no Axe +1
  });
});

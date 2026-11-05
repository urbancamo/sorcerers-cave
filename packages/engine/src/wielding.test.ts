import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { frontStrength, casterMP, partyRollBonus } from "./combat";
import { ringInvincible, shieldWardActive, talismanWardsSpectres, eyePresent } from "./effects";
import { applyHazards, hasStaffWizard } from "./hazards";
import { HAZARD_GHOULS, HAZARD_HARPIES } from "./data/hazards";
import { sweepFallen, wieldConflict } from "./loot";
import { matchModifiers, matchStrength } from "./revisedRound";
import { driveStrangers } from "./strangerDriver";
import type { GameState, PartyMember } from "./state";

// Wielding weapons (docs/requirements/2026-11-05-wielding-weapons-spec.md): an item's combat benefit applies only while it is in use —
// wielded (Sword 3, Staff 9, Axe 17, Shield 20) or worn (Ring 10, Talisman 7). `borne` is the in-use list; carrying alone gives nothing.
const SWORD = 3, STAFF = 9, RING = 10, TALISMAN = 7, AXE = 17, SHIELD = 20, EYE = 13;
const HERO = 0, DWARF = 7, WIZARD = 8, PRIEST = 4;
const mem = (creatureId: number, treasure: number[] = [], borne?: number[]): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure, ...(borne ? { borne } : {}) }) as PartyMember;
const set = (s: GameState, mi: number, idx: number, borne: boolean) => reduce(s, { type: "setBorne", mi, idx, borne });

describe("W-2/W-3: wield and wear", () => {
  it("the Talisman can be worn, alongside everything else", () => {
    let s = makeState({ party: [mem(HERO, [SWORD, SHIELD, RING, TALISMAN])] });
    for (const idx of [0, 1, 2, 3]) s = set(s, 0, idx, true).state;
    expect(s.party[0]!.borne!.slice().sort((a, b) => a - b)).toEqual([SWORD, TALISMAN, RING, SHIELD].sort((a, b) => a - b));
  });
  it("only one attacking weapon (Sword, Axe or Staff) can be wielded at a time", () => {
    const s0 = makeState({ party: [mem(HERO, [SWORD, AXE, STAFF], [SWORD])] });
    expect(wieldConflict(s0.party[0]!, AXE)).toBe(SWORD);
    expect(wieldConflict(s0.party[0]!, STAFF)).toBe(SWORD);
    expect(set(s0, 0, 1, true).events).toContainEqual({ type: "blocked" });
    expect(set(s0, 0, 2, true).events).toContainEqual({ type: "blocked" });
    const stowed = set(s0, 0, 0, false).state;
    expect(set(stowed, 0, 1, true).state.party[0]!.borne).toEqual([AXE]); // free again once the Sword is stowed
  });
  it("the Shield is wielded together with an attacking weapon, and never conflicts with it", () => {
    const s0 = makeState({ party: [mem(HERO, [AXE, SHIELD], [AXE])] });
    expect(wieldConflict(s0.party[0]!, SHIELD)).toBeNull();
    expect(set(s0, 0, 1, true).state.party[0]!.borne).toEqual([AXE, SHIELD]);
  });
  it("wielding stays blocked mid-fight", () => {
    const fight = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, party: [mem(HERO, [TALISMAN])] });
    expect(set(fight, 0, 0, true).events).toContainEqual({ type: "blocked" });
  });
});

describe("W-1/W-6: nothing is in use unless the player puts it there", () => {
  it("an item arrives carried after a handover", () => {
    const s = makeState({ party: [mem(HERO, [SWORD], [SWORD]), mem(5)] });
    const after = reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 }).state;
    expect(after.party[1]!.treasure).toEqual([SWORD]);
    expect(after.party[1]!.borne ?? []).toEqual([]);
  });
});

describe("W-4: the combat effect needs the item in use", () => {
  it("Sword: +2 for a Hero only when wielded", () => {
    expect(frontStrength(mem(HERO, [SWORD]))).toBe(5);
    expect(frontStrength(mem(HERO, [SWORD], [SWORD]))).toBe(7);
  });
  it("Axe: +3 for a Dwarf only when wielded", () => {
    expect(frontStrength(mem(DWARF, [AXE]))).toBe(1);
    expect(frontStrength(mem(DWARF, [AXE], [AXE]))).toBe(4);
  });
  it("Staff: magic power only when wielded", () => {
    expect(casterMP(mem(WIZARD, [STAFF]))).toBe(5);
    expect(casterMP(mem(WIZARD, [STAFF], [STAFF]))).toBe(7);
    expect(casterMP(mem(PRIEST, [STAFF], [STAFF]))).toBe(3);
  });
  it("Ring: +1 to the party's rolls only when worn", () => {
    expect(partyRollBonus(makeState({ party: [mem(HERO, [RING])] }))).toBe(0);
    expect(partyRollBonus(makeState({ party: [mem(HERO, [RING], [RING])] }))).toBe(1);
  });
  it("Ring: invincible on level 4+ only when worn", () => {
    const worn = makeState({ level: 4, party: [mem(HERO, [RING], [RING])] });
    const carried = makeState({ level: 4, party: [mem(HERO, [RING])] });
    expect(ringInvincible(worn.party[0]!, worn)).toBe(true);
    expect(ringInvincible(carried.party[0]!, carried)).toBe(false);
  });
  it("Shield: the ward is live only when wielded by an eligible bearer", () => {
    const carried = makeState({ party: [mem(HERO, [SHIELD])] });
    const wielded = makeState({ party: [mem(HERO, [SHIELD], [SHIELD])] });
    expect(shieldWardActive(carried, carried.party[0]!)).toBe(false);
    expect(shieldWardActive(wielded, wielded.party[0]!)).toBe(true);
  });
  it("Talisman: wards Spectres on level 4+ only when worn, by any one living member for the whole party", () => {
    expect(talismanWardsSpectres(makeState({ level: 4, party: [mem(HERO), mem(5, [TALISMAN])] }))).toBe(false);
    expect(talismanWardsSpectres(makeState({ level: 4, party: [mem(HERO), mem(5, [TALISMAN], [TALISMAN])] }))).toBe(true);
  });
  it("the Eye of God still works carried", () => {
    expect(eyePresent(makeState({ party: [mem(HERO, [EYE])] }))).toBe(true);
  });
  it("the revised fight's breakdown and totals count a weapon only while it is wielded", () => {
    const fight = (borne: number[]) => {
      let st = driveStrangers(reduce(makeState({ phase: "encounter", strangers: [2], party: [mem(HERO, [SWORD], borne)], seed: 1, variants: { combatRevision: true } }), { type: "attack" }).state).state;
      st.fight!.rev!.matches = [{ pf: [0], pb: [], sf: [0], sb: [] }];
      return st;
    };
    const carried = fight([]), wielded = fight([SWORD]);
    const m = (st: GameState) => st.fight!.rev!.matches[0]!;
    expect(matchModifiers(carried, m(carried)).chips.some((c) => c.label.includes("Magic Sword"))).toBe(false);
    expect(matchModifiers(wielded, m(wielded)).chips.some((c) => c.label.includes("Magic Sword"))).toBe(true);
    expect(matchStrength(wielded, m(wielded)).party - matchStrength(carried, m(carried)).party).toBe(2);
  });
});

describe("W-4: the Talisman and the Staff outside combat", () => {
  const withHazard = (hz: number, party: PartyMember[]) => { const s = makeState({ party, hazards: [hz] }); return applyHazards(s).events; };
  it("a worn Talisman wards Ghouls; a carried one does not", () => {
    expect(withHazard(HAZARD_GHOULS, [mem(HERO, [TALISMAN], [TALISMAN])])).toContainEqual({ type: "ghoulsWarded" });
    expect(withHazard(HAZARD_GHOULS, [mem(HERO, [TALISMAN])]).some((e) => e.type === "ghoulsWarded")).toBe(false);
  });
  it("a worn Talisman keeps the Harpies parked; a carried one lets them strike", () => {
    const parked = withHazard(HAZARD_HARPIES, [mem(HERO, [TALISMAN, SWORD], [TALISMAN])]);
    expect(parked).toContainEqual({ type: "harpiesLurk" });
    const struck = withHazard(HAZARD_HARPIES, [mem(HERO, [TALISMAN, SWORD])]);
    expect(struck.some((e) => e.type === "harpiesSteal")).toBe(true);
  });
  it("a Wizard's Staff wards Medusa only when wielded", () => {
    expect(hasStaffWizard(makeState({ party: [mem(WIZARD, [STAFF])] }))).toBe(false);
    expect(hasStaffWizard(makeState({ party: [mem(WIZARD, [STAFF], [STAFF])] }))).toBe(true);
  });
});

describe("W-7: nothing is lost with a fallen holder", () => {
  it("a dead member's wielded and worn items all spill like carried ones", () => {
    const s = makeState({ party: [{ ...mem(HERO, [SWORD, RING, TALISMAN, SHIELD, 1], [SWORD, RING, TALISMAN, SHIELD]), status: 3 }] });
    sweepFallen(s, "working");
    expect(s.treasures.slice().sort((a, b) => a - b)).toEqual([1, SWORD, TALISMAN, RING, SHIELD].sort((a, b) => a - b));
    expect(s.party[0]!.treasure).toEqual([]);
    expect(s.party[0]!.borne ?? []).toEqual([]);
  });
});

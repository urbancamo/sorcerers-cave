import { describe, it, expect } from "vitest";
import { frontStrength, casterMP, partyRollBonus, isCaster } from "./combat";
import { makeState } from "./testkit";

const member = (creatureId: number, extra: Partial<{ dragonKills: number; treasure: number[] }> = {}) => ({
  creatureId, status: 0 as const, dragonKills: extra.dragonKills ?? 0, treasure: extra.treasure ?? [],
});

describe("combat strength (spec §9.3)", () => {
  it("frontStrength is FS + dragon-kills + Magic Sword bonus", () => {
    expect(frontStrength(member(0))).toBe(5); // Hero FS 5
    expect(frontStrength(member(0, { dragonKills: 2 }))).toBe(7); // +2 dragon-slayer
    expect(frontStrength(member(0, { treasure: [3] }))).toBe(7); // Hero + Magic Sword +2
    expect(frontStrength(member(5, { treasure: [3] }))).toBe(4); // Man FS 3 + sword +1
    expect(frontStrength(member(3, { treasure: [3] }))).toBe(4); // Troll FS 4, sword gives inhuman +0
  });

  it("a caster fighting hand-to-hand uses its TOTAL strength (FS + magical power)", () => {
    expect(frontStrength(member(8))).toBe(7);                 // Wizard: FS 2 + MP 5
    expect(frontStrength(member(4))).toBe(4);                 // Priest: FS 2 + MP 2
    expect(frontStrength(member(8, { treasure: [9] }))).toBe(9); // Wizard: FS 2 + MP 5 + Magic Staff +2
  });

  it("the Eye nullifies a front caster's magical power but leaves its fighting strength", () => {
    const s = makeState({ party: [member(8, { treasure: [13] })] }); // Wizard holding the Eye of God
    expect(frontStrength(s.party[0]!, s)).toBe(2); // FS 2 only — magic is powerless
  });

  it("casterMP is MP + Magic Staff bonus, and isCaster flags MP>0 creatures", () => {
    expect(isCaster(member(8))).toBe(true); // Wizard
    expect(isCaster(member(0))).toBe(false); // Hero
    expect(casterMP(member(4))).toBe(2); // Priest MP 2
    expect(casterMP(member(4, { treasure: [9] }))).toBe(3); // Priest + Magic Staff +1
    expect(casterMP(member(8, { treasure: [9] }))).toBe(7); // Wizard MP 5 + Staff +2
  });

  it("partyRollBonus is +1 if any living member holds The Ring, minus curses", () => {
    const noRing = makeState({ party: [member(0)] });
    expect(partyRollBonus(noRing)).toBe(0);
    const ring = makeState({ party: [member(0, { treasure: [10] })] });
    expect(partyRollBonus(ring)).toBe(1);
    const cursed = makeState({ party: [member(0, { treasure: [10] })], curses: 2 });
    expect(partyRollBonus(cursed)).toBe(-1); // +1 ring - 2 curses
  });

  it("a slain Sorcerer lifts the curse penalty on party rolls (§Curse)", () => {
    const cursed = makeState({ party: [member(0)], curses: 2 });
    expect(partyRollBonus(cursed)).toBe(-2);
    const sorcererDead = makeState({ party: [member(0)], curses: 2, sorcererKilled: true });
    expect(partyRollBonus(sorcererDead)).toBe(0); // curses no longer bite
  });
});

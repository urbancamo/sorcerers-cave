import { describe, it, expect } from "vitest";
import { defaultLoadout, type Allocation } from "./loadout";

// Creature ids
const HERO = 0, WHERO = 1, OGRE = 2, TROLL = 3, PRIEST = 4, MAN = 5, WOMAN = 6, DWARF = 7, WIZARD = 8;
const SORCERER = 11, APPRENTICE = 14, SCHOLAR = 17, WITCH = 18, THIEF = 19;
// Artefact (treasure) ids
const SWORD = 3, STAFF = 9, RING = 10, EYE = 13, AXE = 17, SHIELD = 20;

const never = () => { throw new Error("no tie expected, so no random pick"); };
const run = (strangers: number[], floor: number[], opts: { eye?: boolean; gear?: number[][]; pick?: (n: number) => number } = {}): Allocation[] =>
  defaultLoadout({ strangers, floor, eyePresent: opts.eye ?? false, gear: opts.gear ?? strangers.map(() => []), pick: opts.pick ?? never });
const owner = (a: Allocation[], artifact: number) => a.find((x) => x.artifact === artifact)?.stranger;

describe("default stranger loadout (V2, 03-OCT-2026) — spec Appendix C", () => {
  it("V1: Hero, Man, Dwarf with Sword, Axe, Shield, Ring", () => {
    const a = run([HERO, MAN, DWARF], [SWORD, AXE, SHIELD, RING]);
    expect(owner(a, SWORD)).toBe(0); // Hero
    expect(owner(a, AXE)).toBe(2); // Dwarf, first preference
    expect(owner(a, SHIELD)).toBe(0); // Hero, bearing the Sword
    expect(owner(a, RING)).toBe(0); // Hero adjusted 5+2 = 7 beats Dwarf 1+3 = 4 and Man 3
  });

  it("V2: the Eye present switches the whole procedure off", () => {
    expect(run([HERO, MAN], [SWORD, RING], { eye: true })).toEqual([]);
  });

  it("V3: Man, Woman, Thief with the Sword → Man before Woman before Thief", () => {
    expect(owner(run([MAN, WOMAN, THIEF], [SWORD]), SWORD)).toBe(0);
    expect(owner(run([THIEF, WOMAN], [SWORD]), SWORD)).toBe(1); // V10: Woman outranks Thief
  });

  it("V4: Wizard, Sorcerer, Priest with Staff and Ring", () => {
    const a = run([WIZARD, SORCERER, PRIEST], [STAFF, RING]);
    expect(owner(a, STAFF)).toBe(1); // Sorcerer first
    expect(owner(a, RING)).toBe(1); // Sorcerer: 13 + 2 (Staff, as a Wizard) beats Wizard 7 and Priest 4
  });

  it("V5: Hero, Man with Sword and Axe → the Axe goes to the Man (Hero already bears the Sword)", () => {
    const a = run([HERO, MAN], [SWORD, AXE]);
    expect(owner(a, SWORD)).toBe(0);
    expect(owner(a, AXE)).toBe(1);
  });

  it("V6: Man, Woman with the Shield and no Sword/Axe → Man (the 'bearing neither' half)", () => {
    expect(owner(run([WOMAN, MAN], [SHIELD]), SHIELD)).toBe(1);
  });

  it("V7: Ogre and Troll cannot bear a Sword or the Ring; both stay on the floor", () => {
    expect(run([OGRE, TROLL], [SWORD, RING])).toEqual([]);
  });

  it("V8: two Men, one Sword → a random pick between the two, and only because of the tie", () => {
    const calls: number[] = [];
    const a = run([MAN, MAN], [SWORD], { pick: (n) => { calls.push(n); return 1; } });
    expect(calls).toEqual([2]);
    expect(owner(a, SWORD)).toBe(1);
    expect(owner(run([MAN, MAN], [SWORD], { pick: () => 0 }), SWORD)).toBe(0);
  });

  it("V9: a lone Hero takes Sword, Shield and Ring; the Axe stays on the floor", () => {
    const a = run([HERO], [SWORD, AXE, SHIELD, RING]);
    expect(owner(a, SWORD)).toBe(0);
    expect(owner(a, AXE)).toBeUndefined();
    expect(owner(a, SHIELD)).toBe(0);
    expect(owner(a, RING)).toBe(0);
  });

  it("V11: a lone Thief counts as a Man: Sword and Shield, but not the Axe (already bears the Sword)", () => {
    const a = run([THIEF], [SWORD, AXE, SHIELD]);
    expect(owner(a, SWORD)).toBe(0);
    expect(owner(a, AXE)).toBeUndefined();
    expect(owner(a, SHIELD)).toBe(0);
  });

  it("V12: Witch and Scholar with the Staff → Witch (4th) before Scholar (6th)", () => {
    expect(owner(run([SCHOLAR, WITCH], [STAFF]), STAFF)).toBe(1);
  });

  it("V13: Apprentice and Priest with Staff and Ring → Apprentice takes both (9+2 = 11 beats 4)", () => {
    const a = run([PRIEST, APPRENTICE], [STAFF, RING]);
    expect(owner(a, STAFF)).toBe(1);
    expect(owner(a, RING)).toBe(1);
  });

  it("V15: Woman-Hero before Man for the Sword", () => {
    expect(owner(run([MAN, WHERO], [SWORD]), SWORD)).toBe(1);
  });

  it("only the artefacts present are allocated; other floor items are ignored", () => {
    expect(run([HERO], [0, 1, 2, 14, 15])).toEqual([]);
  });

  it("existing bearers keep what they hold and count as 'bearing' for later steps", () => {
    // Man already bears the Sword (an earlier round); the Axe must skip him ('not bearing Magic Sword').
    const a = run([MAN, WOMAN], [AXE], { gear: [[SWORD], []] });
    expect(owner(a, AXE)).toBe(1);
  });

  it("the Ring tie-break: equal adjusted strength falls to the type list, then a random pick", () => {
    // Man 3 and Scholar fs2+mp1 = 3 tie → Man precedes Scholar on the Ring list (8th vs 9th).
    expect(owner(run([SCHOLAR, MAN], [RING]), RING)).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { swordBonus, axeBonus, staffBonus, shieldEligible, ringEligible, swordFightsSpectre } from "./capabilities";

// Creature ids: 0 Hero, 1 W-Hero, 2 Ogre, 3 Troll, 4 Priest, 5 Man, 6 Woman, 7 Dwarf, 8 Wizard,
// 11 Sorcerer, 14 Apprentice, 16 Lion, 17 Scholar, 18 Witch, 19 Thief, 20 Wolf.
const HERO = 0, WHERO = 1, OGRE = 2, TROLL = 3, PRIEST = 4, MAN = 5, WOMAN = 6, DWARF = 7, WIZARD = 8;
const SORCERER = 11, APPRENTICE = 14, LION = 16, SCHOLAR = 17, WITCH = 18, THIEF = 19, WOLF = 20;

describe("capability table ('uses artefacts as' / 'has the capabilities of')", () => {
  it("Magic Sword: +2 for a Hero-class bearer, +1 for a Man-class or Woman-class bearer, else 0", () => {
    expect(swordBonus(HERO)).toBe(2);
    expect(swordBonus(WHERO)).toBe(2); // capabilities of a woman AND a hero → the better
    expect(swordBonus(MAN)).toBe(1);
    expect(swordBonus(WOMAN)).toBe(1);
    expect(swordBonus(THIEF)).toBe(1); // uses artefacts as a Man
    for (const id of [OGRE, TROLL, DWARF, PRIEST, WITCH, SCHOLAR, WIZARD, APPRENTICE, SORCERER, LION, WOLF]) expect(swordBonus(id)).toBe(0);
  });

  it("Magic Axe: +3 for a Dwarf, +1 for Hero/W-Hero/Man/Woman/Thief, else 0", () => {
    expect(axeBonus(DWARF)).toBe(3);
    for (const id of [HERO, WHERO, MAN, WOMAN, THIEF]) expect(axeBonus(id)).toBe(1);
    for (const id of [OGRE, TROLL, PRIEST, WIZARD, SORCERER, LION]) expect(axeBonus(id)).toBe(0);
  });

  it("Magic Staff: +1 for the Priest class (Priest, Witch, Scholar), +2 for the Wizard class (Wizard, Apprentice, Sorcerer by house rule)", () => {
    for (const id of [PRIEST, WITCH, SCHOLAR]) expect(staffBonus(id)).toBe(1);
    for (const id of [WIZARD, APPRENTICE, SORCERER]) expect(staffBonus(id)).toBe(2);
    for (const id of [HERO, MAN, THIEF, DWARF, OGRE]) expect(staffBonus(id)).toBe(0);
  });

  it("Magic Shield ward: Hero, W-Hero, Man, Woman and (as a Man) Thief", () => {
    for (const id of [HERO, WHERO, MAN, WOMAN, THIEF]) expect(shieldEligible(id)).toBe(true);
    for (const id of [PRIEST, WIZARD, DWARF, OGRE, SORCERER]) expect(shieldEligible(id)).toBe(false);
  });

  it("The Ring may be worn by the human classes, the priest classes and the Dwarf, never by inhumans", () => {
    for (const id of [HERO, WHERO, MAN, WOMAN, THIEF, PRIEST, WITCH, SCHOLAR, WIZARD, APPRENTICE, SORCERER, DWARF]) expect(ringEligible(id)).toBe(true);
    for (const id of [OGRE, TROLL, LION, WOLF]) expect(ringEligible(id)).toBe(false);
  });

  it("a Sword bearer fights a Spectre hand-to-hand when Hero/W-Hero/Man/Woman/Thief", () => {
    for (const id of [HERO, WHERO, MAN, WOMAN, THIEF]) expect(swordFightsSpectre(id)).toBe(true);
    for (const id of [PRIEST, DWARF, OGRE, WIZARD]) expect(swordFightsSpectre(id)).toBe(false);
  });
});

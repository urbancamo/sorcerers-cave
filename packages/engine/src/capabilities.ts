// Who may use which fight artefact, resolved through creature capability classes rather than
// hard-coded creature ids. Artefact cards were printed for the base game, before the Thief, Witch,
// Scholar and Apprentice existed, so the creature card must be consulted too: Thief uses artefacts as
// a Man, Witch and Scholar as a Priest, Apprentice as a Wizard, and the Woman-Hero "has all the
// capabilities of a woman and a hero". The Sorcerer using artefacts as a Wizard is a HOUSE RULE (not in
// the original rules; Addendum note #4 of docs/rules/Expanded Consolidated Rules PV2026 V2.md).
// Peter's response of 03-OCT-2026, docs/requirements/combat/2026-10-03-combat-revision-technical-spec.md §4.4.2.

type CapabilityClass = "hero" | "man" | "woman" | "priest" | "wizard" | "dwarf";

const C_HERO = 0, C_WHERO = 1, C_PRIEST = 4, C_MAN = 5, C_WOMAN = 6, C_DWARF = 7, C_WIZARD = 8;
const C_SORCERER = 11, C_APPRENTICE = 14, C_SCHOLAR = 17, C_WITCH = 18, C_THIEF = 19;

/** Capability classes of each creature (absent = none, e.g. Ogre, Troll, Lion, Wolf). */
const CLASSES: Readonly<Record<number, readonly CapabilityClass[]>> = {
  [C_HERO]: ["hero"],
  [C_WHERO]: ["hero", "woman"],
  [C_MAN]: ["man"],
  [C_THIEF]: ["man"],
  [C_WOMAN]: ["woman"],
  [C_PRIEST]: ["priest"],
  [C_WITCH]: ["priest"],
  [C_SCHOLAR]: ["priest"],
  [C_WIZARD]: ["wizard"],
  [C_APPRENTICE]: ["wizard"],
  [C_SORCERER]: ["wizard"],
  [C_DWARF]: ["dwarf"],
};

const is = (creatureId: number, ...classes: CapabilityClass[]): boolean =>
  (CLASSES[creatureId] ?? []).some((c) => classes.includes(c));

/** Magic Sword strength bonus: +2 for a Hero-class bearer, +1 for a Man- or Woman-class bearer. */
export const swordBonus = (creatureId: number): number => (is(creatureId, "hero") ? 2 : is(creatureId, "man", "woman") ? 1 : 0);

/** Magic Axe strength bonus: +3 for a Dwarf, +1 for a Hero-, Man- or Woman-class bearer. */
export const axeBonus = (creatureId: number): number => (is(creatureId, "dwarf") ? 3 : is(creatureId, "hero", "man", "woman") ? 1 : 0);

/** Magic Staff bonus to magical power: +2 for the Wizard class, +1 for the Priest class (card text says +2 for both; D3 is open). */
export const staffBonus = (creatureId: number): number => (is(creatureId, "wizard") ? 2 : is(creatureId, "priest") ? 1 : 0);

/** Magic Shield: only a Hero-, Man- or Woman-class bearer has its ward live. */
export const shieldEligible = (creatureId: number): boolean => is(creatureId, "hero", "man", "woman");

/** The Ring may be worn by the human classes, the priest classes (Priest, Wizard) and the Dwarf. */
export const ringEligible = (creatureId: number): boolean => is(creatureId, "hero", "man", "woman", "priest", "wizard", "dwarf");

/** A Sword bearer of one of these classes may fight a Spectre hand-to-hand (§Spectre). */
export const swordFightsSpectre = (creatureId: number): boolean => is(creatureId, "hero", "man", "woman");

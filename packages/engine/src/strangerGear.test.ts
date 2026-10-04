import { describe, it, expect } from "vitest";
import { gearOf, removeStranger, addStranger, dropAllGear } from "./strangerGear";
import { equipStrangers } from "./strangerEquip";
import { makeState } from "./testkit";
import type { GameState } from "./state";

const HERO = 0, MAN = 5, WOMAN = 6, OGRE = 2, WHERO = 1;
const SWORD = 3, RING = 10, EYE = 13, AXE = 17, GOLD = 5;

const fightState = (strangers: number[], treasures: number[], over: Partial<GameState> = {}): GameState =>
  makeState({ phase: "fight", strangers, treasures, fight: { surprise: 0, round: 1, focus: 0 }, ...over });

describe("equipStrangers — runs the default loadout against the chamber floor", () => {
  it("moves allocated artefacts from the floor onto the stranger and reports each one", () => {
    const s = fightState([MAN, HERO], [SWORD, GOLD, RING]);
    const events = equipStrangers(s);
    expect(gearOf(s, 1)).toEqual([SWORD, RING]); // Hero takes the Sword and (strongest adjusted) the Ring
    expect(gearOf(s, 0)).toEqual([]);
    expect(s.treasures).toEqual([GOLD]); // everything else stays on the floor
    expect(events).toEqual([
      { type: "strangerEquipped", creatureId: HERO, artifact: SWORD },
      { type: "strangerEquipped", creatureId: HERO, artifact: RING },
    ]);
  });

  it("leaves the state untouched (no `gear` key) when nobody can bear anything", () => {
    const s = fightState([OGRE], [SWORD, GOLD]);
    expect(equipStrangers(s)).toEqual([]);
    expect(s.fight!.gear).toBeUndefined();
    expect(s.treasures).toEqual([SWORD, GOLD]);
  });

  it("does nothing when the Eye lies on the floor", () => {
    const s = fightState([HERO], [SWORD, EYE]);
    expect(equipStrangers(s)).toEqual([]);
    expect(s.treasures).toEqual([SWORD, EYE]);
  });

  it("does nothing when the party holds the Eye", () => {
    const s = fightState([HERO], [SWORD], { party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [EYE] }] });
    expect(equipStrangers(s)).toEqual([]);
  });

  it("a second run only hands out what has since reached the floor, keeping existing bearers' gear", () => {
    const s = fightState([HERO, MAN], [SWORD]);
    equipStrangers(s);
    s.treasures.push(AXE);
    equipStrangers(s);
    expect(gearOf(s, 0)).toEqual([SWORD]);
    expect(gearOf(s, 1)).toEqual([AXE]); // Hero bears the Sword, so the Axe skips him
  });

  it("breaks a genuine tie with the game RNG, deterministically for a given seed", () => {
    const a = fightState([MAN, MAN], [SWORD], { seed: 12345 });
    const b = fightState([MAN, MAN], [SWORD], { seed: 12345 });
    equipStrangers(a); equipStrangers(b);
    expect(a.fight!.gear).toEqual(b.fight!.gear);
    expect(a.seed).not.toBe(12345); // a tie consumed one random pick
    const none = fightState([HERO], [SWORD], { seed: 12345 });
    equipStrangers(none);
    expect(none.seed).toBe(12345); // no tie, no RNG use
  });
});

describe("keeping gear aligned with the strangers", () => {
  it("removeStranger drops the stranger's gear onto the floor and keeps later indices aligned", () => {
    const s = fightState([HERO, MAN, WOMAN], [SWORD, AXE]);
    equipStrangers(s); // Hero: Sword; Man: Axe
    expect(removeStranger(s, 0)).toEqual([SWORD]);
    expect(s.strangers).toEqual([MAN, WOMAN]);
    expect(s.treasures).toEqual([SWORD]); // the Axe is still borne
    expect(gearOf(s, 0)).toEqual([AXE]); // Man, shifted down
    expect(gearOf(s, 1)).toEqual([]);
  });

  it("removeStranger works with no gear at all", () => {
    const s = fightState([MAN, WOMAN], []);
    expect(removeStranger(s, 1)).toEqual([]);
    expect(s.strangers).toEqual([MAN]);
    expect(s.fight!.gear).toBeUndefined();
  });

  it("addStranger appends an unequipped stranger and keeps the arrays the same length", () => {
    const s = fightState([HERO], [SWORD]);
    equipStrangers(s);
    addStranger(s, WHERO);
    expect(s.strangers).toEqual([HERO, WHERO]);
    expect(s.fight!.gear).toHaveLength(2);
    expect(gearOf(s, 1)).toEqual([]);
  });

  it("dropAllGear returns every borne artefact to the floor and clears the record", () => {
    const s = fightState([HERO, MAN], [SWORD, AXE, GOLD]);
    equipStrangers(s);
    dropAllGear(s);
    expect(s.treasures.slice().sort()).toEqual([GOLD, SWORD, AXE].sort());
    expect(s.fight!.gear).toBeUndefined();
  });
});

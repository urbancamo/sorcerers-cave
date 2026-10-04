import { describe, it, expect } from "vitest";
import { frontStrength, casterMP, partyRollBonus } from "./combat";
import { eyePresent, ringInvincible, shieldWardActive } from "./effects";
import { makeState } from "./testkit";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });
const T_SWORD = 3, T_STAFF = 9, T_RING = 10, T_EYE = 13, T_AXE = 17, T_SHIELD = 20;
const THIEF = 19, WITCH = 18, SCHOLAR = 17, APPRENTICE = 14, SORCERER = 11, WHERO = 1;

describe("'uses artefacts as' reaches the strength calculation (Peter, 03-OCT-2026)", () => {
  it("a Thief bears the Sword and Axe like a Man (+1 each)", () => {
    expect(frontStrength(member(THIEF, [T_SWORD]))).toBe(3); // Thief FS 2 + 1
    expect(frontStrength(member(THIEF, [T_AXE]))).toBe(3);
  });

  it("a Witch or Scholar uses the Staff as a Priest (+1 magic); an Apprentice as a Wizard (+2)", () => {
    expect(casterMP(member(WITCH, [T_STAFF]))).toBe(5); // Witch MP 4 + 1
    expect(casterMP(member(SCHOLAR, [T_STAFF]))).toBe(2); // Scholar MP 1 + 1
    expect(casterMP(member(APPRENTICE, [T_STAFF]))).toBe(9); // Apprentice MP 7 + 2
  });

  it("the Sorcerer uses the Staff as a Wizard (house rule)", () => {
    expect(casterMP(member(SORCERER, [T_STAFF]))).toBe(11);
  });

  it("the Woman-Hero still gets the Hero's +2 with the Sword", () => {
    expect(frontStrength(member(WHERO, [T_SWORD]))).toBe(6); // FS 4 + 2
  });

  it("a Thief's Magic Shield ward is live, like a Man's", () => {
    const s = makeState({ party: [member(THIEF, [T_SHIELD])] });
    expect(shieldWardActive(s, s.party[0]!)).toBe(true);
  });
});

describe("the Eye of God is area-wide: held by the party or lying in the area (Peter, 03-OCT-2026)", () => {
  it("eyePresent is true when the Eye is held OR on the floor of the area", () => {
    expect(eyePresent(makeState({ party: [member(0, [T_EYE])] }))).toBe(true);
    expect(eyePresent(makeState({ party: [member(0)], treasures: [T_EYE] }))).toBe(true);
    expect(eyePresent(makeState({ party: [member(0)], treasures: [2] }))).toBe(false);
  });

  it("an Eye lying on the floor switches the party's artefacts and magic off", () => {
    const s = makeState({ party: [member(0, [T_SWORD, T_RING])], treasures: [T_EYE], level: 4 });
    expect(frontStrength(s.party[0]!, s)).toBe(5); // no Sword bonus
    expect(partyRollBonus(s)).toBe(0); // no Ring bonus
    expect(ringInvincible(s.party[0]!, s)).toBe(false);
    const wiz = makeState({ party: [member(8, [T_STAFF])], treasures: [T_EYE] });
    expect(casterMP(wiz.party[0]!, wiz)).toBe(0);
  });
});

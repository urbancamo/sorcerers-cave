import { describe, it, expect } from "vitest";
import { eyeActive, talismanWardsSpectres, ringInvincible, hasWoman, wardOffSpectres, annihilateWithEye, reconcileUnicorns, canUseArtifact } from "./effects";
import { makeState, inUseGear } from "./testkit";
import type { MemberStatus } from "./state";

const member = (creatureId: number, treasure: number[] = [], status: MemberStatus = 0) => ({ creatureId, status, dragonKills: 0, treasure, borne: inUseGear(treasure) });

describe("passive-effect predicates", () => {
  it("eyeActive is true only when a living member holds the Eye (id 13)", () => {
    expect(eyeActive(makeState({ party: [member(0, [13])] }))).toBe(true);
    expect(eyeActive(makeState({ party: [member(0, [13], 3)] }))).toBe(false); // dead bearer
    expect(eyeActive(makeState({ party: [member(0, [])] }))).toBe(false);
  });

  it("talismanWardsSpectres requires the Talisman (id 7) AND level >= 4", () => {
    expect(talismanWardsSpectres(makeState({ party: [member(0, [7])], level: 4 }))).toBe(true);
    expect(talismanWardsSpectres(makeState({ party: [member(0, [7])], level: 3 }))).toBe(false);
    expect(talismanWardsSpectres(makeState({ party: [member(0, [])], level: 4 }))).toBe(false);
  });

  it("ringInvincible requires the Ring (id 10), level >= 4, and no active Eye", () => {
    const s = makeState({ party: [member(0, [10])], level: 4 });
    expect(ringInvincible(s.party[0]!, s)).toBe(true);
    const lowLevel = makeState({ party: [member(0, [10])], level: 3 });
    expect(ringInvincible(lowLevel.party[0]!, lowLevel)).toBe(false);
    const withEye = makeState({ party: [member(0, [10]), member(5, [13])], level: 4 });
    expect(ringInvincible(withEye.party[0]!, withEye)).toBe(false); // Eye negates the Ring
  });

  it("hasWoman is true for a living Woman (id 6) or W-Hero (id 1), but not the Unicorn itself", () => {
    expect(hasWoman(makeState({ party: [member(0), member(6)] }))).toBe(true);
    expect(hasWoman(makeState({ party: [member(0), member(1)] }))).toBe(true);
    expect(hasWoman(makeState({ party: [member(0), member(6, [], 3)] }))).toBe(false); // dead
    expect(hasWoman(makeState({ party: [member(13)] }))).toBe(false); // a Unicorn is not a Woman
  });
});

describe("stranger-sweep helpers", () => {
  it("wardOffSpectres removes Spectres (id 9) only when the Talisman wards at level >= 4", () => {
    const s = makeState({ party: [member(0, [7])], level: 4, strangers: [9, 5, 9] });
    const events = wardOffSpectres(s);
    expect(s.strangers).toEqual([5]);
    expect(events).toEqual([{ type: "wardedOff", creatureId: 9 }, { type: "wardedOff", creatureId: 9 }]);
    const low = makeState({ party: [member(0, [7])], level: 3, strangers: [9, 5] });
    expect(wardOffSpectres(low)).toEqual([]);
    expect(low.strangers).toEqual([9, 5]);
  });

  it("annihilateWithEye destroys Spectres (id 9) when the Eye is held", () => {
    const s = makeState({ party: [member(0, [13])], strangers: [9, 8, 9] });
    const events = annihilateWithEye(s);
    expect(s.strangers).toEqual([8]);
    expect(events).toEqual([{ type: "annihilated", creatureId: 9 }, { type: "annihilated", creatureId: 9 }]);
    const noEye = makeState({ party: [member(0)], strangers: [9] });
    expect(annihilateWithEye(noEye)).toEqual([]);
    expect(noEye.strangers).toEqual([9]);
  });

  it("reconcileUnicorns removes Unicorn allies when no Woman remains", () => {
    const s = makeState({ party: [member(0), member(13, [], 1)] }); // Hero + Unicorn ally, no Woman
    const events = reconcileUnicorns(s);
    expect(s.party.map((m) => m.creatureId)).toEqual([0]);
    expect(events).toEqual([{ type: "unicornDeparted", creatureId: 13 }]);
    const withWoman = makeState({ party: [member(6), member(13, [], 1)] });
    expect(reconcileUnicorns(withWoman)).toEqual([]);
    expect(withWoman.party.map((m) => m.creatureId)).toEqual([6, 13]);
  });
});

describe("canUseArtifact — class eligibility shared by findBearer, artifactActions and the inventory UI", () => {
  const HERO = 0, W_HERO = 1, PRIEST = 4, MAN = 5, WOMAN = 6, WIZARD = 8, DWARF = 7;

  it("Magic Carpet needs a Priest or Wizard", () => {
    expect(canUseArtifact(PRIEST, 4)).toBe(true);
    expect(canUseArtifact(WIZARD, 4)).toBe(true);
    expect(canUseArtifact(HERO, 4)).toBe(false);
  });

  it("Healing Balm needs a Woman, Woman Hero, Priest or Wizard", () => {
    for (const id of [WOMAN, W_HERO, PRIEST, WIZARD]) expect(canUseArtifact(id, 6)).toBe(true);
    expect(canUseArtifact(MAN, 6)).toBe(false);
  });

  it("Charmed Flute is closed to inhumans", () => {
    expect(canUseArtifact(HERO, 12)).toBe(true);
    expect(canUseArtifact(DWARF, 12)).toBe(false);
  });

  it("Lotus Dust and Holy Water are Human/Priest only, so a Dwarf cannot use them", () => {
    expect(canUseArtifact(DWARF, 5)).toBe(false);
    expect(canUseArtifact(DWARF, 16)).toBe(false);
    expect(canUseArtifact(MAN, 5)).toBe(true);
  });

  it("Magic Staff reanimation is the Wizard's", () => {
    expect(canUseArtifact(WIZARD, 9)).toBe(true);
    expect(canUseArtifact(PRIEST, 9)).toBe(false);
  });

  it("an artifact with no class gate is open to everyone", () => {
    expect(canUseArtifact(DWARF, 3)).toBe(true); // Magic Sword: the bonus roster gates the effect, not the bearer
  });
  it("the Strength Potion is administered by a Hero, Woman Hero, Man, Thief or Woman only (U in Peter's Appendices 20261110)", () => {
    expect(canUseArtifact(DWARF, 8)).toBe(false);
    expect(canUseArtifact(5, 8)).toBe(true);
    expect(canUseArtifact(PRIEST, 8)).toBe(false);
  });
  it("the Elixir, like the Scroll and the Talisman, is used by humans and magic users only; the Eye works by being carried (Peter's Appendices 20261110)", () => {
    expect(canUseArtifact(DWARF, 15)).toBe(false);
    expect(canUseArtifact(5, 15)).toBe(true);
  });
});

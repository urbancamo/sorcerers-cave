import { describe, it, expect } from "vitest";
import { makeState } from "./testkit";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { driveStrangers } from "./strangerDriver";
import { eyeActive, eyePresent, talismanWardsSpectres, canUseArtifact } from "./effects";
import { applyHazards } from "./hazards";
import { HAZARD_GHOULS } from "./data/hazards";
import type { GameState, PartyMember } from "./state";

// Peter's Appendices 20261006 ("Who can use artefacts"): the Eye of God, the Scroll and the Talisman are for humans and magic users
// only (MSW, 2026-11-10). An inhuman (Dwarf, Giant, Lion, Ogre, Troll, Unicorn, Wolf) may still carry one, but it does nothing there.
const HERO = 0, OGRE = 2, TROLL = 3, MAN = 5, DWARF = 7, GIANT = 12, LION = 16, WOLF = 20, UNICORN = 13, PRIEST = 4, WITCH = 18;
const TALISMAN = 7, EYE = 13, SCROLL = 19;
const INHUMAN = [DWARF, GIANT, LION, OGRE, TROLL, UNICORN, WOLF];
const member = (creatureId: number, treasure: number[] = [], borne?: number[]): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure, ...(borne ? { borne } : {}) });

describe("canUseArtifact for the Eye, the Scroll and the Talisman", () => {
  it.each([EYE, SCROLL, TALISMAN])("item %i: humans and magic users yes, inhumans no", (item) => {
    for (const id of [HERO, MAN, PRIEST, WITCH]) expect(canUseArtifact(id, item)).toBe(true);
    for (const id of INHUMAN) expect(canUseArtifact(id, item)).toBe(false);
  });
});

describe("the Eye of God", () => {
  const withEye = (carrier: number): GameState => makeState({ party: [member(carrier, [EYE]), member(HERO)] });
  it("is active when a human holds it", () => expect(eyeActive(withEye(MAN))).toBe(true));
  it.each(INHUMAN)("does nothing in the hands of an inhuman (creature %i)", (id) => {
    expect(eyeActive(withEye(id))).toBe(false);
    expect(eyePresent(withEye(id))).toBe(false);
  });
  it("still counts as present when it lies in the chamber, whoever is about", () => {
    expect(eyePresent(makeState({ party: [member(OGRE)], treasures: [EYE] }))).toBe(true);
  });
  it("a human taking over from an inhuman switches it on", () => {
    const s = withEye(OGRE);
    s.party[1]!.treasure.push(EYE); s.party[0]!.treasure = [];
    expect(eyeActive(s)).toBe(true);
  });
});

describe("the Talisman", () => {
  const worn = (carrier: number): GameState => makeState({ level: 4, party: [member(carrier, [TALISMAN], [TALISMAN])] });
  it("wards off Spectres at level 4+ when a human wears it", () => expect(talismanWardsSpectres(worn(HERO))).toBe(true));
  it.each(INHUMAN)("gives no ward when an inhuman wears it (creature %i)", (id) => expect(talismanWardsSpectres(worn(id))).toBe(false));
  it("wards off Ghouls when a human wears it, but not when a Dwarf does", () => {
    const run = (carrier: number) => {
      const s = makeState({ party: [member(carrier, [TALISMAN], [TALISMAN]), member(DWARF)], hazards: [HAZARD_GHOULS], seed: 3 });
      return applyHazards(s).events;
    };
    expect(run(MAN)).toContainEqual({ type: "ghoulsWarded" });
    expect(run(DWARF)).not.toContainEqual({ type: "ghoulsWarded" });
  });
});

describe("the Scroll", () => {
  const classic = (carrier: number): GameState => makeState({ phase: "encounter", strangers: [OGRE], treasures: [], party: [member(carrier, [SCROLL]), member(HERO)] });
  const readable = (s: GameState) => legalActions(s).some((a) => a.type === "useArtifact" && a.artifact === SCROLL);
  it("is offered when a human carries it", () => expect(readable(classic(MAN))).toBe(true));
  it.each(INHUMAN)("is not offered when only an inhuman carries it, even with a human present (creature %i)", (id) => {
    expect(readable(classic(id))).toBe(false);
    expect(reduce(classic(id), { type: "useArtifact", artifact: SCROLL }).events).not.toContainEqual({ type: "artifactUsed", artifact: SCROLL });
  });

  const revised = (carrier: number): GameState =>
    driveStrangers(reduce(makeState({ phase: "encounter", strangers: [OGRE], treasures: [], party: [member(carrier, [SCROLL]), member(HERO)], variants: { combatRevision: true } }), { type: "attack" }).state).state;
  it("in the revised combat, the Scroll step is offered only when a human carries it", () => {
    expect(revised(MAN).fight!.pending).toMatchObject({ by: "party", kind: "scroll" });
    expect(revised(OGRE).fight!.pending?.kind).not.toBe("scroll");
  });
});

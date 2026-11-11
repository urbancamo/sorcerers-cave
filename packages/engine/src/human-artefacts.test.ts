import { describe, it, expect } from "vitest";
import { makeState } from "./testkit";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { driveStrangers } from "./strangerDriver";
import { eyeActive, eyePresent, talismanWardsSpectres, canUseArtifact } from "./effects";
import { applyHazards } from "./hazards";
import { canCarry } from "./pickup";
import { HAZARD_GHOULS } from "./data/hazards";
import type { GameState, PartyMember } from "./state";

// Peter's Appendices 20261110 ("Who can use artefacts", U / C / T): the Talisman, the Scroll, the Elixir and the Strength Potion are USED (worn,
// read, administered) by humans and magic users only; the Dwarf, Giant, Ogre and Troll may CARRY them (C) but they do nothing there; the Lion,
// Unicorn and Wolf carry no artefact at all. The Eye of God works by being CARRIED, by any creature that can carry it. The Elixir is given to ANY member
// of the party (T). (MSW 2026-11-10 first read the earlier 20261006 ticks as "carry too" and gated the Eye as well; the new key corrected that.)
const HERO = 0, OGRE = 2, TROLL = 3, MAN = 5, DWARF = 7, GIANT = 12, LION = 16, WOLF = 20, UNICORN = 13, PRIEST = 4, WITCH = 18;
const TALISMAN = 7, EYE = 13, SCROLL = 19, ELIXIR = 15, POTION = 8;
const CARRIERS = [DWARF, GIANT, OGRE, TROLL];      // "C": carry, do not use
const NO_CARRY = [LION, UNICORN, WOLF];            // blank: carry nothing
const member = (creatureId: number, treasure: number[] = [], borne?: number[]): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure, ...(borne ? { borne } : {}) });

describe("canUseArtifact for the Talisman, the Scroll, the Elixir and the Strength Potion", () => {
  it.each([SCROLL, TALISMAN, ELIXIR])("item %i: humans and magic users yes, inhumans no", (item) => {
    for (const id of [HERO, MAN, PRIEST, WITCH]) expect(canUseArtifact(id, item)).toBe(true);
    for (const id of [...CARRIERS, ...NO_CARRY]) expect(canUseArtifact(id, item)).toBe(false);
  });
  it("the Strength Potion is administered by a Hero, Woman Hero, Man, Thief or Woman, not a magic user", () => {
    for (const id of [HERO, 1, MAN, 19, 6]) expect(canUseArtifact(id, POTION)).toBe(true);
    for (const id of [PRIEST, WITCH, 8, ...CARRIERS, ...NO_CARRY]) expect(canUseArtifact(id, POTION)).toBe(false);
  });
});

describe("carrying: the Lion, the Unicorn and the Wolf carry no artefact; weightless artefacts never stop anyone else", () => {
  it.each(NO_CARRY)("creature %i cannot take an artefact, but can take nothing else either (it has no capacity)", (id) => {
    for (const t of [TALISMAN, EYE, SCROLL, ELIXIR, POTION, 3, 10]) expect(canCarry(member(id), t)).toBe(false);
  });
  it.each([HERO, MAN, PRIEST, WITCH, ...CARRIERS])("creature %i can carry any artefact", (id) => {
    for (const t of [TALISMAN, EYE, SCROLL, ELIXIR, POTION]) expect(canCarry(member(id), t)).toBe(true);
  });
});

describe("the Eye of God", () => {
  const withEye = (carrier: number): GameState => makeState({ party: [member(carrier, [EYE]), member(HERO)] });
  it.each([HERO, MAN, PRIEST, ...CARRIERS])("works by being carried, by anyone who can carry it (creature %i)", (id) => {
    expect(eyeActive(withEye(id))).toBe(true);
    expect(eyePresent(withEye(id))).toBe(true);
  });
  it("is also present when it lies in the chamber", () => {
    expect(eyePresent(makeState({ party: [member(OGRE)], treasures: [EYE] }))).toBe(true);
  });
});

describe("the Talisman", () => {
  const worn = (carrier: number): GameState => makeState({ level: 4, party: [member(carrier, [TALISMAN], [TALISMAN])] });
  it("wards off Spectres at level 4+ when a human wears it", () => expect(talismanWardsSpectres(worn(HERO))).toBe(true));
  it.each(CARRIERS)("gives no ward when an inhuman wears it (creature %i): it must be displayed by one who can use it", (id) => expect(talismanWardsSpectres(worn(id))).toBe(false));
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
  it.each(CARRIERS)("is not offered when only a Dwarf, Giant, Ogre or Troll carries it, even with a human present (creature %i)", (id) => {
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

describe("the Elixir: a human or magic user gives it, to any living member of the party", () => {
  const targets = (party: PartyMember[]) => legalActions(makeState({ phase: "explore", party })).flatMap((a) => (a.type === "useArtifact" && a.artifact === ELIXIR ? [a.target] : []));
  it("is offered to a human carrier for every living member, inhuman ones included", () => {
    expect(targets([member(HERO, [ELIXIR]), member(OGRE), member(PRIEST), member(LION)])).toEqual([0, 1, 2, 3]);
  });
  it.each(CARRIERS)("is not offered when only a Dwarf, Giant, Ogre or Troll carries it (creature %i): nobody there can administer it", (id) => {
    expect(targets([member(id, [ELIXIR]), member(HERO)])).toEqual([]);
  });
  it("the reducer lets a human give it to an Ogre, and the Ogre gets the effect", () => {
    const s = makeState({ phase: "explore", party: [member(HERO, [ELIXIR]), member(OGRE)] });
    const r = reduce(s, { type: "useArtifact", artifact: ELIXIR, target: 1 });
    expect(r.events).toContainEqual({ type: "artifactUsed", artifact: ELIXIR });
    expect(r.events).toContainEqual(expect.objectContaining({ type: "elixirDrunk", creatureId: OGRE }));
    expect(r.state.party[0]!.treasure).not.toContain(ELIXIR);
  });
  it("the reducer refuses when the only holder is an Ogre", () => {
    const s = makeState({ phase: "explore", party: [member(OGRE, [ELIXIR]), member(HERO)] });
    expect(reduce(s, { type: "useArtifact", artifact: ELIXIR, target: 1 }).events).toEqual([{ type: "blocked" }]);
  });
});

describe("the Strength Potion", () => {
  const fight = (party: PartyMember[]): GameState => makeState({ phase: "fight", strangers: [OGRE], fight: { surprise: -1, round: 1, focus: 0 } as never, party });
  const offered = (s: GameState) => legalActions(s).some((a) => a.type === "useArtifact" && a.artifact === POTION);
  it("is offered when a Man holds it, and when a Hero holds it for the Man", () => {
    expect(offered(fight([member(MAN, [POTION])]))).toBe(true);
    expect(offered(fight([member(HERO, [POTION]), member(MAN)]))).toBe(true);
  });
  it("is not offered when a Priest or an Ogre holds it: it has to be passed to one who can administer it", () => {
    expect(offered(fight([member(PRIEST, [POTION]), member(MAN)]))).toBe(false);
    expect(offered(fight([member(OGRE, [POTION]), member(MAN)]))).toBe(false);
  });
});

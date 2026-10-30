import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { driveStrangers } from "./strangerDriver";
import { playRevisedFight } from "./headless";
import { HAZARD_GHOULS, HAZARD_TRAP } from "./data/hazards";
import { ALL_CREATURES, C_GHOUL } from "./data/creatures";
import type { GameState, PartyMember } from "./state";

// Peter, 14-OCT-2026 (Procedure: Ghouls Fight): the Ghouls are a persistent hazard, not a real stranger party; defeated Ghouls stay
// in the area and attack any party that enters or re-enters. Otherwise the fight is against a stranger party of as many strength-2
// creatures as there are creatures in the player party, with no surprise, and the Ring bonus and curse penalty apply as usual.
const HERO = 0, MAN = 5, OGRE = 2, DWARF = 7, TALISMAN = 7;
const member = (creatureId: number, treasure: number[] = []): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure });
const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }; // exit E

/** The party steps East into a chamber whose small-pack draw is the Ghouls (plus whatever else is drawn with them). */
const enteringGhouls = (party: PartyMember[], drawn: number[] = [], over: Partial<GameState> = {}): ReturnType<typeof reduce> =>
  reduce(makeState({
    areas: [A], partyArea: 0, level: 1, party, largePack: [8 | 16, 5], largeIdx: 0,
    smallPack: [300 + HAZARD_GHOULS, ...drawn], smallIdx: 0, variants: { combatRevision: true }, ...over,
  }), { type: "move", dir: 2 });

describe("the revised Ghouls fight", () => {
  it("is a creature of strength 2 with no magic", () => {
    expect(ALL_CREATURES[C_GHOUL]).toMatchObject({ name: "Ghoul", fs: 2, mp: 0 });
  });

  it("opens a fight against one Ghoul for each creature in the party, with no surprise", () => {
    const r = enteringGhouls([member(HERO), member(MAN), member(DWARF)]);
    expect(r.state.phase).toBe("fight");
    expect(r.state.strangers).toEqual([C_GHOUL, C_GHOUL, C_GHOUL]);
    expect(r.state.fight!.surprise).toBe(0);
    expect(r.events).toContainEqual({ type: "ghoulsAttack", count: 3 });
    expect(r.events.some((e) => e.type === "combatRoll")).toBe(false);   // the old one-roll-per-member resolution is gone
  });

  it("counts only the living creatures of the party", () => {
    const dead: PartyMember = { ...member(MAN), status: 3 };
    const r = enteringGhouls([member(HERO), dead]);
    expect(r.state.strangers).toEqual([C_GHOUL]);
  });

  it("leaves the legacy combat to its one-roll-per-member resolution", () => {
    const r = enteringGhouls([member(HERO)], [], { variants: undefined });
    expect(r.events.some((e) => e.type === "combatRoll")).toBe(true);
    expect(r.events.some((e) => e.type === "ghoulsAttack")).toBe(false);
  });

  it("is still warded off by the Talisman", () => {
    const r = enteringGhouls([member(DWARF, [TALISMAN]), member(MAN)]);
    expect(r.events).toContainEqual({ type: "ghoulsWarded" });
    expect(r.state.phase).not.toBe("fight");
  });

  it("sets the chamber's real strangers aside, and gives them back after the Ghouls are beaten", () => {
    let withOgres = 0, met = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = enteringGhouls([member(HERO), member(HERO), member(HERO)], Array(6).fill(100 + OGRE), { seed, level: 3, areas: [{ ...A, coord: packCoord(3, 50, 50) }] });   // level 3 draws three cards: the Ghouls and two more
      const aside = r.state.fight!.ghouls!.aside;
      expect(r.state.strangers).toEqual([C_GHOUL, C_GHOUL, C_GHOUL]);   // whoever else is here waits behind them
      if (!aside.length) continue;
      withOgres++;
      expect(aside.every((id) => id === OGRE)).toBe(true);
      const played = playRevisedFight(driveStrangers(r.state).state);
      if (played.state.phase === "gameOver") continue;
      met++;
      expect(played.state.strangers).not.toContain(C_GHOUL);
      expect(played.state.fight?.ghouls).toBeUndefined();
      if (played.state.strangers.length) expect(played.state.strangers.every((id) => id === OGRE)).toBe(true);   // met afterwards in the ordinary way
    }
    expect(withOgres).toBeGreaterThan(0);
    expect(met).toBeGreaterThan(0);
  });

  it("lurks again whatever the outcome, so the next party to enter meets the Ghouls anew", () => {
    const r = enteringGhouls([member(HERO), member(HERO)], [], { seed: 3 });
    const played = playRevisedFight(driveStrangers(r.state).state);
    if (played.state.phase !== "gameOver") expect(played.state.areas[played.state.partyArea]!.contents).toContain(300 + HAZARD_GHOULS);
  });

  it("there is no retreat from the Ghouls: they are a hazard, so none is offered and one is refused", () => {
    const r = enteringGhouls([member(HERO), member(HERO)], [], { seed: 3, largePack: [15 | 16] });
    const s = driveStrangers(r.state).state;
    s.fight!.round = 2;                                 // a round has been fought: any other fight would allow a retreat now
    expect(legalActions(s).some((a) => a.type === "retreat")).toBe(false);
    for (const dir of [0, 1, 2, 3] as const) expect(reduce(s, { type: "retreat", dir }).events[0]).toMatchObject({ type: "blocked" });
  });
});

// a level-3 entry draws three cards: the Ghouls, the Trap and one more
const L3 = { level: 3, areas: [{ ...A, coord: packCoord(3, 50, 50) }] };
describe("the Trap is dealt with last: the Ghouls are fought before it springs (Rules, \"Hazard cards\")", () => {
  it("an unguided party fights the Ghouls first, and falls only once they are beaten", () => {
    const r = enteringGhouls([member(HERO), member(HERO)], [300 + HAZARD_TRAP], { seed: 4, ...L3 });
    expect(r.state.phase).toBe("fight");
    expect(r.state.fight!.ghouls).toBeDefined();
    expect(r.state.fight!.ghouls!.trap).toMatchObject({ fell: true });   // the Trap waits
    expect(r.state.level).toBe(3);                                   // not fallen yet
    expect(r.events.some((e) => e.type === "trapSprung")).toBe(false);
    const played = playRevisedFight(driveStrangers(r.state).state);
    if (played.state.phase === "gameOver") return;
    expect(played.state.level).toBe(4);                              // the Trap sprang afterwards
    expect(played.events.some((e) => e.type === "trapSprung")).toBe(true);
  });

  it("with the Dwarf's choice (trapRules) the choice comes after the Ghouls", () => {
    const r = enteringGhouls([member(DWARF), member(HERO)], [300 + HAZARD_TRAP], { seed: 4, ...L3, variants: { combatRevision: true, trapRules: true } });
    expect(r.state.phase).toBe("fight");                             // the Ghouls first
    const played = playRevisedFight(driveStrangers(r.state).state);
    if (played.state.phase !== "gameOver") expect(played.state.phase).toBe("trap");
  });
});

describe("the Ghouls fight is one round, one on one (Peter, 20-OCT-2026)", () => {
  it("pairs each creature with its own Ghoul, rolls once, and then the Ghouls left withdraw and the combat is over", () => {
    let ended = 0, departed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = enteringGhouls([member(HERO), member(HERO), member(HERO)], [], { seed });
      let s = driveStrangers(r.state).state;
      expect(s.fight!.pending).toMatchObject({ by: "party", kind: "engage" });
      const foes = s.fight!.rev!.deployed.strangers;
      const out = reduce(s, { type: "engage", pairs: [0, 1, 2].map((p) => ({ party: p, stranger: foes[p]! })) });
      expect(out.events.filter((e) => e.type === "combatRoll")).toHaveLength(3);          // one match each, one roll each
      s = driveStrangers(out.state).state;
      if (s.phase === "gameOver") continue;
      ended++;
      expect(s.fight).toBeNull();                                                          // no second round
      expect(s.strangers).not.toContain(C_GHOUL);
      if (out.events.some((e) => e.type === "ghoulsDepart")) departed++;
      expect(s.areas[s.partyArea]!.contents).toContain(300 + HAZARD_GHOULS);               // they lurk on
    }
    expect(ended).toBeGreaterThan(0);
    expect(departed).toBeGreaterThan(0);
  });
});

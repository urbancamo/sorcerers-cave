import { describe, expect, it } from "vitest";
import { reduce } from "./reduce";
import { makeState, inUseGear } from "./testkit";
import { previewPlan, validatePlan, strangerFS, strangerMP } from "./combatPlan";
import { rollDie } from "./rng";
import { packCoord } from "./coords";
import type { GameState } from "./state";

// Engine rules validation, fights (docs/validation/clauses/fights.md), classic combat. The ORACLE is the FIGHTS section of the Consolidated
// Rules V2 and its worked examples: the numbers below are the book's, not read back from the engine.
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };
const mem = (creatureId: number, treasure: number[] = [], o = {}) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure, borne: inUseGear(treasure), ...o });
const HERO = 0, PRIEST = 4, MAN = 5, WOMAN = 6, DWARF = 7, OGRE = 2, TROLL = 3, SPECTRE = 9;
const fightState = (o: Partial<GameState>): GameState => makeState({ phase: "fight", areas: [area], fight: { surprise: 0, round: 1, focus: 0 } as never, ...o });
const seedFor = (pred: (v: number) => boolean): number => { for (let s = 1; s < 100000; s++) if (pred(rollDie(s).value)) return s; throw new Error("no seed"); };

describe("FIGHTS: the book's worked example (Hero+sword, Woman, Dwarf, Priest v. Ogre, Troll; strangers have surprise)", () => {
  const s = fightState({ fight: { surprise: -1, round: 1, focus: 0 } as never, strangers: [OGRE, TROLL], party: [mem(HERO, [3]), mem(WOMAN), mem(DWARF), mem(PRIEST)] });
  const p = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }, { front: [1, 2], backers: [3], strangers: [1] }] });
  it("match 1: hero 5+2 (sword) against the ogre's 5, the strangers adding 1 for surprise", () => {
    expect([p.matches[0]!.partyStr, p.matches[0]!.enemyStr]).toEqual([7, 5]);
    expect(p.matches[0]!.modifiers).toContainEqual(expect.objectContaining({ label: "Surprise", value: 1, side: "enemy" }));
  });
  it("match 2: woman 2 + dwarf 1 + the priest's magic 2 = 5 against the troll's 4, again +1 surprise to the strangers", () => {
    expect([p.matches[1]!.partyStr, p.matches[1]!.enemyStr]).toEqual([5, 4]);
    expect(p.matches[1]!.modifiers).toContainEqual(expect.objectContaining({ label: "Surprise", value: 1, side: "enemy" }));
  });
  it("surprise is for the first round only", () => {
    const later = fightState({ fight: { surprise: -1, round: 2, focus: 0 } as never, strangers: [OGRE], party: [mem(HERO)] });
    const q = previewPlan(later, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(q.matches[0]!.modifiers.some((m) => m.label === "Surprise")).toBe(false);
  });
  it("the party's surprise adds 1 to the PARTY's rolls", () => {
    const mine = fightState({ fight: { surprise: 1, round: 1, focus: 0 } as never, strangers: [OGRE], party: [mem(HERO)] });
    const q = previewPlan(mine, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(q.matches[0]!.modifiers).toContainEqual(expect.objectContaining({ label: "Surprise", side: "party" }));
  });
});

describe("FIGHTS: the strongest combination (a lone hero v. priest, troll, man, dwarf: troll and man hand-to-hand, priest in the background, total 9)", () => {
  it("a hero cannot engage them all, so the engine fights the strongest combination", () => {
    const s = fightState({ strangers: [PRIEST, TROLL, MAN, DWARF], party: [mem(HERO)] });
    const p = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [1] }] });
    expect(p.matches).toHaveLength(1);
    expect(p.matches[0]!.enemyStr).toBe(9);
  });
});

describe("FIGHTS: who may be sent against whom", () => {
  it("a larger party may send two against one", () => {
    const s = fightState({ strangers: [OGRE], party: [mem(HERO), mem(MAN), mem(WOMAN)] });
    expect(validatePlan(s, { matches: [{ front: [0, 1], backers: [], strangers: [0] }] }).ok).toBe(true);
  });
  it("priests and wizards may stay in the background and add their magic to a front-line creature", () => {
    const s = fightState({ strangers: [OGRE], party: [mem(HERO), mem(PRIEST)] });
    expect(validatePlan(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] }).ok).toBe(true);
    expect(previewPlan(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] }).matches[0]!.partyStr).toBe(5 + 2);
  });
  it("any number of casters may combine against one enemy", () => {
    const s = fightState({ strangers: [OGRE], party: [mem(HERO), mem(PRIEST), mem(PRIEST), mem(8)] });
    expect(previewPlan(s, { matches: [{ front: [0], backers: [1, 2, 3], strangers: [0] }] }).matches[0]!.partyStr).toBe(5 + 2 + 2 + 5);
  });
  it("a creature that is not a caster cannot stay in the background", () => {
    const s = fightState({ strangers: [OGRE], party: [mem(HERO), mem(MAN)] });
    expect(validatePlan(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] })).toEqual({ ok: false, reason: "backerNotCaster" });
  });
});

describe("FIGHTS: Spectres (cannot be fought hand-to-hand except by a Man, Woman or Hero with the Magic Sword; casters use magical power only; otherwise the strongest is slain)", () => {
  it("a Man without the sword cannot be sent against a Spectre", () => {
    const s = fightState({ strangers: [SPECTRE], party: [mem(MAN)] });
    expect(validatePlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] }).ok).toBe(false);
  });
  it("a Man with the Magic Sword can", () => {
    const s = fightState({ strangers: [SPECTRE], party: [mem(MAN, [3])] });
    expect(validatePlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] }).ok).toBe(true);
  });
  it("a Priest can, using magical power only", () => {
    const s = fightState({ strangers: [SPECTRE], party: [mem(PRIEST)] });
    const plan = { matches: [{ front: [0], backers: [], strangers: [0] }] };
    expect(validatePlan(s, plan).ok).toBe(true);
    expect(previewPlan(s, plan).matches[0]!.partyStr).toBe(2); // the priest's MAG 2, not his total 4
  });
  it("with no magical power to pit against it, the strongest creature in the party is slain automatically", () => {
    const s = fightState({ strangers: [SPECTRE], party: [mem(WOMAN), mem(OGRE)] });
    const r = reduce(s, { type: "resolveRound", matches: [] });
    expect(r.events.some((e) => e.type === "spectreSlew")).toBe(true);
    expect(r.state.party[1]!.status).toBe(3); // the Ogre, the stronger of the two
  });
});

describe("FIGHTS: losing a match with two creatures: the player states a preference, and a die of 4, 5 or 6 grants it", () => {
  const pair = (roll: number) => {
    const s = fightState({ strangers: [OGRE], party: [mem(WOMAN), mem(DWARF)], seed: seedFor((v) => v === roll) });
    s.fight!.casualtyQueue = [[0, 1]];
    return reduce(s, { type: "chooseCasualty", idx: 0 });
  };
  for (const roll of [1, 2, 3]) it(`a ${roll}: the other one dies`, () => expect(pair(roll).events).toContainEqual({ type: "memberDied", creatureId: DWARF }));
  for (const roll of [4, 5, 6]) it(`a ${roll}: the preferred one dies`, () => expect(pair(roll).events).toContainEqual({ type: "memberDied", creatureId: WOMAN }));
});

describe("FIGHTS: retreat", () => {
  it("is not possible before a round has been fought", () => {
    const s = fightState({ strangers: [OGRE], party: [mem(HERO)] });
    expect(reduce(s, { type: "retreat", dir: 2 } as never).events).toEqual([{ type: "blocked" }]);
  });
});

describe("FIGHTS: the Sorcerer (STR 13 = PHY 4 + MAG 9; Lotus Dust and the Eye of God each reduce his strength by 2)", () => {
  const SORCERER = 11;
  const st = (party: ReturnType<typeof mem>[]) => fightState({ strangers: [SORCERER], party });
  it("has strength 13", () => { const s = st([mem(HERO)]); expect(strangerFS(s, 0) + strangerMP(s, 0)).toBe(13); });
  it("the Eye of God takes 2 off", () => { const s = st([mem(HERO, [13])]); expect(strangerFS(s, 0) + strangerMP(s, 0)).toBe(11); });
  it("Lotus Dust takes 2 off", () => {
    const r = reduce(st([mem(MAN, [5])]), { type: "useArtifact", artifact: 5, target: 0 });
    expect(strangerFS(r.state, 0) + strangerMP(r.state, 0)).toBe(11);
  });
  it("both together take 4 off", () => {
    const r = reduce(st([mem(MAN, [5, 13])]), { type: "useArtifact", artifact: 5, target: 0 });
    expect(strangerFS(r.state, 0) + strangerMP(r.state, 0)).toBe(9);
  });
});

describe("FIGHTS: a Dragon slain single-handed adds 1 to its slayer's fighting strength", () => {
  const DRAGON = 10;
  const win = (front: number[], party: ReturnType<typeof mem>[]) => {
    for (let seed = 1; seed < 400; seed++) {
      const r = reduce(fightState({ strangers: [DRAGON], party, seed }), { type: "resolveRound", matches: [{ front, backers: [], strangers: [0] }] });
      if (r.events.some((e) => e.type === "fightWon")) return r.state;
    }
    throw new Error("no winning seed");
  };
  it("one creature alone: +1", () => expect(win([0], [mem(HERO, [3]), mem(MAN)]).party[0]!.dragonKills).toBe(1));
  it("two creatures together: no dragon-slayer", () => {
    const state = win([0, 1], [mem(HERO, [3]), mem(OGRE)]);
    expect(state.party.map((m) => m.dragonKills)).toEqual([0, 0]);
  });
});

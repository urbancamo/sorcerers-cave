import { describe, expect, it } from "vitest";
import { reduce } from "./reduce";
import { makeState, inUseGear } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { matchModifiers } from "./revisedRound";
import { playRevisedFight } from "./headless";
import { applyHazards } from "./hazards";
import { HAZARD_QUARREL } from "./data/hazards";
import { packCoord } from "./coords";
import type { GameState } from "./state";

// Engine rules validation, revised combat (register R-27: the oracle is Peter's reformulated rules, docs/rules/fighting-rules-reformulated-20261014.md,
// with his 2026-10-10 answers). Steps are cited as in that document. The default loadout has its own file (rulebookLoadout.test.ts).
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };
const mem = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure, borne: inUseGear(treasure) });
const V = { combatRevision: true } as never;
const HERO = 0, OGRE = 2, MAN = 5, WOMAN = 6, DWARF = 7;
const T_RING = 10, T_EYE = 13, T_SCROLL = 19;
const attackFrom = (party: ReturnType<typeof mem>[], strangers: number[], over: Partial<GameState> = {}): GameState =>
  driveStrangers(reduce(makeState({ phase: "encounter", areas: [area], strangers, party, variants: V, ...over }), { type: "attack" }).state).state;
const m11 = { pf: [0], pb: [], sf: [0], sb: [] };

describe("revised fights, Step a: round bonuses", () => {
  it("a party bearing The Ring adds 1 to its die roll; the other side does not", () => {
    const s = attackFrom([mem(HERO, [T_RING])], [OGRE]);
    const chips = matchModifiers(s, m11).chips;
    expect(chips).toContainEqual(expect.objectContaining({ label: "The Ring", value: 1, side: "party", roll: true }));
    expect(chips.some((c) => c.side === "strangers" && c.label === "The Ring")).toBe(false);
  });
  it("the Ring gives nothing while the Eye of God is present", () => {
    const s = attackFrom([mem(HERO, [T_RING, T_EYE])], [OGRE]);
    expect(matchModifiers(s, m11).chips.some((c) => c.label === "The Ring")).toBe(false);
  });
  it("the attacker's surprise bonus is 1, in the first round only", () => {
    const s = attackFrom([mem(HERO)], [OGRE]);
    s.fight!.surprise = 1; s.fight!.round = 1;
    expect(matchModifiers(s, m11).chips).toContainEqual(expect.objectContaining({ label: "Surprise", value: 1, side: "party", roll: true }));
    s.fight!.round = 2;
    expect(matchModifiers(s, m11).chips.some((c) => c.label === "Surprise")).toBe(false);
  });
  it("a player side's result is reduced by its cumulative curses (Step iii)", () => {
    const s = attackFrom([mem(HERO)], [OGRE], { curses: 2 });
    expect(matchModifiers(s, m11).chips).toContainEqual(expect.objectContaining({ side: "party", value: -2, roll: true }));
  });
});

describe("revised fights, Step b: the Scroll option", () => {
  it("the attacking party carrying the Scroll is offered it", () => {
    expect(attackFrom([mem(HERO, [T_SCROLL])], [OGRE]).fight!.pending).toMatchObject({ by: "party", kind: "scroll" });
  });
  it("not while the Eye of God is present", () => {
    expect(attackFrom([mem(HERO, [T_SCROLL, T_EYE])], [OGRE]).fight!.pending).not.toMatchObject({ kind: "scroll" });
  });
  it("a party that is being attacked is not offered it", () => {
    let s = makeState({ phase: "encounter", areas: [area], strangers: [OGRE], party: [mem(HERO, [T_SCROLL])], variants: V, testMode: true });
    s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
    s = reduce(s, { type: "test" }).state;
    expect(s.fight!.rev!.attacker).toBe("strangers");
    expect(s.fight!.pending).not.toMatchObject({ kind: "scroll" });
  });
});

describe("revised fights, Step b: reading the Scroll to destroy", () => {
  const SIBYL = 21, WIZARD = 8;
  const read = () => reduce(attackFrom([mem(HERO, [T_SCROLL])], [OGRE, WIZARD, SIBYL]), { type: "scroll", use: "destroy" });
  it("destroys the enemies without innate magic; magic-users and the Sibyl are not destroyed", () => expect(read().state.strangers).toEqual([WIZARD, SIBYL]));
  it("curses the attacker, and the Scroll is not consumed", () => {
    const r = read();
    expect(r.state.curses).toBe(1);
    expect(r.state.party[0]!.treasure).toContain(T_SCROLL);
  });
});

describe("revised fights, Step c: the defender's deployment", () => {
  it("a defender with fewer unengaged creatures than the attacker deploys them all", () => {
    const s = attackFrom([mem(HERO), mem(MAN), mem(WOMAN), mem(OGRE), mem(DWARF)], [OGRE, OGRE, OGRE]);
    expect(s.fight!.rev!.deployed.strangers).toHaveLength(3);
  });
  it("a defender may not deploy fewer than the attacker has unengaged", () => {
    const s = makeState({ phase: "encounter", areas: [area], strangers: [OGRE, OGRE], party: [mem(HERO), mem(MAN), mem(WOMAN)], variants: V, testMode: true });
    const amb = reduce(reduce(s, { type: "testForceReaction", outcome: "hostile" }).state, { type: "test" }).state;
    expect(amb.fight!.pending).toMatchObject({ by: "party", kind: "deploy", min: 2 });
    expect(reduce(amb, { type: "deploy", creatures: [0] }).events[0]).toMatchObject({ type: "planRejected" });
  });
});

describe("revised fights: the Treasure Chest Spectre (Peter, 2026-10-10 Q6)", () => {
  it("attacks without a surprise bonus, and the fight ends after one round", () => {
    for (let seed = 1; seed < 100; seed++) {
      const s = makeState({ phase: "explore", areas: [area], party: [mem(OGRE, [14])], variants: V, seed });
      const r = reduce(s, { type: "openChest" } as never);
      if (!r.state.strangers.includes(9)) continue;
      expect(r.state.phase).toBe("fight");
      expect(r.state.fight!.surprise).toBe(0);
      expect(r.state.fight!.oneRound).toBe(true);
      return;
    }
    throw new Error("no seed opened a Spectre");
  });
});

describe("revised fights, Step d: the attacker pairs its creatures one-to-one with the defender's front line", () => {
  const stage = () => attackFrom([mem(HERO), mem(MAN), mem(WOMAN)], [OGRE, 3]);
  it("an engagement that leaves a defender unpaired while the attacker has creatures free is refused", () => {
    expect(reduce(stage(), { type: "engage", pairs: [{ party: 0, stranger: 0 }] } as never).events[0]).toMatchObject({ type: "planRejected" });
  });
  it("a complete one-to-one engagement is accepted", () => {
    const r = reduce(stage(), { type: "engage", pairs: [{ party: 0, stranger: 0 }, { party: 1, stranger: 1 }] } as never);
    expect(r.events[0]).toMatchObject({ type: "engaged" });
  });
});

describe("revised fights: a match's outcome", () => {
  const GIANT = 12;
  /** The party's Man and Woman side by side against a Giant; the Giant's win leaves the party to nominate. Returns every casualty die seen. */
  const casualtyDice = (ring: boolean) => {
    const out: { roll: number; got: boolean }[] = [];
    for (let seed = 1; seed < 400 && out.length < 40; seed++) {
      let s = attackFrom([mem(MAN, ring ? [T_RING] : []), mem(WOMAN)], [GIANT], { seed });
      s = reduce(s, { type: "engage", pairs: [{ party: 0, stranger: 0 }], moves: [{ creature: 1, match: 0, back: false }] } as never).state;
      if (!s.fight?.casualtyQueue?.length) continue;
      const r = reduce(s, { type: "chooseCasualty", idx: 0 });
      const ev = r.events.find((e) => e.type === "casualtyChosen") as { roll: number; gotPreference: boolean } | undefined;
      if (ev) out.push({ roll: ev.roll, got: ev.gotPreference });
    }
    return out;
  };
  it("a lost two-creature front line: a die of 4, 5 or 6 grants the nominee's death", () => {
    const dice = casualtyDice(false);
    expect(dice.length).toBeGreaterThan(5);
    for (const d of dice) expect(d.got, `roll ${d.roll}`).toBe(d.roll >= 4);
  });
  it("...and the Ring adds 1 to that die (a 7 counts as 6)", () => {
    const dice = casualtyDice(true);
    expect(dice.length).toBeGreaterThan(5);
    for (const d of dice) expect(d.got, `roll ${d.roll}`).toBe(d.roll + 1 >= 4);
  });
  it("a tie leaves the match unresolved: both creatures stay in it and the fight goes on", () => {
    for (let seed = 1; seed < 400; seed++) {
      const s = attackFrom([mem(HERO)], [HERO], { seed });
      const p = playRevisedFight(s);
      const tie = p.events.find((e) => e.type === "combatRoll" && (e as { result: string }).result === "tie");
      if (!tie) continue;
      expect(p.events.filter((e) => e.type === "combatRoll").length).toBeGreaterThan(1); // it was fought again
      return;
    }
    throw new Error("no seed produced a tie");
  });
});

describe("revised fights, Step g and Ending a Fight: a stalemate (Peter's example: a Spectre against a Thief with the Magic Shield)", () => {
  it("ends in a standoff when neither side can harm the other, and the party may leave", () => {
    const s = attackFrom([mem(19, [20])], [9], { variants: { combatRevision: true, extensionKit: true } as never });
    const p = playRevisedFight(s);
    expect(p.state.fight?.rev?.standoff ?? p.events.some((e) => e.type === "fightStandoff")).toBeTruthy();
  });
});

describe("revised fights, Step b: the Scroll cannot be used in an area where it has already been used", () => {
  it("is not offered there again", () => {
    expect(attackFrom([mem(HERO, [T_SCROLL])], [OGRE], { scrollAreas: [0] }).fight!.pending).not.toMatchObject({ kind: "scroll" });
  });
});

describe("Determining Surprise Attack: arriving by a route that cannot be walked back (Magic Carpet, teleport, whirlpool, chasm)", () => {
  const room = (x: number, visited: boolean, contents: number[] = []) => ({ card: 31, coord: packCoord(1, x, 50), faceUp: true, visited, contents, flags: 0, indiffCount: 0 });
  const byCarpet = (visited: boolean) =>
    reduce(makeState({ phase: "explore", areas: [room(50, true), room(51, visited, [100 + OGRE])], partyArea: 0, party: [mem(4, [4])] }), { type: "useArtifact", artifact: 4, dir: 2 } as never).state;
  it("a carpet arrival at a chamber never entered gives the party surprise", () => expect(byCarpet(false).surpriseReady).toBe(true));
  // R-28 (MSW 2026-11-08, follow Peter): any arrival by a one-way route gets it, whether or not the party has been in that chamber before.
  it("...and so does one at a chamber the party has visited before, where strangers wait (R-28)", () => expect(byCarpet(true).surpriseReady).toBe(true));
  it("a doorway nobody has used earns it even into a visited chamber, and a doorway already walked does not (R-28)", () => {
    const door = (open: number) => ({ card: 31, coord: packCoord(1, open, 50), faceUp: true, visited: true, contents: open === 51 ? [100 + OGRE] : [], flags: 0, indiffCount: 0 });
    const walk = (doorsUsed: number[]) => reduce(makeState({ phase: "explore", areas: [door(50), door(51)], partyArea: 0, prev: 0, doorsUsed, party: [mem(HERO)] }), { type: "move", dir: 2 } as never).state;
    // card 31's exits decide whether the move is possible at all; if it is blocked the test cannot say anything, so fail loudly rather than pass
    const fresh = walk([]);
    expect(fresh.partyArea, "the move east must succeed in this fixture").toBe(1);
    expect(fresh.surpriseReady).toBe(true);
    expect(walk([1]).surpriseReady).toBe(false);
  });
});

describe("Procedure: Quarrel Fight — no bonuses or penalties for the Ring, curses or surprise", () => {
  const loserFor = (seed: number, curses: number, ring: boolean) => {
    const st = makeState({ seed, curses, party: [mem(MAN, ring ? [T_RING] : []), mem(OGRE)], hazards: [HAZARD_QUARREL], variants: { extensionKit: true } as never });
    return applyHazards(st).events.find((e) => e.type === "quarrel") as { loserId: number | null; aRoll: number; bRoll: number };
  };
  it("the same dice give the same duel with curses or a Ring as without", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const plain = loserFor(seed, 0, false);
      expect(loserFor(seed, 3, false).loserId, `seed ${seed}, three curses`).toBe(plain.loserId);
      expect(loserFor(seed, 0, true).loserId, `seed ${seed}, a Ring`).toBe(plain.loserId);
    }
  });
});

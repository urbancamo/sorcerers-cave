import { describe, expect, it } from "vitest";
import { reduce } from "./reduce";
import { makeState, inUseGear } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { matchModifiers } from "./revisedRound";
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

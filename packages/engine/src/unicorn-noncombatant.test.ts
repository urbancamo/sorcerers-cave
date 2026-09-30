import { describe, it, expect } from "vitest";
import { reduce, validatePlan, previewPlan, legalActions, isCaster, isNonCombatant } from "./index";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

// The Unicorn (creature 13) is never involved in a fight (docs/rules: "Friendly to WOMEN, otherwise
// indifferent"; "it may not be approached till other strangers in the chamber have been befriended,
// found indifferent, or slain"). Creature ids: Hero 0, Ogre 2, Troll 3, Man 5, Woman 6, Unicorn 13.

const member = (creatureId: number, status: 0 | 1 = 0) => ({ creatureId, status, dragonKills: 0, treasure: [] });
const area = () => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 });
const UNICORN_PARKED = 100 + 13; // a stranger parked on the tile (chamber.ts: 100 + creature id)

describe("a stranger Unicorn is never in the fight", () => {
  const encounter = (strangers: number[], party = [member(0)]) =>
    makeState({ phase: "encounter", party, strangers, areas: [area()], seed: 7 });

  it("attacking a group that includes a Unicorn fights only the others; the Unicorn stays parked in the chamber", () => {
    const { state, events } = reduce(encounter([3, 13]), { type: "attack" });
    expect(events).toContainEqual(expect.objectContaining({ type: "fightStarted" }));
    expect(state.phase).toBe("fight");
    expect(state.strangers).toEqual([3]); // the Troll only
    expect(state.areas[state.partyArea]!.contents).toContain(UNICORN_PARKED);
  });

  it("the fight preview never shows the Unicorn behind (or anywhere)", () => {
    const { state } = reduce(encounter([3, 13]), { type: "attack" });
    const pv = previewPlan(state, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.enemyBackers).toEqual([]);
    expect(pv.matches[0]!.enemyStr).toBe(4); // a Troll, not Troll + the Unicorn's 4
  });

  it("after the others are slain the party may approach the Unicorn: it is back as the stranger, in an encounter", () => {
    let won: ReturnType<typeof reduce> | undefined;
    for (let seed = 1; seed <= 300 && !won; seed++) {
      const fight = reduce({ ...encounter([3, 13], [member(0), member(0), member(0)]), seed }, { type: "attack" }).state;
      const r = reduce(fight, { type: "resolveRound", matches: [{ front: [0, 1], backers: [], strangers: [0] }] });
      if (r.events.some((e) => e.type === "fightWon")) won = r;
    }
    expect(won).toBeDefined();
    expect(won!.state.strangers).toEqual([13]);
    expect(won!.state.phase).toBe("encounter");
    expect(won!.state.areas[won!.state.partyArea]!.contents).not.toContain(UNICORN_PARKED);
  });

  it("approaching it afterwards: it joins a party with a Woman, otherwise it guards", () => {
    const after = (party: ReturnType<typeof member>[]) => makeState({ phase: "encounter", party, strangers: [13], areas: [area()] });
    const withWoman = reduce(after([member(0), member(6)]), { type: "test" });
    expect(withWoman.events).toContainEqual({ type: "strangersJoined", count: 1 });
    const womanless = reduce(after([member(0)]), { type: "test" });
    expect(womanless.events).toContainEqual({ type: "unicornGuards", creatureId: 13 });
  });

  it("a Unicorn alone cannot be attacked", () => {
    const s = encounter([13]);
    expect(reduce(s, { type: "attack" }).events).toEqual([{ type: "blocked" }]);
    expect(legalActions(s)).not.toContainEqual({ type: "attack" });
    expect(legalActions(s)).toContainEqual({ type: "test" });
  });

  it("a Unicorn alone in a re-entered hostile area starts no fight", () => {
    const s = makeState({ phase: "encounter", party: [member(0)], strangers: [3, 13], areas: [area()], hostileAreas: [0] });
    const { state } = reduce(s, { type: "attack" });
    expect(state.strangers).not.toContain(13);
  });
});

describe("an allied Unicorn never fights either", () => {
  const fightState = (party: ReturnType<typeof member>[], strangers: number[]) =>
    makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, party, strangers, areas: [area()] });

  it("is not a caster, and is flagged as a non-combatant", () => {
    expect(isNonCombatant(13)).toBe(true);
    expect(isNonCombatant(3)).toBe(false);
    expect(isCaster(member(13, 1))).toBe(false);
  });

  it("cannot be placed in the front line or in the background", () => {
    const s = fightState([member(0), member(6), member(13, 1)], [3]);
    expect(validatePlan(s, { matches: [{ front: [2], backers: [], strangers: [0] }] })).toEqual({ ok: false, reason: "nonCombatant" });
    expect(validatePlan(s, { matches: [{ front: [0], backers: [2], strangers: [0] }] })).toEqual({ ok: false, reason: "nonCombatant" });
  });

  it("does not count as a free fighter, so a lone real fighter is ganged up on as normal", () => {
    const s = fightState([member(0), member(13, 1)], [3, 2]); // Hero + allied Unicorn vs Troll + Ogre
    const pv = previewPlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(pv.matches[0]!.strangers.length).toBe(2); // the Ogre is attached to the Hero's match
    expect(validatePlan(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toEqual({ ok: true });
  });
});

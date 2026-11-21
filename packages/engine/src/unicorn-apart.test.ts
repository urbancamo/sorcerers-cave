import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import type { GameState, PartyMember } from "./state";

// GitHub #83 (Peter): the Unicorn "may not be approached till other strangers in the chamber have been befriended, found indifferent, or slain.
// Then it will join your party if it contains a woman." Games stamped `unicornApart` play it that way.
const HERO = 0, W_HERO = 1, MAN = 5, TROLL = 3, UNICORN = 13;
const m = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const room = (contents: number[] = []) => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents, flags: 0, indiffCount: 0 });
const meet = (party: PartyMember[], variants: object, outcome: "indifferent" | "hostile") => {
  const s = makeState({ phase: "encounter", testMode: true, variants, party, strangers: [MAN, UNICORN], treasures: [2], areas: [room()] });
  return reduce(reduce(s, { type: "testForceReaction", outcome }).state, { type: "test" });
};
const ON = { unicornApart: true };

describe("the Unicorn joins at once when the others test indifferent (unicornApart)", () => {
  it("a party with a W-Hero gains the Unicorn; the Man stays, indifferent, guarding the treasure", () => {
    const { state, events } = meet([m(HERO), m(W_HERO)], ON, "indifferent");
    expect(events).toContainEqual(expect.objectContaining({ type: "reaction", outcome: "indifferent" }));
    expect(events).toContainEqual({ type: "strangersJoined", count: 1 });
    expect(events).toContainEqual({ type: "unicornJoins", count: 1 }); // narrated, not silent
    expect(state.party.map((p) => p.creatureId)).toEqual([HERO, W_HERO, UNICORN]);
    expect(state.strangers).toEqual([MAN]);
    expect(state.indiffStreak).toBe(1); // the Man's indifference still counts toward the three that pacify the chamber
  });

  it("a party with no Woman does not gain it: the Unicorn stays with the group", () => {
    const { state } = meet([m(HERO), m(MAN)], ON, "indifferent");
    expect(state.party.some((p) => p.creatureId === UNICORN)).toBe(false);
    expect(state.strangers).toEqual([MAN, UNICORN]);
  });

  it("older games, not stamped, keep the group together", () => {
    const { state } = meet([m(HERO), m(W_HERO)], {}, "indifferent");
    expect(state.party.some((p) => p.creatureId === UNICORN)).toBe(false);
    expect(state.strangers).toEqual([MAN, UNICORN]);
  });
});

describe("the Unicorn stays out of a fight when the party would be friendly to it (unicornApart)", () => {
  it("hostile others: the Unicorn is parked in the chamber and is not a stranger in the fight", () => {
    const { state, events } = meet([m(HERO), m(W_HERO)], ON, "hostile");
    expect(state.phase).toBe("fight");
    expect(state.strangers).toEqual([MAN]);
    expect(state.areas[0]!.contents).toContain(100 + UNICORN);
    expect(state.fight!.unicornAside).toBe(1);
    expect(events).toContainEqual({ type: "unicornHangsBack", count: 1 });
  });

  it("a party with no Woman still meets the whole group in the fight", () => {
    const { state, events } = meet([m(HERO), m(MAN)], ON, "hostile");
    expect(state.strangers).toEqual([MAN, UNICORN]);
    expect(events.some((e) => e.type === "unicornHangsBack")).toBe(false);
  });

  it("older games keep the Unicorn in the fight", () => {
    expect(meet([m(HERO), m(W_HERO)], {}, "hostile").state.strangers).toEqual([MAN, UNICORN]);
  });

  it("once the others are slain, the Unicorn that hung back joins the party", () => {
    // Hero (fight 5) against a lone Troll (4) at seed 1 is a win; the Unicorn waits parked in the chamber.
    const s: GameState = makeState({
      phase: "fight", fight: { surprise: 0, round: 1, focus: 0, unicornAside: 1 }, variants: ON, seed: 1,
      party: [m(HERO), m(W_HERO)], strangers: [TROLL], areas: [room([100 + UNICORN])],
    });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(events).toContainEqual({ type: "strangersJoined", count: 1 });
    expect(events).toContainEqual({ type: "unicornJoins", count: 1 }); // narrated, not silent
    expect(state.party.map((p) => p.creatureId)).toEqual([HERO, W_HERO, UNICORN]);
    expect(state.areas[0]!.contents).not.toContain(100 + UNICORN);
  });
});

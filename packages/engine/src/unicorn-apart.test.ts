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
const meet = (party: PartyMember[], variants: object, outcome: "indifferent" | "hostile", strangers: number[] = [MAN, UNICORN]) => {
  const s = makeState({ phase: "encounter", testMode: true, variants, party, strangers, treasures: [2], areas: [room()] });
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

// "If found with a woman, it will remain loyal to her": a Unicorn whose group holds a Woman or Woman-Hero stays with it and fights alongside it.
describe("a Unicorn found with a Woman stays loyal to her (unicornApart)", () => {
  const WOMAN = 6;
  for (const woman of [WOMAN, W_HERO]) {
    it(`with a stranger ${woman === WOMAN ? "Woman" : "Woman-Hero"}: an indifferent test does not take the Unicorn into the party`, () => {
      const { state, events } = meet([m(HERO), m(W_HERO)], ON, "indifferent", [woman, UNICORN]);
      expect(state.party.some((p) => p.creatureId === UNICORN)).toBe(false);
      expect(state.strangers).toEqual([woman, UNICORN]);
      expect(events.some((e) => e.type === "unicornJoins")).toBe(false);
    });

    it(`with a stranger ${woman === WOMAN ? "Woman" : "Woman-Hero"}: a hostile test has the Unicorn fight alongside her`, () => {
      const { state, events } = meet([m(HERO), m(W_HERO)], ON, "hostile", [woman, UNICORN]);
      expect(state.phase).toBe("fight");
      expect(state.strangers).toEqual([woman, UNICORN]);
      expect(state.fight!.unicornAside).toBeUndefined();
      expect(events.some((e) => e.type === "unicornHangsBack")).toBe(false);
    });
  }

  it("a Man in the group (no Woman) still lets the Unicorn hang back, as before", () => {
    expect(meet([m(HERO), m(W_HERO)], ON, "hostile", [MAN, UNICORN]).state.strangers).toEqual([MAN]);
  });
});

describe("the Woman a Unicorn fought beside falls: it steps back, indifferent, and joins after the fight (unicornApart)", () => {
  const WOMAN = 6;
  // The Unicorn fights beside its stranger Woman (`unicornLoyal`); a round in which she falls sends it back, indifferent, into the chamber.
  const fight = (seed: number, strangers: number[], party: PartyMember[]): GameState => makeState({
    phase: "fight", fight: { surprise: 0, round: 1, focus: 0, unicornLoyal: true }, variants: ON, seed,
    party, strangers, areas: [room()],
  });
  // The dice decide who falls, so take the first seed where the Woman falls and the party survives.
  const womanFalls = (strangers: number[], party: PartyMember[], matches: { front: number[]; backers: number[]; strangers: number[] }[]) => {
    for (let seed = 1; seed < 200; seed++) {
      const r = reduce(fight(seed, strangers, party), { type: "resolveRound", matches });
      if (!r.events.some((e) => e.type === "planRejected" || e.type === "gameOver") && !r.state.strangers.includes(WOMAN) && !r.state.strangers.includes(UNICORN) === r.events.some((e) => e.type === "unicornStepsBack")) return r;
    }
    throw new Error("no seed in range kills the Woman");
  };

  it("with another stranger still fighting: the Unicorn leaves the fight at once and the fight goes on", () => {
    // Each stranger gets its own match, so the Woman can fall while the Unicorn survives its own duel.
    const { state, events } = womanFalls([WOMAN, MAN, UNICORN], [m(HERO), m(W_HERO), m(HERO)], [
      { front: [0], backers: [], strangers: [0] }, { front: [1], backers: [], strangers: [1] }, { front: [2], backers: [], strangers: [2] },
    ]);
    expect(state.phase).toBe("fight"); // the Man is still on his feet, or the fight would be over
    expect(events).toContainEqual({ type: "unicornStepsBack", count: 1 });
    expect(state.strangers.includes(UNICORN)).toBe(false);
    expect(state.areas[0]!.contents).toContain(100 + UNICORN);
    expect(state.party.some((p) => p.creatureId === UNICORN)).toBe(false);
    expect(state.fight?.unicornLoyal).toBeUndefined();
  });

  it("once nothing else is left, the fight is won and the Unicorn joins a party holding a Woman", () => {
    const { state, events } = womanFalls([WOMAN, UNICORN], [m(HERO), m(W_HERO)], [{ front: [0, 1], backers: [], strangers: [0] }]);
    expect(events).toContainEqual({ type: "unicornStepsBack", count: 1 });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(events).toContainEqual({ type: "unicornJoins", count: 1 });
    expect(state.party.map((p) => p.creatureId)).toContain(UNICORN);
  });

  it("a party with no Woman leaves it indifferent, parked in the chamber", () => {
    const { state, events } = womanFalls([WOMAN, UNICORN], [m(HERO), m(MAN)], [{ front: [0, 1], backers: [], strangers: [0] }]);
    expect(events).toContainEqual({ type: "fightWon" });
    expect(events.some((e) => e.type === "unicornJoins")).toBe(false);
    expect(state.party.some((p) => p.creatureId === UNICORN)).toBe(false);
    expect(state.areas[0]!.contents).toContain(100 + UNICORN);
  });
});

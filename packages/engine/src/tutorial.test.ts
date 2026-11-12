import { describe, expect, it } from "vitest";
import { driveStrangers } from "./strangerDriver";
import { reduce } from "./reduce";
import { scoreBreakdown } from "./score";
import { TUTORIAL_PICKS, TUTORIAL_ROUTE, tutorialGame } from "./tutorial";
import type { GameEvent } from "./actions";
import type { GameState } from "./state";

// The tutorial is a fixed script (docs/requirements/tutorial): this replays it from the stacked game and pins Peter's numbers, so a
// later rules change that breaks the tutorial fails here rather than in front of a new player.

function play(upToStep = 99) {
  let state: GameState = tutorialGame();
  const events: GameEvent[] = [];
  const phases: string[] = [];
  for (const beat of TUTORIAL_ROUTE.filter((b) => b.step <= upToStep)) {
    for (const hidden of beat.before ?? []) state = reduce(state, hidden).state;
    const r = reduce(state, beat.play);
    expect(r.events.some((e) => e.type === "blocked"), JSON.stringify(beat)).toBe(false);
    events.push(...r.events);
    state = driveStrangers(r.state).state;
    phases.push(state.phase);
  }
  return { state, events, phases };
}

describe("the tutorial game", () => {
  it("is a kit game with Woman-Hero and Dwarf, the trap rule and the revised combat, in Test Mode", () => {
    const s = tutorialGame();
    expect(s.party.map((m) => m.creatureId)).toEqual([...TUTORIAL_PICKS]);
    expect(s.variants).toMatchObject({ extensionKit: true, trapRules: true, combatRevision: true });
    expect(s.testMode).toBe(true);
    expect(s.areas).toHaveLength(1); // just the Gateway
  });

  it("is the same game every time", () => {
    expect(tutorialGame()).toEqual(tutorialGame());
  });

  it("plays the whole route with every action legal", () => {
    const { state } = play();
    expect(state.phase).toBe("explore");
    expect(state.party.every((m) => m.status === 0 || m.status === 1)).toBe(true); // nobody falls
    expect(state.party).toHaveLength(3); // the Priest joined
  });

  it("meets a Spectre, withdraws, and the trap drops the party to level 2", () => {
    const { events } = play(6);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["drewChamber", "trapLooms", "trapSprung"]));
    const { state } = play(4);
    expect(state.strangers).toEqual([9]); // the Spectre
    expect(play(6).state.level).toBe(2);
  });

  it("recruits the Priest, and the Dwarf ends up wielding the Magic Axe", () => {
    const { state, events } = play(8);
    expect(events.some((e) => e.type === "strangersJoined")).toBe(true);
    const dwarf = state.party.find((m) => m.creatureId === 7)!;
    expect(dwarf.treasure).toEqual([17]);
    expect(dwarf.borne).toContain(17);
  });

  it("takes the stair up and back, creating a secret door at the far end", () => {
    const { state } = play(9);
    expect(state.secretDoors).toBe(1);
    expect(state.level).toBe(2);
  });

  it("beats the Troll 11 to 9 (party 4+4+3, Troll 4+1 surprise+4)", () => {
    const rolls = play(10).events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");
    expect(rolls).toHaveLength(1);
    expect(rolls[0]).toMatchObject({ enemy: "Troll", partyRoll: 3, enemyRoll: 4, partyTotal: 11, enemyTotal: 9, result: "partyWon" });
  });

  it("beats the Witch 12 to 11 (Priest in support, surprise, and the Ring she wields)", () => {
    const rolls = play(11).events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");
    expect(rolls[1]).toMatchObject({ enemy: "Witch", partyRoll: 1, enemyRoll: 5, partyTotal: 12, enemyTotal: 11, result: "partyWon" });
  });

  it("ends in the Tomb of Kings with the Earthquake behind: the way back is gone", () => {
    const { state } = play();
    const here = state.areas[state.partyArea]!;
    expect(here.card >> 7).toBe(4); // SPECIAL_TOMB
    const back = reduce(state, { type: "withdraw" });
    expect(back.events.some((e) => e.type === "blocked")).toBe(true);
    expect(state.party.some((m) => m.treasure.includes(10))).toBe(true); // the Ring is in the party's hands
    expect(state.party.some((m) => m.treasure.includes(2))).toBe(true); // and so are the gems
  });

  it("never reaches the score table (Test Mode)", () => {
    expect(scoreBreakdown(play().state).total).toBeGreaterThan(0);
  });
});

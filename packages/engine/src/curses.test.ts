import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { applyHazards } from "./hazards";
import { whirlpoolCrossing } from "./special";
import { HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_DESERTION } from "./data/hazards";
import { cursedRoll } from "./effects";
import { packCoord } from "./coords";
import type { PartyMember } from "./state";

// Peter's curses bug (2026-11-04, scenario QOKJ): each curse subtracts 1 from every die roll, and outside a fight a roll cannot fall below 1.
const mem = (creatureId: number, status: 0 | 1 = 0, treasure: number[] = []): PartyMember => ({ creatureId, status, dragonKills: 0, treasure });
const rigged = (die: number, curses: number, over = {}) => makeState({ testMode: true, testAllDiceRoll: die, curses, ...over } as never);

describe("cursedRoll", () => {
  it("subtracts the curses and never goes below 1", () => {
    expect(cursedRoll(rigged(4, 2))).toBe(2);
    expect(cursedRoll(rigged(2, 10))).toBe(1);
    expect(cursedRoll(rigged(5, 0))).toBe(5);
  });
  it("is lifted once the Sorcerer is slain", () => {
    expect(cursedRoll(rigged(4, 3, { sorcererKilled: true }))).toBe(4);
  });
});

describe("non-fight rolls respect curses", () => {
  it("the Whirlpool drags the party on a cursed 3 (raw 3 − 1 = 2)", () => {
    const r = whirlpoolCrossing(rigged(3, 1));
    expect(r.events).toContainEqual({ type: "whirlpoolRoll", roll: 2, dragged: true });
  });
  it("the Whirlpool shows a clamped 1, not the raw 2, under many curses", () => {
    expect(whirlpoolCrossing(rigged(2, 10)).events).toContainEqual({ type: "whirlpoolRoll", roll: 1, dragged: true });
  });
  it("Medusa's gaze petrifies on a cursed 3", () => {
    const s = rigged(3, 1, { party: [mem(0)], hazards: [HAZARD_MEDUSA] });
    applyHazards(s);
    expect(s.party[0]!.status).toBe(2);
  });
  it("Medusa's gaze is survived on a raw 3 with no curse", () => {
    const s = rigged(3, 0, { party: [mem(0)], hazards: [HAZARD_MEDUSA] });
    applyHazards(s);
    expect(s.party[0]!.status).toBe(0);
  });
  it("an ally deserts on a cursed 3", () => {
    const s = rigged(3, 1, { party: [mem(0), mem(5, 1)], hazards: [HAZARD_DESERTION] });
    applyHazards(s);
    expect(s.party.length).toBe(1);
  });
  it("the Elixir poisons on a cursed 2", () => {
    const s = rigged(2, 1, { party: [mem(0, 0, [15])] });
    const r = reduce(s, { type: "useArtifact", artifact: 15, target: 0 });
    expect(r.state.party[0]!.status).toBe(3);
  });
  it("the Treasure Chest's curse result comes up on a cursed 2", () => {
    const s = rigged(2, 1, { phase: "explore", party: [mem(0, 0, [14])] });
    const r = reduce(s, { type: "openChest" });
    expect(r.events).toContainEqual({ type: "chestOpened", result: 1 });
    expect(r.state.curses).toBe(2);
  });
});

describe("the legacy Ghouls fight", () => {
  const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
  it("applies the curse penalty to the party's die, as any fight does", () => {
    const s = rigged(4, 10, { areas: [A], partyArea: 0, level: 1, party: [mem(1)], largePack: [8 | 16, 5], largeIdx: 0, smallPack: [300 + HAZARD_GHOULS], smallIdx: 0 });
    const roll = reduce(s, { type: "move", dir: 2 }).events.find((e) => e.type === "combatRoll");
    expect(roll).toMatchObject({ partyRoll: 4, partyTotal: 4 + 4 - 10 });
  });
});

describe("the Eye of God", () => {
  it("passing it between members is not a curse, dropping it is", () => {
    const s = makeState({ phase: "explore", party: [mem(0, 0, [13]), mem(5)] });
    expect(reduce(s, { type: "moveTreasure", from: 0, to: 1, idx: 0 }).state.curses).toBe(0);
    expect(reduce(s, { type: "dropTreasure", mi: 0, idx: 0 }).state.curses).toBe(1);
  });
});

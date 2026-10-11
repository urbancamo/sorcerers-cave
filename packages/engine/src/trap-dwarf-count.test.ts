import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { DIR_N } from "./coords";
import { HAZARD_TRAP } from "./data/hazards";
import type { GameState, PartyMember, PlacedArea } from "./state";

/**
 * A party with n Dwarves can guide past n traps (ruled 11-OCT-2026, supplementary issue of Q8 in
 * docs/requirements/2026-10-09-dwarfs-and-surprise-rule-debate.md). Under `variants.trapRules` only: with it off a
 * Dwarf still avoids any trap, exactly as before. "Living" = alive or ally, the same test `hasLivingDwarf` made.
 */

const MAN = 5;
const DWARF = 7;
const TRAP = 300 + HAZARD_TRAP;
const ON = { trapRules: true };
const member = (creatureId: number, status: 0 | 1 | 2 | 3 = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure: [] });
const chamber = (party: PartyMember[], hazards: number[], over: Partial<GameState> = {}): GameState =>
  makeState({ variants: ON, party, hazards, ...over });

describe("n Dwarves guide past n traps (trapRules)", () => {
  it("two Dwarves, two traps drawn together: no fall — the player is offered the Dwarves' choice", () => {
    const { fell, trapChoice, events } = applyHazards(chamber([member(DWARF), member(DWARF)], [HAZARD_TRAP, HAZARD_TRAP]));
    expect(fell).toBe(false);
    expect(trapChoice).toBe(true);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "trapSprung" }));
  });

  it("two Dwarves, three traps: more traps than guides — the party falls, and it is no choice", () => {
    const { fell, trapChoice } = applyHazards(chamber([member(DWARF), member(DWARF)], [HAZARD_TRAP, HAZARD_TRAP, HAZARD_TRAP]));
    expect(fell).toBe(true);
    expect(trapChoice).toBeFalsy();
  });

  it("a trap already parked here counts toward the total: two Dwarves cover a parked trap plus a new one", () => {
    const s = chamber([member(DWARF), member(DWARF)], [HAZARD_TRAP]);
    s.areas[s.partyArea]!.contents = [TRAP];
    const { fell, trapChoice } = applyHazards(s);
    expect(fell).toBe(false);
    expect(trapChoice).toBe(true);
  });

  it("only LIVING Dwarves guide: a petrified or fallen Dwarf is not a guide", () => {
    for (const status of [2, 3] as const) {
      const { fell } = applyHazards(chamber([member(DWARF), member(DWARF, status)], [HAZARD_TRAP, HAZARD_TRAP]));
      expect(fell, `second Dwarf status ${status}`).toBe(true);
    }
  });

  it("an allied Dwarf (status 1) guides like an original one", () => {
    const { fell, trapChoice } = applyHazards(chamber([member(DWARF), member(DWARF, 1)], [HAZARD_TRAP, HAZARD_TRAP]));
    expect(fell).toBe(false);
    expect(trapChoice).toBe(true);
  });

  it("unchanged for one Dwarf: one trap is guided, two are not", () => {
    expect(applyHazards(chamber([member(DWARF)], [HAZARD_TRAP])).trapChoice).toBe(true);
    expect(applyHazards(chamber([member(DWARF)], [HAZARD_TRAP, HAZARD_TRAP])).fell).toBe(true);
  });

  it("a party with no Dwarf falls at one trap, however many other members it has", () => {
    expect(applyHazards(chamber([member(MAN), member(MAN)], [HAZARD_TRAP])).fell).toBe(true);
  });

  it("flag off: byte-identical to before — a Dwarf avoids any number of traps", () => {
    const { fell, events } = applyHazards(chamber([member(DWARF)], [HAZARD_TRAP, HAZARD_TRAP], { variants: undefined }));
    expect(fell).toBe(false);
    expect(events).toContainEqual({ type: "trapAvoided" });
  });
});

describe("guide lost generalises: fewer living Dwarves than traps in the chamber", () => {
  const area = (card: number, coord: number, over: Partial<PlacedArea> = {}): PlacedArea =>
    ({ card, coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });
  const B = packCoord(1, 51, 50);
  const inChamber = (party: PartyMember[], traps: number): GameState =>
    makeState({
      variants: ON, party,
      areas: [
        area(2, packCoord(1, 50, 50)),
        area(15 | 16, B, { contents: Array(traps).fill(TRAP) }),
        area(4 | 16, packCoord(1, 51, 49)),
        area(8 | 16, packCoord(2, 51, 50), { visited: false }),
      ],
      partyArea: 1, prev: 0, prev2: 0, level: 1,
    });

  it("two Dwarves guard two traps: the party may leave", () => {
    const { state } = reduce(inChamber([member(MAN), member(DWARF), member(DWARF)], 2), { type: "move", dir: DIR_N });
    expect(state.level).toBe(1);
  });

  it("one of the two Dwarves is dead: one guide for two traps — the party falls as it leaves, with no surprise", () => {
    const { state, events } = reduce(inChamber([member(MAN), member(DWARF), member(DWARF, 3)], 2), { type: "move", dir: DIR_N });
    expect(events).toContainEqual({ type: "trapSprung", level: 2, guideLost: true });
    expect(state.level).toBe(2);
    expect(state.deliberateFall).toBeUndefined();
  });

  it("two Dwarves, one trap: losing one Dwarf still leaves a guide for the trap", () => {
    const { state } = reduce(inChamber([member(MAN), member(DWARF), member(DWARF, 3)], 1), { type: "move", dir: DIR_N });
    expect(state.level).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
import { enterChamber } from "./chamber";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_TRAP } from "./data/hazards";
import { SPECIAL_WELL } from "./data/areaCards";
import type { GameState, PartyMember } from "./state";

/**
 * Standing traps (`variants.trapRules`, spec 2026-10-11-dwarf-deliberate-trap-fall, Task 1): a drawn
 * trap is parked on its chamber as `300 + HAZARD_TRAP` ("continues in effect") and reloads on every
 * re-entry; two traps in one chamber cannot be avoided by a Dwarf. With the flag off nothing changes.
 */

const MAN = 5;
const DWARF = 7;
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const TRAP = 300 + HAZARD_TRAP;
const ON = { trapRules: true };

const chamberState = (over: Partial<GameState>): GameState => makeState({ party: [member(MAN)], ...over });
const parkedTraps = (s: GameState) => s.areas[s.partyArea]!.contents.filter((c) => c === TRAP).length;

describe("standing trap — flag off (byte-identical to before)", () => {
  it("a trap that falls is not parked", () => {
    const s = chamberState({ hazards: [HAZARD_TRAP] });
    const { fell } = applyHazards(s);
    expect(fell).toBe(true);
    expect(parkedTraps(s)).toBe(0);
  });

  it("a Dwarf avoids even two traps, and nothing is parked", () => {
    const s = chamberState({ party: [member(DWARF)], hazards: [HAZARD_TRAP, HAZARD_TRAP] });
    const { fell } = applyHazards(s);
    expect(fell).toBe(false);
    expect(parkedTraps(s)).toBe(0);
  });
});

describe("standing trap — flag on", () => {
  it("parks one trap marker when a trap falls", () => {
    const s = chamberState({ variants: ON, hazards: [HAZARD_TRAP] });
    const { fell } = applyHazards(s);
    expect(fell).toBe(true);
    expect(parkedTraps(s)).toBe(1);
  });

  it("parks the trap when a Dwarf meets it, and leaves the choice to the player (trapChoice)", () => {
    const s = chamberState({ variants: ON, party: [member(DWARF)], hazards: [HAZARD_TRAP] });
    const { fell, trapChoice, events } = applyHazards(s);
    expect(fell).toBe(false);
    expect(trapChoice).toBe(true);
    expect(events).not.toContainEqual({ type: "trapAvoided" }); // emitted by avoidTrap, not here
    expect(parkedTraps(s)).toBe(1);
  });

  it("two traps in the working set: the Dwarf cannot avoid them, and both stay parked", () => {
    const s = chamberState({ variants: ON, party: [member(DWARF)], hazards: [HAZARD_TRAP, HAZARD_TRAP] });
    const { fell, events } = applyHazards(s);
    expect(fell).toBe(true);
    expect(events).not.toContainEqual({ type: "trapAvoided" });
    expect(parkedTraps(s)).toBe(2);
  });

  it("a trap already parked here counts: one more drawn makes two, so the Dwarf falls (Well/Bell draw)", () => {
    const s = chamberState({ variants: ON, party: [member(DWARF)], hazards: [HAZARD_TRAP] });
    s.areas[s.partyArea]!.contents = [TRAP];
    const { fell } = applyHazards(s);
    expect(fell).toBe(true);
    expect(parkedTraps(s)).toBe(2); // the old marker stays, the new trap joins it
  });

  it("a Well draw of a trap into a chamber already holding one is unavoidable for a Dwarf", () => {
    const WELL = (SPECIAL_WELL << 7) | 31;
    const s = makeState({
      variants: ON,
      party: [member(DWARF)],
      areas: [{ card: WELL, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [TRAP], flags: 0, indiffCount: 0 }],
      partyArea: 0, prev: 0, prev2: 0, level: 1,
      smallPack: [TRAP], smallIdx: 0,
    });
    const res = reduce(s, { type: "drawFromWell" });
    expect(res.events).toContainEqual({ type: "trapSprung", level: 2 });
    expect(res.state.level).toBe(2);
  });

  it("a revisit reloads the parked trap into the working set", () => {
    const s = chamberState({ variants: ON });
    s.areas[s.partyArea]!.visited = true;
    s.areas[s.partyArea]!.contents = [TRAP, 110];
    enterChamber(s);
    expect(s.hazards).toEqual([HAZARD_TRAP]);
    expect(s.strangers).toEqual([10]);
    expect(s.areas[s.partyArea]!.contents).toEqual([]);
  });

  it("re-entering a trap chamber without a Dwarf falls again and re-parks the trap", () => {
    const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const B = { card: 8 | 16, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [TRAP], flags: 0, indiffCount: 0 };
    const s = makeState({
      variants: ON, party: [member(MAN)], areas: [A, B], partyArea: 0, prev: 0, prev2: 0, level: 1, largePack: [5], largeIdx: 0,
    });
    const res = reduce(s, { type: "move", dir: 2 });
    expect(res.events).toContainEqual({ type: "trapSprung", level: 2 });
    expect(res.state.areas[1]!.contents.filter((c) => c === TRAP)).toHaveLength(1);
  });

  it("counts reloaded traps in knownTraps for the entry, and applyHazards clears it", () => {
    const s = chamberState({ variants: ON });
    s.areas[s.partyArea]!.visited = true;
    s.areas[s.partyArea]!.contents = [TRAP];
    enterChamber(s);
    expect(s.knownTraps).toBe(1);
    applyHazards(s);
    expect(s.knownTraps).toBeUndefined();
  });

  it("a trap drawn fresh is not a known trap", () => {
    const s = chamberState({ variants: ON, smallPack: [TRAP], smallIdx: 0 });
    enterChamber(s);
    expect(s.knownTraps).toBeUndefined();
  });
});

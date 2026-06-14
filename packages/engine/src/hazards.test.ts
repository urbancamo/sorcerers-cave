import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_MUTINY, HAZARD_TRAP } from "./data/hazards";

describe("applyHazards (spec §7.2)", () => {
  it("Earthquake collapses the previous area", () => {
    const s = makeState({
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [110], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 51), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1, prev: 0,
      hazards: [HAZARD_EARTHQUAKE],
    });
    const { events } = applyHazards(s);
    expect(s.areas[0]!.flags & 4).toBe(4);
    expect(s.areas[0]!.contents).toEqual([]);
    expect(events).toContainEqual({ type: "hazardFired", hazard: HAZARD_EARTHQUAKE });
  });

  it("Medusa turns members to stone on a roll of 1-2", () => {
    const s = makeState({
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
      ],
      hazards: [HAZARD_MEDUSA],
      seed: 3,
    });
    applyHazards(s);
    for (const m of s.party) expect([0, 2]).toContain(m.status);
  });

  it("Mutiny reverts allies to strangers, drops their treasure, and reports it", () => {
    const s = makeState({
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] },
        { creatureId: 10, status: 1, dragonKills: 0, treasure: [1, 3] }, // ally carrying Gold + Magic Sword
      ],
      strangers: [],
      treasures: [],
      hazards: [HAZARD_MUTINY],
    });
    const { events } = applyHazards(s);
    expect(s.party.map((m) => m.creatureId)).toEqual([0]); // only the original remains
    expect(s.strangers).toContain(10);                     // the ally is now a stranger
    expect(s.treasures).toEqual([1, 3]);                   // its loot returns to the chamber
    expect(events).toContainEqual({ type: "mutinied", deserters: [10], treasures: [1, 3] });
  });

  it("Mutiny keeps one ally loyal when the party is all allies", () => {
    const s = makeState({
      party: [
        { creatureId: 10, status: 1, dragonKills: 0, treasure: [] },
        { creatureId: 11, status: 1, dragonKills: 0, treasure: [2] },
      ],
      strangers: [],
      treasures: [],
      hazards: [HAZARD_MUTINY],
    });
    applyHazards(s);
    expect(s.party).toHaveLength(1);   // one ally stays
    expect(s.strangers).toContain(11); // the rest desert
    expect(s.treasures).toEqual([2]);  // dropping their loot
  });

  it("Trap drops the whole party one level (fell), negated by a Dwarf", () => {
    const withDwarf = makeState({
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_TRAP],
    });
    const dwarfRes = applyHazards(withDwarf);
    expect(dwarfRes.fell).toBe(false);
    expect(dwarfRes.events).toContainEqual({ type: "trapAvoided" }); // feedback before the card is discarded

    const noDwarf = makeState({
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_TRAP],
    });
    const fallRes = applyHazards(noDwarf);
    expect(fallRes.fell).toBe(true);
    expect(fallRes.events).not.toContainEqual({ type: "trapAvoided" });
  });

  it("a sprung trap drops the party a level with no climb-back stair", () => {
    const A = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }; // exit E
    const s = makeState({
      areas: [A],
      partyArea: 0,
      level: 1,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], // Man, no dwarf
      largePack: [8 | 16, 5], // chamber (W reverse-door) to enter; an NS corridor (5) to fall onto
      largeIdx: 0,
      smallPack: [300 + HAZARD_TRAP], // the chamber draws a trap
      smallIdx: 0,
    });
    const { state, events } = reduce(s, { type: "move", dir: 2 }); // move East into the chamber
    expect(events).toContainEqual({ type: "trapSprung", level: 2 });
    expect(state.level).toBe(2);
    const here = state.areas[state.partyArea]!;
    expect(here.card & 32).toBe(0);                 // no phantom stair-up → cannot climb back out
    expect(here.mirroredStairs ?? 0).toBe(0);       // and nothing tagged as a connectivity link
  });
});

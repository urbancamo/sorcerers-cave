import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
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

  it("Mutiny turns allies into strangers", () => {
    const s = makeState({
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] },
        { creatureId: 10, status: 1, dragonKills: 0, treasure: [] },
      ],
      strangers: [],
      hazards: [HAZARD_MUTINY],
    });
    applyHazards(s);
    expect(s.party.map((m) => m.creatureId)).toEqual([0]);
    expect(s.strangers).toContain(10);
  });

  it("Trap drops the whole party one level (fell), negated by a Dwarf", () => {
    const withDwarf = makeState({
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_TRAP],
    });
    expect(applyHazards(withDwarf).fell).toBe(false);

    const noDwarf = makeState({
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_TRAP],
    });
    expect(applyHazards(noDwarf).fell).toBe(true);
  });
});

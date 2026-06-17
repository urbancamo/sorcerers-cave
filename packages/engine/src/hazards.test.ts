import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP } from "./data/hazards";

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

  it("Medusa and Ghouls lurk — re-parked into the chamber so they reload on re-entry", () => {
    const s = makeState({
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_MEDUSA, HAZARD_GHOULS],
      seed: 3,
    });
    applyHazards(s);
    expect(s.areas[s.partyArea]!.contents).toEqual(expect.arrayContaining([300 + HAZARD_MEDUSA, 300 + HAZARD_GHOULS]));
    expect(s.areas[s.partyArea]!.markers ?? []).not.toContain(300 + HAZARD_MEDUSA);
  });

  it("Ghouls drop heavy treasure onto the floor and roll against each member", () => {
    const s = makeState({
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [1, 3] }], // Hero: Gold (heavy) + Magic Sword (artifact)
      hazards: [HAZARD_GHOULS], treasures: [], seed: 5,
    });
    const { events } = applyHazards(s);
    expect(s.treasures).toContain(1);          // Gold dropped to the chamber floor (reclaimable)
    expect(s.party[0]!.treasure).toEqual([3]); // keeps the weightless Magic Sword
    expect(events.some((e) => e.type === "combatRoll" && e.enemy === "Ghouls")).toBe(true);
  });

  it("Earthquake lays a display-only scar on the tile it collapses (not the current tile)", () => {
    const s = makeState({
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 51), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1, prev: 0,
      hazards: [HAZARD_EARTHQUAKE],
    });
    applyHazards(s);
    expect(s.areas[0]!.markers).toEqual([300 + HAZARD_EARTHQUAKE]); // on the collapsed (prev) tile
    expect(s.areas[1]!.markers ?? []).not.toContain(300 + HAZARD_EARTHQUAKE); // not the current tile
    expect(s.areas[0]!.contents).not.toContain(300 + HAZARD_EARTHQUAKE); // scar never re-fires
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

  it("the Talisman wards off Ghouls — no harm, no hazard fired (card)", () => {
    const s = makeState({
      party: [
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [7] }, // Dwarf holding the Talisman (id 7)
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [] },  // a weak Dwarf the Ghouls would slay
      ],
      hazards: [HAZARD_GHOULS],
      seed: 3,
    });
    const { events } = applyHazards(s);
    expect(s.party.every((m) => m.status === 0)).toBe(true); // nobody harmed
    expect(events.some((e) => e.type === "hazardFired")).toBe(false); // Ghouls driven off before they engage
  });

  it("a Wizard bearing the Magic Staff is immune to Medusa (card)", () => {
    const s = makeState({
      party: [
        { creatureId: 8, status: 0, dragonKills: 0, treasure: [9] }, // Wizard with the Magic Staff (id 9)
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },  // Man, vulnerable
      ],
      hazards: [HAZARD_MEDUSA],
      seed: 1,
    });
    applyHazards(s);
    expect(s.party[0]!.status).toBe(0); // the staff-bearing Wizard is never turned to stone
  });
});

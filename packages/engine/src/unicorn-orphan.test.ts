import { describe, expect, it } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { applyHazards } from "./hazards";
import { HAZARD_MEDUSA } from "./data/hazards";
import type { PartyMember } from "./state";

// House rule R-17 (MSW, 2026-11-06): with no Woman left, a Unicorn does not vanish. Inside a fight it keeps fighting to protect itself;
// when no fight is going on it becomes an indifferent stranger guarding the area it is in (the state of a Womanless Unicorn met in a chamber).
const m = (creatureId: number, status: PartyMember["status"] = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure: [] });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("an orphaned Unicorn (R-17)", () => {
  it("outside a fight it leaves the party at once and guards the area as an indifferent stranger", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(6, 3), m(5), m(13, 1)], treasures: [] });
    const { state, events } = reduce(s, { type: "leaveTreasure" });
    expect(state.party.map((x) => x.creatureId)).toEqual([6, 5]);
    expect(state.areas[0]!.contents).toContain(100 + 13);
    expect(state.pacifiedAreas).toContain(0);
    expect(events).toContainEqual({ type: "unicornGuards", creatureId: 13 });
  });

  it("stays while a Woman is in the party", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(6), m(13, 1)], treasures: [] });
    const { state } = reduce(s, { type: "leaveTreasure" });
    expect(state.party.map((x) => x.creatureId)).toEqual([6, 13]);
  });

  it("a lone Unicorn turns indifferent and leaves: nobody is left, so the party does not survive (MSW, 2026-11-08)", () => {
    const s = makeState({ phase: "pickup", areas: [{ ...area }], party: [m(6, 3), m(13, 1)], treasures: [] });
    const { state, events } = reduce(s, { type: "leaveTreasure" });
    expect(state.party.map((x) => x.creatureId)).toEqual([6]);
    expect(state.areas[0]!.contents).toContain(100 + 13);
    expect(state.gs).toBe(2);
    expect(state.phase).toBe("gameOver");
    expect(events).toContainEqual({ type: "unicornDeparted", creatureId: 13, last: true });
    expect(events).toContainEqual({ type: "gameOver", gs: 2 });
  });

  it("Medusa turning the only Woman to stone leaves a lone Unicorn, which leaves: the party does not survive", () => {
    // Scan for a gaze that stones the Woman but spares the Unicorn (the Unicorn is then the only living member).
    for (let seed = 1; seed < 500; seed++) {
      const s = makeState({ seed, phase: "pickup", areas: [{ ...area }], party: [m(6), m(13, 1)], treasures: [], hazards: [HAZARD_MEDUSA] });
      applyHazards(s);
      if (s.party[0]!.status !== 2 || s.party[1]!.status === 2 || s.party[1]!.status === 3) continue;
      const { state, events } = reduce(s, { type: "leaveTreasure" });
      expect(state.party.map((x) => x.creatureId)).toEqual([6]);
      expect(state.gs).toBe(2);
      expect(events).toContainEqual({ type: "unicornDeparted", creatureId: 13, last: true });
      return;
    }
    throw new Error("no seed stoned only the Woman");
  });
});

import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { GATEWAY_START_COORD } from "./state";
import type { PartyMember } from "./state";

/**
 * `midState` (SC-4-43): when resolving an action relocates the party AFTER the entered/current
 * area's events have fired (a Trap during a chamber draw, a Whirlpool drag, a Chasm descent, a
 * Crypt fall), the result carries a snapshot taken just before the relocation — the presentation
 * layer holds it as the backdrop so hazards/dice present against the room they happened in, not
 * the landing tile (docs/bugs/ZTNU-log.json: "mutiny was drawn in a tunnel").
 */

const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const HERO = 0;
const DIR_E = 2;
const PLAIN_CHAMBER = 31; // NESW chamber
const gwCoord = GATEWAY_START_COORD;

function eastChamberState(smallPack: number[]) {
  // Party on the gateway; an unexplored NESW chamber lies east; the small pack is scripted.
  const s = makeState({
    party: [member(HERO)],
    smallPack,
    smallIdx: 0,
  });
  s.areas.push({ card: PLAIN_CHAMBER, coord: gwCoord + 1, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
  return s;
}

describe("midState — the pre-relocation presentation snapshot (SC-4-43)", () => {
  it("a trap drawn on chamber entry returns midState at the entered chamber, final state at the landing", () => {
    const s = eastChamberState([301]); // the chamber draw is exactly one Trap hazard
    const r = reduce(s, { type: "move", dir: DIR_E });
    expect(r.events.some((e) => e.type === "trapSprung")).toBe(true);
    expect(r.midState).toBeDefined();
    // The snapshot presents the ENTERED chamber (level 1), party still there, pre-fall.
    const mid = r.midState!;
    expect(mid.level).toBe(1);
    expect(mid.areas[mid.partyArea]!.coord).toBe(gwCoord + 1);
    expect(mid.fellThroughTrap).toBe(false);
    // The authoritative state has fallen one level.
    expect(r.state.level).toBe(2);
    expect(r.state.fellThroughTrap).toBe(true);
  });

  it("a plain move (no relocation) returns no midState", () => {
    const s = eastChamberState([201]); // the draw is a Gold treasure — nothing relocates
    const r = reduce(s, { type: "move", dir: DIR_E });
    expect(r.events.some((e) => e.type === "trapSprung")).toBe(false);
    expect(r.midState).toBeUndefined();
  });
});

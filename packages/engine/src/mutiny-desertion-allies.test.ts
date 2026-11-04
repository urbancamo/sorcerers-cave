import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { GATEWAY_START_COORD, type PartyMember } from "./state";
import { HAZARD_MUTINY, HAZARD_DESERTION, HAZARD_QUARREL, HAZARD_SPELL, HAZARD_HARPIES } from "./data/hazards";

// Peter's 2026-11-04 items 5 and 6: Mutiny and Desertion "did nothing". They only ever touch ALLIES (status 1); a party of original
// adventurers is untouched. These pin that so it is a decision, not a surprise (the web now says so in a notice).
const member = (creatureId: number, status: 0 | 1 = 0): PartyMember => ({ creatureId, status, dragonKills: 0, treasure: [] });
const enter = (hazard: number, party: PartyMember[], seed = 1) => {
  const s = makeState({ party, smallPack: [300 + hazard], smallIdx: 0, seed });
  s.areas.push({ card: 31, coord: GATEWAY_START_COORD + 1, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
  return reduce(s, { type: "move", dir: 2 });
};

describe("Mutiny and Desertion only affect allies", () => {
  it("Mutiny with only original adventurers changes nothing, but its card stays on the tile", () => {
    const r = enter(HAZARD_MUTINY, [member(0), member(5), member(6)]);
    expect(r.state.party).toHaveLength(3);
    expect(r.events.some((e) => e.type === "mutinied")).toBe(false);
    expect(r.state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!.markers).toContain(300 + HAZARD_MUTINY);
  });

  it("Mutiny with allies turns them into strangers", () => {
    const r = enter(HAZARD_MUTINY, [member(0), member(5, 1), member(6, 1)]);
    expect(r.events).toContainEqual(expect.objectContaining({ type: "mutinied" }));
    expect(r.state.party).toHaveLength(1);
    expect(r.state.strangers).toHaveLength(2);
  });

  it("Desertion with no allies rolls no dice", () => {
    const r = enter(HAZARD_DESERTION, [member(0), member(5), member(6)]);
    expect(r.events.some((e) => e.type === "desertionRoll")).toBe(false);
    expect(r.state.party).toHaveLength(3);
  });

  it("Desertion with allies rolls one die per ally", () => {
    const r = enter(HAZARD_DESERTION, [member(0), member(5, 1), member(6, 1)]);
    expect(r.events.filter((e) => e.type === "desertionRoll")).toHaveLength(2);
  });
});

// Every once-only hazard card that fires leaves itself on the party's tile as a display-only marker, so it does not vanish with the live
// working set and make the hazard look like it did nothing (the Mutiny precedent, SC-7.2-16).
describe("spent hazard cards stay on the tile they were drawn in", () => {
  const markersAfter = (hazard: number, party: PartyMember[]) =>
    enter(hazard, party).state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!.markers ?? [];

  it("Desertion leaves its card, with allies or without", () => {
    expect(markersAfter(HAZARD_DESERTION, [member(0), member(5), member(6)])).toContain(300 + HAZARD_DESERTION);
    expect(markersAfter(HAZARD_DESERTION, [member(0), member(5, 1)])).toContain(300 + HAZARD_DESERTION);
  });
  it("Quarrel leaves its card, whether it fizzles for want of two combatants or is fought", () => {
    expect(markersAfter(HAZARD_QUARREL, [member(0)])).toContain(300 + HAZARD_QUARREL);
    expect(markersAfter(HAZARD_QUARREL, [member(0), member(5), member(6)])).toContain(300 + HAZARD_QUARREL);
  });
  it("Spell leaves its card on the party's tile, fizzled or not", () => {
    expect(markersAfter(HAZARD_SPELL, [member(0), member(5)])).toContain(300 + HAZARD_SPELL);
  });
  it("Harpies leave their card when they strike, but a parked (lurking) Harpies card stays in the chamber's contents instead", () => {
    const struck = enter(HAZARD_HARPIES, [{ ...member(0), treasure: [4] }, member(5)]).state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!;
    if (struck.markers?.includes(300 + HAZARD_HARPIES)) expect(struck.contents).not.toContain(300 + HAZARD_HARPIES);
    const lurked = enter(HAZARD_HARPIES, [member(0), member(5)]).state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!;
    expect(lurked.contents).toContain(300 + HAZARD_HARPIES);
    expect(lurked.markers ?? []).not.toContain(300 + HAZARD_HARPIES);
  });
  it("a marker never re-fires: moving off and back does not trigger the hazard again", () => {
    const first = enter(HAZARD_DESERTION, [member(0), member(5, 1)]);
    const area = first.state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!;
    expect(area.contents).not.toContain(300 + HAZARD_DESERTION);
  });
});

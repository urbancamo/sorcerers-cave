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
  it("Mutiny with only original adventurers changes nothing, and leaves no card on the tile", () => {
    const r = enter(HAZARD_MUTINY, [member(0), member(5), member(6)]);
    expect(r.state.party).toHaveLength(3);
    expect(r.events.some((e) => e.type === "mutinied")).toBe(false);
    expect(r.state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!.markers ?? []).toEqual([]);
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

// A once-only hazard card that fires is shown by the web's set-piece pop-up and then discarded: the tile is left clear (Mark, 2026-11-05).
// Parked cards (Ghouls, Medusa, a lurking Harpies) stay in the chamber's contents and strike again.
describe("spent hazard cards are discarded, not left on the tile", () => {
  const markersAfter = (hazard: number, party: PartyMember[]) =>
    enter(hazard, party).state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!.markers ?? [];

  it.each([
    ["Desertion", HAZARD_DESERTION, [member(0), member(5, 1)]],
    ["Desertion (no allies)", HAZARD_DESERTION, [member(0), member(5), member(6)]],
    ["Quarrel (fizzles)", HAZARD_QUARREL, [member(0)]],
    ["Quarrel (fought)", HAZARD_QUARREL, [member(0), member(5), member(6)]],
    ["Spell", HAZARD_SPELL, [member(0), member(5)]],
    ["Harpies (strike)", HAZARD_HARPIES, [{ ...member(0), treasure: [4] }, member(5)]],
  ])("%s leaves no card on the tile", (_n, hazard, party) => {
    const area = enter(hazard as number, party as PartyMember[]).state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!;
    expect(area.markers ?? []).toEqual([]);
  });
  it("a parked (lurking) Harpies card stays in the chamber's contents instead", () => {
    const lurked = enter(HAZARD_HARPIES, [member(0), member(5)]).state.areas.find((a) => a.coord === GATEWAY_START_COORD + 1)!;
    expect(lurked.contents).toContain(300 + HAZARD_HARPIES);
  });
});

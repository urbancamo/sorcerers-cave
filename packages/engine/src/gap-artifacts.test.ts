import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { applyHazards } from "./hazards";
import { fluteLulls } from "./effects";
import { viperCrossing } from "./special";
import { makeState } from "./testkit";
import { packCoord, DIR_N } from "./coords";
import { HAZARD_MEDUSA } from "./data/hazards";

// Ids used throughout (per spec §16 / §3): party creatures Wizard 8, Troll 3, Hero 0;
// treasures Lotus Dust 5, Magic Staff 9, Charmed Flute 12; Spectre stranger id 9; Medusa hazard 3.
const member = (creatureId: number, treasure: number[] = [], status = 0) =>
  ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = (card: number, coord: number, contents: number[] = []) =>
  ({ card, coord, faceUp: true, visited: true, contents, flags: 0, indiffCount: 0 });

describe("SC-11-11: Lotus Dust has no effect on a Spectre (§16)", () => {
  it("blocks using Lotus Dust (id 5) against a Spectre (stranger id 9)", () => {
    // A living Wizard carries the Lotus Dust; the sole stranger is a Spectre (id 9).
    const s = makeState({
      phase: "encounter",
      areas: [area(31, packCoord(1, 50, 50))],
      strangers: [9],
      party: [member(8, [5])],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 5, target: 0 });
    expect(events).toEqual([{ type: "blocked" }]); // no effect on Spectres (card, reduce.ts:636)
    expect(state.strangers).toEqual([9]);          // the Spectre is untouched
    expect(state.party[0]!.treasure).toEqual([5]); // the Lotus Dust is not consumed
  });

  it("legalActions does not offer Lotus Dust against a Spectre (selectors.ts:27)", () => {
    const s = makeState({
      phase: "encounter",
      areas: [area(31, packCoord(1, 50, 50))],
      strangers: [9],
      party: [member(8, [5])],
    });
    const acts = legalActions(s);
    expect(acts).not.toContainEqual({ type: "useArtifact", artifact: 5, target: 0 });
  });

  it("legalActions DOES offer Lotus Dust against a non-Spectre stranger", () => {
    // Baseline: the same holder, but the stranger is a Dragon (id 10) — Lotus Dust IS offered.
    const s = makeState({
      phase: "encounter",
      areas: [area(31, packCoord(1, 50, 50))],
      strangers: [10],
      party: [member(8, [5])],
    });
    expect(legalActions(s)).toContainEqual({ type: "useArtifact", artifact: 5, target: 0 });
  });
});

describe("SC-11-22: Magic Staff passive auto-reanimation (§Medusa)", () => {
  it("frees a stoned member pinned to the area being resolved on entry (reduce.ts:104-118,124)", () => {
    // Two areas: the party stands in area 1, its stoned Hero pinned to area 0 (stoneArea 0). A living
    // Wizard bears the Magic Staff. Moving NORTH back into area 0 resolves that area, and reviveStoned
    // frees the Hero automatically — no explicit useArtifact needed.
    const s = makeState({
      phase: "explore",
      partyArea: 1,
      prev: 1, // set prev != 0 so the move counts as a genuine crossing, not a plain back-step
      areas: [
        area(4, packCoord(1, 50, 50)),  // area 0: a non-chamber corridor with a South (reverse) door
        area(1, packCoord(1, 50, 51)),  // area 1: a corridor with a North door onto area 0
      ],
      party: [
        member(8, [9]),                              // living Wizard bearing the Magic Staff (id 9)
        { ...member(0, [], 2), stoneArea: 0 },       // Hero left as stone, pinned to area 0
      ],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_N });
    expect(state.partyArea).toBe(0);                 // moved back into the chamber holding the stone
    expect(state.party[1]!.status).toBe(0);          // the Hero is freed (status 0)
    expect(state.party[1]!.stoneArea).toBeUndefined(); // pin cleared
    expect(events).toContainEqual({ type: "memberRevived", creatureId: 0 });
  });

  it("does NOT free a stoned member with no living staff-Wizard present", () => {
    // Same layout, but the Wizard does not carry the Staff — the stone member stays stone.
    const s = makeState({
      phase: "explore",
      partyArea: 1,
      prev: 1,
      areas: [
        area(4, packCoord(1, 50, 50)),
        area(1, packCoord(1, 50, 51)),
      ],
      party: [
        member(8, []),                          // Wizard with no Staff
        { ...member(0, [], 2), stoneArea: 0 },
      ],
    });
    const { state, events } = reduce(s, { type: "move", dir: DIR_N });
    expect(state.party[1]!.status).toBe(2);     // still stone
    expect(events).not.toContainEqual({ type: "memberRevived", creatureId: 0 });
  });
});

describe("SC-11-23: Magic Staff wards Medusa (§Medusa, card)", () => {
  it("a staff-Wizard makes Medusa powerless: medusaAverted, no petrification, no hazardFired", () => {
    const s = makeState({
      party: [
        member(8, [9]), // Wizard bearing the Magic Staff (id 9)
        member(0, []),  // Hero — would be vulnerable, but the staff averts the gaze
      ],
      hazards: [HAZARD_MEDUSA],
      seed: 1,
    });
    const { events } = applyHazards(s);
    expect(events).toContainEqual({ type: "medusaAverted" });                // the gaze is turned aside
    expect(s.party.some((m) => m.status === 2)).toBe(false);                 // no one turned to stone
    expect(events.some((e) => e.type === "medusaGaze")).toBe(false);         // the gaze never lands
    expect(events.some((e) => e.type === "hazardFired" && e.hazard === HAZARD_MEDUSA)).toBe(false);
  });
});

describe("SC-11-29: Charmed Flute creature-type gate (§Charmed Flute)", () => {
  it("an ineligible holder (Troll id 3) carrying the Flute does NOT lull — fluteLulls false", () => {
    const s = makeState({ party: [member(3, [12])] }); // Troll is not a Man/Woman/Hero/Priest/Wizard
    expect(fluteLulls(s)).toBe(false);
  });

  it("an eligible holder (Hero id 0) carrying the Flute DOES lull — fluteLulls true", () => {
    const s = makeState({ party: [member(0, [12])] });
    expect(fluteLulls(s)).toBe(true);
  });
});

describe("SC-11-31: Charmed Flute lulls the vipers (§10.1, viperCrossing)", () => {
  it("an eligible flute-holder crossing the Viper Pit yields vipersLulled and no per-member rolls", () => {
    const s = makeState({
      party: [member(0, [12]), member(5, [])], // eligible Hero holds the Flute; a Man crosses too
      seed: 1,                                  // a seed a plain crossing would roll on — proves no roll fires
    });
    const events = viperCrossing(s);
    expect(events).toEqual([{ type: "vipersLulled" }]);          // the vipers are lulled — one event, nothing else
    expect(events.some((e) => e.type === "viperPit")).toBe(false); // no per-member fatal rolls at all
    expect(s.party.every((m) => m.status === 0)).toBe(true);      // the whole party crosses safely
    expect(s.seed).toBe(1);                                       // the rng was never advanced (no rolls)
  });

  it("without an eligible flute-holder the crossing rolls per member (viperPit event present)", () => {
    // Baseline: a Troll (ineligible) holds the Flute, so the vipers are NOT lulled and rolls fire.
    const s = makeState({ party: [member(3, [12])], seed: 7 });
    const events = viperCrossing(s);
    expect(events.some((e) => e.type === "vipersLulled")).toBe(false);
    expect(events.some((e) => e.type === "viperPit")).toBe(true);
  });
});

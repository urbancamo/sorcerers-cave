import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_MEDUSA, HAZARD_TRAP } from "./data/hazards";
import type { PartyMember } from "./state";

const T_LOTUS = 5;
const member = (creatureId: number, treasure: number[] = []): PartyMember =>
  ({ creatureId, status: 0, dragonKills: 0, treasure });

// A start tile with an East exit; the large pack holds a chamber (W reverse-door) whose
// small-pack draw is the Medusa hazard — moving East walks straight into her lair.
const START = { card: 2, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
const enterLair = (party: PartyMember[], seed = 1) => {
  const s = makeState({
    areas: [START],
    party,
    largePack: [8 | 16],
    smallPack: [300 + HAZARD_MEDUSA],
    seed,
  });
  return reduce(s, { type: "move", dir: 2 });
};

describe("Lotus Dust vs Medusa (§Lotus Dust 'Works on MEDUSA')", () => {
  it("entering with Lotus Dust pauses before the gaze", () => {
    const { state, events } = enterLair([member(5, [T_LOTUS])]);
    expect(state.phase).toBe("medusa");
    expect(events).toContainEqual({ type: "medusaLooms" });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(false); // her gaze is held
    expect(state.party[0]!.status).toBe(0);
    expect(legalActions(state)).toEqual([
      { type: "useArtifact", artifact: T_LOTUS },
      { type: "proceed" },
    ]);
  });

  it("throwing the dust puts her to sleep for two of the player's turns and the entry resolves on", () => {
    const paused = enterLair([member(5, [T_LOTUS])]).state;
    const { state, events } = reduce(paused, { type: "useArtifact", artifact: T_LOTUS });
    expect(events).toContainEqual({ type: "artifactUsed", artifact: T_LOTUS });
    expect(events).toContainEqual({ type: "medusaSlept", until: paused.turn + 2 });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(false);
    expect(state.party[0]!.treasure).toEqual([]); // single-use — the dust is spent
    expect(state.areas[state.partyArea]!.medusaAsleepUntil).toBe(paused.turn + 2);
    expect(state.phase).toBe("explore"); // an otherwise-empty chamber plays out as usual
    expect(state.areas[state.partyArea]!.contents).toContain(300 + HAZARD_MEDUSA); // she lurks on, asleep
  });

  it("proceeding without throwing lets the gaze fall as normal", () => {
    const paused = enterLair([member(5, [T_LOTUS])]).state;
    const { state, events } = reduce(paused, { type: "proceed" });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(true);
    expect(state.party[0]!.treasure).toEqual([T_LOTUS]); // the dust is kept
    expect(state.areas[state.partyArea]!.medusaAsleepUntil).toBeUndefined();
    expect(state.phase).not.toBe("medusa");
  });

  it("proceed is blocked outside the medusa pause", () => {
    const s = makeState();
    const { events } = reduce(s, { type: "proceed" });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("no pause without a living Lotus-holder — the gaze fires immediately", () => {
    const { state, events } = enterLair([member(5)]);
    expect(events.some((e) => e.type === "medusaLooms")).toBe(false);
    expect(events.some((e) => e.type === "medusaGaze")).toBe(true);
    expect(state.phase).not.toBe("medusa");
  });

  it("no pause when a staff-Wizard already makes her powerless", () => {
    const { state, events } = enterLair([member(8, [9]), member(5, [T_LOTUS])]);
    expect(events.some((e) => e.type === "medusaLooms")).toBe(false);
    expect(events).toContainEqual({ type: "medusaAverted" });
    expect(state.phase).not.toBe("medusa");
  });

  it("she sleeps through re-entries for two turns, then wakes and gazes again", () => {
    // Turn T: enter and throw the dust (asleep until T+2).
    let r = reduce(enterLair([member(5, [T_LOTUS])]).state, { type: "useArtifact", artifact: T_LOTUS });
    // Turn T+1: step back out; turn T+2: re-enter — still asleep, no gaze.
    r = reduce(r.state, { type: "move", dir: 4 });
    r = reduce(r.state, { type: "move", dir: 2 });
    expect(r.events).toContainEqual({ type: "medusaAsleep" });
    expect(r.events.some((e) => e.type === "medusaGaze")).toBe(false);
    expect(r.state.party[0]!.status).toBe(0);
    // Turn T+3: out again; turn T+4: her sleep has run its course — the gaze fires.
    r = reduce(r.state, { type: "move", dir: 4 });
    r = reduce(r.state, { type: "move", dir: 2 });
    expect(r.events.some((e) => e.type === "medusaGaze")).toBe(true);
    expect(r.state.areas.find((a) => a.contents.includes(300 + HAZARD_MEDUSA) || a.medusaAsleepUntil !== undefined)
      ?.medusaAsleepUntil).toBeUndefined();
  });

  it("dusting Medusa still lets a trap in the same draw spring — the fall resolves on", () => {
    const lair = { card: 8 | 16, coord: packCoord(1, 51, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      areas: [START, lair],
      partyArea: 1, prev: 0,
      party: [member(5, [T_LOTUS])],
      phase: "medusa",
      hazards: [HAZARD_MEDUSA, HAZARD_TRAP],
      medusaPause: { freshEntry: true },
      largePack: [5], // an NS corridor to fall onto
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: T_LOTUS });
    expect(events).toContainEqual({ type: "medusaSlept", until: s.turn + 2 });
    expect(events.some((e) => e.type === "medusaGaze")).toBe(false);
    expect(events).toContainEqual({ type: "trapSprung", level: 2 });
    expect(state.level).toBe(2);
  });
});

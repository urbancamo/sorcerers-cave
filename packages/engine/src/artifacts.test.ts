import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { frontStrength } from "./combat";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("useArtifact — Strength Potion (§9.3)", () => {
  it("boosts a Man/Woman/Hero by +2 for the fight and is consumed", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [member(0, [8])] });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 8, target: 0 });
    expect(state.party[0]!.potionActive).toBe(true);
    expect(state.party[0]!.treasure).toEqual([]); // consumed
    expect(frontStrength(state.party[0]!)).toBe(7); // Hero 5 + 2
    expect(events).toContainEqual({ type: "artifactUsed", artifact: 8 });
  });
  it("is rejected outside a fight", () => {
    const s = makeState({ phase: "explore", party: [member(0, [8])] });
    expect(reduce(s, { type: "useArtifact", artifact: 8, target: 0 }).events).toContainEqual({ type: "blocked" });
  });
});

describe("useArtifact — Healing Balm (§16)", () => {
  it("a Woman/Priest/Wizard revives a dead member and consumes the balm", () => {
    const s = makeState({ phase: "explore", areas: [area], party: [member(4, [6]), member(5, [], 3)] }); // Priest with balm + dead Man
    const { state } = reduce(s, { type: "useArtifact", artifact: 6, target: 1 });
    expect(state.party[1]!.status).toBe(0); // revived
    expect(state.party[0]!.treasure).toEqual([]); // consumed
  });
  it("is rejected when the bearer is not a Woman/Priest/Wizard", () => {
    const s = makeState({ phase: "explore", areas: [area], party: [member(0, [6]), member(5, [], 3)] }); // Hero holds balm
    expect(reduce(s, { type: "useArtifact", artifact: 6, target: 1 }).events).toContainEqual({ type: "blocked" });
  });
});

describe("useArtifact — Magic Staff reanimation (§16)", () => {
  it("a Wizard restores a stoned member and the staff is NOT consumed", () => {
    const s = makeState({ phase: "explore", areas: [area], party: [member(8, [9]), member(5, [], 2)] }); // Wizard with staff + stoned Man
    const { state } = reduce(s, { type: "useArtifact", artifact: 9, target: 1 });
    expect(state.party[1]!.status).toBe(0); // un-stoned
    expect(state.party[0]!.treasure).toEqual([9]); // staff kept (permanent)
  });
});

describe("useArtifact — Lotus Dust (§16)", () => {
  it("sleeps a stranger (out of the encounter, persisted to the area) and is consumed", () => {
    const s = makeState({ phase: "encounter", areas: [area], strangers: [10, 3], party: [member(5, [5])] });
    const { state } = reduce(s, { type: "useArtifact", artifact: 5, target: 0 });
    expect(state.strangers).toEqual([3]); // Dragon removed
    expect(state.areas[0]!.contents).toContain(110); // Dragon asleep in the area
    expect(state.party[0]!.treasure).toEqual([]); // consumed
  });
});

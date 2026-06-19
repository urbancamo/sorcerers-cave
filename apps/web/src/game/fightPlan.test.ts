import { describe, it, expect } from "vitest";
import { emptyDraft, place, unplace, toMatches, freeMembers, strangerOf } from "./fightPlan";

describe("fightPlan draft reducer", () => {
  it("places a fighter on a stranger as front", () => {
    const d = place(emptyDraft(), 0, 2, "front");
    expect(toMatches(d)).toEqual([{ front: [0], backers: [], strangers: [2] }]);
    expect(strangerOf(d, 0)).toBe(2);
  });

  it("a second fighter on the same foe makes a 2-v-1; a third is ignored", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = place(d, 1, 2, "front");
    d = place(d, 3, 2, "front"); // capped at two front
    expect(toMatches(d)[0]!.front).toEqual([0, 1]);
  });

  it("re-placing a member moves it (never duplicates across matches)", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = place(d, 0, 5, "front"); // move to a different foe
    expect(toMatches(d)).toEqual([{ front: [0], backers: [], strangers: [5] }]);
  });

  it("places a caster as a backer", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = place(d, 1, 2, "backer");
    expect(toMatches(d)).toEqual([{ front: [0], backers: [1], strangers: [2] }]);
  });

  it("keeps a backer-only match so the placement is visible (engine then flags it as needing a front)", () => {
    const d = place(emptyDraft(), 1, 2, "backer");
    expect(toMatches(d)).toEqual([{ front: [], backers: [1], strangers: [2] }]);
  });

  it("unplace frees a member back to the tray", () => {
    let d = place(emptyDraft(), 0, 2, "front");
    d = unplace(d, 0);
    expect(toMatches(d)).toEqual([]);
    expect(strangerOf(d, 0)).toBeNull();
  });

  it("freeMembers returns the living members not yet assigned", () => {
    const d = place(emptyDraft(), 0, 2, "front");
    expect(freeMembers(d, [0, 1, 2])).toEqual([1, 2]);
  });
});

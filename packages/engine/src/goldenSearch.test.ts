import { describe, expect, it } from "vitest";
import { newGame } from "./index";
import { PARTY_BUDGET } from "./state";
import { validatePicks } from "./setup";
import { beamSearch, candidateActions, heuristic, homeDistance, legalParties, walkDistances } from "./goldenSearch";

const KIT = { extensionKit: true, sibyl: true };

describe("goldenSearch: the look-ahead search that finds the golden game", () => {
  it("legalParties lists exactly the drafts the engine accepts (31 base, 120 with the kit)", () => {
    expect(legalParties()).toHaveLength(31);
    const kit = legalParties(KIT);
    expect(kit).toHaveLength(120);
    for (const party of kit) {
      expect(party.length).toBeLessThanOrEqual(PARTY_BUDGET);
      expect(validatePicks(party, KIT)).toBeTruthy();
    }
    expect(new Set(kit.map((p) => p.join(","))).size).toBe(kit.length); // no duplicates
  });

  it("the party starts at the cave exit, so home is no distance away", () => {
    const s = newGame(2, [4, 6], KIT);
    expect(homeDistance(s)).toBe(0);
    expect(walkDistances(s).home).toBe(0);
  });

  it("never offers exitCave before the Sorcerer is dead, and always offers the loadout first when there is one", () => {
    const s = newGame(2, [4, 6], KIT);
    expect(candidateActions(s).some((a) => a.type === "exitCave")).toBe(false);
    const killed = { ...s, sorcererKilled: true };
    expect(candidateActions(killed, false).some((a) => a.type === "exitCave")).toBe(false); // exit gated by the caller
  });

  it("lets the party leave at once when the goal is only the score (requireSorcerer false), but never when he must die first", () => {
    const s = newGame(2, [4, 6], KIT);
    expect(candidateActions(s, true, false).some((a) => a.type === "exitCave")).toBe(true);
    expect(candidateActions(s, true, true).some((a) => a.type === "exitCave")).toBe(false);
    expect(candidateActions(s, false, false).some((a) => a.type === "exitCave")).toBe(false); // still gated by the caller
  });

  it("rates a state where the Sorcerer is dead above the same state with him alive", () => {
    const s = newGame(2, [4, 6], KIT);
    expect(heuristic({ ...s, sorcererKilled: true })).toBeGreaterThan(heuristic(s));
  });

  it("beamSearch is deterministic, spends a countable budget and never trips an engine fault", () => {
    const run = () => beamSearch(newGame(2, [4, 6], KIT), { width: 4, maxSteps: 40 });
    const a = run();
    const b = run();
    expect(a.steps).toBe(40);
    expect(a.expanded).toBeGreaterThan(0);
    expect(a.crashes).toEqual([]);
    expect(a.best!.actions).toEqual(b.best!.actions);
    expect(a.expanded).toBe(b.expanded);
  });
});

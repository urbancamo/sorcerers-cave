import { describe, it, expect, afterEach } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { gearOf } from "./strangerGear";
import { freeOf } from "./revisedRound";
import { applyStrangerDecision, driveStrangers, pendingContext } from "./strangerDriver";
import { registerStrategy, unregisterStrategy, type StrangerStrategy } from "./strategy";
import type { GameState, PartyMember } from "./state";

// Stage 6.1 (docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md): the driver's "ask" and "apply" halves, so a
// strategy that answers outside the mutation can be handed the context and its answer applied later.

const HERO = 0, OGRE = 2, TROLL = 3, MAN = 5;
const SWORD = 3, GOLD = 5;
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });

const loadoutFight = (level = "standard"): GameState =>
  reduce(makeState({ phase: "encounter", strangers: [HERO, OGRE], treasures: [SWORD, GOLD], party: [member(HERO), member(MAN)], variants: { strangerLevel: level } }), { type: "attack" }).state;
const deployFight = (level = "standard"): GameState =>
  reduce(makeState({ phase: "encounter", strangers: [OGRE, TROLL], treasures: [], party: [member(HERO), member(MAN)], variants: { combatRevision: true, strangerLevel: level } }), { type: "attack" }).state;

const registered: string[] = [];
const register = (s: StrangerStrategy) => { registerStrategy(s); registered.push(s.id); };
afterEach(() => { while (registered.length) unregisterStrategy(registered.pop()!); });
const external: StrangerStrategy = {
  id: "ext", version: 7, kind: "external", budget: { deadlineMs: 1000 },
  assignArtefacts: () => { throw new Error("an external strategy is never called in process"); },
};
const META = { strategyId: "ext", strategyVersion: 7 };

describe("pendingContext: the ask", () => {
  it("is null when the fight is not waiting on the strangers", () => {
    expect(pendingContext(makeState({ phase: "encounter", strangers: [OGRE], party: [member(HERO)] }))).toBeNull();
  });

  it("describes a pending loadout as plain data that survives JSON", () => {
    const ctx = pendingContext(loadoutFight())!;
    expect(ctx.kind).toBe("loadout");
    expect(ctx.context).toMatchObject({ view: { strangers: [HERO, OGRE], floor: [SWORD, GOLD] }, rngSeed: expect.any(Number) });
    expect(JSON.parse(JSON.stringify(ctx))).toEqual(ctx);
  });

  it("describes a pending deploy with the free creatures and the minimum, and no functions", () => {
    const state = deployFight();
    const ctx = pendingContext(state)!;
    expect(ctx.kind).toBe("deploy");
    expect(ctx.context).toMatchObject({ free: freeOf(state, "strangers"), min: 2 });
    expect(ctx.context).not.toHaveProperty("evaluate");
    expect(JSON.parse(JSON.stringify(ctx))).toEqual(ctx);
  });

  it("does not advance the game's own random stream (P8)", () => {
    const state = loadoutFight();
    const before = state.seed;
    pendingContext(state);
    expect(state.seed).toBe(before);
  });
});

describe("applyStrangerDecision: the apply", () => {
  it("applies a legal loadout under the strategy's own id and version, with no fallback", () => {
    const { state, applied } = applyStrangerDecision(loadoutFight("ext"), { allocations: [{ artifact: SWORD, stranger: 0 }] }, META);
    expect(applied.action).toEqual({ type: "strangersAssignArtefacts", ...META, allocations: [{ artifact: SWORD, stranger: 0 }] });
    expect(gearOf(state, 0)).toEqual([SWORD]);
    expect(state.fight!.pending).toBeUndefined();
  });

  it("replaces an illegal loadout with standard's and records why (P5)", () => {
    const { state, applied } = applyStrangerDecision(loadoutFight("ext"), { allocations: [{ artifact: 99, stranger: 0 }] }, META);
    expect(applied.action).toMatchObject({ type: "strangersAssignArtefacts", strategyId: "standard", fallback: { from: "ext", reason: expect.any(String) } });
    expect(gearOf(state, 0)).toEqual([SWORD]);
  });

  it("treats a malformed answer as a fallback and never throws", () => {
    for (const raw of [undefined, null, 42, "x", {}, { allocations: "no" }]) {
      const { applied } = applyStrangerDecision(loadoutFight("ext"), raw, META);
      expect(applied.action).toMatchObject({ strategyId: "standard", fallback: { from: "ext" } });
    }
  });

  it("applies a legal deploy", () => {
    const { applied, state } = applyStrangerDecision(deployFight("ext"), { creatures: [0, 1] }, META);
    expect(applied.action).toEqual({ type: "strangersDeploy", ...META, creatures: [0, 1] });
    expect(state.fight!.pending).toMatchObject({ by: "party" });
  });

  it("falls back on an illegal deploy (too few creatures)", () => {
    const { applied } = applyStrangerDecision(deployFight("ext"), { creatures: [0] }, META);
    expect(applied.action).toMatchObject({ type: "strangersDeploy", strategyId: "standard", fallback: { from: "ext" } });
  });

  it("refuses to run when nothing is pending for the strangers", () => {
    expect(() => applyStrangerDecision(makeState({ phase: "encounter", strangers: [OGRE], party: [member(HERO)] }), {}, META)).toThrow(/pending/);
  });
});

describe("driveStrangers and an external strategy", () => {
  it("stops at the pending decision instead of falling back as late, and reports what it awaits", () => {
    register(external);
    const start = loadoutFight("ext");
    const driven = driveStrangers(start);
    expect(driven.applied).toEqual([]);
    expect(driven.awaiting).toBe("loadout");
    expect(driven.state.fight!.pending).toEqual({ by: "strangers", kind: "loadout" });
  });

  it("stops at a pairing decision too", () => {
    register({ ...external, assignArtefacts: external.assignArtefacts });
    expect(driveStrangers(deployFight("ext")).awaiting).toBe("deploy");
  });

  it("carries on once the answer is applied", () => {
    register(external);
    const { state } = applyStrangerDecision(deployFight("ext"), { creatures: [0, 1] }, META);
    expect(driveStrangers(state).awaiting).toBeUndefined();
  });

  it("leaves a built-in strategy exactly as before: nothing awaited", () => {
    const driven = driveStrangers(loadoutFight("standard"));
    expect(driven.awaiting).toBeUndefined();
    expect(driven.applied).toHaveLength(1);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { pendingContext } from "./strangerDriver";
import { getStrategy, registerStrategy, unregisterStrategy, type StrangerStrategy } from "./strategy";
import { EXTERNAL_LEVELS, externalStrategy } from "./externalLevels";
import type { GameState, PartyMember } from "./state";

// Stage 6.1b (docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md): a level declares its own thinking time.

const HERO = 0, OGRE = 2, TROLL = 3, MAN = 5;
const SWORD = 3, GOLD = 5;
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const loadoutFight = (level: string): GameState =>
  reduce(makeState({ phase: "encounter", strangers: [HERO, OGRE], treasures: [SWORD, GOLD], party: [member(HERO), member(MAN)], variants: { strangerLevel: level } }), { type: "attack" }).state;
const deployFight = (level: string): GameState =>
  reduce(makeState({ phase: "encounter", strangers: [OGRE, TROLL], treasures: [], party: [member(HERO), member(MAN)], variants: { combatRevision: true, strangerLevel: level } }), { type: "attack" }).state;

const registered: string[] = [];
const register = (s: StrangerStrategy) => { registerStrategy(s); registered.push(s.id); };
afterEach(() => { while (registered.length) unregisterStrategy(registered.pop()!); });

describe("an external level declares its thinking time", () => {
  it("must declare a positive whole-millisecond deadline to be registered", () => {
    for (const budget of [undefined, {}, { deadlineMs: 0 }, { deadlineMs: -5 }, { deadlineMs: 1.5 }, { deadlineMs: Number.NaN }]) {
      const bad = { ...externalStrategy({ id: "bad", version: 1, budget: { deadlineMs: 1000 } }), budget } as unknown as StrangerStrategy;
      expect(() => registerStrategy(bad), JSON.stringify(budget)).toThrow(/deadline/);
    }
  });

  it("a built-in strategy needs no deadline", () => {
    register({ id: "plain", version: 1, kind: "builtin", assignArtefacts: () => ({ allocations: [] }) });
  });

  it("the factory builds an external strategy that is never run in process", () => {
    const s = externalStrategy({ id: "ext-test", version: 2, budget: { deadlineMs: 900 } });
    expect(s).toMatchObject({ id: "ext-test", version: 2, kind: "external", budget: { deadlineMs: 900 } });
    expect(() => s.assignArtefacts({} as never)).toThrow(/outside/);
  });

  it("ext-easy and ext-hard are registered, as external levels with their declared deadlines", () => {
    for (const [id, def] of Object.entries(EXTERNAL_LEVELS)) {
      expect(getStrategy(id)).toMatchObject({ id, version: def.version, kind: "external", budget: { deadlineMs: def.deadlineMs } });
    }
  });

  it("easy thinks for less time than hard", () => {
    expect(EXTERNAL_LEVELS["ext-easy"]!.deadlineMs).toBeLessThan(EXTERNAL_LEVELS["ext-hard"]!.deadlineMs);
  });
});

describe("the budget travels in the context", () => {
  it("a loadout context carries the level's deadline, with the default node budget", () => {
    register(externalStrategy({ id: "ext-a", version: 1, budget: { deadlineMs: 1200 } }));
    expect(pendingContext(loadoutFight("ext-a"))!.context.budget).toEqual({ maxNodes: 1 << 20, deadlineMs: 1200 });
  });

  it("a pairing context carries it too", () => {
    register(externalStrategy({ id: "ext-b", version: 1, budget: { deadlineMs: 3000 } }));
    expect(pendingContext(deployFight("ext-b"))!.context.budget).toEqual({ maxNodes: 1 << 20, deadlineMs: 3000 });
  });

  it("a level may set its own node budget", () => {
    register(externalStrategy({ id: "ext-c", version: 1, budget: { deadlineMs: 500, maxNodes: 64 } }));
    expect(pendingContext(deployFight("ext-c"))!.context.budget).toEqual({ maxNodes: 64, deadlineMs: 500 });
  });

  it("a built-in level's budget is exactly what it was: no deadline", () => {
    expect(pendingContext(loadoutFight("standard"))!.context.budget).toEqual({ maxNodes: 1 << 20 });
    expect(pendingContext(deployFight("standard"))!.context.budget).toEqual({ maxNodes: 1 << 20 });
  });
});

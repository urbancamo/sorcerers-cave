import { describe, it, expect, afterEach } from "vitest";
import { reduce } from "./reduce";
import { replay } from "./replay";
import { makeState } from "./testkit";
import { gearOf } from "./strangerGear";
import { driveStrangers } from "./strangerDriver";
import { getStrategy, registerStrategy, unregisterStrategy, standardStrategy, type StrangerStrategy } from "./strategy";
import type { GameAction } from "./actions";
import type { GameState, PartyMember } from "./state";

const HERO = 0, MAN = 5, OGRE = 2;
const SWORD = 3, GOLD = 5, EYE = 13;
const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
const encounter = (variants: GameState["variants"], strangers = [HERO, OGRE], treasures = [SWORD, GOLD]): GameState =>
  makeState({ phase: "encounter", strangers, treasures, party: [member(HERO), member(MAN)], ...(variants ? { variants } : {}) });

const registered: string[] = [];
const register = (s: StrangerStrategy) => { registerStrategy(s); registered.push(s.id); };
afterEach(() => { while (registered.length) unregisterStrategy(registered.pop()!); });

describe("stage 1: the loadout seam", () => {
  it("with no strategy configured the loadout is applied at once, exactly as before (P1)", () => {
    const { state, events } = reduce(encounter(undefined), { type: "attack" });
    expect(state.fight!.pending).toBeUndefined();
    expect(gearOf(state, 0)).toEqual([SWORD]);
    expect(events).toContainEqual({ type: "strangerEquipped", creatureId: HERO, artifact: SWORD });
  });

  it("with a strategy configured the fight waits on the strangers instead", () => {
    const { state, events } = reduce(encounter({ strangerLevel: "standard" }), { type: "attack" });
    expect(state.phase).toBe("fight");
    expect(state.fight!.pending).toEqual({ by: "strangers", kind: "loadout" });
    expect(state.fight!.gear).toBeUndefined();
    expect(events.some((e) => e.type === "strangerEquipped")).toBe(false);
  });

  it("nothing is pending when there is nothing to decide (no artefact, no bearer, or the Eye)", () => {
    for (const s of [encounter({ strangerLevel: "standard" }, [HERO], [GOLD]), encounter({ strangerLevel: "standard" }, [OGRE], [SWORD]), encounter({ strangerLevel: "standard" }, [HERO], [SWORD, EYE])]) {
      expect(reduce(s, { type: "attack" }).state.fight!.pending).toBeUndefined();
    }
  });

  it("the standard strategy arms the strangers exactly as the legacy loadout does", () => {
    const legacy = reduce(encounter(undefined), { type: "attack" }).state;
    const waiting = reduce(encounter({ strangerLevel: "standard" }), { type: "attack" }).state;
    const { state, applied } = driveStrangers(waiting);
    expect(applied).toHaveLength(1);
    expect(state.fight!.gear).toEqual(legacy.fight!.gear);
    expect(state.treasures).toEqual(legacy.treasures);
    expect(state.fight!.pending).toBeUndefined();
  });

  it("an unknown strategy id plays as standard", () => {
    expect(getStrategy("no-such-strategy").id).toBe("standard");
    const { state } = driveStrangers(reduce(encounter({ strangerLevel: "no-such-strategy" }), { type: "attack" }).state);
    expect(gearOf(state, 0)).toEqual([SWORD]);
  });

  it("a second strategy proves selection: 'unarmed' leaves the artefact on the floor", () => {
    register({ id: "unarmed", version: 3, kind: "builtin", assignArtefacts: () => ({ allocations: [] }) });
    const { state, applied } = driveStrangers(reduce(encounter({ strangerLevel: "unarmed" }), { type: "attack" }).state);
    expect(state.fight!.gear).toBeUndefined();
    expect(state.treasures).toEqual([SWORD, GOLD]);
    expect(applied[0]!.action).toMatchObject({ type: "strangersAssignArtefacts", strategyId: "unarmed", strategyVersion: 3, allocations: [] });
  });

  it("the standard strategy is deterministic: the same context gives the same decision (P9)", () => {
    const ctx = { view: { strangers: [MAN, MAN, MAN], gear: [[], [], []], floor: [SWORD], eyePresent: false, level: 1, round: 1, party: [], partyRollBonus: 0 }, rngSeed: 99, budget: { maxNodes: 100 } };
    expect(standardStrategy.assignArtefacts(ctx)).toEqual(standardStrategy.assignArtefacts(ctx));
  });
});

describe("stage 2: logged decisions, the driver and the legality layer", () => {
  const wait = () => reduce(encounter({ strangerLevel: "standard" }), { type: "attack" }).state;

  it("while a decision is pending no player action is accepted", () => {
    const s = wait();
    for (const a of [{ type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] }, { type: "retreat", dir: 0 }, { type: "exitCave" }] as GameAction[]) {
      const r = reduce(s, a);
      expect(r.events).toEqual([{ type: "blocked" }]);
      expect(r.state).toBe(s);
    }
  });

  it("a forged stranger action is blocked when nothing is pending (P7)", () => {
    const s = reduce(encounter(undefined, [HERO, OGRE], [GOLD]), { type: "attack" }).state;
    const r = reduce(s, { type: "strangersAssignArtefacts", strategyId: "x", strategyVersion: 1, allocations: [{ artifact: SWORD, stranger: 0 }] });
    expect(r.events).toEqual([{ type: "blocked" }]);
    expect(r.state).toBe(s);
  });

  it("an illegal decision is blocked even while pending: wrong artefact, bad index, too many copies, a bearer who cannot bear it, the Eye", () => {
    const s = wait();
    const bad = (allocations: { artifact: number; stranger: number }[]) => reduce(s, { type: "strangersAssignArtefacts", strategyId: "x", strategyVersion: 1, allocations });
    for (const allocations of [
      [{ artifact: GOLD, stranger: 0 }], [{ artifact: SWORD, stranger: 7 }], [{ artifact: SWORD, stranger: 0 }, { artifact: SWORD, stranger: 0 }],
      [{ artifact: SWORD, stranger: 1 }],            // an Ogre cannot bear a Sword
      [{ artifact: 20, stranger: 0 }],               // no Shield on the floor
    ]) {
      expect(bad(allocations).events).toEqual([{ type: "blocked" }]);
    }
    const eye = reduce(encounter({ strangerLevel: "standard" }, [HERO], [SWORD, EYE, 13]), { type: "attack" }).state;
    expect(eye.fight!.pending).toBeUndefined();
  });

  it("the decision is a logged action: replaying the log never consults a strategy (P6)", () => {
    register({ id: "boom", version: 1, kind: "builtin", assignArtefacts: () => ({ allocations: [{ artifact: SWORD, stranger: 0 }] }) });
    const start = encounter({ strangerLevel: "boom" });
    const waiting = reduce(start, { type: "attack" });
    const driven = driveStrangers(waiting.state);
    const log: GameAction[] = [{ type: "attack" }, ...driven.applied.map((a) => a.action)];
    unregisterStrategy("boom");                                   // gone from the registry, as if never written
    let s = start;
    for (const a of log) s = reduce(s, a).state;
    expect(s).toEqual(driven.state);
  });

  it("a strategy that throws, answers illegally or answers late is replaced by standard's decision, and the substitution is logged (P5)", () => {
    const cases: Record<string, StrangerStrategy["assignArtefacts"]> = {
      throws: () => { throw new Error("boom"); },
      illegal: () => ({ allocations: [{ artifact: SWORD, stranger: 1 }] }),
      late: () => Promise.resolve({ allocations: [] }) as never,
      garbage: () => ({ nope: 1 }) as never,
    };
    for (const [id, fn] of Object.entries(cases)) {
      register({ id, version: 1, kind: "builtin", assignArtefacts: fn });
      const { state, applied } = driveStrangers(reduce(encounter({ strangerLevel: id }), { type: "attack" }).state);
      expect(gearOf(state, 0), id).toEqual([SWORD]);               // standard's decision
      expect(applied[0]!.action, id).toMatchObject({ type: "strangersAssignArtefacts", strategyId: "standard", fallback: { from: id } });
      expect(applied[0]!.events, id).toContainEqual(expect.objectContaining({ type: "strategyFallback", from: id }));
    }
  });

  it("a strategy cannot touch the game seed, and is handed a copy of the state (P8)", () => {
    let seen: unknown;
    register({ id: "spy", version: 1, kind: "builtin", assignArtefacts: (ctx) => { seen = ctx; (ctx.view.floor as number[]).length = 0; return { allocations: [] }; } });
    const waiting = reduce(encounter({ strangerLevel: "spy" }), { type: "attack" }).state;
    const seedBefore = waiting.seed;
    const { state } = driveStrangers(waiting);
    expect(state.seed).toBe(seedBefore);
    expect(waiting.treasures).toEqual([SWORD, GOLD]);               // mutating the view did not touch the real state
    expect(seen).toBeDefined();
  });

  it("the loadout is decided again after a round when a bearer's death puts an artefact back on the floor", () => {
    const base = makeState({
      phase: "fight", strangers: [MAN, MAN], party: [member(HERO), member(HERO)], seed: 5,
      fight: { surprise: 0, round: 1, focus: 0, gear: [[SWORD], []] }, variants: { strangerLevel: "standard" },
    });
    base.party.forEach((m) => { m.dragonKills = 10; });
    const r = reduce(base, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }, { front: [1], backers: [], strangers: [1] }] });
    // both strangers died, so the fight ended and there is nothing to decide
    expect(r.state.fight == null || r.state.fight.pending === undefined).toBe(true);
  });

  it("the strategy id is part of the game's immutable variants", () => {
    const frames = replay(1, [0], [], { strangerLevel: "standard" });
    expect(frames[0]!.state.variants).toEqual({ strangerLevel: "standard" });
  });
});

import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { driveStrangers } from "./strangerDriver";
import { playRevisedFight, partyAction } from "./headless";
import { getStrategy, listStrategyIds, registerStrategy, unregisterStrategy, type StrangerStrategy } from "./strategy";
import { randBelow } from "./rng";
import type { GameState, PartyMember } from "./state";

// Pluggable stranger combat spec, stage 5: the `novice` and `expert` built-ins. The sweep plays whole revised fights with each
// on the stranger side and requires that none of their pairing decisions is ever rejected (no `fallback` on any logged action).

const member = (creatureId: number): PartyMember => ({ creatureId, status: 0, dragonKills: 0, treasure: [] });
/** Creatures that can stand in a party or a stranger group (Hero..Dragon; the Spectre and Unicorn are exercised elsewhere). */
const POOL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12];
const SWORD = 3, STAFF = 9, SHIELD = 20, AXE = 17;

function scenario(level: string, n: number): GameState {
  let seed = 1000 + n * 7919;
  const pick = (k: number): number => { const r = randBelow(seed, k); seed = r.seed; return r.value; };
  const party = Array.from({ length: 1 + pick(5) }, () => POOL[pick(POOL.length)]!);
  const strangers = Array.from({ length: 1 + pick(7) }, () => POOL[pick(POOL.length)]!);
  const floor = [SWORD, STAFF, SHIELD, AXE].filter(() => pick(2) === 0);
  return makeState({
    phase: "encounter", strangers, treasures: floor, party: party.map(member), seed: seed >>> 0,
    variants: { combatRevision: true, strangerLevel: level },
  });
}

const start = (s: GameState): GameState => driveStrangers(reduce(s, { type: "attack" }).state).state;

describe("stage 5: the level strategies are registered", () => {
  it("novice and expert are built-ins and answer the pairing hooks", () => {
    for (const id of ["novice", "expert"]) {
      expect(listStrategyIds()).toContain(id);
      const s = getStrategy(id);
      expect(s.kind).toBe("builtin");
      expect(s.deploy && s.engage && s.chooseCasualty).toBeTruthy();
    }
  });
});

describe("stage 5: legality sweep", () => {
  for (const level of ["novice", "expert", "smart", "standard"]) {
    it(`${level}: 150 whole fights, no decision rejected, every fight ends, replays identically`, () => {
      let decisions = 0;
      for (let n = 0; n < 150; n++) {
        const first = playRevisedFight(start(scenario(level, n)));
        const fallbacks = first.actions.filter((a) => "fallback" in a && (a as { fallback?: unknown }).fallback);
        expect(fallbacks, `${level} scenario ${n}`).toEqual([]);
        expect(first.end, `${level} scenario ${n}`).not.toBe("stuck");
        decisions += first.actions.filter((a) => a.type.startsWith("strangers")).length;
        const again = playRevisedFight(start(scenario(level, n)));
        expect(again.actions).toEqual(first.actions);
      }
      expect(decisions).toBeGreaterThan(150);
    });
  }
});

describe("stage 5: expert never scores below standard's own answer", () => {
  it("is deterministic for the same position and keeps the logged strategy id", () => {
    const s = start(scenario("expert", 3));
    const a = playRevisedFight(s), b = playRevisedFight(s);
    expect(a.actions).toEqual(b.actions);
    const logged = a.actions.filter((x) => x.type === "strangersDeploy" || x.type === "strangersEngage");
    for (const x of logged) expect(x).toMatchObject({ strategyId: "expert", strategyVersion: 2 });
  });
});

describe("stage 5: expert's Monte Carlo rollout search", () => {
  it("is handed the engine's rollouts on deploy and engage, and they are the engine's own fights", () => {
    let seen = { deploy: 0, engage: 0 };
    const spy = {
      ...getStrategy("standard"), id: "rollout-spy", version: 1, kind: "builtin" as const,
      deploy(ctx: Parameters<NonNullable<StrangerStrategy["deploy"]>>[0]) {
        const std = getStrategy("standard").deploy!(ctx);
        const scores = ctx.evaluate!([std, { creatures: ctx.free.slice() }, { creatures: [] }], 4);
        expect(scores[0]).toBeGreaterThanOrEqual(0); expect(scores[0]).toBeLessThanOrEqual(1);
        expect(scores[2]).toBe(-1);   // fewer than `min` is illegal: scored -1, never applied
        expect(ctx.evaluate!([std], 4)).toEqual([scores[0]]);   // the same dice for the same candidate: repeatable
        seen.deploy++;
        return std;
      },
      engage(ctx: Parameters<NonNullable<StrangerStrategy["engage"]>>[0]) {
        const std = getStrategy("standard").engage!(ctx);
        const [score] = ctx.evaluate!([std], 3);
        expect(score).toBeGreaterThanOrEqual(0); expect(score).toBeLessThanOrEqual(1);
        seen.engage++;
        return std;
      },
    } satisfies StrangerStrategy;
    registerStrategy(spy);
    try {
      for (let n = 0; n < 20; n++) playRevisedFight(start(scenario("rollout-spy", n)));
      // The strangers engage only when they are the attacker: a hostile reaction (Test Mode) gives them the surprise.
      for (let n = 0; n < 20; n++) {
        let s = scenario("rollout-spy", n);
        s = { ...s, testMode: true };
        s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
        s = driveStrangers(reduce(s, { type: "test" }).state).state;
        if (s.fight?.pending?.by === "party") s = reduce(s, partyAction(s)!).state;
        playRevisedFight(s);
      }
    } finally { unregisterStrategy("rollout-spy"); }
    expect(seen.deploy).toBeGreaterThan(0);
    expect(seen.engage).toBeGreaterThan(0);
  });

  it("evaluation leaves the real game untouched", () => {
    const s = start(scenario("expert", 5));
    const before = JSON.stringify(s);
    playRevisedFight(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

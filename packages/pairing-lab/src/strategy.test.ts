import { describe, it, expect } from "vitest";
import { STRATEGIES, fightFromView, getStrategy, mcStrategy, strategyToPolicy, viewOfFight, type DeployDecision, type StrangerStrategy } from "./strategy";
import { DEFAULT_RULES } from "./rules";
import { simulate, startFight } from "./sim";
import { balancedScenario } from "./scenario";
import { stylePolicy } from "./policies";

const OK = ["strangersWin", "partyWin", "retreat", "stalemate", "cap"];

describe("the fight view (plain, serialisable data)", () => {
  it("survives a JSON round trip and rebuilds an equivalent fight", () => {
    const F = startFight(balancedScenario(5, "base"), DEFAULT_RULES, 1);
    const v = JSON.parse(JSON.stringify(viewOfFight(F)));
    const G = fightFromView(v, 42);
    expect(G.P).toEqual(F.P); expect(G.S).toEqual(F.S); expect(G.matches).toEqual(F.matches);
    expect(G.ctx).toEqual(F.ctx); expect(G.totalP).toBe(F.totalP); expect(G.round).toBe(F.round);
  });
  it("does not expose the live random stream", () => {
    const F = startFight(balancedScenario(5, "base"), DEFAULT_RULES, 1);
    expect(Object.keys(viewOfFight(F))).not.toContain("rng");
  });
});

describe("the registry", () => {
  it("always has standard, and knows mc", () => {
    expect(getStrategy("standard").id).toBe("standard");
    expect(getStrategy("mc").id).toBe("mc");
    expect(Object.keys(STRATEGIES)).toEqual(expect.arrayContaining(["standard", "mc"]));
  });
  it("falls back to standard for an unknown id", () => {
    expect(getStrategy("no-such-thing").id).toBe("standard");
  });
});

describe("strategyToPolicy (the lab adapter)", () => {
  it("runs the standard strategy exactly like the GRD policy it wraps", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = balancedScenario(seed, "base");
      expect(simulate(s, DEFAULT_RULES, "GRD", strategyToPolicy(getStrategy("standard")), seed)).toEqual(simulate(s, DEFAULT_RULES, "GRD", stylePolicy("GRD"), seed));
    }
  });
  it("runs mc as the strangers in either role: legal, deterministic, and it logs every decision as plain data", () => {
    const log: unknown[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const s = balancedScenario(seed, seed % 2 ? "base" : "kit");
      const mk = () => strategyToPolicy(mcStrategy({ candidates: 6, rollouts: 8 }), { onDecision: (d) => log.push(d) });
      const a = simulate(s, DEFAULT_RULES, "CAU", mk(), seed), b = simulate(s, DEFAULT_RULES, "CAU", mk(), seed);
      expect(OK).toContain(a.end); expect(a).toEqual(b);
    }
    expect(log.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });
  it("replaces an illegal or throwing or async decision with standard's, and counts it", () => {
    const bad: StrangerStrategy = {
      id: "bad", version: 1,
      deploy: () => ({ deploy: [999, -3, 1.5] }),
      engage: () => { throw new Error("boom"); },
      redeploy: () => Promise.resolve({ moves: [] }) as never,
    };
    const stats = { fallbacks: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const o = simulate(balancedScenario(seed, "base"), DEFAULT_RULES, "GRD", strategyToPolicy(bad, { stats }), seed);
      expect(OK).toContain(o.end);
    }
    expect(stats.fallbacks).toBeGreaterThan(0);
  });
  it("hooks a strategy leaves out are inherited from standard", () => {
    const only: StrangerStrategy = { id: "deploy-only", version: 1, deploy: (c): DeployDecision => ({ deploy: c.free.slice(0, c.min) }) };
    for (let seed = 1; seed <= 20; seed++) expect(OK).toContain(simulate(balancedScenario(seed, "base"), DEFAULT_RULES, "GRD", strategyToPolicy(only), seed).end);
  });
  it("tags each logged decision with the strategy id and version", () => {
    const log: { strategyId: string; strategyVersion: number; kind: string }[] = [];
    simulate(balancedScenario(3, "base", { attacker: "strangers" }), DEFAULT_RULES, "GRD", strategyToPolicy(getStrategy("mc"), { onDecision: (d) => log.push(d) }), 3);
    expect(log.length).toBeGreaterThan(0);
    for (const d of log) { expect(d.strategyId).toBe("mc"); expect(d.strategyVersion).toBeGreaterThanOrEqual(1); expect(["deploy", "engage"]).toContain(d.kind); }
  });
});

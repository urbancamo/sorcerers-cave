import { describe, it, expect } from "vitest";
import { mcPolicy } from "./search";
import { simulate } from "./sim";
import { DEFAULT_RULES } from "./rules";
import { stylePolicy } from "./policies";
import { balancedScenario } from "./scenario";
import type { Style } from "./types";

const STYLES: Style[] = ["GRD", "CAU", "MAG", "RLG"];
const small = () => mcPolicy({ candidates: 6, rollouts: 8 });

describe("mcPolicy (flat Monte Carlo decision maker)", () => {
  it("plays legal, terminating fights in either role, against every party style", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = balancedScenario(seed, seed % 2 ? "base" : "kit");
      for (const ps of STYLES) {
        const o = simulate(s, DEFAULT_RULES, ps, small(), seed);
        expect(["strangersWin", "partyWin", "retreat", "stalemate", "cap"]).toContain(o.end);
        expect(o.rounds).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it("can also play the party's side", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const o = simulate(balancedScenario(seed, "base"), DEFAULT_RULES, small(), "GRD", seed);
      expect(o.rounds).toBeGreaterThanOrEqual(1);
    }
  });
  it("is deterministic for a seed", () => {
    const s = balancedScenario(7, "base", { attacker: "strangers" });
    expect(simulate(s, DEFAULT_RULES, "GRD", small(), 3)).toEqual(simulate(s, DEFAULT_RULES, "GRD", small(), 3));
  });
  it("does not change the scenario it is given", () => {
    const s = balancedScenario(9, "base");
    const before = JSON.stringify(s);
    simulate(s, DEFAULT_RULES, "GRD", small(), 1);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("carries an id naming its budget, overridable", () => {
    expect(small().id).toBe("MC6x8");
    expect(mcPolicy({ id: "mine" }).id).toBe("mine");
  });
  it("earns at least as much as the greedy heuristic on a fixed set of fights (more value destroyed less lost)", () => {
    // paired: same scenarios and seeds; strangers are the policy under test, the party plays each style in turn
    const mean = (strangers: () => ReturnType<typeof stylePolicy>) => {
      let sum = 0, n = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const s = balancedScenario(seed, "base");
        sum += simulate(s, DEFAULT_RULES, STYLES[seed % 4]!, strangers(), seed).r3; n++;
      }
      return sum / n;
    };
    const greedy = mean(() => stylePolicy("GRD"));
    const mc = mean(() => mcPolicy({ candidates: 8, rollouts: 16 }));
    expect(mc).toBeGreaterThan(greedy - 0.01);
  });
});

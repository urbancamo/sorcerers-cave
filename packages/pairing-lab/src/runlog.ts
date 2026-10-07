// Run records: every simulated scenario with its inputs and its outcome, so a run can be stored, printed and replayed.
// The JSON form is exact (scenarios in full, not just seeds); `replayRun` re-simulates every scenario and checks that
// each recorded outcome is reproduced exactly.
import { balancedScenario, randomScenario } from "./scenario";
import { DEFAULT_RULES, unit } from "./rules";
import { simulate } from "./sim";
import type { Outcome, Rules, Scenario, Style, Unit } from "./types";

export interface PlainUnit { cid: number; gear: number[]; dragonKills: number; fsBonus: number; potion: boolean }
export interface PlainScenario { party: PlainUnit[]; strangers: PlainUnit[]; eye: boolean; curses: number; level: number; strangerSurprise: 0 | 1 }
export interface ScenarioRecord { id: number; seed: number; scenario: PlainScenario; outcome: Outcome }

export interface RunOptions {
  id: string;
  deck: "base" | "kit";
  generator: "balanced" | "random";
  seed: number;          // scenario i uses seed + i, for both the generator and the simulator
  count: number;
  partyStyle: Style;
  strangerStyle: Style;
  rules?: Rules;
}

export interface Run {
  version: 1;
  kind: "pairing-sim-run";
  run: { id: string; deck: "base" | "kit"; generator: "balanced" | "random"; baseSeed: number; count: number; partyStyle: Style; strangerStyle: Style; rules: Rules };
  scenarios: ScenarioRecord[];
}

const toPlainUnit = (u: Unit): PlainUnit => ({ cid: u.cid, gear: [...u.gear], dragonKills: u.dragonKills, fsBonus: u.fsBonus, potion: u.potion });
const fromPlainUnit = (p: PlainUnit): Unit => { const u = unit(p.cid, p.gear); u.dragonKills = p.dragonKills; u.fsBonus = p.fsBonus; u.potion = p.potion; return u; };
const toPlain = (s: Scenario): PlainScenario => ({
  party: s.party.map(toPlainUnit), strangers: s.strangers.map(toPlainUnit), eye: s.eye, curses: s.curses, level: s.level, strangerSurprise: s.strangerSurprise,
});
export const fromPlain = (p: PlainScenario): Scenario => ({
  party: p.party.map(fromPlainUnit), strangers: p.strangers.map(fromPlainUnit), eye: p.eye, curses: p.curses, level: p.level, strangerSurprise: p.strangerSurprise,
});

export function simulateRun(o: RunOptions): Run {
  const rules = o.rules ?? DEFAULT_RULES;
  const scenarios: ScenarioRecord[] = [];
  for (let i = 0; i < o.count; i++) {
    const seed = o.seed + i;
    const sc = (o.generator === "balanced" ? balancedScenario : randomScenario)(seed, o.deck);
    scenarios.push({ id: i + 1, seed, scenario: toPlain(sc), outcome: simulate(sc, rules, o.partyStyle, o.strangerStyle, seed) });
  }
  return {
    version: 1, kind: "pairing-sim-run",
    run: { id: o.id, deck: o.deck, generator: o.generator, baseSeed: o.seed, count: o.count, partyStyle: o.partyStyle, strangerStyle: o.strangerStyle, rules },
    scenarios,
  };
}

/** Pretty-printed for small runs, compact for large ones. */
export const toJson = (run: Run, indent = run.scenarios.length <= 2000 ? 2 : 0): string => JSON.stringify(run, null, indent);

export function parseRun(json: string): Run {
  const r = JSON.parse(json) as Run;
  if (r.kind !== "pairing-sim-run" || r.version !== 1) throw new Error("not a version 1 pairing-sim-run file");
  return r;
}

/** Re-simulate every recorded scenario and report the ids whose outcome is not reproduced exactly. */
export function replayRun(run: Run): { ok: boolean; mismatches: number[] } {
  const { rules, partyStyle, strangerStyle } = run.run;
  const mismatches: number[] = [];
  for (const rec of run.scenarios) {
    const o = simulate(fromPlain(rec.scenario), rules, partyStyle, strangerStyle, rec.seed);
    if (JSON.stringify(o) !== JSON.stringify(rec.outcome)) mismatches.push(rec.id);
  }
  return { ok: mismatches.length === 0, mismatches };
}

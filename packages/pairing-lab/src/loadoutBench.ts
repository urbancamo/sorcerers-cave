// Bench for stranger LOADOUT strategies (pluggable stranger combat spec, stage 3): run an engine `StrangerStrategy` as the
// source of the strangers' artefacts in lab scenarios, then play the same fights both ways and compare by full simulation.
// The scenarios put artefacts under the strangers' guard far more often than the game would (`strangerOdds`), because the
// default 4% would leave almost every fight with nothing to decide.
import type { Allocation, StrangerStrategy } from "@sorcerers-cave/engine";
import { armStrangers, balancedScenario, type LoadoutFn } from "./scenario";
import { DEFAULT_RULES, mpOf, partyHasRing, totalOf } from "./rules";
import { simulate } from "./sim";
import type { Ctx, Style } from "./types";

/** An engine strategy as a lab loadout function. A strategy that throws or gives nonsense gets the same treatment as in the game:
 *  the engine's `standard` decision is used instead. */
export function strategyLoadout(strategy: StrangerStrategy, budget = { maxNodes: 20000 }): LoadoutFn {
  let n = 0;
  return ({ strangers, floor, eye, party, level, curses }) => {
    const ctx: Ctx = { eye, curses, level, attacker: "strangers", surprise: 0, rules: DEFAULT_RULES };
    const view = {
      strangers: strangers.map((u) => u.cid), gear: strangers.map((u) => u.gear.slice()), floor: floor.slice(), eyePresent: eye, level, round: 1,
      party: party.map((u) => ({ creatureId: u.cid, strength: totalOf(u, ctx), magic: mpOf(u, ctx) })),
      partyRollBonus: (partyHasRing(party, ctx) ? 1 : 0) - curses,
    };
    const out = strategy.assignArtefacts({ view, rngSeed: ++n, budget });
    return out.allocations as Allocation[];
  };
}

export interface CompareOptions {
  a: StrangerStrategy | LoadoutFn;     // the baseline
  b: StrangerStrategy | LoadoutFn;     // the challenger
  scenarios: number;
  deck: "base" | "kit";
  strangerOdds?: number;               // default 0.9 (see above)
  partyStyles?: readonly Style[];      // default all four, in turn
  firstSeed?: number;
  strangers?: [number, number];        // only fights with this many strangers, inclusive (default 1-20)
}

export interface CompareResult {
  n: number;
  differed: number;                    // fights in which the two strategies armed the strangers differently
  r3A: number; r3B: number; diffR3: number; diffCI: number;      // R3 for the strangers; diff = B - A with a 95% interval
  r2A: number; r2B: number; diffR2: number;
  /** the same, over only the fights where the loadouts differed */
  onDiffered: { n: number; diffR3: number; diffCI: number; diffR2: number };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ci = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return 1.96 * Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1)) / Math.sqrt(xs.length);
};

/** Play each fight twice from identical dice: once with the strangers armed by `a`, once by `b`. */
export function compareLoadouts(o: CompareOptions): CompareResult {
  const styles = o.partyStyles ?? (["GRD", "CAU", "MAG", "RLG"] as const);
  const [lo, hi] = o.strangers ?? [1, 20];
  const base = { strangerOdds: o.strangerOdds ?? 0.9, maxStrangers: hi };
  const as = (x: StrangerStrategy | LoadoutFn): LoadoutFn => (typeof x === "function" ? x : strategyLoadout(x));
  const la = as(o.a), lb = as(o.b);
  const d3: number[] = [], d2: number[] = [], r3a: number[] = [], r3b: number[] = [], r2a: number[] = [], r2b: number[] = [];
  const dd3: number[] = [], dd2: number[] = [];
  let differed = 0;
  for (let seed = o.firstSeed ?? 1, done = 0; done < o.scenarios; seed++) {
    const raw = balancedScenario(seed, o.deck, { ...base, deferLoadout: true });
    if (raw.strangers.length < lo) continue;
    const sa = armStrangers(raw, la), sb = armStrangers(raw, lb);
    const style = styles[done % styles.length]!;
    const oa = simulate(sa, DEFAULT_RULES, style, "GRD", seed), ob = simulate(sb, DEFAULT_RULES, style, "GRD", seed);
    const diff = sa.strangers.some((u, i) => u.gear.join() !== sb.strangers[i]!.gear.join());
    r3a.push(oa.r3); r3b.push(ob.r3); r2a.push(oa.r2); r2b.push(ob.r2); d3.push(ob.r3 - oa.r3); d2.push(ob.r2 - oa.r2);
    if (diff) { differed++; dd3.push(ob.r3 - oa.r3); dd2.push(ob.r2 - oa.r2); }
    done++;
  }
  return {
    n: d3.length, differed, r3A: mean(r3a), r3B: mean(r3b), diffR3: mean(d3), diffCI: ci(d3), r2A: mean(r2a), r2B: mean(r2b), diffR2: mean(d2),
    onDiffered: { n: dd3.length, diffR3: mean(dd3), diffCI: ci(dd3), diffR2: mean(dd2) },
  };
}

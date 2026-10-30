// Search-based policies for the lab (pluggable stranger combat spec, stage 3): a flat Monte Carlo decision maker that tries each
// candidate choice by playing the rest of the fight out many times, and keeps the choice with the best average reward.
//
// Reward is the agreed R3 from the deciding side's view: value destroyed minus value lost, as a fraction of everything in the
// fight (`Outcome.r3` is the strangers' view; the party's is 1 - r3). Every candidate is judged on the SAME rollouts (same dice,
// same opponent style), so differences between candidates are not swamped by luck. The opponent is not known, so each rollout
// draws a style from a model of how a player might behave (`opponents`), and the deciding side finishes with its `base` policy.
import { makeRng } from "./rng";
import { totalOf } from "./rules";
import { STYLE_POLICIES, oppOf, stylePolicy, unitsOf, type Policy } from "./policies";
import { beginRound, cloneFight, playOut, resumeAfterEngage, stepEngage, type Policies } from "./sim";
import type { Fight, Side, Style } from "./types";

export interface McOptions {
  readonly id?: string;
  /** Candidate choices tried per decision (the built-in heuristics plus random ones). */
  readonly candidates?: number;
  /** Rollouts per candidate. */
  readonly rollouts?: number;
  /** What the deciding side does after the decision being evaluated, and for the decisions this policy does not search. */
  readonly base?: Policy;
  /** Styles the unknown opponent is assumed to be drawn from, one per rollout in turn. */
  readonly opponents?: readonly Style[];
}

const ALL_STYLES: readonly Style[] = ["GRD", "CAU", "MAG", "RLG"];

/** The reward of a finished fight to `side`. */
const rewardTo = (F: Fight, side: Side): number => {
  const tot = F.totalP + F.totalS;
  const strangers = tot ? 0.5 + (0.5 * (F.pvl - F.svl)) / tot : 0.5;
  return side === "strangers" ? strangers : 1 - strangers;
};

export function mcPolicy(o: McOptions = {}): Policy {
  const base = o.base ?? STYLE_POLICIES.GRD;
  const K = o.candidates ?? 8, R = o.rollouts ?? 24;
  const opponents = o.opponents ?? ALL_STYLES;

  /** Mean reward over the rollouts of one candidate; `apply` plays the candidate decision into a clone positioned at that point of the round. */
  function score(F: Fight, side: Side, seed: number, apply: (G: Fight, pol: Policies) => void): number {
    let sum = 0;
    for (let j = 0; j < R; j++) {
      const G = cloneFight(F, makeRng(seed + j * 7919));   // the same seed for every candidate: common random numbers
      const opp = STYLE_POLICIES[opponents[j % opponents.length]!];
      const pol: Policies = side === "strangers" ? { strangers: base, party: opp } : { party: base, strangers: opp };
      apply(G, pol);
      sum += rewardTo(G, side);
    }
    return sum / R;
  }

  /** Position a clone one step before the decision: the round has begun (step a) but nothing else has happened. */
  const roundOf = (G: Fight) => { G.round--; return beginRound(G); };

  function best<T>(F: Fight, cands: T[], run: (c: T, G: Fight, pol: Policies) => void, side: Side): T {
    if (cands.length === 1) return cands[0] as T;
    const seed = (F.rng.next() * 4294967296) >>> 0;
    let top: T = cands[0] as T, topScore = -1;
    for (const c of cands) {
      const s = score(F, side, seed, (G, pol) => run(c, G, pol));
      if (s > topScore) { top = c; topScore = s; }
    }
    return top;
  }

  const dedupe = <T,>(items: T[], key: (t: T) => string): T[] => { const seen = new Set<string>(); return items.filter((t) => { const k = key(t); if (seen.has(k)) return false; seen.add(k); return true; }); };

  return {
    id: o.id ?? `MC${K}x${R}`,
    surplus: base.surplus,
    nominate: base.nominate,

    deploy(F, side, free, min) {
      const U = unitsOf(F, side);
      const strongFirst = free.slice().sort((a, b) => totalOf(U[b]!, F.ctx) - totalOf(U[a]!, F.ctx));
      const cands: number[][] = [];
      for (const style of ALL_STYLES) cands.push(stylePolicy(style).deploy(F, side, free, min));
      cands.push(strongFirst.slice(0, min), strongFirst.slice().reverse().slice(0, min), strongFirst);   // the strongest, the weakest, everyone
      while (cands.length < K) { const f = free.slice(); F.rng.shuffle(f); cands.push(f.slice(0, min + F.rng.int(f.length - min + 1))); }
      const unique = dedupe(cands.map((c) => c.slice().sort((a, b) => a - b)), (c) => c.join(","));
      return best(F, unique.slice(0, Math.max(K, 1)), (chosen, G, pol) => {
        const rc = roundOf(G), D = unitsOf(G, side);
        for (const i of chosen) D[i]!.role = 1;
        stepEngage(G, rc, pol);
        resumeAfterEngage(G, rc, pol);
        playOut(G, pol);
      }, side);
    },

    engage(F, side, ownFree, oppDeployed) {
      const A = unitsOf(F, side), D = oppOf(F, side);
      const n = Math.min(ownFree.length, oppDeployed.length);
      const byDesc = (U: typeof A) => (x: number, y: number) => totalOf(U[y]!, F.ctx) - totalOf(U[x]!, F.ctx);
      const a = ownFree.slice().sort(byDesc(A)), d = oppDeployed.slice().sort(byDesc(D));
      const pairUp = (as: number[], ds: number[]): [number, number][] => Array.from({ length: n }, (_, i) => [as[i]!, ds[i]!] as [number, number]);
      const cands: [number, number][][] = [pairUp(a, d), pairUp(a, d.slice().reverse()), pairUp(a.slice().reverse(), d), pairUp(a.slice().reverse(), d.slice().reverse())];
      while (cands.length < K) { const as = ownFree.slice(), ds = oppDeployed.slice(); F.rng.shuffle(as); F.rng.shuffle(ds); cands.push(pairUp(as, ds)); }
      const unique = dedupe(cands, (c) => c.map(([x, y]) => `${x}-${y}`).sort().join(","));
      return best(F, unique, (pairs, G, pol) => {
        const rc = roundOf(G);
        stepEngage(G, rc, pol, undefined, pairs);
        resumeAfterEngage(G, rc, pol);
        playOut(G, pol);
      }, side);
    },
  };
}

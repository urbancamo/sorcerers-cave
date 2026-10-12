// The difficulty levels above `standard` (pluggable stranger combat spec, stage 5): `novice` plays the pairing decisions loosely and
// at random, `expert` searches them. Both leave the artefact loadout to `standard`, and both are built on the plain-data views only.
// A hook that cannot produce a legal answer is the driver's business (it falls back to `standard`), but these are written to be
// legal by construction: the calibration sweep (level-strategies.test.ts) asserts they never fall back.
import { winChance } from "./smartLoadout";
import { randBelow } from "./rng";
import {
  standardStrategy,
  type CasualtyContext, type CasualtyDecision, type DeployContext, type DeployDecision, type EngageContext, type EngageDecision,
  type FightView, type RedeployContext, type RedeployDecision, type StrangerStrategy, type UnitView,
} from "./strategy";

/** A seeded random stream over one decision's `rngSeed`. */
function stream(seed: number): { below(n: number): number; shuffle<T>(xs: readonly T[]): T[] } {
  let s = seed;
  const below = (n: number): number => { const r = randBelow(s, n); s = r.seed; return r.value; };
  return {
    below,
    shuffle: <T,>(xs: readonly T[]): T[] => {
      const a = xs.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = below(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
      return a;
    },
  };
}

const strangerUnits = (v: FightView): Map<number, UnitView> => new Map(v.strangers.map((u) => [u.index, u]));

// ---------------------------------------------------------------------------------------------------------------------------
// novice

/** `novice`: puts a random few in the front line, pairs at random, forgets half of the surplus, and nominates at random. */
export const noviceStrategy: StrangerStrategy = {
  id: "novice", version: 1, kind: "builtin",
  assignArtefacts: (ctx) => standardStrategy.assignArtefacts(ctx),

  deploy(ctx: DeployContext): DeployDecision {
    const r = stream(ctx.rngSeed);
    return { creatures: r.shuffle(ctx.free).slice(0, ctx.min) };
  },

  engage(ctx: EngageContext): EngageDecision {
    const r = stream(ctx.rngSeed);
    const pairs: EngageDecision["pairs"] = [], usedOwn = new Set<number>(), usedFoe = new Set<number>();
    for (;;) {   // until no legal pair has both ends free, which is what the rules ask of an attacker
      const open = ctx.legalPairs.filter((p) => !usedOwn.has(p.stranger) && !usedFoe.has(p.party));
      if (open.length === 0) break;
      const p = open[r.below(open.length)]!;
      usedOwn.add(p.stranger); usedFoe.add(p.party); pairs.push({ party: p.party, stranger: p.stranger });
    }
    return { pairs };
  },

  redeploy(ctx: RedeployContext): RedeployDecision {
    const r = stream(ctx.rngSeed);
    const moves: RedeployDecision["moves"] = [], filled = new Set<number>();
    for (const c of r.shuffle(ctx.candidates)) {
      if (r.below(2) === 0) continue;   // a novice leaves some surplus idle
      const options = ctx.legalMoves.filter((m) => m.creature === c && (m.back || !filled.has(m.match)));
      if (options.length === 0) continue;
      const m = options[r.below(options.length)]!;
      if (!m.back) filled.add(m.match);
      moves.push({ creature: m.creature, match: m.match, back: m.back });
    }
    return { moves };
  },

  chooseCasualty(ctx: CasualtyContext): CasualtyDecision {
    return { nominated: ctx.pair[stream(ctx.rngSeed).below(2)]! };
  },
};

// ---------------------------------------------------------------------------------------------------------------------------
// expert

/** Most nodes an expert decision may visit, whatever the driver's budget allows: decisions are made inside a mutation. */
const EXPERT_NODES = 20000;

/** What the strangers expect to gain from one match: the value they destroy less the value they lose (each creature's points). */
function matchValue(s: UnitView, p: UnitView, view: FightView): number {
  const sStr = s.strength + view.strangerDieBonus, pStr = p.strength + view.partyDieBonus;
  return p.points * winChance(sStr, pStr) - s.points * winChance(pStr, sStr);
}

/** `expert`: judges deployments and pairings by the exact expected value of the round's matches, within a node budget, and
 *  never does worse than `standard`'s answer (which it scores first and keeps unless something is strictly better). */
export const expertStrategy: StrangerStrategy = {
  id: "expert", version: 1, kind: "builtin",
  assignArtefacts: (ctx) => standardStrategy.assignArtefacts(ctx),

  deploy(ctx: DeployContext): DeployDecision {
    const v = ctx.view, mine = strangerUnits(v);
    const std = standardStrategy.deploy!(ctx).creatures;
    // The attacker is modelled as pairing its unengaged creatures strongest against strongest (the baseline); the party's
    // creatures already in a match are not facing a fresh front line.
    const engaged = new Set(v.matches.flatMap((m) => [...m.pf, ...m.pb]));
    const attackers = v.party.filter((u) => !engaged.has(u.index)).sort((a, b) => b.strength - a.strength);
    const score = (set: readonly number[]): number => {
      const front = set.map((i) => mine.get(i)!).sort((a, b) => b.strength - a.strength);
      let total = 0;
      for (let k = 0; k < Math.min(front.length, attackers.length); k++) total += matchValue(front[k]!, attackers[k]!, v);
      return total;
    };
    let best = std.slice(), bestScore = score(best), nodes = 0;
    const chosen: number[] = [];
    const walk = (from: number): void => {
      if (nodes++ >= Math.min(ctx.budget.maxNodes, EXPERT_NODES)) return;
      if (chosen.length === ctx.min) { const sc = score(chosen); if (sc > bestScore + 1e-9) { best = chosen.slice(); bestScore = sc; } return; }
      for (let i = from; i < ctx.free.length; i++) { chosen.push(ctx.free[i]!); walk(i + 1); chosen.pop(); }
    };
    if (ctx.free.length > ctx.min) walk(0);
    return { creatures: best };
  },

  engage(ctx: EngageContext): EngageDecision {
    const v = ctx.view, mine = strangerUnits(v), theirs = new Map(v.party.map((u) => [u.index, u]));
    const value = (p: { party: number; stranger: number }): number => matchValue(mine.get(p.stranger)!, theirs.get(p.party)!, v);
    const std = standardStrategy.engage!(ctx).pairs;
    const total = (pairs: readonly { party: number; stranger: number }[]): number => pairs.reduce((a, p) => a + value(p), 0);
    let best = std, bestScore = total(std), nodes = 0;
    const attackers = ctx.own.slice().sort((a, b) => a - b);
    const chosen: EngageDecision["pairs"] = [], usedFoe = new Set<number>();
    const walk = (k: number): void => {
      if (nodes++ >= Math.min(ctx.budget.maxNodes, EXPERT_NODES)) return;
      if (k === attackers.length) {
        const usedOwn = new Set(chosen.map((p) => p.stranger));
        // Only a complete answer counts: no legal pair may be left with both ends free.
        if (ctx.legalPairs.some((p) => !usedOwn.has(p.stranger) && !usedFoe.has(p.party))) return;
        const sc = total(chosen);
        if (sc > bestScore + 1e-9) { best = chosen.map((p) => ({ ...p })); bestScore = sc; }
        return;
      }
      const a = attackers[k]!;
      for (const p of ctx.legalPairs) {
        if (p.stranger !== a || usedFoe.has(p.party)) continue;
        chosen.push(p); usedFoe.add(p.party);
        walk(k + 1);
        chosen.pop(); usedFoe.delete(p.party);
      }
      walk(k + 1);   // this attacker stays unpaired (legal only if every pair open to it is taken)
    };
    walk(0);
    return { pairs: best.map((p) => ({ party: p.party, stranger: p.stranger })) };
  },

  // Surplus is `standard`'s. A lost pair nominates the cheaper creature: the die then spares or takes it with equal odds, so the
  // nomination only decides which of the two is exposed to the better odds, and the cheaper one costs least if it falls.
  chooseCasualty(ctx: CasualtyContext): CasualtyDecision {
    const mine = strangerUnits(ctx.view), [a, b] = ctx.pair, ua = mine.get(a)!, ub = mine.get(b)!;
    if (ua.points !== ub.points) return { nominated: ua.points < ub.points ? a : b };
    if (ua.strength !== ub.strength) return { nominated: ua.strength < ub.strength ? a : b };
    return { nominated: Math.min(a, b) };
  },
};

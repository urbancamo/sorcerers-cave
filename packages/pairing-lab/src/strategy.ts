// The stranger-strategy interface of the pluggable combat spec (docs/requirements/combat/2026-10-11-pluggable-stranger-combat.md
// §5.2, the stage-4 hooks) and the lab adapter of stage 3 (§5.8). PROVISIONAL: the revised round engine does not exist in the
// game yet, so the contract lives here, in the lab, where it can be exercised; it moves to the engine with stage 4.
//
// A strategy sees a plain, serialisable `FightView` and returns plain, serialisable decisions, so the same strategy can run
// in the lab, in the game's driver, or behind a network call. The lab's own legality layer (in `sim.ts`) still checks every
// decision, and `strategyToPolicy` falls back to `standard` when a strategy throws, answers late, or answers nonsense.
import { makeRng } from "./rng";
import { mcPolicy, type McOptions } from "./search";
import { STYLE_POLICIES, type Move, type Policy } from "./policies";
import type { Ctx, Fight, Match, Side, Unit } from "./types";

/** Everything a strategy may know: both sides' creatures (with the artefacts they bear), the matches, the round, the conditions. */
export interface FightView {
  round: number; ctx: Ctx; P: Unit[]; S: Unit[]; matches: Match[];
  totalP: number; totalS: number; pvl: number; svl: number;
}
export interface Budget { maxNodes: number; deadlineMs?: number }
interface BaseContext { view: FightView; side: Side; rngSeed: number; budget: Budget }

export interface DeployContext extends BaseContext { free: number[]; min: number }
export interface EngageContext extends BaseContext { ownFree: number[]; oppDeployed: number[] }
export interface RedeployContext extends BaseContext { candidates: number[] }
export interface CasualtyContext extends BaseContext { a: number; b: number }

export interface DeployDecision { deploy: number[] }
export interface EngageDecision { pairs: [number, number][] }
export interface RedeployDecision { moves: Move[] }
export interface CasualtyDecision { nominated: number }

export interface StrangerStrategy {
  readonly id: string;
  readonly version: number;
  /** Step (c), the defender. */
  deploy?(ctx: DeployContext): DeployDecision;
  /** Step (d), the attacker. */
  engage?(ctx: EngageContext): EngageDecision;
  /** Step (e), surplus creatures. */
  redeploy?(ctx: RedeployContext): RedeployDecision;
  /** Nominates a creature only; the die rule is the engine's (Peter Q7). */
  chooseCasualty?(ctx: CasualtyContext): CasualtyDecision;
}

/** A decision as logged: plain data, tagged with who made it (spec §5.3). */
export interface LoggedDecision { kind: "deploy" | "engage" | "redeploy" | "casualty"; strategyId: string; strategyVersion: number; round: number; side: Side; decision: unknown }

const copyUnit = (u: Unit): Unit => ({ ...u, gear: u.gear.slice() });

export function viewOfFight(F: Fight): FightView {
  return {
    round: F.round, ctx: { ...F.ctx, rules: { ...F.ctx.rules } }, P: F.P.map(copyUnit), S: F.S.map(copyUnit),
    matches: F.matches.map((m) => ({ pf: m.pf.slice(), pb: m.pb.slice(), sf: m.sf.slice(), sb: m.sb.slice() })),
    totalP: F.totalP, totalS: F.totalS, pvl: F.pvl, svl: F.svl,
  };
}

/** A fight the lab can search from, rebuilt from a view (with its own random stream). */
export function fightFromView(v: FightView, rngSeed: number): Fight {
  return {
    P: v.P.map(copyUnit), S: v.S.map(copyUnit), ctx: { ...v.ctx, rules: { ...v.ctx.rules } }, rng: makeRng(rngSeed), round: v.round,
    matches: v.matches.map((m) => ({ pf: m.pf.slice(), pb: m.pb.slice(), sf: m.sf.slice(), sb: m.sb.slice() })),
    totalP: v.totalP, totalS: v.totalS, pvl: v.pvl, svl: v.svl, r1Won: 0, r1Matches: 0, end: null,
  };
}

/** A per-decision seed from the position alone, so asking never disturbs the fight's own dice. */
function seedOf(F: Fight, salt: number): number {
  let h = Math.imul(F.round + 1, 2654435761) ^ salt;
  for (const u of F.P) h = Math.imul(h ^ (u.cid * 4 + (u.alive ? 1 : 0) + u.role * 64), 16777619);
  for (const u of F.S) h = Math.imul(h ^ (u.cid * 8 + (u.alive ? 3 : 0) + u.role * 128), 16777619);
  return h >>> 0;
}

const isInt = (x: unknown): x is number => Number.isInteger(x);
const isThenable = (x: unknown): boolean => typeof (x as { then?: unknown } | null)?.then === "function";

export interface AdapterOptions {
  /** Called with every decision the strategy made (not the fallbacks). */
  onDecision?: (d: LoggedDecision) => void;
  /** Counts the decisions replaced by `standard`'s. */
  stats?: { fallbacks: number };
  budget?: Budget;
}

/** Run a strategy as one side of a lab fight. Hooks it leaves out, and decisions it gets wrong, come from `standard` (GRD). */
export function strategyToPolicy(strategy: StrangerStrategy, o: AdapterOptions = {}): Policy {
  const std = STYLE_POLICIES.GRD;
  const budget = o.budget ?? { maxNodes: 1 << 20 };
  const ask = <D>(F: Fight, side: Side, kind: LoggedDecision["kind"], salt: number, call: (b: BaseContext) => D, valid: (d: D) => boolean): D | undefined => {
    try {
      const d = call({ view: viewOfFight(F), side, rngSeed: seedOf(F, salt), budget });
      if (isThenable(d) || !valid(d)) throw new Error("unusable decision");
      o.onDecision?.({ kind, strategyId: strategy.id, strategyVersion: strategy.version, round: F.round, side, decision: JSON.parse(JSON.stringify(d)) });
      return d;
    } catch {
      if (o.stats) o.stats.fallbacks++;
      return undefined;
    }
  };
  const within = (xs: unknown, allowed: number[]): xs is number[] => Array.isArray(xs) && xs.every((x) => isInt(x) && allowed.includes(x));

  return {
    id: strategy.id,
    deploy(F, side, free, min) {
      if (!strategy.deploy) return std.deploy(F, side, free, min);
      const d = ask<DeployDecision>(F, side, "deploy", 1, (b) => strategy.deploy!({ ...b, free, min }), (x) => !!x && within(x.deploy, free));
      return d ? d.deploy : std.deploy(F, side, free, min);
    },
    engage(F, side, ownFree, oppDeployed) {
      if (!strategy.engage) return std.engage(F, side, ownFree, oppDeployed);
      const d = ask<EngageDecision>(F, side, "engage", 2, (b) => strategy.engage!({ ...b, ownFree, oppDeployed }),
        (x) => !!x && Array.isArray(x.pairs) && x.pairs.every((p) => Array.isArray(p) && p.length === 2 && ownFree.includes(p[0]) && oppDeployed.includes(p[1])));
      return d ? d.pairs : std.engage(F, side, ownFree, oppDeployed);
    },
    surplus(F, side, cand) {
      if (!strategy.redeploy) return std.surplus(F, side, cand);
      const d = ask<RedeployDecision>(F, side, "redeploy", 3, (b) => strategy.redeploy!({ ...b, candidates: cand }),
        (x) => !!x && Array.isArray(x.moves) && x.moves.every((m) => isInt(m.u) && cand.includes(m.u) && isInt(m.m) && m.m >= 0 && m.m < F.matches.length && typeof m.back === "boolean"));
      return d ? d.moves : std.surplus(F, side, cand);
    },
    nominate(F, side, a, b) {
      if (!strategy.chooseCasualty) return std.nominate(F, side, a, b);
      const d = ask<CasualtyDecision>(F, side, "casualty", 4, (bc) => strategy.chooseCasualty!({ ...bc, a, b }), (x) => !!x && (x.nominated === a || x.nominated === b));
      return d ? d.nominated : std.nominate(F, side, a, b);
    },
  };
}

/** `standard`: the lab's HEU placeholder (strongest against strongest) for deployment and engagement. Provisional (spec D7). */
const standard: StrangerStrategy = {
  id: "standard", version: 1,
  deploy: (c) => ({ deploy: STYLE_POLICIES.GRD.deploy(fightFromView(c.view, c.rngSeed), c.side, c.free, c.min) }),
  engage: (c) => ({ pairs: STYLE_POLICIES.GRD.engage(fightFromView(c.view, c.rngSeed), c.side, c.ownFree, c.oppDeployed) }),
  redeploy: (c) => ({ moves: STYLE_POLICIES.GRD.surplus(fightFromView(c.view, c.rngSeed), c.side, c.candidates) }),
};

/** Flat Monte Carlo (`search.ts`) as a strategy: it searches deployment and engagement, and leaves the rest to `standard`. */
export function mcStrategy(o: McOptions = {}): StrangerStrategy {
  const pol = mcPolicy(o);
  return {
    id: "mc", version: 1,
    deploy: (c) => ({ deploy: pol.deploy(fightFromView(c.view, c.rngSeed), c.side, c.free, c.min) }),
    engage: (c) => ({ pairs: pol.engage(fightFromView(c.view, c.rngSeed), c.side, c.ownFree, c.oppDeployed) }),
  };
}

export const STRATEGIES: Record<string, StrangerStrategy> = { standard, mc: mcStrategy({ candidates: 8, rollouts: 16 }) };

/** A strategy by id; `standard` for anything unknown (it is always present and is the universal fallback). */
export const getStrategy = (id: string): StrangerStrategy => STRATEGIES[id] ?? standard;

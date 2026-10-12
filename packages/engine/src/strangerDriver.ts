// The driver (pluggable stranger combat spec §5.4): while a fight is waiting on the strangers, ask the configured strategy,
// check its answer against the engine's legality layer, fall back to `standard` on any failure, and apply the result through
// `reduce` as a logged action. Pure and synchronous (built-in strategies), so a caller commits the player's action and the
// strangers' replies atomically. It returns every action it applied, in order, so the caller can append each to the game log.
import { reduce } from "./reduce";
import { loadoutViolation } from "./strangerEquip";
import { alignedGear } from "./strangerGear";
import { eyePresent } from "./effects";
import { ALL_CREATURES } from "./data/creatures";
import { partyAction, type PlayedFight } from "./partyPlay";
import { casterMP, frontStrength, partyRollBonus } from "./combat";
import "./builtinStrategies";
import {
  deployViolation, engageViolation, fightView, freeOf, legalMoves, legalPairs, nominateViolation, redeployViolation,
} from "./revisedRound";
import { getStrategy, standardStrategy, type Evaluate, type LoadoutContext, type LoadoutDecision, type StrangerStrategy } from "./strategy";
import type { GameAction, GameEvent } from "./actions";
import type { GameState } from "./state";

export interface AppliedAction { action: GameAction; events: GameEvent[] }

const MAX_DECISIONS = 4000;   // a safety stop: a revised fight asks a few decisions a round, and ends within its round limit

/** A per-decision seed from the game seed and the position, without advancing the game's own stream (P8). */
function decisionSeed(state: GameState): number {
  let h = (state.seed ^ Math.imul((state.fight?.round ?? 0) + 1, 2654435761)) >>> 0;
  for (const t of state.treasures) h = Math.imul(h ^ (t + 1), 16777619) >>> 0;
  for (const c of state.strangers) h = Math.imul(h ^ (c + 101), 16777619) >>> 0;
  return h;
}

function contextOf(state: GameState): LoadoutContext {
  return {
    view: {
      strangers: state.strangers.slice(), gear: alignedGear(state).map((g) => g.slice()), floor: state.treasures.slice(),
      eyePresent: eyePresent(state), level: state.level, round: state.fight?.round ?? 0,
      party: state.party.filter((m) => m.status === 0 || m.status === 1).map((m) => ({ creatureId: m.creatureId, strength: frontStrength(m, state), magic: casterMP(m, state) })),
      partyRollBonus: partyRollBonus(state),
    },
    rngSeed: decisionSeed(state), budget: { maxNodes: 1 << 20 },
  };
}

const isThenable = (x: unknown): boolean => typeof (x as { then?: unknown } | null)?.then === "function";

function decide(state: GameState, strategy: StrangerStrategy): { strategy: StrangerStrategy; decision: LoadoutDecision; fallback?: { from: string; reason: string } } {
  let reason: string | null = null;
  try {
    const decision = strategy.assignArtefacts(contextOf(state));
    if (isThenable(decision)) reason = "late: the strategy answered asynchronously";
    else {
      reason = loadoutViolation(state, decision?.allocations);
      if (reason === null) return { strategy, decision };
    }
  } catch (e) {
    reason = `failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { strategy: standardStrategy, decision: standardStrategy.assignArtefacts(contextOf(state)), fallback: { from: strategy.id, reason } };
}

/** A hook's answer checked against the legality layer, or `standard`'s when it fails, throws or answers late (P5, P6). A strategy that
 *  does not implement a hook leaves it to `standard`. */
function decideHook<D>(
  strategy: StrangerStrategy, call: (s: StrangerStrategy) => D | undefined, violation: (d: D) => string | null,
): { strategy: StrangerStrategy; decision: D; fallback?: { from: string; reason: string } } {
  let reason: string | null = null;
  try {
    const decision = call(strategy);
    if (decision === undefined) return { strategy: standardStrategy, decision: call(standardStrategy)! };
    if (isThenable(decision)) reason = "late: the strategy answered asynchronously";
    else {
      reason = violation(decision);
      if (reason === null) return { strategy, decision };
    }
  } catch (e) {
    reason = `failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { strategy: standardStrategy, decision: call(standardStrategy)!, fallback: { from: strategy.id, reason } };
}

/** The fixed part of a hook's context: the view, a per-decision seed and a budget. */
const hookBase = (state: GameState) => ({ view: fightView(state), rngSeed: decisionSeed(state), budget: { maxNodes: 1 << 20 } });

const POINTS = ALL_CREATURES.map((c) => c.points);

/** A fight played to its end headlessly: the strangers through this driver, the party through `standard`. */
export function playOutRevised(start: GameState, maxSteps = 5000): PlayedFight {
  let state = start;
  const actions: GameAction[] = [], events: GameEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const driven = driveStrangers(state);
    for (const a of driven.applied) { actions.push(a.action); events.push(...a.events); }
    state = driven.state;
    if (!state.fight) return { state, actions, events, end: state.phase === "gameOver" ? "lost" : "won" };
    if (state.fight.rev?.standoff) return { state, actions, events, end: "standoff" };
    const action = partyAction(state);
    if (!action) return { state, actions, events, end: "stuck" };
    const r = reduce(state, action);
    if (r.events.length === 1 && (r.events[0]!.type === "blocked" || r.events[0]!.type === "planRejected")) throw new Error(`the engine refused the party's ${action.type}: ${JSON.stringify(r.events[0])}`);
    actions.push(action); events.push(...r.events);
    state = r.state;
  }
  return { state, actions, events, end: "stuck" };
}

/** The strangers' result of a finished fight as a fraction: 0.5 plus half the net value destroyed over everything in the fight (R3). */
function resultForStrangers(total: number, events: readonly GameEvent[]): number {
  let svl = 0, pvl = 0;
  for (const e of events) {
    if (e.type === "strangerKilled") svl += POINTS[e.creatureId]!;
    else if (e.type === "memberDied") pvl += POINTS[e.creatureId]!;
  }
  return total ? 0.5 + (0.5 * (pvl - svl)) / total : 0.5;
}

/** Rollout seed `j` for a decision: the same for every candidate, so they are compared on the same dice. */
const rolloutSeed = (decision: number, j: number): number => ((Math.imul(decision ^ 0x9e3779b9, 2654435761) + Math.imul(j + 1, 40503)) >>> 1) || 1;

/** The `evaluate` a hook receives: each candidate action is applied to a copy of the game, then the rest of the fight is played with
 *  `standard` on both sides under fresh dice. */
function evaluator<D>(state: GameState, seed: number, toAction: (d: D) => GameAction): Evaluate<D> {
  const total = state.party.filter((m) => m.status === 0 || m.status === 1).reduce((a, m) => a + POINTS[m.creatureId]!, 0) + state.strangers.reduce((a, c) => a + POINTS[c]!, 0);
  return (candidates, rollouts) => candidates.map((d) => {
    const action = toAction(d);
    let sum = 0;
    for (let j = 0; j < rollouts; j++) {
      const copy = structuredClone(state);
      copy.seed = rolloutSeed(seed, j);
      copy.variants = { ...copy.variants, strangerLevel: "standard" };
      const first = reduce(copy, action);
      if (first.events.length === 1 && (first.events[0]!.type === "blocked" || first.events[0]!.type === "planRejected")) return -1;
      const played = playOutRevised(first.state);
      sum += resultForStrangers(total, [...first.events, ...played.events]);
    }
    return sum / rollouts;
  });
}

/** Answer whatever pending pairing decision the strangers have, as the action the engine then validates and applies. */
function pairingAction(state: GameState, strategy: StrangerStrategy): GameAction {
  const pending = state.fight!.pending!;
  const meta = (r: { strategy: StrangerStrategy; fallback?: { from: string; reason: string } }) =>
    ({ strategyId: r.strategy.id, strategyVersion: r.strategy.version, ...(r.fallback ? { fallback: r.fallback } : {}) });
  switch (pending.kind) {
    case "deploy": {
      const base = hookBase(state);
      const ctx = {
        ...base, free: freeOf(state, "strangers"), min: pending.min,
        evaluate: evaluator(state, base.rngSeed, (d: { creatures: number[] }): GameAction => ({ type: "strangersDeploy", strategyId: "rollout", strategyVersion: 0, creatures: d.creatures.slice() })),
      };
      const r = decideHook(strategy, (s) => s.deploy?.(ctx), (d) => deployViolation(state, "strangers", d?.creatures));
      return { type: "strangersDeploy", ...meta(r), creatures: r.decision.creatures.slice() };
    }
    case "engage": {
      const base = hookBase(state);
      const ctx = {
        ...base, own: freeOf(state, "strangers"), foes: state.fight!.rev!.deployed.party.slice(), legalPairs: legalPairs(state, "strangers"),
        evaluate: evaluator(state, base.rngSeed, (d: { pairs: { party: number; stranger: number }[] }): GameAction => ({ type: "strangersEngage", strategyId: "rollout", strategyVersion: 0, pairs: d.pairs.map((p) => ({ party: p.party, stranger: p.stranger })) })),
      };
      const r = decideHook(strategy, (s) => s.engage?.(ctx), (d) => engageViolation(state, "strangers", d?.pairs));
      return { type: "strangersEngage", ...meta(r), pairs: r.decision.pairs.map((p) => ({ party: p.party, stranger: p.stranger })) };
    }
    case "redeploy": {
      const moves = legalMoves(state, "strangers");
      const ctx = { ...hookBase(state), candidates: [...new Set(moves.map((m) => m.creature))], legalMoves: moves };
      const r = decideHook(strategy, (s) => s.redeploy?.(ctx), (d) => redeployViolation(state, "strangers", d?.moves));
      return { type: "strangersRedeploy", ...meta(r), moves: r.decision.moves.map((m) => ({ creature: m.creature, match: m.match, back: m.back })) };
    }
    case "casualty": {
      const ctx = { ...hookBase(state), pair: pending.pair };
      const r = decideHook(strategy, (s) => s.chooseCasualty?.(ctx), (d) => nominateViolation(state, d?.nominated));
      return { type: "strangersNominate", ...meta(r), nominated: r.decision.nominated };
    }
    default:
      throw new Error(`no pairing decision for ${pending.kind}`);
  }
}

export function driveStrangers(state: GameState): { state: GameState; applied: AppliedAction[] } {
  const applied: AppliedAction[] = [];
  let cur = state;
  for (let i = 0; i < MAX_DECISIONS && cur.fight?.pending?.by === "strangers"; i++) {
    const strategy = getStrategy(cur.variants?.strangerLevel ?? "standard");
    let action: GameAction;
    if (cur.fight.pending.kind === "loadout") {
      const { strategy: used, decision, fallback } = decide(cur, strategy);
      action = {
        type: "strangersAssignArtefacts", strategyId: used.id, strategyVersion: used.version,
        allocations: decision.allocations.map((a) => ({ artifact: a.artifact, stranger: a.stranger })), ...(fallback ? { fallback } : {}),
      };
    } else action = pairingAction(cur, strategy);
    const r = reduce(cur, action);
    if (r.events.length === 1 && r.events[0]!.type === "blocked") throw new Error("the engine refused a stranger decision it had just validated");
    applied.push({ action, events: r.events });
    cur = r.state;
  }
  return { state: cur, applied };
}

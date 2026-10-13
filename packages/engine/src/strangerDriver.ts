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
import {
  getStrategy, standardStrategy, type CasualtyContext, type DeployContext, type EngageContext, type Evaluate, type LoadoutContext,
  type LoadoutDecision, type RedeployContext, type StrangerStrategy,
} from "./strategy";
import type { GameAction, GameEvent } from "./actions";
import type { GameState } from "./state";

export interface AppliedAction { action: GameAction; events: GameEvent[] }

/** A decision the strangers can be asked for. */
export type PendingKind = "loadout" | "deploy" | "engage" | "redeploy" | "casualty";
/** What a strategy is asked, as plain data (no functions, so it survives JSON): the ask half of the driver, for a strategy that
 *  answers outside the mutation (stage 6). A search strategy running in process also gets `evaluate`, added by `pairingAction`. */
export type PendingContext =
  | { kind: "loadout"; context: LoadoutContext }
  | { kind: "deploy"; context: Omit<DeployContext, "evaluate"> }
  | { kind: "engage"; context: Omit<EngageContext, "evaluate"> }
  | { kind: "redeploy"; context: RedeployContext }
  | { kind: "casualty"; context: CasualtyContext };
/** Who answered, recorded on the logged action. */
export interface DecisionMeta { strategyId: string; strategyVersion: number }

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
    rngSeed: decisionSeed(state), budget: budgetOf(state),
  };
}

/** The thinking budget the configured level declares: the default node cap, plus its deadline if it has one. */
function budgetOf(state: GameState): { maxNodes: number; deadlineMs?: number } {
  const b = getStrategy(state.variants?.strangerLevel ?? "standard").budget;
  return { maxNodes: b?.maxNodes ?? 1 << 20, ...(b?.deadlineMs !== undefined ? { deadlineMs: b.deadlineMs } : {}) };
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
const hookBase = (state: GameState) => ({ view: fightView(state), rngSeed: decisionSeed(state), budget: budgetOf(state) });

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

/** The plain-data context of a pending pairing decision. */
function pairingContext(state: GameState): Exclude<PendingContext, { kind: "loadout" }> {
  const pending = state.fight!.pending!, base = hookBase(state);
  switch (pending.kind) {
    case "deploy": return { kind: "deploy", context: { ...base, free: freeOf(state, "strangers"), min: pending.min } };
    case "engage": return { kind: "engage", context: { ...base, own: freeOf(state, "strangers"), foes: state.fight!.rev!.deployed.party.slice(), legalPairs: legalPairs(state, "strangers") } };
    case "redeploy": {
      const moves = legalMoves(state, "strangers");
      return { kind: "redeploy", context: { ...base, candidates: [...new Set(moves.map((m) => m.creature))], legalMoves: moves } };
    }
    case "casualty": return { kind: "casualty", context: { ...base, pair: pending.pair } };
    default: throw new Error(`no pairing decision for ${pending.kind}`);
  }
}

/** The ask: what the strangers are being asked now, or null when the fight is not waiting on them. */
export function pendingContext(state: GameState): PendingContext | null {
  const pending = state.fight?.pending;
  if (!pending || pending.by !== "strangers") return null;
  return pending.kind === "loadout" ? { kind: "loadout", context: contextOf(state) } : pairingContext(state);
}

/** The logged action for a decision, whoever made it. */
function strangerAction(kind: PendingKind, decision: unknown, used: DecisionMeta, fallback?: { from: string; reason: string }): GameAction {
  const meta = { ...used, ...(fallback ? { fallback } : {}) };
  switch (kind) {
    case "loadout": return { type: "strangersAssignArtefacts", ...meta, allocations: (decision as LoadoutDecision).allocations.map((a) => ({ artifact: a.artifact, stranger: a.stranger })) };
    case "deploy": return { type: "strangersDeploy", ...meta, creatures: (decision as { creatures: number[] }).creatures.slice() };
    case "engage": return { type: "strangersEngage", ...meta, pairs: (decision as { pairs: { party: number; stranger: number }[] }).pairs.map((p) => ({ party: p.party, stranger: p.stranger })) };
    case "redeploy": return { type: "strangersRedeploy", ...meta, moves: (decision as { moves: { creature: number; match: number; back: boolean }[] }).moves.map((m) => ({ creature: m.creature, match: m.match, back: m.back })) };
    case "casualty": return { type: "strangersNominate", ...meta, nominated: (decision as { nominated: number }).nominated };
  }
}

/** Answer whatever pending pairing decision the strangers have, as the action the engine then validates and applies. */
function pairingAction(state: GameState, strategy: StrangerStrategy): GameAction {
  const pc = pairingContext(state);
  const meta = (r: { strategy: StrangerStrategy; fallback?: { from: string; reason: string } }): [DecisionMeta, typeof r.fallback] =>
    [{ strategyId: r.strategy.id, strategyVersion: r.strategy.version }, r.fallback];
  switch (pc.kind) {
    case "deploy": {
      const ctx = {
        ...pc.context,
        evaluate: evaluator(state, pc.context.rngSeed, (d: { creatures: number[] }): GameAction => strangerAction("deploy", d, { strategyId: "rollout", strategyVersion: 0 })),
      };
      const r = decideHook(strategy, (s) => s.deploy?.(ctx), (d) => deployViolation(state, "strangers", d?.creatures));
      return strangerAction("deploy", r.decision, ...meta(r));
    }
    case "engage": {
      const ctx = {
        ...pc.context,
        evaluate: evaluator(state, pc.context.rngSeed, (d: { pairs: { party: number; stranger: number }[] }): GameAction => strangerAction("engage", d, { strategyId: "rollout", strategyVersion: 0 })),
      };
      const r = decideHook(strategy, (s) => s.engage?.(ctx), (d) => engageViolation(state, "strangers", d?.pairs));
      return strangerAction("engage", r.decision, ...meta(r));
    }
    case "redeploy": {
      const r = decideHook(strategy, (s) => s.redeploy?.(pc.context), (d) => redeployViolation(state, "strangers", d?.moves));
      return strangerAction("redeploy", r.decision, ...meta(r));
    }
    case "casualty": {
      const r = decideHook(strategy, (s) => s.chooseCasualty?.(pc.context), (d) => nominateViolation(state, d?.nominated));
      return strangerAction("casualty", r.decision, ...meta(r));
    }
  }
}

/** The apply: a decision made elsewhere (an external strategy's answer) checked against the legality layer, replaced by `standard`'s
 *  when it is illegal or malformed (P5), and applied through `reduce` as a logged action (P6). Never throws on a bad answer. */
export function applyStrangerDecision(state: GameState, raw: unknown, meta: DecisionMeta): { state: GameState; applied: AppliedAction } {
  const pc = pendingContext(state);
  if (!pc) throw new Error("no pending stranger decision to apply");
  const field = (key: string): unknown => (raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined);
  let reason: string | null;
  switch (pc.kind) {
    case "loadout": reason = loadoutViolation(state, field("allocations")); break;
    case "deploy": reason = deployViolation(state, "strangers", field("creatures")); break;
    case "engage": reason = engageViolation(state, "strangers", field("pairs")); break;
    case "redeploy": reason = redeployViolation(state, "strangers", field("moves")); break;
    case "casualty": reason = nominateViolation(state, field("nominated")); break;
  }
  const std = standardStrategy;
  const action = reason === null
    ? strangerAction(pc.kind, raw, meta)
    : strangerAction(pc.kind, standardDecision(pc), { strategyId: std.id, strategyVersion: std.version }, { from: meta.strategyId, reason });
  const r = reduce(state, action);
  if (r.events.length === 1 && r.events[0]!.type === "blocked") throw new Error("the engine refused a stranger decision it had just validated");
  return { state: r.state, applied: { action, events: r.events } };
}

/** `standard`'s answer to a pending decision. */
function standardDecision(pc: PendingContext): unknown {
  const std = standardStrategy;
  switch (pc.kind) {
    case "loadout": return std.assignArtefacts(pc.context);
    case "deploy": return std.deploy!(pc.context);
    case "engage": return std.engage!(pc.context);
    case "redeploy": return std.redeploy!(pc.context);
    case "casualty": return std.chooseCasualty!(pc.context);
  }
}

/** `awaiting` names the decision an external strategy has been asked and has not yet answered: the loop stops there and leaves the
 *  fight pending, for `applyStrangerDecision` to resume (stage 6). Built-in strategies never leave anything awaited. */
export function driveStrangers(state: GameState): { state: GameState; applied: AppliedAction[]; awaiting?: PendingKind } {
  const applied: AppliedAction[] = [];
  let cur = state;
  for (let i = 0; i < MAX_DECISIONS && cur.fight?.pending?.by === "strangers"; i++) {
    const strategy = getStrategy(cur.variants?.strangerLevel ?? "standard");
    if (strategy.kind === "external") return { state: cur, applied, awaiting: cur.fight.pending.kind };
    let action: GameAction;
    if (cur.fight.pending.kind === "loadout") {
      const { strategy: used, decision, fallback } = decide(cur, strategy);
      action = strangerAction("loadout", decision, { strategyId: used.id, strategyVersion: used.version }, fallback);
    } else action = pairingAction(cur, strategy);
    const r = reduce(cur, action);
    if (r.events.length === 1 && r.events[0]!.type === "blocked") throw new Error("the engine refused a stranger decision it had just validated");
    applied.push({ action, events: r.events });
    cur = r.state;
  }
  return { state: cur, applied };
}

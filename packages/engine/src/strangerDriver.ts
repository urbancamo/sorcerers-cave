// The driver (pluggable stranger combat spec §5.4): while a fight is waiting on the strangers, ask the configured strategy,
// check its answer against the engine's legality layer, fall back to `standard` on any failure, and apply the result through
// `reduce` as a logged action. Pure and synchronous (built-in strategies), so a caller commits the player's action and the
// strangers' replies atomically. It returns every action it applied, in order, so the caller can append each to the game log.
import { reduce } from "./reduce";
import { loadoutViolation } from "./strangerEquip";
import { alignedGear } from "./strangerGear";
import { eyePresent } from "./effects";
import { getStrategy, standardStrategy, type LoadoutContext, type LoadoutDecision, type StrangerStrategy } from "./strategy";
import type { GameAction, GameEvent } from "./actions";
import type { GameState } from "./state";

export interface AppliedAction { action: GameAction; events: GameEvent[] }

const MAX_DECISIONS = 8;   // a safety stop: one round can reopen the loadout at most a handful of times

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

export function driveStrangers(state: GameState): { state: GameState; applied: AppliedAction[] } {
  const applied: AppliedAction[] = [];
  let cur = state;
  for (let i = 0; i < MAX_DECISIONS && cur.fight?.pending?.by === "strangers"; i++) {
    const { strategy, decision, fallback } = decide(cur, getStrategy(cur.variants?.strangerLevel ?? "standard"));
    const action: GameAction = {
      type: "strangersAssignArtefacts", strategyId: strategy.id, strategyVersion: strategy.version,
      allocations: decision.allocations.map((a) => ({ artifact: a.artifact, stranger: a.stranger })), ...(fallback ? { fallback } : {}),
    };
    const r = reduce(cur, action);
    if (r.events.length === 1 && r.events[0]!.type === "blocked") throw new Error("the engine refused a stranger decision it had just validated");
    applied.push({ action, events: r.events });
    cur = r.state;
  }
  return { state: cur, applied };
}

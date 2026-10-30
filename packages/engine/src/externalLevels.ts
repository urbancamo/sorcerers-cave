// External levels (stage 6.1b, docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md): strategies whose decisions are
// made outside the engine (a model endpoint), so the engine never calls them; the driver stops and waits for the answer. What makes
// one level different from another is, among other things, how long it may think, so each declares its own deadline.
import type { StrangerStrategy, StrategyBudget } from "./strategy";

/** The thinking time of each external level. Provisional: tune against the real endpoint's latency (stage 6.6). */
export const EXTERNAL_LEVELS: Readonly<Record<string, { version: number; deadlineMs: number }>> = {
  "ext-easy": { version: 1, deadlineMs: 1500 },
  "ext-hard": { version: 1, deadlineMs: 6000 },
};

/** A strategy answered outside the process. Its hooks are never run here; `budget.deadlineMs` is how long the caller waits. */
export function externalStrategy(def: { id: string; version: number; budget: StrategyBudget }): StrangerStrategy {
  return {
    id: def.id, version: def.version, kind: "external", budget: def.budget,
    assignArtefacts() { throw new Error(`${def.id} is answered outside the engine`); },
  };
}

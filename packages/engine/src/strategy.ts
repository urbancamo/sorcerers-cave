// Stranger strategies (docs/requirements/combat/2026-10-11-pluggable-stranger-combat.md §5.2, stage 1): the one decision the
// strangers make today — who bears which fight artefact — behind a registry, so a game can be played against a different
// strategy without the engine knowing any concrete one (P3). The pairing hooks arrive with the revised round engine (stage 4).
//
// A strategy never changes the game: it returns a plain decision, the driver (strangerDriver.ts) checks it against the engine's
// legality layer and applies it as a logged action (P5, P6).
import { defaultLoadout, type Allocation } from "./loadout";
import { randBelow } from "./rng";

/** What a strategy may know when assigning artefacts: a read-only copy of the facts, never the game state itself (P4, P8). */
export interface LoadoutContext {
  view: {
    strangers: readonly number[];           // creature ids, by stranger index
    gear: readonly (readonly number[])[];   // what each already bears
    floor: readonly number[];               // treasure ids lying in the chamber, unborne
    eyePresent: boolean;
    level: number;
    round: number;
  };
  /** A per-decision random stream seed, derived from the game seed without advancing it (P8). */
  rngSeed: number;
  budget: { maxNodes: number; deadlineMs?: number };
}

export interface LoadoutDecision { allocations: Allocation[] }

export interface StrangerStrategy {
  readonly id: string;
  /** Bumped on any behaviour change; written to every logged decision. */
  readonly version: number;
  readonly kind: "builtin" | "external";
  assignArtefacts(ctx: LoadoutContext): LoadoutDecision;
}

/** `standard`: Peter's default loadout (docs/rules/strangers-default-loadout-v2-20261003.md). Always present; the universal fallback. */
export const standardStrategy: StrangerStrategy = {
  id: "standard", version: 1, kind: "builtin",
  assignArtefacts(ctx) {
    let seed = ctx.rngSeed;
    const allocations = defaultLoadout({
      strangers: ctx.view.strangers, gear: ctx.view.gear, floor: ctx.view.floor, eyePresent: ctx.view.eyePresent,
      pick: (n) => { const r = randBelow(seed, n); seed = r.seed; return r.value; },
    });
    return { allocations };
  },
};

const registry = new Map<string, StrangerStrategy>([[standardStrategy.id, standardStrategy]]);

export function registerStrategy(s: StrangerStrategy): void {
  if (s.id === standardStrategy.id) throw new Error("the standard strategy cannot be replaced");
  registry.set(s.id, s);
}
/** Remove a registered strategy (tests, hot reload). `standard` cannot be removed. */
export function unregisterStrategy(id: string): void { if (id !== standardStrategy.id) registry.delete(id); }
export const hasStrategy = (id: string): boolean => registry.has(id);
export const listStrategyIds = (): string[] => [...registry.keys()];
/** A strategy by id; `standard` for anything unknown. */
export const getStrategy = (id: string): StrangerStrategy => registry.get(id) ?? standardStrategy;

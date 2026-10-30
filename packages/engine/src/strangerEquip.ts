// Stranger Fight Preparations: the default loadout applied to a live fight (see loadout.ts for the heuristic
// itself and strangerGear.ts for the helpers that keep `fight.gear` aligned with `state.strangers`).
import { LOADOUT_ARTIFACTS, canBearArtifact, defaultLoadout, type Allocation } from "./loadout";
import { eyePresent } from "./effects";
import { randBelow } from "./rng";
import { alignedGear } from "./strangerGear";
import type { GameState } from "./state";
import type { GameEvent } from "./actions";

/**
 * Stranger Fight Preparations: let the strangers pick up the fight artefacts lying in the chamber by
 * Peter's default loadout. Allocated artefacts leave the floor (`state.treasures`) and are recorded in
 * `fight.gear`. Safe to run again: existing bearers keep what they hold and only artefacts that have
 * since reached the floor (a dead bearer's) are handed out. A no-op under the Eye of God, which switches
 * every fight artefact off. Consumes the game RNG only to break a genuine tie.
 */
export function equipStrangers(state: GameState): GameEvent[] {
  const fight = state.fight;
  if (!fight || state.strangers.length === 0) return [];
  // A stranger strategy is configured (`variants.strangerLevel`): the decision is the strategy's, taken by the driver and applied
  // as a logged action (strangerDriver.ts). Here the fight only waits, and only if there is something to decide.
  if (state.variants?.strangerLevel) {
    if (loadoutWork(state)) fight.pending = { by: "strangers", kind: "loadout" };
    return [];
  }
  const gear = alignedGear(state);
  const allocations = defaultLoadout({
    strangers: state.strangers,
    gear,
    floor: state.treasures,
    eyePresent: eyePresent(state),
    pick: (n) => { const r = randBelow(state.seed, n); state.seed = r.seed; return r.value; },
  });
  return applyAllocations(state, allocations);
}

/** Is there anything for a strategy to decide: a fight artefact on the floor that some stranger present could bear (and no Eye)? */
export function loadoutWork(state: GameState): boolean {
  if (eyePresent(state)) return false;
  return state.treasures.some((t) => (LOADOUT_ARTIFACTS as readonly number[]).includes(t) && state.strangers.some((c) => canBearArtifact(t, c)));
}

/** Hand the allocations out: each artefact leaves the floor and is recorded in `fight.gear`. */
export function applyAllocations(state: GameState, allocations: readonly Allocation[]): GameEvent[] {
  const fight = state.fight;
  if (!fight || allocations.length === 0) return [];
  const gear = alignedGear(state);
  const events: GameEvent[] = [];
  for (const { artifact, stranger } of allocations) {
    state.treasures.splice(state.treasures.indexOf(artifact), 1);
    gear[stranger]!.push(artifact);
    events.push({ type: "strangerEquipped", creatureId: state.strangers[stranger]!, artifact });
  }
  fight.gear = gear;
  return events;
}

/** The legality layer for a loadout decision (P5): why it is not allowed, or null if it is. Every strategy is held to this. */
export function loadoutViolation(state: GameState, allocations: unknown): string | null {
  if (!Array.isArray(allocations)) return "allocations is not a list";
  if (allocations.length > 0 && eyePresent(state)) return "the Eye of God switches every fight artefact off";
  const gear = alignedGear(state);
  const taken = new Map<number, number>();
  const seen = new Set<string>();
  for (const a of allocations) {
    if (!a || !Number.isInteger(a.artifact) || !Number.isInteger(a.stranger)) return "malformed allocation";
    if (!(LOADOUT_ARTIFACTS as readonly number[]).includes(a.artifact)) return `artefact ${a.artifact} is not a loadout artefact`;
    if (a.stranger < 0 || a.stranger >= state.strangers.length) return `no stranger ${a.stranger}`;
    if (!canBearArtifact(a.artifact, state.strangers[a.stranger]!)) return `stranger ${a.stranger} cannot bear artefact ${a.artifact}`;
    if (gear[a.stranger]!.includes(a.artifact) || seen.has(`${a.artifact}:${a.stranger}`)) return `stranger ${a.stranger} would bear artefact ${a.artifact} twice`;
    seen.add(`${a.artifact}:${a.stranger}`);
    taken.set(a.artifact, (taken.get(a.artifact) ?? 0) + 1);
  }
  for (const [artifact, n] of taken) if (n > state.treasures.filter((t) => t === artifact).length) return `not enough of artefact ${artifact} on the floor`;
  return null;
}

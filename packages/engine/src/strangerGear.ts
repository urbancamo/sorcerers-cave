// Fight artefacts borne by strangers (Peter's default loadout, docs/rules/strangers-default-loadout-v2-20261003.md).
// `state.strangers` stays a plain list of creature ids; what each one bears lives beside it in
// `state.fight.gear`, indexed the same way. Every place that removes or adds a stranger during a fight
// goes through the helpers here so the two arrays cannot drift apart.
import type { GameState } from "./state";

/** The fight artefacts stranger `i` bears (empty when none, or outside a fight). */
export function gearOf(state: GameState, i: number): readonly number[] {
  return state.fight?.gear?.[i] ?? [];
}

/** Pad or trim `gear` to the number of strangers (defensive: a missed site must never throw). */
export function alignedGear(state: GameState): number[][] {
  const gear = state.fight?.gear ?? [];
  return state.strangers.map((_, i) => gear[i] ?? []);
}

/** Remove stranger `i`; whatever it bore drops onto the floor. Returns the dropped artefacts. */
export function removeStranger(state: GameState, i: number): number[] {
  const gear = state.fight?.gear;
  const dropped = gear?.[i] ? [...gear[i]!] : [];
  state.strangers.splice(i, 1);
  if (gear) {
    gear.splice(i, 1);
    if (gear.every((g) => g.length === 0)) delete state.fight!.gear;
  }
  if (dropped.length) state.treasures.push(...dropped);
  return dropped;
}

/** Add an unequipped stranger (a deserter, a revert) while a fight may be in progress. */
export function addStranger(state: GameState, creatureId: number): void {
  state.strangers.push(creatureId);
  if (state.fight?.gear) state.fight.gear.push([]);
}

/** Every borne artefact returns to the floor and the record is cleared (the fight is over or being fled). */
export function dropAllGear(state: GameState): void {
  const gear = state.fight?.gear;
  if (!gear) return;
  for (const g of gear) state.treasures.push(...g);
  delete state.fight!.gear;
}

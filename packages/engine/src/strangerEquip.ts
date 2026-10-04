// Stranger Fight Preparations: the default loadout applied to a live fight (see loadout.ts for the heuristic
// itself and strangerGear.ts for the helpers that keep `fight.gear` aligned with `state.strangers`).
import { defaultLoadout } from "./loadout";
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
  const gear = alignedGear(state);
  const allocations = defaultLoadout({
    strangers: state.strangers,
    gear,
    floor: state.treasures,
    eyePresent: eyePresent(state),
    pick: (n) => { const r = randBelow(state.seed, n); state.seed = r.seed; return r.value; },
  });
  if (allocations.length === 0) return [];
  const events: GameEvent[] = [];
  for (const { artifact, stranger } of allocations) {
    state.treasures.splice(state.treasures.indexOf(artifact), 1);
    gear[stranger]!.push(artifact);
    events.push({ type: "strangerEquipped", creatureId: state.strangers[stranger]!, artifact });
  }
  fight.gear = gear;
  return events;
}

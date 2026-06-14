import { rollDie } from "./rng";
import { CREATURES, FLAG_GUIDES_PAST_TRAP } from "./data/creatures";
import {
  HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS,
} from "./data/hazards";
import { AF_DESTROYED, type GameState, type PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_TALISMAN = 7;
const T_MAGIC_STAFF = 9;
const C_WIZARD = 8;

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

function livingHolds(state: GameState, treasureId: number): boolean {
  return living(state).some((m) => m.treasure.includes(treasureId));
}

/** Resolve every hazard in the working set, in priority order (spec §7.2). */
export function applyHazards(state: GameState): { events: GameEvent[]; fell: boolean } {
  const events: GameEvent[] = [];
  let fell = false;
  const order = [HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP];

  for (const hz of order) {
    if (!state.hazards.includes(hz)) continue;
    if (hz === HAZARD_GHOULS && livingHolds(state, T_TALISMAN)) continue; // the Talisman wards off Ghouls (card)
    events.push({ type: "hazardFired", hazard: hz });
    switch (hz) {
      case HAZARD_EARTHQUAKE: {
        const prev = state.areas[state.prev];
        if (prev && state.prev !== state.partyArea) {
          prev.flags |= AF_DESTROYED;
          prev.contents = [];
        }
        break;
      }
      case HAZARD_MEDUSA: {
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          if (m.creatureId === C_WIZARD && m.treasure.includes(T_MAGIC_STAFF)) continue; // a Wizard bearing the Magic Staff is immune (card)
          const r = rollDie(state.seed);
          state.seed = r.seed;
          if (r.value <= 2) m.status = 2;
        }
        break;
      }
      case HAZARD_GHOULS: {
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const ours = rollDie(state.seed); state.seed = ours.seed;
          const theirs = rollDie(state.seed); state.seed = theirs.seed;
          const fs = CREATURES[m.creatureId]!.fs;
          if (ours.value + fs < theirs.value + 2) m.status = 3;
        }
        break;
      }
      case HAZARD_MUTINY: {
        const allies = state.party.filter((m) => m.status === 1);
        const originals = state.party.filter((m) => m.status === 0);
        // All allies desert; if the party is now ALL allies, one stays loyal (spec §Mutiny).
        const desert = originals.length === 0 ? allies.slice(1) : allies;
        const dropped: number[] = [];
        for (const a of desert) {
          state.strangers.push(a.creatureId); // revert to a stranger (retestable)
          dropped.push(...a.treasure);        // and drop their loot back into the chamber
        }
        state.treasures.push(...dropped);
        state.party = state.party.filter((m) => !desert.includes(m));
        if (desert.length > 0) {
          events.push({ type: "mutinied", deserters: desert.map((a) => a.creatureId), treasures: dropped });
        }
        break;
      }
      case HAZARD_TRAP: {
        const hasDwarf = living(state).some((m) => (CREATURES[m.creatureId]!.flags & FLAG_GUIDES_PAST_TRAP) !== 0);
        if (hasDwarf) events.push({ type: "trapAvoided" }); // the dwarf guides the party past it
        else fell = true;                                   // otherwise the party drops a level
        break;
      }
    }
  }
  state.hazards = [];
  return { events, fell };
}

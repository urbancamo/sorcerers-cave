import { rollDie } from "./rng";
import { CREATURES, FLAG_GUIDES_PAST_TRAP } from "./data/creatures";
import { TREASURES } from "./data/treasures";
import {
  HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS,
} from "./data/hazards";
import { AF_DESTROYED, type GameState, type PartyMember } from "./state";
import type { GameEvent } from "./actions";
import { frontStrength } from "./combat";

const T_TALISMAN = 7;
const T_MAGIC_STAFF = 9;
const C_WIZARD = 8;

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

function livingHolds(state: GameState, treasureId: number): boolean {
  return living(state).some((m) => m.treasure.includes(treasureId));
}

/** A living Wizard bearing the Magic Staff — makes Medusa powerless over the whole party (card). */
function hasStaffWizard(state: GameState): boolean {
  return state.party.some((m) => (m.status === 0 || m.status === 1) && m.creatureId === C_WIZARD && m.treasure.includes(T_MAGIC_STAFF));
}

/** Resolve every hazard in the working set, in priority order (spec §7.2). */
export function applyHazards(state: GameState): { events: GameEvent[]; fell: boolean } {
  const events: GameEvent[] = [];
  let fell = false;
  const order = [HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP];

  for (const hz of order) {
    if (!state.hazards.includes(hz)) continue;
    if (hz === HAZARD_GHOULS && livingHolds(state, T_TALISMAN)) { events.push({ type: "ghoulsWarded" }); continue; } // the Talisman wards off Ghouls (card)
    if (hz === HAZARD_MEDUSA && hasStaffWizard(state)) { events.push({ type: "medusaAverted" }); continue; } // the staff averts her gaze — no one stoned
    events.push({ type: "hazardFired", hazard: hz });
    switch (hz) {
      case HAZARD_EARTHQUAKE: {
        const prev = state.areas[state.prev];
        if (prev && state.prev !== state.partyArea) {
          prev.flags |= AF_DESTROYED;
          prev.contents = [];
          // Lay the earthquake card on the tile it collapsed (display-only scar on the rubble).
          prev.markers = [...(prev.markers ?? []), 300 + HAZARD_EARTHQUAKE];
        }
        break;
      }
      case HAZARD_MEDUSA: {
        // (A staff-Wizard's aversion is handled above, before the gaze fires.)
        const rolls: { creatureId: number; roll: number; petrified: boolean }[] = [];
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const r = rollDie(state.seed);
          state.seed = r.seed;
          const petrified = r.value <= 2; // a 1 or 2 turns that creature to stone (§Medusa)
          if (petrified) { m.status = 2; m.stoneArea = state.partyArea; } // left as stone in this chamber
          rolls.push({ creatureId: m.creatureId, roll: r.value, petrified });
        }
        if (rolls.length) events.push({ type: "medusaGaze", rolls });
        break;
      }
      case HAZARD_GHOULS: {
        // The attack forces everyone to drop heavy treasure to fight; it lands on the chamber floor,
        // visible and reclaimable at the end of the turn (§Ghouls).
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const heavy = m.treasure.filter((t) => TREASURES[t]!.kind === "heavy");
          if (heavy.length) {
            m.treasure = m.treasure.filter((t) => TREASURES[t]!.kind !== "heavy");
            state.treasures.push(...heavy);
          }
        }
        // Each creature fights the ghouls (strength 2) in the normal way — full fighting strength
        // (Magic Sword / Strength Potion count), no surprise. A lost match removes that member.
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const ours = rollDie(state.seed); state.seed = ours.seed;
          const theirs = rollDie(state.seed); state.seed = theirs.seed;
          const partyTotal = frontStrength(m, state) + ours.value, enemyTotal = 2 + theirs.value;
          events.push({
            type: "combatRoll", party: CREATURES[m.creatureId]!.name, enemy: "Ghouls",
            partyRoll: ours.value, enemyRoll: theirs.value, partyTotal, enemyTotal,
            result: partyTotal > enemyTotal ? "partyWon" : enemyTotal > partyTotal ? "enemyWon" : "tie",
          });
          if (enemyTotal > partyTotal) m.status = 3;
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
  // Medusa & Ghouls LURK in the chamber — re-parked into the area's contents so they reload and fire
  // again on every re-entry (§Medusa, §Ghouls). (Earthquake's scar is laid on the tile it collapsed,
  // handled in its case above.)
  const here = state.areas[state.partyArea];
  if (here) {
    for (const hz of state.hazards) {
      if ((hz === HAZARD_MEDUSA || hz === HAZARD_GHOULS) && !here.contents.includes(300 + hz)) {
        here.contents.push(300 + hz);
      }
    }
  }
  state.hazards = [];
  return { events, fell };
}

import { HAZARD_DESERTION, HAZARD_HARPIES, HAZARD_MUTINY, HAZARD_QUARREL, HAZARD_SPELL, type GameEvent } from "@sorcerers-cave/engine";

// The once-only hazards that strike and are spent. Each is presented as a set piece — its card shown in the dice / aftermath pop-up —
// and then discarded, leaving the tile clear. (Ghouls, Medusa and a lurking Harpies card stay in the chamber instead.)
const SPENT = [HAZARD_MUTINY, HAZARD_DESERTION, HAZARD_QUARREL, HAZARD_SPELL, HAZARD_HARPIES];

/** The spent hazard card these events played out, or null. A Quarrel that fizzles for want of two combatants fires no `hazardFired`. */
export function spentHazard(events: readonly GameEvent[]): number | null {
  for (const e of events) {
    if (e.type === "hazardFired" && SPENT.includes(e.hazard)) return e.hazard;
    if (e.type === "quarrelFizzled") return HAZARD_QUARREL;
  }
  return null;
}

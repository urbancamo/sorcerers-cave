import { HAZARD_DESERTION, HAZARD_HARPIES, HAZARD_MUTINY, HAZARD_QUARREL, HAZARD_SPELL, type GameEvent } from "@sorcerers-cave/engine";

// The once-only hazards that strike and are spent. Each is presented as a set piece — its card shown in the dice / aftermath pop-up —
// and then discarded, leaving the tile clear. (Ghouls, Medusa and a lurking Harpies card stay in the chamber instead.)
const SPENT = [HAZARD_MUTINY, HAZARD_DESERTION, HAZARD_QUARREL, HAZARD_SPELL, HAZARD_HARPIES];

/** True when this spent hazard fired in these events. A Quarrel that fizzles for want of two combatants fires no `hazardFired`. */
export function firedSpent(events: readonly GameEvent[], hazard: number): boolean {
  return SPENT.includes(hazard) && events.some((e) => (e.type === "hazardFired" && e.hazard === hazard) || (hazard === HAZARD_QUARREL && e.type === "quarrelFizzled"));
}

/** The spent hazard whose own outcome this event is (Desertion's rolls, the Harpies' theft, a Quarrel's flare, ...), if that hazard fired in
 *  `events`, else undefined. A card goes only with the notice or roll that tells its own story, never with whatever else happened in the
 *  same action (a Harpies card on a Bell Rope roll, issue #133). */
export function ownerOf(e: GameEvent, events: readonly GameEvent[]): number | undefined {
  const h = e.type === "mutinied" ? HAZARD_MUTINY
    : e.type === "desertionRoll" ? HAZARD_DESERTION
    : e.type === "wolfUnmoved" ? e.hazard
    : e.type === "harpiesSteal" || e.type === "harpiesLurk" ? HAZARD_HARPIES
    : e.type === "quarrel" || e.type === "quarrelFizzled" || e.type === "quarrelLooms" ? HAZARD_QUARREL
    : e.type === "spellRemap" ? HAZARD_SPELL
    : undefined;
  return h !== undefined && firedSpent(events, h) ? h : undefined;
}

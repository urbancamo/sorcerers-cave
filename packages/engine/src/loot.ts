import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

/**
 * Borne vs carried (multiplayer plan ④a, from Peter's notes): turn-to-stone — and by the same logic,
 * death — affects only the living flesh. An item the member was BEARING (wielding/worn/displayed) goes
 * down with the body: petrified with a stone member, lost with a corpse. An item merely CARRIED spills
 * onto the chamber floor, recoverable "as easily as if it had been dropped" (§Medusa: "anything they
 * were carrying can be taken from them"). Only these items have a borne mode in the base game:
 * the Magic Sword (3), the Magic Staff (9) and The Ring (10) — everything else is always carried.
 *
 * Passive combat effects (Sword bonus, Staff MP, Ring rolls) remain possession-based, exactly as
 * before — `borne` changes only the fate of the item when its holder falls.
 *
 * Extension kit (SC-EXT-26/27, design US-23/US-24): the Magic Axe (17) and Magic Shield (20) join
 * the SAME borne mode, mirrored exactly — their own passive combat effects (the Axe's fs bonus,
 * the Shield's ward) are likewise possession-based (combat.ts/combatPlan.ts), never `isBorne`;
 * `borne` still governs only what happens to the item when the holder falls or turns to stone.
 */
export const BORNEABLE: readonly number[] = [3, 9, 10, 17, 20];

export const isBorne = (m: PartyMember, tid: number): boolean => (m.borne ?? []).includes(tid);

/**
 * Spill one downed member's CARRIED items off the body, returning the spilled ids (borne items stay
 * on `m.treasure`, locked with the body). Naturally idempotent: after a spill only borne items remain.
 */
export function spillCarried(m: PartyMember): number[] {
  const keep = m.treasure.filter((t) => isBorne(m, t));
  const spilled = m.treasure.filter((t) => !isBorne(m, t));
  if (spilled.length) m.treasure = keep;
  return spilled;
}

/**
 * Sweep every DEAD (status 3) member: carried items spill to `dest` ("working" = the live chamber
 * floor `state.treasures`, joining a pickup; "contents" = parked on the current tile for a later
 * visit). Emits one itemsSpilled per member with anything to spill. Idempotent across repeat sweeps.
 */
export function sweepFallen(state: GameState, dest: "working" | "contents"): GameEvent[] {
  const events: GameEvent[] = [];
  for (const m of state.party) {
    if (m.status !== 3) continue;
    const items = spillCarried(m);
    if (!items.length) continue;
    if (dest === "working") state.treasures.push(...items);
    else state.areas[state.partyArea]!.contents.push(...items.map((t) => 200 + t));
    events.push({ type: "itemsSpilled", creatureId: m.creatureId, items });
  }
  return events;
}

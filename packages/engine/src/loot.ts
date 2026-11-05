import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

/**
 * In use vs carried (docs/requirements/2026-11-05-wielding-weapons-spec.md). A member's `borne` list is the items it is USING:
 * wielding (Magic Sword 3, Staff 9, Axe 17, Shield 20) or wearing (The Ring 10, the Talisman 7). An item's combat or warding effect
 * applies only while it is in use — merely carrying it gives nothing (W-4). Nothing is put in use automatically (W-6). The Eye of
 * God works by being carried; every other artefact is unchanged.
 *
 * Nothing is lost with a fallen holder (W-7): in use or not, every item spills like a carried one.
 */
export const WIELDED: readonly number[] = [3, 9, 17, 20];
export const WORN: readonly number[] = [7, 10];
export const BORNEABLE: readonly number[] = [...WIELDED, ...WORN];
/** The attacking weapons: a member wields at most one of these at a time (two hands: one weapon plus the Shield). */
export const ATTACKING: readonly number[] = [3, 9, 17];

export const isBorne = (m: PartyMember, tid: number): boolean => (m.borne ?? []).includes(tid);
/** Is `tid` held AND in use by this member? The one test every party combat or warding effect goes through. */
export const inUse = (m: PartyMember, tid: number): boolean => m.treasure.includes(tid) && isBorne(m, tid);
/** The attacking weapon already wielded that stops `tid` being wielded too (W-3), or null. */
export function wieldConflict(m: PartyMember, tid: number): number | null {
  if (!ATTACKING.includes(tid)) return null;
  return (m.borne ?? []).find((t) => ATTACKING.includes(t) && t !== tid) ?? null;
}

/** Spill everything a downed member carried off the body, returning the spilled ids. Idempotent: after a spill nothing remains. */
export function spillCarried(m: PartyMember): number[] {
  const spilled = m.treasure;
  m.treasure = [];
  m.borne = undefined;
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

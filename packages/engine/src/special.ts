import { rollDie } from "./rng";
import { fluteLulls, eyeForsakenByDeath, markDied } from "./effects";
import { canCarry } from "./pickup";
import { getSubLocation } from "./subLocation";
import type { SubAt } from "./subLocation";
import type { GameState, PartyMember, PlacedArea } from "./state";
import type { GameEvent } from "./actions";

const C_GIANT = 12;
const HEAVY = new Set([0, 1, 2]); // Silver, Gold, Gems

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

/** Can a living Giant fish at least one dropped item out of a Deep Pool right now? Recovery is a
 *  Giant-only, capacity-limited pickup (§Deep Pool): a Man/Ogre/etc. can never lift pool treasure,
 *  and a Giant already loaded to capacity can't either. Multiple Giants each count. */
export function giantCanRecover(state: GameState, dropped: readonly number[]): boolean {
  return state.party.some(
    (m) => (m.status === 0 || m.status === 1) && m.creatureId === C_GIANT && dropped.some((t) => canCarry(m, t)),
  );
}

/** Precise Locations (§10.5): the `sunkTreasure` bucket key for a given sub-location, or undefined
 *  when there isn't one to sink into/reclaim from (centre, or an undetermined doorway direction). */
export function sunkKey(sub: { at: SubAt; dir?: number }): "island" | 1 | 2 | 3 | 4 | undefined {
  if (sub.at === "island") return "island";
  if (sub.at === "doorway" && sub.dir !== undefined) return sub.dir as 1 | 2 | 3 | 4;
  return undefined;
}

/** Precise Locations (§10.5): pull (and remove) the sunk-treasure bucket at `key` from `area`, or
 *  undefined if there isn't one / it's empty. */
function takeSunkBucket(area: PlacedArea, key: "island" | 1 | 2 | 3 | 4 | undefined): number[] | undefined {
  if (key === undefined || !area.sunkTreasure?.length) return undefined;
  const bucket = area.sunkTreasure.find((b) => b.at === key);
  if (!bucket || bucket.items.length === 0) return undefined;
  area.sunkTreasure = area.sunkTreasure.filter((b) => b !== bucket);
  return bucket.items;
}

/**
 * Try to reclaim reclaimable treasure at the party's CURRENT area for a Deep-Pool/Viper-Pit-style
 * gated special: the auto-dropped pile first (an ordinary crossing's own drop), else the sunk
 * bucket at the party's EXACT current sub-location (a deliberate `dropTreasure`, §10.5). On
 * success: populates `state.treasures`, clears the source, sets `state.phase = "pickup"`, pushes
 * `treasureReclaimed`, and returns true. No-op (false) if there's nothing reclaimable or no
 * eligible carrier — a sunk bucket pulled to check eligibility is put back untouched either way.
 * Shared by `reduce.ts`'s `resolveAreaLoop` (on (re-)entry) and its `reclaimTreasure` action (while
 * the party is already parked on the tile, bug fix 2026-08-02) so the two paths can never diverge.
 */
export function tryReclaimSunk(
  state: GameState,
  area: PlacedArea,
  eligible: (items: readonly number[]) => boolean,
  events: GameEvent[],
): boolean {
  if (area.dropped && area.dropped.length > 0 && eligible(area.dropped)) {
    state.treasures = area.dropped;
    area.dropped = [];
    events.push({ type: "treasureReclaimed", count: state.treasures.length });
    state.phase = "pickup";
    return true;
  }
  const key = sunkKey(getSubLocation(state));
  const sunk = takeSunkBucket(area, key);
  if (sunk && eligible(sunk)) {
    state.treasures = sunk;
    events.push({ type: "treasureReclaimed", count: sunk.length });
    state.phase = "pickup";
    return true;
  }
  if (sunk) area.sunkTreasure = [...(area.sunkTreasure ?? []), { at: key!, items: sunk }];
  return false;
}

/** Cross the Viper Pit (§10.1). Each living member risks a fatal fall (a roll of 1 or 2); the
 *  Charmed Flute lulls the vipers so the whole party crosses safely. Threads the seed. */
export function viperCrossing(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const members = living(state);
  // The Charmed Flute (played by an eligible member) lulls the vipers — the party crosses unharmed.
  if (fluteLulls(state)) return [{ type: "vipersLulled" }];
  // Roll a d6 per member so the UI can show the crossing (a 1 or 2 is a fatal fall into the pit).
  const rolls: { creatureId: number; roll: number; died: boolean }[] = [];
  for (const m of members) {
    const r = rollDie(state.seed);
    state.seed = r.seed;
    const died = r.value <= 2;
    rolls.push({ creatureId: m.creatureId, roll: r.value, died });
    if (died) {
      markDied(state, m);
      // The Eye sinks into the pit with its bearer — the party is cursed for losing it (§Eye of God).
      events.push(...eyeForsakenByDeath(state, m));
      m.treasure = []; // lost to the pit
      events.push({ type: "memberDied", creatureId: m.creatureId });
    }
  }
  events.unshift({ type: "viperPit", rolls });
  return events;
}

/** Cross the Deep Pool (§10.2). A living Giant carries all heavy treasure across; otherwise
 *  every living member's heavy treasure (Silver/Gold/Gems) is left in the pool (reclaimable). */
export function deepPoolCrossing(state: GameState, poolIdx: number): GameEvent[] {
  const events: GameEvent[] = [];
  const members = living(state);
  if (members.some((m) => m.creatureId === C_GIANT)) return events; // Giant carries everything
  const pool = state.areas[poolIdx]!;
  pool.dropped = pool.dropped ?? [];
  for (const m of members) {
    const heavy = m.treasure.filter((t) => HEAVY.has(t));
    if (heavy.length > 0) {
      pool.dropped.push(...heavy);
      m.treasure = m.treasure.filter((t) => !HEAVY.has(t));
      events.push({ type: "treasureDropped", count: heavy.length });
    }
  }
  return events;
}

/** Cross the Whirlpool's shallows (§Whirlpool, design US-05): a d6 of 1-2 means the whole party is
 *  about to be dragged one level down (SC-EXT-6) — the caller (reduce.ts) performs the actual
 *  relocation via `relocateDown` and cancels the lateral move, since only reduce.ts holds that
 *  helper; 3-6 means the crossing is safe and the already-completed lateral move stands. Threads
 *  the seed. Unlike the Viper Pit / Deep Pool, no per-member effect — the whole party shares one roll. */
export function whirlpoolCrossing(state: GameState): { events: GameEvent[]; dragged: boolean } {
  const r = rollDie(state.seed);
  state.seed = r.seed;
  const dragged = r.value <= 2;
  return { events: [{ type: "whirlpoolRoll", roll: r.value, dragged }], dragged };
}

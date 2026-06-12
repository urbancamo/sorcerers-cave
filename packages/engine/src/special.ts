import { rollDie } from "./rng";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_CHARMED_FLUTE = 12;
const C_GIANT = 12;
const HEAVY = new Set([0, 1, 2]); // Silver, Gold, Gems

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

/** Cross the Viper Pit (§10.1). Each living member risks a fatal fall (roll of 1); the
 *  Charmed Flute lulls the vipers so the whole party crosses safely. Threads the seed. */
export function viperCrossing(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const members = living(state);
  if (members.some((m) => m.treasure.includes(T_CHARMED_FLUTE))) return events;
  for (const m of members) {
    const r = rollDie(state.seed);
    state.seed = r.seed;
    if (r.value === 1) {
      m.status = 3;
      m.treasure = []; // lost to the pit
      events.push({ type: "memberDied", creatureId: m.creatureId });
    }
  }
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

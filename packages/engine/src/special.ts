import { rollDie } from "./rng";
import { fluteLulls, eyeForsakenByDeath } from "./effects";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const C_GIANT = 12;
const HEAVY = new Set([0, 1, 2]); // Silver, Gold, Gems

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
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
      m.status = 3;
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

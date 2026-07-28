import { ALL_TREASURES, canCarry, decodeArea, SPECIAL_DEEP_POOL, type GameState } from "@sorcerers-cave/engine";

// 12 = Giant, the engine's own C_GIANT (selectors.ts) — only a Giant lifts treasure from a Deep Pool.
const C_GIANT = 12;
const active = (m: GameState["party"][number]) => m.status === 0 || m.status === 1;

/** Explanatory lines for treasure in the party's current area that nobody can take (design
 *  2026-07-28): the pickup window shows them beside the takeable rows, and the explore panel keeps
 *  them standing after an auto-skipped pickup. Wording follows the actual obstacle — the Deep
 *  Pool's Giant-only rule (§Deep Pool), or plain weight (a loaded Giant is a weight problem, not a
 *  pool problem). Silent when the whole party is down: the problem isn't the weight then. `tids`
 *  are plain treasure ids — the pickup working set, or parked `200+tid` contents decoded by the
 *  caller — and carryable ids simply produce no line. */
export function uncarryableNotes(state: GameState, tids: number[]): string[] {
  const party = state.party.filter(active);
  if (party.length === 0) return [];
  const deepPool = decodeArea(state.areas[state.partyArea]!.card).special === SPECIAL_DEEP_POOL;
  const giantless = deepPool && !party.some((m) => m.creatureId === C_GIANT);
  const notes: string[] = [];
  for (const tid of tids) {
    const name = ALL_TREASURES[tid]!.name;
    if (giantless) notes.push(`Only a Giant can lift the ${name} from the pool.`);
    else if (!party.some((m) => (!deepPool || m.creatureId === C_GIANT) && canCarry(m, tid))) {
      notes.push(`The ${name} is too heavy for anyone to carry.`);
    }
  }
  return notes;
}

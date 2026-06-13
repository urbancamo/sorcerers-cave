import { CREATURES } from "./data/creatures";
import { TREASURES } from "./data/treasures";
import { GS_DEAD, type GameState } from "./state";

/** Final score (spec §12). A wiped party (GS_DEAD) scores 0; otherwise clamp at 0. */
export function scoreGame(state: GameState): number {
  if (state.gs === GS_DEAD) return 0;
  let score = 0;
  for (const m of state.party) {
    if (m.status !== 0 && m.status !== 1) continue; // skip stone and dead
    let pts = CREATURES[m.creatureId]!.points;
    if (m.dragonKills > 0) pts *= 2; // dragon-slayer doubling (creature points only)
    score += pts;
    for (const tid of m.treasure) score += TREASURES[tid]!.points;
  }
  if (state.sorcererKilled) score += 30;
  score += state.bonusScore;
  score -= 30 * state.curses;
  return Math.max(0, score);
}

import { CREATURES } from "./data/creatures";
import { TREASURES, type TreasureKind } from "./data/treasures";
import { activeCurses } from "./effects";
import { GS_DEAD, type GameState, type MemberStatus } from "./state";

/** One carried item in a scored roll call (treasure or artifact). */
export interface ScoredTreasure {
  id: number;
  name: string;
  points: number;
  kind: TreasureKind;
}

/** One party member in a scored roll call. */
export interface ScoredMember {
  creatureId: number;
  name: string;
  status: MemberStatus;
  counts: boolean; // status 0/1 contributes to the total (stone/dead score nothing)
  creaturePoints: number; // after dragon-slayer doubling; 0 when !counts
  dragonDoubled: boolean;
  treasures: ScoredTreasure[]; // listed for the record even when the member doesn't count
  subtotal: number; // creaturePoints + carried treasure points; 0 when !counts
}

/** A full, displayable scoring breakdown — every party member, their carried items, and the bonuses. */
export interface ScoreBreakdown {
  members: ScoredMember[];
  sorcererBonus: number; // 30 if the Sorcerer was slain, else 0
  bonusScore: number; // banked points (e.g. Treasure Chest loot)
  cursePenalty: number; // 30 per curse deducted — but 0 once the Sorcerer is slain (curses are lifted)
  total: number; // final score (matches scoreGame)
}

/** Per-member/per-item scoring for the roll call (spec §12). `scoreGame` is its total. */
export function scoreBreakdown(state: GameState): ScoreBreakdown {
  const members: ScoredMember[] = state.party.map((m) => {
    const counts = m.status === 0 || m.status === 1; // skip stone and dead
    const dragonDoubled = m.dragonKills > 0;
    const base = CREATURES[m.creatureId]!.points;
    const creaturePoints = counts ? (dragonDoubled ? base * 2 : base) : 0; // doubling: creature points only
    const treasures: ScoredTreasure[] = m.treasure.map((tid) => {
      const t = TREASURES[tid]!;
      return { id: tid, name: t.name, points: t.points, kind: t.kind };
    });
    const treasureTotal = counts ? treasures.reduce((sum, t) => sum + t.points, 0) : 0;
    return {
      creatureId: m.creatureId,
      name: CREATURES[m.creatureId]!.name,
      status: m.status,
      counts,
      creaturePoints,
      dragonDoubled,
      treasures,
      subtotal: creaturePoints + treasureTotal,
    };
  });
  const sorcererBonus = state.sorcererKilled ? 30 : 0;
  const bonusScore = state.bonusScore;
  // 30 points per curse — but a slain Sorcerer lifts every curse, so no penalty then (§Curse, §Scoring).
  const cursePenalty = 30 * activeCurses(state);
  const raw = members.reduce((sum, m) => sum + m.subtotal, 0) + sorcererBonus + bonusScore - cursePenalty;
  // A wiped party (GS_DEAD) scores 0; otherwise clamp at 0.
  const total = state.gs === GS_DEAD ? 0 : Math.max(0, raw);
  return { members, sorcererBonus, bonusScore, cursePenalty, total };
}

/** Final score (spec §12). A wiped party (GS_DEAD) scores 0; otherwise clamp at 0. */
export function scoreGame(state: GameState): number {
  return scoreBreakdown(state).total;
}

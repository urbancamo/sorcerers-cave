// Extension kit (SC-EXT-17): aliases `ALL_CREATURES` — a surviving kit ally's own points/name would
// otherwise crash the roll call at game end; byte-identical for ids 0-13.
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { ALL_TREASURES, type TreasureKind } from "./data/treasures";
import { activeCurses } from "./effects";
import { rollDie } from "./rng";
import { GS_DEAD, type GameState, type MemberStatus } from "./state";

const T_IDOL = 18; // extension-kit treasure — deferred 10×d6 valuation at scoring time (SC-EXT-23)

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
  cursePenalty: number; // flat 30 if under any curse, else 0 — and 0 once the Sorcerer is slain (curses lifted)
  // Extension kit (SC-EXT-23, design US-25): the Idol's visible d6, present only when a surviving
  // (status 0/1) member carries it — undefined otherwise (left in the cave, or only on a dead/stone
  // member, per below). The game-over UI animates this roll onto the Idol's breakdown line.
  idolRoll?: number;
  total: number; // final score (matches scoreGame)
}

/** Per-member/per-item scoring for the roll call (spec §12). `scoreGame` is its total. */
export function scoreBreakdown(state: GameState): ScoreBreakdown {
  // Extension kit (SC-EXT-23, design US-25): the Idol (treasure 18) carries NO fixed point value in
  // `ALL_TREASURES` (points: 0) — its worth is deferred to scoring time: 10× a d6 drawn from the
  // FINAL state's seed via the ordinary, pure `rollDie` — called but never assigned back onto
  // `state.seed`, so this "peek" advances nothing and `scoreBreakdown` stays a pure, repeatable
  // function of `state` (same final state -> same roll, replay-safe; calling this twice on the same
  // state yields the identical roll both times). Rolled once per breakdown call, gated on ANY
  // surviving member carrying it (there is only ever one Idol card in a game either way).
  const idolCarried = state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(T_IDOL));
  const idolRoll = idolCarried ? rollDie(state.seed).value : undefined;

  const members: ScoredMember[] = state.party.map((m) => {
    const counts = m.status === 0 || m.status === 1; // skip stone and dead
    const dragonDoubled = m.dragonKills > 0;
    const base = CREATURES[m.creatureId]!.points;
    const creaturePoints = counts ? (dragonDoubled ? base * 2 : base) : 0; // doubling: creature points only
    // `ALL_TREASURES` (base + kit, SC-EXT-2) so a kit heavy find (e.g. Crypt/Gems, SC-EXT-13) scores
    // its real points instead of crashing on a `TREASURES` lookup miss; byte-identical for ids 0-14.
    // The Idol (SC-EXT-23) overrides its listed 0 with the deferred 10×roll — "for the record" even
    // on a member who doesn't count (mirrors every other item here), but `idolRoll` is undefined
    // (so this stays 0) unless SOME surviving member holds it — never the case for a dead/stone
    // holder alone, so "Idol on a dead member scores 0" falls out of this for free.
    const treasures: ScoredTreasure[] = m.treasure.map((tid) => {
      const t = ALL_TREASURES[tid]!;
      const points = tid === T_IDOL ? (idolRoll ?? 0) * 10 : t.points;
      return { id: tid, name: t.name, points, kind: t.kind };
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
  // A flat 30-point penalty if the party is under any curse (§Scoring: "under a curse deducts 30
  // points" — not per-curse). A slain Sorcerer lifts every curse, so there is no penalty then (§Curse).
  const cursePenalty = activeCurses(state) > 0 ? 30 : 0;
  const raw = members.reduce((sum, m) => sum + m.subtotal, 0) + sorcererBonus + bonusScore - cursePenalty;
  // A wiped party (GS_DEAD) scores 0; otherwise clamp at 0.
  const total = state.gs === GS_DEAD ? 0 : Math.max(0, raw);
  return { members, sorcererBonus, bonusScore, cursePenalty, idolRoll, total };
}

/** Final score (spec §12). A wiped party (GS_DEAD) scores 0; otherwise clamp at 0. */
export function scoreGame(state: GameState): number {
  return scoreBreakdown(state).total;
}

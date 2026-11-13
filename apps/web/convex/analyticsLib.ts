import { decodeArea, scoreGame, type GameState } from "@sorcerers-cave/engine";
import type { Doc } from "./_generated/dataModel";

type Row = Pick<Doc<"gameStats">, "mode" | "outcome" | "score" | "turn" | "deepestLevel" | "dragonKills" | "membersLost" | "picks" | "extensionKit" | "sibyl" | "finishedAt">;
type Outcomes = { escaped: number; dead: number; quit: number };

export const SCORE_BUCKET = 50;
export const DAYS = 30;
const DAY_MS = 86_400_000;

const tally = (counts: Map<number, number>, key: number) => counts.set(key, (counts.get(key) ?? 0) + 1);
const sorted = <K extends string>(m: Map<number, number>, k: K) =>
  [...m.entries()].sort((a, b) => a[0] - b[0]).map(([key, count]) => ({ [k]: key, count }) as Record<K, number> & { count: number });

/** Everything the analytics charts show, from a window of recorded games. Pure, so it is tested without a database. */
export function aggregate(rows: Row[], now: number) {
  const outcomes: Record<"solo" | "multi", Outcomes> = { solo: { escaped: 0, dead: 0, quit: 0 }, multi: { escaped: 0, dead: 0, quit: 0 } };
  const scores: number[] = [];
  const turns: number[] = [];
  const buckets = new Map<number, number>();
  const deepest = new Map<number, number>(), dragons = new Map<number, number>(), lost = new Map<number, number>(), creatures = new Map<number, number>();
  const variants = { base: 0, extensionKit: 0, sibyl: 0 };
  const today = Math.floor(now / DAY_MS);
  const perDay = new Map<number, Outcomes>();
  for (const r of rows) {
    outcomes[r.mode][r.outcome]++;
    tally(deepest, r.deepestLevel);
    tally(dragons, r.dragonKills);
    tally(lost, r.membersLost);
    for (const c of r.picks ?? []) tally(creatures, c);
    if (r.sibyl) variants.sibyl++; else if (r.extensionKit) variants.extensionKit++; else variants.base++;
    if (r.outcome === "escaped") {
      scores.push(r.score);
      turns.push(r.turn);
      tally(buckets, Math.floor(r.score / SCORE_BUCKET) * SCORE_BUCKET);
    }
    const day = Math.floor(r.finishedAt / DAY_MS);
    if (today - day < DAYS && day <= today) {
      const d = perDay.get(day) ?? { escaped: 0, dead: 0, quit: 0 };
      d[r.outcome]++;
      perDay.set(day, d);
    }
  }
  scores.sort((a, b) => a - b);
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const median = scores.length ? (scores.length % 2 ? scores[(scores.length - 1) / 2]! : (scores[scores.length / 2 - 1]! + scores[scores.length / 2]!) / 2) : null;
  const days = Array.from({ length: DAYS }, (_, i) => {
    const day = today - (DAYS - 1 - i);
    return { day: new Date(day * DAY_MS).toISOString().slice(0, 10), ...(perDay.get(day) ?? { escaped: 0, dead: 0, quit: 0 }) };
  });
  return {
    n: rows.length,
    outcomes,
    escapedScore: { mean: mean(scores), median, max: scores.length ? scores[scores.length - 1]! : null, meanTurns: mean(turns) },
    scoreHistogram: sorted(buckets, "from").map((b) => ({ from: b.from, to: b.from + SCORE_BUCKET, count: b.count })),
    perDay: days,
    deepest: sorted(deepest, "level"),
    dragonKills: sorted(dragons, "kills"),
    membersLost: sorted(lost, "lost"),
    creatures: sorted(creatures, "id").sort((a, b) => b.count - a.count),
    variants,
  };
}

const SPECIAL_NAME: Record<number, string> = {
  1: "Gateway", 2: "Deep Pool", 3: "Viper Pit", 4: "Tomb", 5: "Great Hall", 6: "Chasm", 7: "Bell Rope", 8: "Lair", 9: "Whirlpool", 10: "Gallery", 11: "Well",
};

/** Short name for an area card: a special area by name, otherwise "Chamber" or "Tunnel" with its exits and stairs, e.g. "Tunnel NE", "Chamber NESW ↑". */
export function areaLabel(card: number): string {
  const a = decodeArea(card);
  if (a.special && SPECIAL_NAME[a.special]) return SPECIAL_NAME[a.special]!;
  const exits = (a.n ? "N" : "") + (a.e ? "E" : "") + (a.s ? "S" : "") + (a.w ? "W" : "");
  return `${a.chamber ? "Chamber" : "Tunnel"} ${exits}${a.stairUp ? " ↑" : ""}${a.stairDown ? " ↓" : ""}`.trim();
}

const PHASE_LABEL: Record<string, string> = {
  explore: "Exploring", fight: "Combat", encounter: "Encounter", medusa: "Medusa", trap: "Trap", pickup: "Looting",
  sorcerer: "Sorcerer", leader: "Choosing leader", quarrel: "Quarrel", gameOver: "Game over",
};

/** What the Live games table shows from a solo game's saved state: its score so far, where the party is, and what it is doing.
 *  Null fields when the state is not a full solo state. Never throws: one odd game must not break the whole table. */
export function liveFigures(state: unknown): { score: number | null; area: string | null; activity: string | null } {
  const s = state as Partial<GameState> | null;
  if (!s) return { score: null, area: null, activity: null };
  let score: number | null = null;
  try { if (s.party?.length && s.gs !== undefined) score = scoreGame(s as GameState); } catch { /* partial state */ }
  const card = s.areas?.[s.partyArea ?? -1]?.card;
  return {
    score,
    area: card === undefined ? null : areaLabel(card),
    activity: s.phase ? PHASE_LABEL[s.phase] ?? s.phase : null,
  };
}

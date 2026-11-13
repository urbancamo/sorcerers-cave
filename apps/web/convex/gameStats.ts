import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { scoreGame, GS_ESCAPED, GS_DEAD, GS_QUIT, GS_PLAYING, type GameState } from "@sorcerers-cave/engine";
import { deepestLevel } from "./highScores";

type StatRow = Omit<Doc<"gameStats">, "_id" | "_creationTime">;

const OUTCOMES: Record<number, StatRow["outcome"]> = { [GS_ESCAPED]: "escaped", [GS_DEAD]: "dead", [GS_QUIT]: "quit" };

/** The figures a finished game contributes. Pure: the same final state always gives the same row. Null while the game is still on. */
export function statsFromState(
  state: GameState, score: number,
  extra: { gameId: Id<"games">; seat: number; mode: StatRow["mode"]; picks?: number[]; seatCount?: number; finishedAt: number },
): StatRow | null {
  const outcome = OUTCOMES[state.gs];
  if (!outcome) return null;
  return {
    gameId: extra.gameId, seat: extra.seat, mode: extra.mode, outcome, score,
    turn: state.turn,
    deepestLevel: deepestLevel(state),
    areas: state.areas.length,
    dragonKills: state.party.reduce((n, m) => n + (m.dragonKills ?? 0), 0),
    membersLost: state.party.filter((m) => m.status >= 2).length, // 2 = stone, 3 = dead
    partySize: state.party.length,
    picks: extra.picks,
    extensionKit: !!state.variants?.extensionKit,
    sibyl: !!state.variants?.sibyl,
    seatCount: extra.seatCount,
    finishedAt: extra.finishedAt,
  };
}

/** Store the row and bump the totals, once per (game, seat): a retried or re-entered finish changes nothing. Returns whether it wrote. */
export async function recordStat(ctx: MutationCtx, row: StatRow): Promise<boolean> {
  const existing = await ctx.db.query("gameStats").withIndex("by_game_and_seat", (q) => q.eq("gameId", row.gameId).eq("seat", row.seat)).first();
  if (existing) return false;
  await ctx.db.insert("gameStats", row);
  const totals = await ctx.db.query("gameStatsTotals").withIndex("by_key", (q) => q.eq("key", "all")).first();
  const next = {
    games: (totals?.games ?? 0) + 1,
    solo: (totals?.solo ?? 0) + (row.mode === "solo" ? 1 : 0),
    multi: (totals?.multi ?? 0) + (row.mode === "multi" ? 1 : 0),
    escaped: (totals?.escaped ?? 0) + (row.outcome === "escaped" ? 1 : 0),
    dead: (totals?.dead ?? 0) + (row.outcome === "dead" ? 1 : 0),
    quit: (totals?.quit ?? 0) + (row.outcome === "quit" ? 1 : 0),
    escapedScoreSum: (totals?.escapedScoreSum ?? 0) + (row.outcome === "escaped" ? row.score : 0),
  };
  if (totals) await ctx.db.patch(totals._id, next);
  else await ctx.db.insert("gameStatsTotals", { key: "all", ...next });
  return true;
}

/** A solo game has just reached a terminal state (called wherever a solo game's status flips to finished). */
export async function recordSoloFinish(ctx: MutationCtx, game: Doc<"games">, state: GameState): Promise<void> {
  if (state.testMode || state.gs === GS_PLAYING) return;
  const row = statsFromState(state, scoreGame(state), { gameId: game._id, seat: 0, mode: "solo", picks: game.picks, finishedAt: Date.now() });
  if (row) await recordStat(ctx, row);
}

/**
 * One-off backfill of games finished before this table existed. Run page by page until `isDone`:
 *   npx convex run gameStats:backfill '{"paginationOpts":{"numItems":20,"cursor":null}}'
 * then repeat with the returned `continueCursor`. Idempotent (a game already recorded is skipped), so it is safe to re-run.
 * Solo games come from `games`; multiplayer parties come from their per-seat `highScores` archive rows (every terminal seat has one).
 * `finishedAt` is the game's last update (solo) or the archive row's time (multi), so it is approximate.
 */
export const backfill = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("games").paginate(paginationOpts);
    let recorded = 0;
    for (const g of page.page) {
      if (g.mode === "multi" || g.status !== "finished") continue;
      const state = g.state as GameState;
      if (state.testMode) continue;
      const row = statsFromState(state, scoreGame(state), { gameId: g._id, seat: 0, mode: "solo", picks: g.picks, finishedAt: g.updatedAt });
      if (row && (await recordStat(ctx, row))) recorded++;
    }
    return { recorded, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const backfillMulti = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("highScores").paginate(paginationOpts);
    let recorded = 0;
    for (const h of page.page) {
      if (h.mode !== "multi") continue;
      const seats = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", h.gameId)).collect();
      const seat = seats.find((p) => p.partyName === h.partyName)?.seat;
      if (seat === undefined) continue; // the seat row is gone; nothing to key on
      const row = statsFromState(h.state as GameState, h.score, { gameId: h.gameId, seat, mode: "multi", seatCount: h.seatCount, finishedAt: h.createdAt });
      if (row && (await recordStat(ctx, row))) recorded++;
    }
    return { recorded, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

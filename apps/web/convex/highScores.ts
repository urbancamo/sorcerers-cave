import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { scoreGame, unpackCoord, GS_PLAYING, type GameState, type GameEvent } from "@sorcerers-cave/engine";

const MAX_NAME = 40;
const LEADERBOARD_LIMIT = 100;

/**
 * Record a finished game on the global leaderboard. The score is recomputed
 * server-side from the stored state (the client is never trusted for it), and
 * the full party + state snapshot is kept so the attributes can be inspected.
 * Idempotent per game: a second save returns the existing record.
 */
export const save = mutation({
  args: { gameId: v.id("games"), name: v.string() },
  handler: async (ctx, { gameId, name }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.ownerId !== callerId) throw new Error("Forbidden"); // IDOR guard
    if (game.status !== "finished") throw new Error("Game is not finished");

    // Idempotent: don't double-record a game if save is retried.
    const existing = await ctx.db
      .query("highScores")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .first();
    if (existing) return existing._id;

    const state = game.state as GameState;
    if (state.gs === GS_PLAYING) throw new Error("Game is still in progress");
    const cleanName = name.trim().slice(0, MAX_NAME) || "Anonymous";
    const score = scoreGame(state); // authoritative — never trust a client score

    return await ctx.db.insert("highScores", {
      gameId,
      ownerId: callerId,
      name: cleanName,
      score,
      outcome: state.gs,
      party: state.party,
      state,
      createdAt: Date.now(),
    });
  },
});

/** Top scores across all players (highest first). Omits the heavy full-state blob. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("highScores")
      .withIndex("by_score")
      .order("desc")
      .take(LEADERBOARD_LIMIT);
    return rows.map((r) => ({
      _id: r._id,
      name: r.name,
      score: r.score,
      outcome: r.outcome,
      party: r.party,
      createdAt: r.createdAt,
    }));
  },
});

/**
 * Expedition statistics for one recorded score, derived on demand from the stored final state and
 * the game's event log (so it works for games saved before this feature). Public, like `list`.
 */
export const stats = query({
  args: { id: v.id("highScores") },
  handler: async (ctx, { id }) => {
    const hs = await ctx.db.get(id);
    if (!hs) return null;
    const state = hs.state as GameState;

    const levels = state.areas.map((a) => unpackCoord(a.coord).level);
    const maxDepth = levels.length ? Math.max(...levels) : 1;
    const dragonsSlain = state.party.reduce((n, m) => n + (m.dragonKills ?? 0), 0);

    // Total enemies slain isn't tracked in the state, so count strangerKilled across the event log.
    const eventRows = await ctx.db
      .query("gameEvents")
      .withIndex("by_game", (q) => q.eq("gameId", hs.gameId))
      .collect();
    const enemiesSlain = eventRows.reduce(
      (n, row) => n + (row.events as GameEvent[]).filter((e) => e.type === "strangerKilled").length,
      0,
    );

    return {
      maxDepth,
      turns: state.turn,
      areasMapped: state.areas.length,
      enemiesSlain,
      dragonsSlain,
      sorcererSlain: !!state.sorcererKilled,
      membersLost: state.party.filter((m) => m.status === 3).length,
    };
  },
});

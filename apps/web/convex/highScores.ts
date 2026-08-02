import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { scoreGame, unpackCoord, GS_PLAYING, GS_ESCAPED, type GameState, type GameEvent } from "@sorcerers-cave/engine";

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
    // Only a party that climbed back to the surface earns a recordable score — an abandoned or
    // wiped-out expedition is not valid for the leaderboard (§Scoring).
    if (state.gs !== GS_ESCAPED) throw new Error("Only a party that escapes the cave can record a score");
    if (state.testMode) throw new Error("Test-mode games cannot be recorded on the leaderboard"); // §Test Mode
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
      mode: "solo",
      // Extension kit (SC-EXT-29): keys this entry into the kit-mode leaderboard (base and kit
      // keep entirely separate tables — scores aren't comparable across deck compositions).
      extensionKit: state.variants?.extensionKit ?? undefined,
    });
  },
});

/** Top scores across all players (highest first), split into FOUR independent tables keyed
 *  mode × extensionKit (design 2026-07-28): solitaire and multiplayer scores aren't comparable
 *  (a shared cave splits its treasure between seats), and neither are base and kit decks
 *  (SC-EXT-29). Omitted args = the solitaire base table; absent flags on legacy rows read as
 *  solo/base by construction. Multiplayer lists only ESCAPED seats — wipes and abandons stay
 *  recorded in the archive (`recordTerminals` writes every terminal) but a 0-score wipe is not
 *  leaderboard material, matching the solo save rule. */
export const list = query({
  args: {
    mode: v.optional(v.union(v.literal("solo"), v.literal("multi"))),
    extensionKit: v.optional(v.boolean()),
  },
  handler: async (ctx, { mode, extensionKit }) => {
    const wantMode = mode ?? "solo";
    const wantKit = extensionKit === true;
    // A multi row's kit flag falls back to its stored final state: rows recorded between the
    // MP-kit deploy and the `recordTerminals` stamping fix carry the variant only in `state`.
    const kitOf = (r: { extensionKit?: boolean; state: unknown }) =>
      r.extensionKit ?? (r.state as GameState).variants?.extensionKit ?? false;
    const rows = await ctx.db
      .query("highScores")
      .withIndex("by_score")
      .order("desc")
      .take(LEADERBOARD_LIMIT * 4); // over-fetch, then drop other-table entries
    return rows
      .filter((r) =>
        (r.mode ?? "solo") === wantMode &&
        kitOf(r) === wantKit &&
        (wantMode === "solo" || r.outcome === GS_ESCAPED))
      .slice(0, LEADERBOARD_LIMIT)
      .map((r) => ({
      _id: r._id,
      name: r.name,
      score: r.score,
      outcome: r.outcome,
      party: r.party,
      createdAt: r.createdAt,
      extensionKit: r.extensionKit ?? undefined,
      seatCount: r.seatCount ?? undefined,
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

    // Some figures aren't kept in the state, so derive them from the per-action event log:
    //  - enemies slain  → strangerKilled events
    //  - artifacts used → artifactUsed events
    //  - rounds fought  → action-rows that actually produced combat rolls. A resolved round emits
    //    one combatRoll per matchup, so we count rows (not events) that contain any; rejected plans
    //    emit planRejected with no combatRoll and are correctly ignored.
    const eventRows = await ctx.db
      .query("gameEvents")
      .withIndex("by_game", (q) => q.eq("gameId", hs.gameId))
      .collect();
    let enemiesSlain = 0, artifactsUsed = 0, roundsFought = 0;
    for (const row of eventRows) {
      const evs = row.events as GameEvent[];
      enemiesSlain += evs.filter((e) => e.type === "strangerKilled").length;
      artifactsUsed += evs.filter((e) => e.type === "artifactUsed").length;
      if (evs.some((e) => e.type === "combatRoll")) roundsFought += 1;
    }

    return {
      maxDepth,
      turns: state.turn,
      areasMapped: state.areas.length,
      roundsFought,
      enemiesSlain,
      artifactsUsed,
      dragonsSlain,
      sorcererSlain: !!state.sorcererKilled,
      membersLost: state.party.filter((m) => m.status === 3).length,
    };
  },
});

/**
 * The full move log behind one recorded score, in the same shape as `game.log` (initial conditions +
 * ordered move records). Public — a recorded high score is already published (its party, final state
 * and derived `stats` are all visible), so its game log is downloadable too; unlike `game.log`, this
 * is keyed by the leaderboard entry rather than owner-scoped.
 */
export const log = query({
  args: { id: v.id("highScores") },
  handler: async (ctx, { id }) => {
    const hs = await ctx.db.get(id);
    if (!hs) return null;
    const game = await ctx.db.get(hs.gameId);
    if (!game) return null;
    const rows = await ctx.db
      .query("gameEvents")
      .withIndex("by_game", (q) => q.eq("gameId", hs.gameId))
      .collect(); // index order = seq ascending
    return {
      game: {
        code: game.code ?? null,
        seed: game.seed ?? null,   // null for games created before initial conditions were persisted
        picks: game.picks ?? null,
        color: game.color ?? null,
        status: game.status,
        createdAt: game.createdAt,
        variants: game.variants ?? undefined, // extensionKit (SC-EXT-29) — undefined ⇒ kit-off
      },
      moves: rows.map((r) => ({ seq: r.seq, action: r.action, events: r.events })),
    };
  },
});

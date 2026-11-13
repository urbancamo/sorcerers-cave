import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { requireRole } from "./roles";
import { aggregate, liveFigures } from "./analyticsLib";

/** Multiplayer is hidden from players unless the System tab's switch is on (settings.get); the lists leave multiplayer games out then too. */
const multiplayerOn = async (ctx: QueryCtx) => (await ctx.db.query("systemSettings").first())?.multiplayerEnabled === true;

// Every query here is for the admin panel's Game Analytics tab: the ANALYTICS role (SYSTEM implies it).

/** How many of the most recent games the distribution charts cover; the headline totals cover every game. */
export const WINDOW = 1000;
const LIVE_LIMIT = 50;

/** Headline totals over every recorded game, plus the charts' figures over the newest WINDOW games. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "ANALYTICS");
    const totals = await ctx.db.query("gameStatsTotals").withIndex("by_key", (q) => q.eq("key", "all")).first();
    const rows = await ctx.db.query("gameStats").withIndex("by_finishedAt").order("desc").take(WINDOW);
    return {
      totals: {
        games: totals?.games ?? 0, solo: totals?.solo ?? 0, multi: totals?.multi ?? 0,
        escaped: totals?.escaped ?? 0, dead: totals?.dead ?? 0, quit: totals?.quit ?? 0,
        meanEscapedScore: totals && totals.escaped ? Math.round((totals.escapedScoreSum / totals.escaped) * 10) / 10 : null,
      },
      window: aggregate(rows, Date.now()),
      windowSize: WINDOW,
    };
  },
});

/** Finished games, newest first, optionally narrowed to one outcome. Paginated. */
export const history = query({
  args: { paginationOpts: paginationOptsValidator, outcome: v.optional(v.union(v.literal("escaped"), v.literal("dead"), v.literal("quit"))) },
  handler: async (ctx, { paginationOpts, outcome }) => {
    await requireRole(ctx, "ANALYTICS");
    const base = outcome
      ? ctx.db.query("gameStats").withIndex("by_outcome_and_finishedAt", (i) => i.eq("outcome", outcome))
      : ctx.db.query("gameStats").withIndex("by_finishedAt");
    const q = (await multiplayerOn(ctx)) ? base : base.filter((f) => f.neq(f.field("mode"), "multi"));
    const page = await q.order("desc").paginate(paginationOpts);
    const codes = new Map<string, string | null>();
    const rows = [];
    for (const r of page.page) {
      if (!codes.has(r.gameId)) codes.set(r.gameId, (await ctx.db.get(r.gameId))?.code ?? null);
      rows.push({ ...r, code: codes.get(r.gameId) ?? null });
    }
    return { ...page, page: rows };
  },
});

/** Games still in progress and touched since `since` (a timestamp the client rounds, so the query is not rebuilt on every tick).
 *  Reads each game's state only to pull out a few figures; none of the state is returned. */
export const liveGames = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    await requireRole(ctx, "ANALYTICS");
    // A saved game is put away: it is live again only once it has moved since the save (a save sets savedAt = updatedAt).
    const base = ctx.db.query("games").withIndex("by_status_and_updatedAt", (q) => q.eq("status", "active").gt("updatedAt", since))
      .filter((f) => f.or(f.eq(f.field("savedAt"), undefined), f.gt(f.field("updatedAt"), f.field("savedAt"))));
    const games = await ((await multiplayerOn(ctx)) ? base : base.filter((f) => f.neq(f.field("mode"), "multi"))).order("desc").take(LIVE_LIMIT);
    return games.map((g) => {
      const s = g.state as { testMode?: boolean; turn?: number; level?: number; party?: unknown[]; phase?: string; parties?: unknown[]; turnCount?: number } | null;
      const multi = g.mode === "multi";
      return {
        id: g._id,
        code: g.code ?? null,
        mode: multi ? "multi" as const : "solo" as const,
        lobby: g.lobby ?? null,
        testMode: !!s?.testMode,
        ...(multi ? { score: null, area: null, activity: null } : liveFigures(g.state)),
        turn: s ? (multi ? s.turnCount ?? null : s.turn ?? null) : null,
        level: !multi && s ? s.level ?? null : null,
        partySize: !multi && s?.party ? s.party.length : null,
        parties: multi ? s?.parties?.length ?? null : null,
        extensionKit: !!g.variants?.extensionKit,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      };
    });
  },
});

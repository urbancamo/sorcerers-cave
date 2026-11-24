import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole } from "./roles";

// Editing the names players have chosen (admin Names tab, SYSTEM role): an offensive name that got through screening (nameCheck.ts), or one
// entered before screening existed, can be changed or cleared. An admin's own text is not screened. Every change is written to `nameAudit`.

const HIGH_SCORE_NAME_MAX = 40; // as highScores.ts
const PARTY_NAME_MAX = 24; // as multiplayer.ts
export const CLEARED = "Anonymous"; // what a cleared high-score name becomes
export const CLEARED_PARTY = "Party"; // what a cleared party name becomes (a seat must have a name)
const SHOWN = 100;
const SHOWN_PARTIES = 120;

/** The latest high-score entries, newest first, with just what the tab shows (not the stored game). */
export const highScores = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "SYSTEM");
    const rows = await ctx.db.query("highScores").order("desc").take(SHOWN);
    return rows.map((r) => ({
      _id: r._id, name: r.name, score: r.score, mode: r.mode ?? "solo", gameCode: r.gameCode ?? null, partyName: r.partyName ?? null, createdAt: r.createdAt,
    }));
  },
});

/** Party names in the latest multiplayer seatings, newest first, each with the other parties in its game for context. */
export const parties = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "SYSTEM");
    const rows = await ctx.db.query("players").order("desc").take(SHOWN_PARTIES);
    const byGame = new Map<string, string[]>();
    for (const r of rows) byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r.partyName]);
    return rows.map((r) => ({
      _id: r._id, gameId: r.gameId, seat: r.seat, partyName: r.partyName, color: r.color, createdAt: r._creationTime,
      withParties: (byGame.get(r.gameId) ?? []).filter((n) => n !== r.partyName),
    }));
  },
});

/** The latest name changes, newest first. */
export const audit = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "SYSTEM");
    return (await ctx.db.query("nameAudit").withIndex("by_at").order("desc").take(30)).map((a) => ({ _id: a._id, at: a.at, kind: a.kind, before: a.before, after: a.after }));
  },
});

const record = (ctx: MutationCtx, byUserId: Id<"users">, kind: "highScore" | "partyName", targetId: string, before: string, after: string) =>
  ctx.db.insert("nameAudit", { at: Date.now(), byUserId, kind, targetId, before, after });

function cleaned(name: string, max: number, what: string): string {
  const n = name.trim();
  if (!n) throw new ConvexError(`${what} cannot be empty. Use Clear to replace it with a standard name.`);
  if (n.length > max) throw new ConvexError(`${what} can be at most ${max} characters.`);
  return n;
}

/** Set a high-score entry's name (a multiplayer entry's party name is kept in step when it was the same). `next` is already checked. */
async function setHighScoreName(ctx: MutationCtx, adminId: Id<"users">, id: Id<"highScores">, next: string) {
  const row = await ctx.db.get(id);
  if (!row) throw new ConvexError("That entry no longer exists.");
  if (row.name === next) return null;
  await ctx.db.patch(id, { name: next, ...(row.partyName === row.name ? { partyName: next } : {}) });
  await record(ctx, adminId, "highScore", id, row.name, next);
  return null;
}

/** Change a high-score entry's name. */
export const renameHighScore = mutation({
  args: { id: v.id("highScores"), name: v.string() },
  handler: async (ctx, { id, name }) => setHighScoreName(ctx, await requireRole(ctx, "SYSTEM"), id, cleaned(name, HIGH_SCORE_NAME_MAX, "A name")),
});

/** Replace a high-score entry's name with the standard one. */
export const clearHighScore = mutation({
  args: { id: v.id("highScores") },
  handler: async (ctx, { id }) => setHighScoreName(ctx, await requireRole(ctx, "SYSTEM"), id, CLEARED),
});

/**
 * Set a party's name in a multiplayer game: its seat, the game's own copy once it has started, its chat lines, and its leaderboard entry.
 * Another party in the same game cannot already have the name. `next` is already checked.
 */
async function setPartyName(ctx: MutationCtx, adminId: Id<"users">, playerId: Id<"players">, next: string) {
  const seat = await ctx.db.get(playerId);
  if (!seat) throw new ConvexError("That party no longer exists.");
  const before = seat.partyName;
  if (before === next) return null;
  const others = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", seat.gameId)).collect();
  if (others.some((p) => p._id !== playerId && p.partyName.toLowerCase() === next.toLowerCase())) {
    throw new ConvexError("Another party in that game already has that name.");
  }
  await ctx.db.patch(playerId, { partyName: next });

  const game = await ctx.db.get(seat.gameId);
  const mp = game?.state as { parties?: { name: string }[] } | null | undefined;
  if (game && mp?.parties?.[seat.seat]) {
    const parties = mp.parties.map((p, i) => (i === seat.seat ? { ...p, name: next } : p));
    await ctx.db.patch(game._id, { state: { ...mp, parties } });
  }
  for (const m of await ctx.db.query("messages").withIndex("by_game", (q) => q.eq("gameId", seat.gameId)).take(2000)) {
    if (m.seat === seat.seat && m.partyName === before) await ctx.db.patch(m._id, { partyName: next });
  }
  for (const h of await ctx.db.query("highScores").withIndex("by_game", (q) => q.eq("gameId", seat.gameId)).take(8)) {
    if (h.partyName === before) await ctx.db.patch(h._id, { name: next, partyName: next });
  }
  await record(ctx, adminId, "partyName", playerId, before, next);
  return null;
}

/** Change a party's name in a multiplayer game. */
export const renameParty = mutation({
  args: { playerId: v.id("players"), name: v.string() },
  handler: async (ctx, { playerId, name }) => setPartyName(ctx, await requireRole(ctx, "SYSTEM"), playerId, cleaned(name, PARTY_NAME_MAX, "A party name")),
});

/** Replace a party's name with the standard one (a seat must have a name, so it is not left empty). */
export const clearParty = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    const adminId = await requireRole(ctx, "SYSTEM");
    // "Party", or "Party 2"… when another party in the game already took it
    const seat = await ctx.db.get(playerId);
    if (!seat) throw new ConvexError("That party no longer exists.");
    const taken = new Set((await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", seat.gameId)).collect()).map((p) => p.partyName.toLowerCase()));
    let next = CLEARED_PARTY;
    for (let i = 2; taken.has(next.toLowerCase()); i++) next = `${CLEARED_PARTY} ${i}`;
    return setPartyName(ctx, adminId, playerId, next);
  },
});

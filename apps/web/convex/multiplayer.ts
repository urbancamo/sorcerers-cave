import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";
import { uniqueCode } from "./game";

// Phase 1 of multiplayer: lobby, named parties, colour reservation, host start-lock, and chat.
// No gameplay yet (startGame only flips the lobby state). These functions are inert until the
// client's production-off feature flag exposes them.

const COLORS = ["green", "blue", "yellow", "red"] as const;
const colorV = v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"));
const MAX_SEATS = 4;
const NAME_MAX = 24;
const MSG_MAX = 280;

const cleanName = (n: string) => n.trim().slice(0, NAME_MAX);

/** All seats in a game, ordered by seat index. */
async function seatsOf(ctx: QueryCtx, gameId: Id<"games">): Promise<Doc<"players">[]> {
  const rows = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  return rows.sort((a, b) => a.seat - b.seat);
}

/** The caller's seat in a game (or null). */
async function mySeat(ctx: MutationCtx, gameId: Id<"games">, userId: Id<"users">): Promise<Doc<"players"> | null> {
  const rows = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
  return rows.find((p) => p.userId === userId) ?? null;
}

async function postSystem(ctx: MutationCtx, gameId: Id<"games">, text: string, at: number) {
  await ctx.db.insert("messages", { gameId, seat: null, partyName: "", color: null, text, createdAt: at });
}

/** Create a multiplayer game: the host takes seat 0 with a required party name + colour. */
export const createMultiplayer = mutation({
  args: { partyName: v.string(), color: colorV },
  handler: async (ctx, { partyName, color }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const name = cleanName(partyName);
    if (!name) throw new Error("Party name is required");
    const code = await uniqueCode(ctx);
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      ownerId: userId, hostId: userId, code, mode: "multi", lobby: "open", maxSeats: MAX_SEATS,
      state: null, status: "active", createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("players", { gameId, userId, seat: 0, partyName: name, color, ready: false, lastSeen: now });
    await postSystem(ctx, gameId, `${name} created the game`, now);
    return { gameId, code };
  },
});

/** Public lobby view by code — drives the join screen and the lobby for everyone, reactively. */
export const lobby = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const callerId = await getAuthUserId(ctx);
    const c = code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", c)).first();
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, game._id);
    return {
      gameId: game._id,
      code: game.code,
      lobby: game.lobby ?? "open",
      maxSeats: game.maxSeats ?? MAX_SEATS,
      takenColors: seats.map((p) => p.color),
      youSeat: callerId ? seats.find((p) => p.userId === callerId)?.seat ?? null : null,
      isHost: callerId === game.hostId,
      seats: seats.map((p) => ({
        seat: p.seat,
        partyName: p.partyName,
        color: p.color,
        ready: p.ready,
        isHost: p.userId === game.hostId,
        isYou: !!callerId && p.userId === callerId,
      })),
    };
  },
});

/**
 * Join a multiplayer lobby by code. Returns a tagged result rather than throwing for expected
 * conditions (full / name or colour taken / started). Idempotent if already seated.
 */
export const joinByCode = mutation({
  args: { code: v.string(), partyName: v.string(), color: colorV },
  handler: async (ctx, { code, partyName, color }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const c = code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", c)).first();
    if (!game || game.mode !== "multi") return { ok: false as const, reason: "not_found" };

    const seats = await seatsOf(ctx, game._id);
    const mine = seats.find((p) => p.userId === userId);
    if (mine) return { ok: true as const, gameId: game._id }; // already seated → rejoin

    if ((game.lobby ?? "open") !== "open") return { ok: false as const, reason: "started" };
    if (seats.length >= (game.maxSeats ?? MAX_SEATS)) return { ok: false as const, reason: "full" };
    const name = cleanName(partyName);
    if (!name) return { ok: false as const, reason: "name_required" };
    if (seats.some((p) => p.partyName.toLowerCase() === name.toLowerCase())) return { ok: false as const, reason: "name_taken" };
    if (seats.some((p) => p.color === color)) return { ok: false as const, reason: "color_taken" };

    const used = new Set(seats.map((p) => p.seat));
    let seat = 0;
    while (used.has(seat)) seat += 1; // lowest free seat (leaves can free a slot)
    const now = Date.now();
    await ctx.db.insert("players", { gameId: game._id, userId, seat, partyName: name, color, ready: false, lastSeen: now });
    await postSystem(ctx, game._id, `${name} joined`, now);
    return { ok: true as const, gameId: game._id };
  },
});

export const setPartyName = mutation({
  args: { gameId: v.id("games"), partyName: v.string() },
  handler: async (ctx, { gameId, partyName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const name = cleanName(partyName);
    if (!name) return { ok: false as const, reason: "name_required" };
    const seats = await seatsOf(ctx, gameId);
    if (seats.some((p) => p._id !== me._id && p.partyName.toLowerCase() === name.toLowerCase())) {
      return { ok: false as const, reason: "name_taken" };
    }
    await ctx.db.patch(me._id, { partyName: name });
    return { ok: true as const };
  },
});

export const setColor = mutation({
  args: { gameId: v.id("games"), color: colorV },
  handler: async (ctx, { gameId, color }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const seats = await seatsOf(ctx, gameId);
    if (seats.some((p) => p._id !== me._id && p.color === color)) return { ok: false as const, reason: "color_taken" };
    await ctx.db.patch(me._id, { color });
    return { ok: true as const };
  },
});

export const setReady = mutation({
  args: { gameId: v.id("games"), ready: v.boolean() },
  handler: async (ctx, { gameId, ready }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    await ctx.db.patch(me._id, { ready });
  },
});

/** Leave the lobby. If the host leaves, the next seat is promoted; an empty lobby is finished. */
export const leaveSeat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) return;
    const game = await ctx.db.get(gameId);
    const now = Date.now();
    await ctx.db.delete(me._id);
    await postSystem(ctx, gameId, `${me.partyName} left`, now);
    if (game && game.hostId === userId) {
      const rest = await seatsOf(ctx, gameId);
      if (rest.length === 0) await ctx.db.patch(gameId, { lobby: "finished", updatedAt: now });
      else await ctx.db.patch(gameId, { hostId: rest[0]!.userId, updatedAt: now });
    }
  },
});

/** Host locks the lobby and starts. Phase 1 only flips the lobby state (gameplay arrives in Phase 2). */
export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.hostId !== userId) throw new Error("Only the host may start");
    if ((game.lobby ?? "open") !== "open") return { ok: false as const, reason: "already_started" };
    const seats = await seatsOf(ctx, gameId);
    if (seats.length < 2) return { ok: false as const, reason: "need_players" };
    const now = Date.now();
    await ctx.db.patch(gameId, { lobby: "started", updatedAt: now });
    await postSystem(ctx, gameId, "The game has started", now);
    return { ok: true as const };
  },
});

/** Post a chat message (membership-gated). */
export const sendMessage = mutation({
  args: { gameId: v.id("games"), text: v.string() },
  handler: async (ctx, { gameId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const body = text.trim().slice(0, MSG_MAX);
    if (!body) return;
    await ctx.db.insert("messages", {
      gameId, seat: me.seat, partyName: me.partyName, color: me.color, text: body, createdAt: Date.now(),
    });
  },
});

/** Chat + system feed, oldest-first (membership-gated). */
export const messages = query({
  args: { gameId: v.id("games"), limit: v.optional(v.number()) },
  handler: async (ctx, { gameId, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect();
    if (!rows.some((p) => p.userId === userId)) return []; // not a member
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(limit ?? 100);
    return recent.reverse().map((m) => ({
      _id: m._id, seat: m.seat, partyName: m.partyName, color: m.color, text: m.text, createdAt: m.createdAt,
    }));
  },
});

export { COLORS };

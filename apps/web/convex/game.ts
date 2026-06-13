import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  newGame as createGameState,
  validatePicks,
  reduce,
  GS_PLAYING,
  type GameState,
  type GameAction,
} from "@sorcerers-cave/engine";

// Permissive shape validator for the engine's GameAction union; reduce() enforces semantics.
const actionValidator = v.object({
  type: v.string(),
  dir: v.optional(v.number()),
  ti: v.optional(v.number()),
  mi: v.optional(v.number()),
  idx: v.optional(v.number()),
  artifact: v.optional(v.number()),
  target: v.optional(v.number()),
});

/** Start a new authoritative game: validate the party, build the engine state, persist it (owned by the caller). */
export const newGame = mutation({
  args: { seed: v.number(), picks: v.array(v.number()) },
  handler: async (ctx, { seed, picks }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthenticated");
    if (!validatePicks(picks)) throw new Error("Invalid party selection");
    const state = createGameState(seed, picks);
    const now = Date.now();
    return await ctx.db.insert("games", { ownerId, state, status: "active", createdAt: now, updatedAt: now });
  },
});

/** Apply one player action authoritatively: reduce, persist the new state, log the events. */
export const applyAction = mutation({
  args: { id: v.id("games"), action: actionValidator },
  handler: async (ctx, { id, action }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(id);
    if (!game) throw new Error("Game not found");
    if (game.ownerId !== callerId) throw new Error("Forbidden"); // IDOR guard
    if (game.status !== "active") return { state: game.state as GameState, events: [] };

    const { state, events } = reduce(game.state as GameState, action as GameAction);
    const status = state.gs === GS_PLAYING ? "active" : "finished";
    await ctx.db.patch(id, { state, status, updatedAt: Date.now() });

    const blockedNoop = events.length === 1 && events[0]!.type === "blocked";
    if (!blockedNoop) {
      const last = await ctx.db
        .query("gameEvents")
        .withIndex("by_game", (q) => q.eq("gameId", id))
        .order("desc")
        .first();
      await ctx.db.insert("gameEvents", { gameId: id, seq: (last?.seq ?? -1) + 1, action, events });
    }
    return { state, events };
  },
});

export const get = query({
  args: { id: v.id("games") },
  handler: async (ctx, { id }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(id);
    if (!game || game.ownerId !== callerId) return null; // owner-scoped (IDOR guard)
    return game;
  },
});

/** The signed-in player's games (newest first); empty when unauthenticated. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return [];
    return ctx.db.query("games").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
  },
});

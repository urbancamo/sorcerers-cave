import { mutation, query, type MutationCtx } from "./_generated/server";
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
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  artifact: v.optional(v.number()),
  target: v.optional(v.number()),
  borne: v.optional(v.boolean()), // setBorne: bear (wield/wear) vs stow a Sword/Staff/Ring

  // resolveRound: the player's pairing for one fight round (front/background/strangers per match).
  matches: v.optional(v.array(v.object({
    front: v.array(v.number()),
    backers: v.array(v.number()),
    strangers: v.array(v.number()),
  }))),
});

/** Start a new authoritative game: validate the party, build the engine state, persist it (owned by the caller). */
const colorValidator = v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"));

/** A random four-uppercase-letter code (A–Z). */
function genCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return s;
}

/** Allocate a four-letter code not already used by another game (26^4 space → collisions are rare). */
export async function uniqueCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = genCode();
    const clash = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique game code");
}

// Extension kit (SC-EXT-29, design US-01): the only solo-relevant key of the shared `variants`
// shape (schema.ts) — a plain object validator here rather than reusing the full MP union, since a
// solo `newGame` call never sets zombies/fogLite/concurrent.
const variantsValidator = v.object({ extensionKit: v.optional(v.boolean()) });

export const newGame = mutation({
  args: { seed: v.number(), picks: v.array(v.number()), color: v.optional(colorValidator), variants: v.optional(variantsValidator) },
  handler: async (ctx, { seed, picks, color, variants }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthenticated");
    // Server-side authoritative check (mirrors the client's PartySelect validation) — a kit-only
    // pick (e.g. the Witch) is only legal when `variants.extensionKit` is actually set, closing off
    // a client that omits the flag to sneak a kit creature into a kit-off game.
    if (!validatePicks(picks, variants)) throw new Error("Invalid party selection");
    const state = createGameState(seed, picks, variants);
    const now = Date.now();
    const code = await uniqueCode(ctx);
    // Persist the initial conditions (seed + picks + variants) alongside the state so the full game
    // is replayable from scratch via the engine's replay() over the gameEvents action log.
    return await ctx.db.insert("games", { ownerId, code, seed, picks, variants, state, status: "active", color, createdAt: now, updatedAt: now });
  },
});

/** Save the current game: persists nothing new (state is already authoritative) but bumps the save
 *  time and returns the four-letter code the player uses to resume it. Owner-scoped (IDOR guard). */
export const save = mutation({
  args: { id: v.id("games") },
  handler: async (ctx, { id }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const game = await ctx.db.get(id);
    if (!game || game.ownerId !== callerId) throw new Error("Forbidden");
    let code = game.code;
    if (!code) code = await uniqueCode(ctx); // back-fill a code for games created before this feature
    await ctx.db.patch(id, { code, updatedAt: Date.now() });
    return code;
  },
});

/** Resume one of YOUR saved games by its four-letter code. Returns its id, or null if no game with
 *  that code belongs to the caller. The code is only four letters (a small, guessable keyspace), so
 *  it is deliberately NOT a cross-user access token: resume is owner-scoped and never transfers
 *  ownership, so a guessed code cannot hijack another player's game. */
export const resumeByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const normalized = code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", normalized)).first();
    if (!game || game.ownerId !== callerId) return null; // owner-scoped (no ownership transfer)
    return game._id;
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

    const { state, events, midState } = reduce(game.state as GameState, action as GameAction);
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
    // midState (SC-4-43): the pre-relocation presentation snapshot — never persisted,
    // returned only so the client can hold the interrupted room as the backdrop.
    return { state, events, midState };
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

/** The full move log for one of YOUR games: the initial conditions (`seed` + `picks`) plus every
 *  recorded action and its consequences (events), in `seq` order. This is self-contained — feeding
 *  `replay(seed, picks, moves.map(m => m.action))` reconstructs the game move-by-move, forwards and
 *  backwards. Owner-scoped (IDOR guard); returns null for a non-owner or unknown game. */
export const log = query({
  args: { id: v.id("games") },
  handler: async (ctx, { id }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(id);
    if (!game || game.ownerId !== callerId) return null; // owner-scoped (IDOR guard)
    const rows = await ctx.db
      .query("gameEvents")
      .withIndex("by_game", (q) => q.eq("gameId", id))
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

/** Replay bundle for any solo game by its four-letter code — deliberately SHAREABLE, not
 *  owner-scoped (spec §RB-6-3): anyone holding the code may replay the game, so unlike
 *  `resumeByCode`/`log`/`get` there is no IDOR guard here, and the bundle carries no owner
 *  identity (RB-1-7). Read-only: reconstructing the game is the client's job via the engine's
 *  replay(seed, picks, moves.map(m => m.action)). Multi games are excluded this milestone
 *  (RB-1-6); a pre-logging game (null seed/picks) is returned flagged `replayable: false`
 *  rather than crashing the viewer (RB-1-5). */
export const replayByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", normalized)).first();
    if (!game) return null;
    if (game.mode === "multi") return null; // solo only in this milestone (RB-1-6)
    const rows = await ctx.db
      .query("gameEvents")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect(); // index order = seq ascending
    return {
      // reconstructable-from-scratch only when the initial conditions were persisted (RB-1-5)
      replayable: game.seed != null && game.picks != null,
      game: {
        code: game.code ?? null,
        seed: game.seed ?? null,
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

/** The signed-in player's games (newest first); empty when unauthenticated. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return [];
    return ctx.db.query("games").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
  },
});

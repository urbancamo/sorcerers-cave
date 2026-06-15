import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";
import { uniqueCode } from "./game";
import { buildMpGame, choosePartyFor, mpReduce, partyView, scoreGame, PARTY_BUDGET, type MpGameState, type MpAction } from "@sorcerers-cave/engine";

// Permissive action shape; the engine (mpReduce) enforces semantics. Includes the lobby-level endTurn.
const mpActionValidator = v.object({
  type: v.string(),
  dir: v.optional(v.number()),
  idx: v.optional(v.number()),
  ti: v.optional(v.number()),   // takeTreasure: which chamber treasure
  mi: v.optional(v.number()),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  artifact: v.optional(v.number()),
  target: v.optional(v.number()),
});

// Multiplayer lobby (Phase 1), the multi-party game state + turn-based party draft (Phase 2/3).
// Inert until the client's production-off feature flag exposes it.
const SELECTABLE = [0, 1, 2, 3, 4, 5, 6, 7]; // creature ids with a selection value

const COLORS = ["green", "blue", "yellow", "red"] as const;
const colorV = v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"));
const MAX_SEATS = 4;
const NAME_MAX = 24;
const MSG_MAX = 280;

const cleanName = (n: string) => n.trim().slice(0, NAME_MAX);

// How a finished party's outcome reads in the broadcast feed (keyed by terminal SeatStatus).
const OUTCOME_VERB: Record<string, string> = {
  wiped: "perished in the cave", left: "escaped the cave", quit: "abandoned the expedition",
};

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

/** Host locks the lobby and starts: seats are compacted to 0..n-1, the shared multi-party game state
 *  is built (random play order, party-selection phase), and stored on the game. */
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
    // Compact seats to a contiguous 0..n-1 (leaves can leave gaps) so engine party indices line up.
    for (let i = 0; i < seats.length; i++) {
      if (seats[i]!.seat !== i) await ctx.db.patch(seats[i]!._id, { seat: i });
    }
    const mp = buildMpGame(now, seats.map((p, i) => ({ seat: i, color: p.color, name: p.partyName })));
    await ctx.db.patch(gameId, { lobby: "started", state: mp, updatedAt: now });
    await postSystem(ctx, gameId, "The game has started — choose your parties", now);
    return { ok: true as const };
  },
});

/** Draft a party in turn (Phase 3). Turn-gated to the current picker; depletes the shared pack and,
 *  after the last pick, transitions the game to the playing phase. */
export const pickParty = mutation({
  args: { gameId: v.id("games"), picks: v.array(v.number()) },
  handler: async (ctx, { gameId, picks }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const game = await ctx.db.get(gameId);
    const mp = game?.state as MpGameState | null;
    if (!game || game.mode !== "multi" || !mp) return { ok: false as const, reason: "not_multi" };

    const res = choosePartyFor(mp, me.seat, picks);
    if (!res.ok) return { ok: false as const, reason: res.reason ?? "invalid" };
    const now = Date.now();
    await ctx.db.patch(gameId, { state: res.state, updatedAt: now });
    await postSystem(ctx, gameId, `${me.partyName} chose their party`, now);
    if (res.state.phase === "playing") await postSystem(ctx, gameId, "All parties chosen — into the cave!", now + 1);
    return { ok: true as const, phase: res.state.phase };
  },
});

/**
 * Membership-gated projection of a multi game for the client — never the raw cave (which would leak
 * the shuffled deck order). Drives the draft (Phase 3) and, later, play.
 */
export const gameState = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(gameId);
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, gameId);
    const me = callerId ? seats.find((p) => p.userId === callerId) : null;
    if (!me) return null; // not a member

    const mp = game.state as MpGameState | null;
    if (!mp) return { phase: "lobby" as const, youSeat: me.seat };

    const remaining: Record<number, number> = {};
    if (mp.phase === "partySelect") {
      for (const id of SELECTABLE) remaining[id] = mp.cave.smallPack.filter((c) => c === 100 + id).length;
    }
    return {
      phase: mp.phase,
      youSeat: me.seat,
      currentPicker: mp.phase === "partySelect" ? mp.pickOrder[mp.active]! : null,
      currentSeat: mp.phase === "playing" ? mp.order[mp.active]! : null,
      turnCount: mp.turnCount,
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        members: p.party.map((m) => m.creatureId),
        // running/final score per party (the engine computes it from the party's state)
        score: p.party.length ? scoreGame(partyView(mp, p.seat)) : 0,
      })),
      draft: mp.phase === "partySelect" ? { remaining, budget: PARTY_BUDGET } : null,
    };
  },
});

/**
 * The viewing seat's render view during play: a single-party GameState (shared cave ⊕ your party,
 * decks included for optimistic moves), plus whose turn it is and every party's position/colour for
 * the multi-token map. Membership-gated; null unless the game is in the playing phase.
 */
export const playView = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const callerId = await getAuthUserId(ctx);
    const game = await ctx.db.get(gameId);
    if (!game || game.mode !== "multi") return null;
    const seats = await seatsOf(ctx, gameId);
    const me = callerId ? seats.find((p) => p.userId === callerId) : null;
    if (!me) return null;
    const mp = game.state as MpGameState | null;
    if (!mp || mp.phase !== "playing") return null;

    const current = mp.order[mp.active]!;
    return {
      state: partyView(mp, me.seat),
      youSeat: me.seat,
      currentSeat: current,
      yourTurn: current === me.seat,
      parties: mp.parties.map((p) => ({
        seat: p.seat, name: p.name, color: p.color, status: p.status,
        partyArea: p.partyArea, level: p.level,
      })),
    };
  },
});

/** Apply one action in a multiplayer game, turn-gated by the engine. Persists the new shared state. */
export const act = mutation({
  args: { gameId: v.id("games"), action: mpActionValidator },
  handler: async (ctx, { gameId, action }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const me = await mySeat(ctx, gameId, userId);
    if (!me) throw new Error("Not in this game");
    const game = await ctx.db.get(gameId);
    const mp = game?.state as MpGameState | null;
    if (!game || game.mode !== "multi" || !mp) return { events: [{ type: "blocked" }] };

    const { state, events } = mpReduce(mp, me.seat, action as MpAction);
    const blocked = events.length === 1 && events[0]!.type === "blocked";
    if (blocked) return { events };

    const now = Date.now();
    await ctx.db.patch(gameId, { state, updatedAt: now });

    // If the acting party just reached a terminal state, record it to the multiplayer high-score
    // table (§8.4) — kept separate from solo records. Only the acting seat's party can transition.
    const before = mp.parties[me.seat]!.status, after = state.parties[me.seat]!.status;
    if (before === "exploring" && after !== "exploring") {
      const view = partyView(state, me.seat);
      const score = scoreGame(view);
      await ctx.db.insert("highScores", {
        gameId, ownerId: me.userId, name: state.parties[me.seat]!.name,
        score, outcome: view.gs, party: view.party, state: view, createdAt: now,
        mode: "multi", gameCode: game.code, partyName: state.parties[me.seat]!.name,
      });
      // Broadcast the outcome to everyone still in the cave.
      const verb = OUTCOME_VERB[after] ?? "finished";
      await postSystem(ctx, gameId, `${me.partyName} ${verb} (score ${score})`, now);
    }
    return { events };
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

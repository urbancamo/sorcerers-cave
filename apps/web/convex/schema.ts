import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  games: defineTable({
    ownerId: v.optional(v.id("users")),
    // Short, human-typable resume handle: four uppercase letters, unique across games. Optional so
    // games created before this feature still validate; every new game is allocated one.
    code: v.optional(v.string()),
    state: v.any(), // serialized engine GameState (engine owns the shape; Milestone B)
    status: v.union(v.literal("active"), v.literal("finished")),
    // party marker colour (optional for games created before colours existed); multiplayer will
    // use this to reserve colours already taken in a shared game.
    color: v.optional(v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"))),
    // --- Multiplayer (Phase 1) — all optional so existing solo rows still validate. ---
    mode: v.optional(v.union(v.literal("solo"), v.literal("multi"))),
    hostId: v.optional(v.id("users")),        // the creator; only the host may start the game
    lobby: v.optional(v.union(v.literal("open"), v.literal("started"), v.literal("finished"))),
    maxSeats: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_code", ["code"]),
  // Multiplayer seats — one row per player in a multi game (Phase 1).
  players: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),
    seat: v.number(),        // 0–3, stable index
    partyName: v.string(),   // required identity (1–24 chars, unique within a game)
    color: v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red")),
    ready: v.boolean(),
    lastSeen: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_user", ["userId"]),
  // Multiplayer chat / broadcast feed (Phase 1). seat=null for system lines.
  messages: defineTable({
    gameId: v.id("games"),
    seat: v.union(v.number(), v.null()),
    partyName: v.string(),
    color: v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"), v.null()),
    text: v.string(),
    createdAt: v.number(),
    // "action" = an auto-narrated game event (defeat, pickup, descend…) attributed to a seat;
    // absent for player chat and seat=null system lines.
    kind: v.optional(v.literal("action")),
  }).index("by_game", ["gameId", "createdAt"]),
  gameEvents: defineTable({
    gameId: v.id("games"),
    seq: v.number(),
    action: v.any(),
    events: v.any(),
  }).index("by_game", ["gameId", "seq"]),
  // Global, shared leaderboard. `party` and `state` keep the full final snapshot so the
  // attributes behind a score can be inspected later.
  highScores: defineTable({
    gameId: v.id("games"),
    ownerId: v.optional(v.id("users")),
    name: v.string(),
    score: v.number(),
    outcome: v.number(), // GS_* (escaped / dead / quit)
    party: v.any(), // final party array (full member attributes + carried treasure)
    state: v.any(), // full final engine state, for deeper analysis
    createdAt: v.number(),
    // Multiplayer results (§8.4): a finished party's entry, kept separate from solo records.
    mode: v.optional(v.union(v.literal("solo"), v.literal("multi"))),
    gameCode: v.optional(v.string()),  // the four-letter code (group a multi game's parties)
    partyName: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_score", ["score"]),
});

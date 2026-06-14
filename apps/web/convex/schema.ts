import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  games: defineTable({
    ownerId: v.optional(v.id("users")),
    state: v.any(), // serialized engine GameState (engine owns the shape; Milestone B)
    status: v.union(v.literal("active"), v.literal("finished")),
    // party marker colour (optional for games created before colours existed); multiplayer will
    // use this to reserve colours already taken in a shared game.
    color: v.optional(v.union(v.literal("green"), v.literal("blue"), v.literal("yellow"), v.literal("red"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
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
  })
    .index("by_game", ["gameId"])
    .index("by_score", ["score"]),
});

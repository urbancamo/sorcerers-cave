import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  games: defineTable({
    ownerId: v.optional(v.id("users")),
    state: v.any(), // serialized engine GameState (engine owns the shape; Milestone B)
    status: v.union(v.literal("active"), v.literal("finished")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  gameEvents: defineTable({
    gameId: v.id("games"),
    seq: v.number(),
    action: v.any(),
    events: v.any(),
  }).index("by_game", ["gameId", "seq"]),
});

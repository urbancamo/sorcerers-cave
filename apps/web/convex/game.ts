import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Milestone A stubs: prove the round-trip. Real engine-backed logic lands in Milestone D.
export const newGame = mutation({
  args: { seed: v.number() },
  handler: async (ctx, { seed }) => {
    const now = Date.now();
    return await ctx.db.insert("games", {
      state: { seed, turn: 0, gs: 0 }, // placeholder GameState
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const get = query({
  args: { id: v.id("games") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

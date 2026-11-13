import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./roles";

// Site-wide options, kept in the single-row `systemSettings` table. Reading them is public (the welcome page needs the values
// before anyone has signed in); changing them takes the SYSTEM role.

const settingsRow = (ctx: QueryCtx) => ctx.db.query("systemSettings").first();

/** The options as the welcome page needs them. Anything never set is at its default: Multiplayer is OFF. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await settingsRow(ctx);
    return { multiplayerEnabled: row?.multiplayerEnabled === true };
  },
});

/** Save the System tab's options (all of them at once, as the form's one Save does). */
export const setOptions = mutation({
  args: { multiplayerEnabled: v.boolean() },
  handler: async (ctx, { multiplayerEnabled }) => {
    await requireRole(ctx, "SYSTEM");
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { multiplayerEnabled });
    else await ctx.db.insert("systemSettings", { multiplayerEnabled });
    return { multiplayerEnabled };
  },
});

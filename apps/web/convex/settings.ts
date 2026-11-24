import { mutation, query, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRole } from "./roles";
import { MAX_COUNT, MAX_WINDOW_SEC, MIN_WINDOW_SEC, RATE_LIMITS, RATE_NAMES, effectiveLimit, type RateName } from "./rateLimits";

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

/** Every rate limit with its default and the value in force, for the System tab. */
export const rateLimits = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "SYSTEM");
    const row = await settingsRow(ctx);
    return RATE_NAMES.map((name) => {
      const def = RATE_LIMITS[name];
      const now = effectiveLimit(name, row?.rateLimits);
      return {
        name, label: def.label, note: def.note, scope: def.scope,
        defaultMax: def.max, defaultWindowSec: def.windowSec, max: now.max, windowSec: now.windowSec,
      };
    });
  },
});

/**
 * Save the rate limits as the System tab's form holds them: the whole list at once. A limit equal to its default is stored as no setting, so a
 * later change to a default reaches it. Values outside the bounds are refused, not clamped.
 */
export const setRateLimits = mutation({
  args: { limits: v.array(v.object({ name: v.string(), max: v.number(), windowSec: v.number() })) },
  handler: async (ctx, { limits }) => {
    await requireRole(ctx, "SYSTEM");
    const overrides: Record<string, { max: number; windowSec: number }> = {};
    for (const { name, max, windowSec } of limits) {
      if (!(RATE_NAMES as string[]).includes(name)) throw new ConvexError(`Unknown limit: ${name}`);
      const label = RATE_LIMITS[name as RateName].label;
      if (!Number.isInteger(max) || max < 1 || max > MAX_COUNT) throw new ConvexError(`${label}: the number allowed must be a whole number from 1 to ${MAX_COUNT}.`);
      if (!Number.isInteger(windowSec) || windowSec < MIN_WINDOW_SEC || windowSec > MAX_WINDOW_SEC) {
        throw new ConvexError(`${label}: the period must be from ${MIN_WINDOW_SEC} seconds to 7 days.`);
      }
      const def = RATE_LIMITS[name as RateName];
      if (max !== def.max || windowSec !== def.windowSec) overrides[name] = { max, windowSec };
    }
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { rateLimits: overrides });
    else await ctx.db.insert("systemSettings", { rateLimits: overrides });
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

// Rate limits for the writes an anonymous player can reach (docs/security/review-2026-11.md, findings 3 and 4). Sign-in is free and anonymous,
// so a limit per user alone can be dodged by minting accounts: the costly ones also have a site-wide cap. Each limit is a fixed window (at most
// `max` uses per `windowSec` seconds); the defaults are here and an admin can change any of them in the System tab (`settings.setRateLimits`).
// Convex mutations are serializable, so the count is exact, with no race between two requests.

export type RateScope = "user" | "game" | "site";
export type RateDef = { label: string; note: string; what: string; scope: RateScope; max: number; windowSec: number };

export const RATE_LIMITS = {
  newGame: { label: "Start a solo game", note: "Per player.", what: "games started", scope: "user", max: 40, windowSec: 3600 },
  createMultiplayer: { label: "Create a multiplayer game", note: "Per player.", what: "multiplayer games created", scope: "user", max: 10, windowSec: 3600 },
  joinAttempt: { label: "Join a multiplayer game by code", note: "Per player. Also slows guessing of game codes.", what: "join attempts", scope: "user", max: 30, windowSec: 600 },
  chatUser: { label: "Chat messages", note: "Per player.", what: "chat messages", scope: "user", max: 20, windowSec: 60 },
  chatGame: { label: "Chat messages in one game", note: "Per game, all players together: keeps one game's chat from growing without end.", what: "messages in this game", scope: "game", max: 300, windowSec: 3600 },
  highScoreName: { label: "High-score names checked", note: "Per player. Each one is a call to Claude.", what: "names tried", scope: "user", max: 30, windowSec: 3600 },
  partyNameCheck: { label: "Party names checked", note: "Per player. Each one is a call to Claude.", what: "party names tried", scope: "user", max: 30, windowSec: 3600 },
  bugReportUser: { label: "Bug reports", note: "Per player.", what: "reports", scope: "user", max: 5, windowSec: 3600 },
  bugReportSite: { label: "Bug reports, whole site", note: "All players together: each report opens a public GitHub issue, and anonymous accounts are free.", what: "reports", scope: "site", max: 30, windowSec: 3600 },
  uploadUser: { label: "Screenshot uploads", note: "Per player.", what: "uploads", scope: "user", max: 10, windowSec: 3600 },
  uploadSite: { label: "Screenshot uploads, whole site", note: "All players together.", what: "uploads", scope: "site", max: 100, windowSec: 3600 },
} as const satisfies Record<string, RateDef>;

export type RateName = keyof typeof RATE_LIMITS;
export const RATE_NAMES = Object.keys(RATE_LIMITS) as RateName[];

/** Bounds an admin can set (a typo should not turn a limit off or lock everyone out for a week). */
export const MAX_COUNT = 100000;
export const MIN_WINDOW_SEC = 10;
export const MAX_WINDOW_SEC = 7 * 24 * 3600;

export type RateOverrides = Partial<Record<string, { max: number; windowSec: number }>>;

/** The limit in force: the admin's setting, else the default. */
export function effectiveLimit(name: RateName, overrides: RateOverrides | undefined) {
  const def = RATE_LIMITS[name] as RateDef;
  const o = overrides?.[name];
  return { max: o?.max ?? def.max, windowSec: o?.windowSec ?? def.windowSec };
}

export type RateResult = { ok: true } | { ok: false; message: string };

/**
 * Count one use of `name` for `subject` (the user or game id; omit for a site-wide limit) and say whether it is allowed. A refused use is
 * not counted. Does not throw, for callers that answer in their own shape.
 */
export async function tryRate(ctx: MutationCtx, name: RateName, subject?: string): Promise<RateResult> {
  const settings = await ctx.db.query("systemSettings").first();
  const { max, windowSec } = effectiveLimit(name, settings?.rateLimits);
  const windowMs = windowSec * 1000;
  const key = subject ? `${name}:${subject}` : name;
  const now = Date.now();
  const hit = await ctx.db.query("rateLimitHits").withIndex("by_key", (q) => q.eq("key", key)).first();
  if (!hit) {
    await ctx.db.insert("rateLimitHits", { key, windowStart: now, count: 1 });
    return { ok: true };
  }
  if (now - hit.windowStart >= windowMs) {
    await ctx.db.patch(hit._id, { windowStart: now, count: 1 });
    return { ok: true };
  }
  if (hit.count >= max) {
    const wait = Math.max(1, Math.ceil((hit.windowStart + windowMs - now) / 1000));
    const when = wait < 90 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`;
    return { ok: false, message: `Too many ${RATE_LIMITS[name].what}. Please try again in about ${when}.` };
  }
  await ctx.db.patch(hit._id, { count: hit.count + 1 });
  return { ok: true };
}

/** As `tryRate`, but a refusal throws a ConvexError whose data is the message for the player. */
export async function checkRate(ctx: MutationCtx, name: RateName, subject?: string): Promise<void> {
  const r = await tryRate(ctx, name, subject);
  if (!r.ok) throw new ConvexError(r.message);
}

/** Count one use from an action (which cannot touch the database itself); answers as `tryRate` does. */
export const consume = internalMutation({
  args: { name: v.string(), subject: v.optional(v.string()) },
  handler: async (ctx, { name, subject }): Promise<RateResult> => {
    if (!(RATE_NAMES as string[]).includes(name)) throw new Error(`Unknown limit: ${name}`);
    return await tryRate(ctx, name as RateName, subject);
  },
});

const KEEP_MS = (MAX_WINDOW_SEC + 24 * 3600) * 1000;

/** Hourly: drop counters whose window ended long ago (a counter is only read while its window is open). */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db.query("rateLimitHits").withIndex("by_windowStart", (q) => q.lt("windowStart", Date.now() - KEEP_MS)).take(500);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});

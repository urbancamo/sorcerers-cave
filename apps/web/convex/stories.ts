import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { defaultPrompt, type ResolvedPrompt } from "./storyWriter";
import { storyThreshold } from "./storyPrompt";

/**
 * Stories for high-scoring solo games (docs/requirements/auto-short-story/plan.md): the public read, the queueing hook used by
 * `highScores.save`, and the internal functions the generation action (storyGen.ts) calls. Money is spent only in the action.
 */

const triggerV = v.union(v.literal("save"), v.literal("rewrite"), v.literal("retry"));
export type SettingsArgs = { paused?: boolean; dailyCapUsd?: number; monthlyCapUsd?: number };
const runV = v.object({
  pass: v.union(v.literal("plan"), v.literal("write"), v.literal("check")),
  model: v.string(), inputTokens: v.number(), outputTokens: v.number(), costUsd: v.number(), durationMs: v.number(),
  status: v.union(v.literal("ok"), v.literal("rejected"), v.literal("error")), reason: v.optional(v.string()),
});

/** The story for one high-score entry: its status, and its markdown only once it is ready. Public, like the entry itself. */
export const forScore = query({
  args: { highScoreId: v.id("highScores") },
  handler: async (ctx, { highScoreId }) => {
    const s = await ctx.db.query("stories").withIndex("by_highScore", (q) => q.eq("highScoreId", highScoreId)).first();
    if (!s) return null;
    return { status: s.status, title: s.title ?? null, text: s.status === "ready" ? s.text ?? null : null, words: s.words ?? null };
  },
});

/** Generation is switched on only once an API key is configured, so deploying the code spends nothing by itself. */
export const generationEnabled = (): boolean => !!process.env.ANTHROPIC_API_KEY;

/**
 * Called by `highScores.save` for a freshly recorded SOLO escape: a story is queued when generation is enabled and the
 * score reaches the threshold for its table. Never throws into the save.
 */
export async function queueStory(ctx: MutationCtx, highScoreId: Id<"highScores">, score: number, variants: { extensionKit?: boolean; sibyl?: boolean } | undefined): Promise<void> {
  if (!generationEnabled() || score < storyThreshold(variants)) return;
  try {
    const now = Date.now();
    const existing = await ctx.db.query("stories").withIndex("by_highScore", (q) => q.eq("highScoreId", highScoreId)).first();
    if (existing) return;
    await ctx.db.insert("stories", { highScoreId, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.storyGen.generate, { highScoreId, trigger: "save" });
  } catch {
    // a story is a bonus: failing to queue one must never fail recording the score
  }
}

/** The active prompt: the newest saved version, or the source default (version 0). */
export async function activePrompt(ctx: { db: QueryCtx["db"] }): Promise<ResolvedPrompt> {
  const row = await ctx.db.query("storyPrompts").withIndex("by_version").order("desc").first();
  return row ? { version: row.version, writer: row.writer, editor: row.editor, model: row.model, minWords: row.minWords, maxWords: row.maxWords } : defaultPrompt();
}

export const startOfUtcDay = (t: number): number => t - (t % 86_400_000);
export const startOfUtcMonth = (t: number): number => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

/** Estimated spend since `from` (a bounded read: a month of runs is small). */
export async function spendSince(ctx: { db: QueryCtx["db"] }, from: number): Promise<number> {
  const rows = await ctx.db.query("storyRuns").withIndex("by_createdAt", (q) => q.gte("createdAt", from)).take(20_000);
  return rows.reduce((n, r) => n + r.costUsd, 0);
}

/** Why a model call must not be made right now (paused, or a spending cap reached), or null when it may go ahead. */
export async function blockReason(ctx: { db: QueryCtx["db"] }, now: number): Promise<string | null> {
  const settings = await ctx.db.query("storySettings").first();
  if (settings?.paused) return "generation is paused";
  if (settings?.dailyCapUsd && (await spendSince(ctx, startOfUtcDay(now))) >= settings.dailyCapUsd) return "daily cap reached";
  if (settings?.monthlyCapUsd && (await spendSince(ctx, startOfUtcMonth(now))) >= settings.monthlyCapUsd) return "monthly cap reached";
  return null;
}

/**
 * Start (or restart) generation for one entry: make sure a story row exists, refuse if generation is paused or a spending cap
 * is reached, count the attempt, and hand back the prompt to use. Existing text is left untouched until a new one succeeds.
 */
export const begin = internalMutation({
  args: { highScoreId: v.id("highScores"), trigger: triggerV },
  handler: async (ctx, { highScoreId }): Promise<{ ok: true; storyId: Id<"stories">; prompt: ResolvedPrompt } | { ok: false; reason: string; storyId: Id<"stories"> | null }> => {
    const now = Date.now();
    let story = await ctx.db.query("stories").withIndex("by_highScore", (q) => q.eq("highScoreId", highScoreId)).first();
    if (!story) {
      const id = await ctx.db.insert("stories", { highScoreId, status: "pending", attempts: 0, createdAt: now, updatedAt: now });
      story = (await ctx.db.get(id))!;
    }
    const blocked = async (reason: string) => {
      // A story that already has text keeps it; one that never had text is marked failed so the dashboard shows why.
      if (!story!.text) await ctx.db.patch(story!._id, { status: "failed", error: reason, updatedAt: now });
      return { ok: false as const, reason, storyId: story!._id };
    };
    const why = await blockReason(ctx, now);
    if (why) return blocked(why);
    await ctx.db.patch(story._id, { attempts: story.attempts + 1, updatedAt: now, ...(story.text ? {} : { status: "pending" as const }) });
    return { ok: true, storyId: story._id, prompt: await activePrompt(ctx) };
  },
});

/** What the action needs to replay the run behind an entry. Null when the entry or its replay data is gone. */
export const replayInput = internalQuery({
  args: { highScoreId: v.id("highScores") },
  handler: async (ctx, { highScoreId }) => {
    const hs = await ctx.db.get(highScoreId);
    if (!hs) return null;
    const game = await ctx.db.get(hs.gameId);
    if (!game || game.seed == null || !game.picks) return null;
    const rows = await ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", hs.gameId)).take(5000);
    return { seed: game.seed, picks: game.picks as number[], variants: game.variants ?? undefined, actions: rows.map((r) => r.action) };
  },
});

/** Record the model calls and the outcome: a ready story (keeping the old text as `previousText`) or a failure. */
export const finish = internalMutation({
  args: {
    storyId: v.id("stories"), trigger: triggerV, promptVersion: v.number(), runs: v.array(runV),
    result: v.union(v.object({ ok: v.literal(true), title: v.string(), text: v.string(), words: v.number(), model: v.string() }), v.object({ ok: v.literal(false), reason: v.string() })),
  },
  handler: async (ctx, { storyId, trigger, promptVersion, runs, result }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return;
    const now = Date.now();
    for (const r of runs) await ctx.db.insert("storyRuns", { storyId, highScoreId: story.highScoreId, trigger, promptVersion, createdAt: now, ...r });
    if (result.ok) {
      await ctx.db.patch(storyId, {
        status: "ready", title: result.title, text: result.text, words: result.words, model: result.model, promptVersion, error: undefined,
        previousText: story.text, updatedAt: now,
      });
    } else if (story.text) {
      await ctx.db.patch(storyId, { error: result.reason, updatedAt: now }); // a failed rewrite leaves the old story in place
    } else {
      await ctx.db.patch(storyId, { status: "failed", error: result.reason, updatedAt: now });
    }
  },
});

/**
 * Create or update the single generation-settings document: pause switch and spending caps in US dollars (0 clears a cap).
 * Unspecified fields are left as they are. Run by hand until the admin panel has a role-gated control:
 *   npx convex run stories:setSettings '{"dailyCapUsd":2}'
 */
export async function applySettings(ctx: MutationCtx, { paused, dailyCapUsd, monthlyCapUsd }: SettingsArgs) {
  const cap = (n: number | undefined): number | undefined => (n === undefined ? undefined : n > 0 ? n : undefined);
  if ([dailyCapUsd, monthlyCapUsd].some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))) throw new Error("A cap must be a number of dollars, 0 or more");
  const now = Date.now();
  const row = await ctx.db.query("storySettings").first();
  const next = {
    paused: paused ?? row?.paused ?? false,
    dailyCapUsd: dailyCapUsd === undefined ? row?.dailyCapUsd : cap(dailyCapUsd),
    monthlyCapUsd: monthlyCapUsd === undefined ? row?.monthlyCapUsd : cap(monthlyCapUsd),
    updatedAt: now,
  };
  if (row) await ctx.db.replace(row._id, next);
  else await ctx.db.insert("storySettings", next);
  return next;
}

export const setSettings = internalMutation({
  args: { paused: v.optional(v.boolean()), dailyCapUsd: v.optional(v.number()), monthlyCapUsd: v.optional(v.number()) },
  handler: async (ctx, args) => applySettings(ctx, args),
});

export type StoryDoc = Doc<"stories">;

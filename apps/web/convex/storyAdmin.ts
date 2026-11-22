import { action, internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { replay, type GameAction } from "@sorcerers-cave/engine";
import { hasRole, requireAnyRole, requireRole, type Role } from "./roles";
import { activePrompt, applySettings, blockReason } from "./stories";
import { aggregateStories, promptProblems, DAYS } from "./storyAdminLib";
import { digestText, storyDigest } from "./storyDigest";
import { anthropicCall, generateStory, isBlockReason } from "./storyGen";
import { MODEL_PRICES } from "./storyPrompt";
import { defaultPrompt, writeStory } from "./storyWriter";

/**
 * The admin Stories tab's backend. Viewing needs ANALYTICS or STORIES; everything that changes a setting, rewrites stories or spends
 * money needs STORIES. SYSTEM implies both. Every function checks its role first.
 */
const VIEW: Role[] = ["ANALYTICS", "STORIES"];

const DAY_MS = 86_400_000;
const MAX_REWRITE = 500;
const BATCH = 3;
const FALLBACK_COST_PER_STORY = 0.2; // used for an estimate before any story has been written

const scopeV = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("older") }),
  v.object({ kind: v.literal("failed") }),
  v.object({ kind: v.literal("one"), gameCode: v.string() }),
);
type Scope = typeof scopeV.type;

// ---- reading (ANALYTICS) ---------------------------------------------------------------------------------------------------

/** Dashboard figures: story counts, calls, spend, per-day series, prompt-version breakdown, failure reasons, and the switches. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyRole(ctx, VIEW);
    const now = Date.now();
    const runs = await ctx.db.query("storyRuns").withIndex("by_createdAt", (q) => q.gte("createdAt", now - DAYS * DAY_MS)).take(10_000);
    const stories = await ctx.db.query("stories").take(5000);
    const settings = await ctx.db.query("storySettings").first();
    const prompt = await activePrompt(ctx);
    return {
      ...aggregateStories(runs, stories, now),
      settings: { paused: settings?.paused ?? false, dailyCapUsd: settings?.dailyCapUsd ?? null, monthlyCapUsd: settings?.monthlyCapUsd ?? null },
      activeVersion: prompt.version,
      windowDays: DAYS,
    };
  },
});

/** The newest model calls and stories, for the Runs view. */
export const recent = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyRole(ctx, VIEW);
    const runs = await ctx.db.query("storyRuns").withIndex("by_createdAt").order("desc").take(40);
    const titles = new Map<Id<"stories">, string | undefined>();
    for (const r of runs) if (r.storyId && !titles.has(r.storyId)) titles.set(r.storyId, (await ctx.db.get(r.storyId))?.title);
    const stories = await ctx.db.query("stories").order("desc").take(40);
    return {
      runs: runs.map((r) => ({ _id: r._id, createdAt: r.createdAt, pass: r.pass, trigger: r.trigger, promptVersion: r.promptVersion, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs, status: r.status, reason: r.reason ?? null, title: (r.storyId && titles.get(r.storyId)) || null })),
      stories: stories.map((s) => ({ _id: s._id, highScoreId: s.highScoreId, status: s.status, title: s.title ?? null, words: s.words ?? null, promptVersion: s.promptVersion ?? null, attempts: s.attempts, error: s.error ?? null, updatedAt: s.updatedAt })),
    };
  },
});

/** One story's text (and the text it replaced), for reading in the panel. */
export const storyText = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    await requireAnyRole(ctx, VIEW);
    const s = await ctx.db.get(storyId);
    return s ? { title: s.title ?? null, text: s.text ?? null, previousText: s.previousText ?? null, status: s.status, error: s.error ?? null } : null;
  },
});

/** The saved prompt versions (newest first), the active one, and the source defaults (version 0). */
export const prompts = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyRole(ctx, VIEW);
    const versions = await ctx.db.query("storyPrompts").withIndex("by_version").order("desc").take(25);
    const d = defaultPrompt();
    return {
      activeVersion: versions[0]?.version ?? 0,
      defaults: { writer: d.writer, editor: d.editor, model: d.model, minWords: d.minWords, maxWords: d.maxWords },
      models: Object.keys(MODEL_PRICES),
      versions: versions.map((p) => ({ version: p.version, writer: p.writer, editor: p.editor, model: p.model, minWords: p.minWords, maxWords: p.maxWords, note: p.note ?? null, createdAt: p.createdAt })),
    };
  },
});

export const jobs = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyRole(ctx, VIEW);
    return (await ctx.db.query("storyJobs").withIndex("by_createdAt").order("desc").take(8)).map((j) => ({ _id: j._id, scope: j.scope, total: j.total, done: j.done, failed: j.failed, status: j.status, reason: j.reason ?? null, createdAt: j.createdAt, updatedAt: j.updatedAt }));
  },
});

// ---- changing things (SYSTEM) ----------------------------------------------------------------------------------------------

/** Save the edited prompt as a NEW version (append-only), which becomes the active one. Re-activating an old version is saving its text again. */
export const savePrompt = mutation({
  args: { writer: v.string(), editor: v.string(), model: v.string(), minWords: v.number(), maxWords: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireRole(ctx, "STORIES");
    const problems = promptProblems(args);
    if (problems.length) throw new Error(problems.join(" "));
    const latest = await ctx.db.query("storyPrompts").withIndex("by_version").order("desc").first();
    const version = (latest?.version ?? 0) + 1;
    await ctx.db.insert("storyPrompts", { version, ...args, note: args.note?.trim().slice(0, 200) || undefined, createdBy: userId, createdAt: Date.now() });
    return version;
  },
});

/** True when `next` lets more be spent than `current` does: a higher figure, or removing a cap (0 clears it). */
export const raisesCap = (current: number | undefined, next: number | undefined): boolean =>
  next !== undefined && current !== undefined && (next === 0 || next > current);

/**
 * Pause, resume and LOWER a cap need STORIES. Raising a cap or removing it lets more money be spent, so that needs SYSTEM:
 * a STORIES editor cannot lift the limit the administrator set.
 */
export const updateSettings = mutation({
  args: { paused: v.optional(v.boolean()), dailyCapUsd: v.optional(v.number()), monthlyCapUsd: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireRole(ctx, "STORIES");
    const current = await ctx.db.query("storySettings").first();
    if ((raisesCap(current?.dailyCapUsd, args.dailyCapUsd) || raisesCap(current?.monthlyCapUsd, args.monthlyCapUsd)) && !hasRole(await ctx.db.get(userId), "SYSTEM")) {
      throw new Error("Forbidden: raising or removing a spending cap needs the System role.");
    }
    const r = await applySettings(ctx, args);
    return { paused: r.paused, dailyCapUsd: r.dailyCapUsd ?? null, monthlyCapUsd: r.monthlyCapUsd ?? null };
  },
});

/** The stories a rewrite scope selects (at most MAX_REWRITE), with a readable label. */
async function targets(ctx: QueryCtx, scope: Scope): Promise<{ ids: Id<"highScores">[]; label: string; truncated: boolean }> {
  const active = (await activePrompt(ctx)).version;
  let label = "";
  let ids: Id<"highScores">[] = [];
  if (scope.kind === "one") {
    label = `Game ${scope.gameCode.trim().toUpperCase()}`;
    const game = await ctx.db.query("games").withIndex("by_code", (q) => q.eq("code", scope.gameCode.trim().toUpperCase())).first();
    const hs = game ? await ctx.db.query("highScores").withIndex("by_game", (q) => q.eq("gameId", game._id)).first() : null;
    const story = hs ? await ctx.db.query("stories").withIndex("by_highScore", (q) => q.eq("highScoreId", hs._id)).first() : null;
    if (story && story.status !== "pending") ids = [story.highScoreId];
  } else {
    const all = await ctx.db.query("stories").take(5000);
    if (scope.kind === "all") { label = "Every story"; ids = all.filter((s) => s.status !== "pending").map((s) => s.highScoreId); }
    else if (scope.kind === "failed") { label = "Failed stories"; ids = all.filter((s) => s.status === "failed").map((s) => s.highScoreId); }
    else { label = `Stories written with an older prompt than version ${active}`; ids = all.filter((s) => s.status === "ready" && (s.promptVersion ?? 0) < active).map((s) => s.highScoreId); }
  }
  return { ids: ids.slice(0, MAX_REWRITE), label, truncated: ids.length > MAX_REWRITE };
}

/** How many stories a scope would rewrite and roughly what it would cost, so the admin can confirm knowingly. */
export const rewritePreview = query({
  args: { scope: scopeV },
  handler: async (ctx, { scope }) => {
    await requireRole(ctx, "STORIES");
    const now = Date.now();
    const t = await targets(ctx, scope);
    const recentRuns = await ctx.db.query("storyRuns").withIndex("by_createdAt").order("desc").take(300);
    const per = aggregateStories(recentRuns, [], now).runs.avgCostPerStoryUsd ?? FALLBACK_COST_PER_STORY;
    const settings = await ctx.db.query("storySettings").first();
    const todayUsd = aggregateStories(recentRuns, [], now).spend.todayUsd;
    const estimatedUsd = Math.round(per * t.ids.length * 100) / 100;
    const remaining = settings?.dailyCapUsd ? Math.max(0, Math.round((settings.dailyCapUsd - todayUsd) * 100) / 100) : null;
    return { label: t.label, count: t.ids.length, truncated: t.truncated, perStoryUsd: per, estimatedUsd, remainingTodayUsd: remaining, exceedsDailyCap: remaining !== null && estimatedUsd > remaining, paused: settings?.paused ?? false };
  },
});

/** Begin a bulk rewrite. `expected` is the count the admin confirmed, so a changed selection cannot slip through. One job runs at a time. */
export const startRewrite = mutation({
  args: { scope: scopeV, expected: v.number() },
  handler: async (ctx, { scope, expected }) => {
    const userId = await requireRole(ctx, "STORIES");
    const running = await ctx.db.query("storyJobs").withIndex("by_createdAt").order("desc").take(5);
    if (running.some((j) => j.status === "running")) throw new Error("A rewrite is already running. Stop it or wait for it to finish.");
    const t = await targets(ctx, scope);
    if (t.ids.length === 0) throw new Error("There is nothing to rewrite for that choice.");
    if (t.ids.length !== expected) throw new Error(`The selection now holds ${t.ids.length} stories, not ${expected}. Please review and confirm again.`);
    const why = await blockReason(ctx, Date.now());
    if (why) throw new Error(`Cannot start: ${why}.`);
    const now = Date.now();
    const jobId = await ctx.db.insert("storyJobs", { kind: "rewrite", scope: t.label, total: t.ids.length, done: 0, failed: 0, status: "running", createdBy: userId, createdAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.storyAdmin.rewriteBatch, { jobId, ids: t.ids, from: 0 });
    return jobId;
  },
});

export const stopJob = mutation({
  args: { jobId: v.id("storyJobs") },
  handler: async (ctx, { jobId }) => {
    await requireRole(ctx, "STORIES");
    const j = await ctx.db.get(jobId);
    if (j?.status === "running") await ctx.db.patch(jobId, { status: "stopped", reason: "stopped by an administrator", updatedAt: Date.now() });
  },
});

// ---- the rewrite queue (internal) -------------------------------------------------------------------------------------------

export const jobState = internalQuery({ args: { jobId: v.id("storyJobs") }, handler: async (ctx, { jobId }) => (await ctx.db.get(jobId))?.status ?? null });

export const jobProgress = internalMutation({
  args: { jobId: v.id("storyJobs"), done: v.number(), failed: v.number(), status: v.union(v.literal("running"), v.literal("done"), v.literal("stopped")), reason: v.optional(v.string()) },
  handler: async (ctx, { jobId, done, failed, status, reason }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return;
    // Counts always add up; an administrator's stop is final and is never overwritten by an in-flight batch.
    await ctx.db.patch(jobId, { done: j.done + done, failed: j.failed + failed, updatedAt: Date.now(), ...(j.status === "running" ? { status, ...(reason ? { reason } : {}) } : {}) });
  },
});

/** Rewrite the next few stories, then schedule the next batch: small steps so a job can be watched, stopped, and halted by a cap. */
export const rewriteBatch = internalAction({
  args: { jobId: v.id("storyJobs"), ids: v.array(v.id("highScores")), from: v.number() },
  handler: async (ctx, { jobId, ids, from }): Promise<null> => {
    if ((await ctx.runQuery(internal.storyAdmin.jobState, { jobId })) !== "running") return null;
    const slice = ids.slice(from, from + BATCH);
    let done = 0, failed = 0, halt: string | undefined;
    for (const id of slice) {
      const r = await generateStory(ctx, id, "rewrite");
      if (r.ok) done++;
      else if (isBlockReason(r.reason)) { halt = r.reason; break; } // not this story's fault: stop the whole job
      else failed++;
    }
    const next = from + slice.length;
    const finished = !halt && next >= ids.length;
    await ctx.runMutation(internal.storyAdmin.jobProgress, { jobId, done, failed, status: halt ? "stopped" : finished ? "done" : "running", reason: halt });
    if (!halt && !finished) await ctx.scheduler.runAfter(0, internal.storyAdmin.rewriteBatch, { jobId, ids, from: next });
    return null;
  },
});

// ---- trying a prompt without saving it ---------------------------------------------------------------------------------------

export const assertEditor = internalQuery({ args: {}, handler: async (ctx) => requireRole(ctx, "STORIES") });
export const spendBlock = internalQuery({ args: {}, handler: async (ctx) => blockReason(ctx, Date.now()) });
export const recordTrial = internalMutation({
  args: { highScoreId: v.id("highScores"), runs: v.array(v.object({ pass: v.union(v.literal("write"), v.literal("check")), model: v.string(), inputTokens: v.number(), outputTokens: v.number(), costUsd: v.number(), durationMs: v.number(), status: v.union(v.literal("ok"), v.literal("rejected"), v.literal("error")), reason: v.optional(v.string()) })) },
  handler: async (ctx, { highScoreId, runs }) => {
    const now = Date.now();
    for (const r of runs) await ctx.db.insert("storyRuns", { highScoreId, trigger: "trial", promptVersion: -1, createdAt: now, ...r });
  },
});

/**
 * Write one story with an UNSAVED prompt and return it without storing it, so a prompt change can be judged before a bulk
 * rewrite. It spends money like any generation (recorded as a "trial" run, and refused when paused or over a cap).
 */
export const tryPrompt = action({
  args: { highScoreId: v.id("highScores"), writer: v.string(), editor: v.string(), model: v.string(), minWords: v.number(), maxWords: v.number() },
  handler: async (ctx, { highScoreId, ...p }): Promise<{ ok: true; title: string; text: string; words: number; costUsd: number } | { ok: false; reason: string; costUsd: number }> => {
    await ctx.runQuery(internal.storyAdmin.assertEditor, {});
    const problems = promptProblems(p);
    if (problems.length) throw new Error(problems.join(" "));
    const blocked = await ctx.runQuery(internal.storyAdmin.spendBlock, {});
    if (blocked) throw new Error(`Cannot try the prompt: ${blocked}.`);
    const input = await ctx.runQuery(internal.stories.replayInput, { highScoreId });
    if (!input) throw new Error("That entry has no replay data to write a story from.");
    const digest = digestText(storyDigest(replay(input.seed, input.picks, input.actions as GameAction[], input.variants as never)));
    const r = await writeStory(anthropicCall, { version: -1, ...p }, digest);
    await ctx.runMutation(internal.storyAdmin.recordTrial, { highScoreId, runs: r.runs });
    const costUsd = Math.round(r.runs.reduce((n, x) => n + x.costUsd, 0) * 10_000) / 10_000;
    return r.ok ? { ok: true, title: r.title, text: r.text, words: r.words, costUsd } : { ok: false, reason: r.reason, costUsd };
  },
});

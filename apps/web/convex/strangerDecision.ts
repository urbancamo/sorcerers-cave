// The asynchronous path for an external stranger level (stage 6.3, docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md).
//
// When a fight reaches a decision that an external level makes, `applyAction` parks it (`park`): the pending decision is stamped with a
// request id and two jobs are scheduled. `resolve` asks the endpoint and `commit`s the answer; `commit` is also what the watchdog runs,
// with a timeout, if `resolve` never reports back. Whichever settles the request first wins: the request id is cleared with the pending
// decision, so every later `commit` for it is stale and changes nothing. Any failure falls back to `standard`, logged (P5, P11).
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { askEndpoint, type Job } from "./endpointClient";
import {
  applyStrangerDecision, awaitingRequest, driveStrangers, getStrategy, markAwaiting, pendingContext, GS_PLAYING,
  type GameState,
} from "@sorcerers-cave/engine";

/** How long after a level's own deadline the watchdog waits before taking the decision itself. */
export const WATCHDOG_GRACE_MS = 2000;

/** The next free `seq` in a game's log. */
export async function nextSeq(ctx: QueryCtx, gameId: Id<"games">): Promise<number> {
  const last = await ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", gameId)).order("desc").first();
  return (last?.seq ?? -1) + 1;
}

/** Hand the pending decision to the endpoint: record the request on it and schedule the call and its watchdog. `requestSeq` is the
 *  position the next log row will have, which makes the request id unique within the game. Returns the state to store. */
export async function park(ctx: MutationCtx, gameId: Id<"games">, state: GameState, requestSeq: number): Promise<GameState> {
  const requestId = `${gameId}:${requestSeq}`;
  const marked = markAwaiting(state, requestId, Date.now());
  const { deadlineMs } = awaitingRequest(marked)!;
  await ctx.scheduler.runAfter(0, internal.strangerDecision.resolve, { gameId, requestId });
  await ctx.scheduler.runAfter(deadlineMs + WATCHDOG_GRACE_MS, internal.strangerDecision.commit, { gameId, requestId, failure: "timeout" });
  return marked;
}

/** What to ask for a request, or null if it has been settled already. */
export const load = internalQuery({
  args: { gameId: v.id("games"), requestId: v.string() },
  handler: async (ctx, { gameId, requestId }): Promise<Job | null> => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "active") return null;
    const state = game.state as GameState;
    const request = awaitingRequest(state);
    const asked = pendingContext(state);
    if (!request || request.id !== requestId || !asked) return null;
    const strategy = getStrategy(state.variants?.strangerLevel ?? "standard");
    return { requestId, kind: asked.kind, context: asked.context, strategyId: strategy.id, strategyVersion: strategy.version, deadlineMs: request.deadlineMs };
  },
});

/** Ask the endpoint for a parked decision and commit what comes back. */
export const resolve = internalAction({
  args: { gameId: v.id("games"), requestId: v.string() },
  handler: async (ctx, { gameId, requestId }): Promise<null> => {
    const job: Job | null = await ctx.runQuery(internal.strangerDecision.load, { gameId, requestId });
    if (!job) return null;
    const answer = await askEndpoint(job, { url: process.env.EXTERNAL_STRATEGY_URL, secret: process.env.EXTERNAL_STRATEGY_SECRET });
    await ctx.runMutation(internal.strangerDecision.commit, { gameId, requestId, ...("raw" in answer ? { raw: answer.raw } : { failure: answer.failure }) });
    return null;
  },
});

/** Settle a request: apply the endpoint's answer, or `standard`'s when `failure` says there was none. A request that has already been
 *  settled, or never belonged to this game, is stale and changes nothing. Then play on: built-in levels carry on at once, and another
 *  external decision is parked in its turn. */
export const commit = internalMutation({
  args: { gameId: v.id("games"), requestId: v.string(), raw: v.optional(v.any()), failure: v.optional(v.string()) },
  handler: async (ctx, { gameId, requestId, raw, failure }): Promise<{ committed: boolean; reason?: "stale" }> => {
    const game = await ctx.db.get(gameId);
    const state = game?.state as GameState | undefined;
    if (!game || game.status !== "active" || !state || awaitingRequest(state)?.id !== requestId) return { committed: false, reason: "stale" };

    const strategy = getStrategy(state.variants?.strangerLevel ?? "standard");
    const answered = applyStrangerDecision(state, raw, { strategyId: strategy.id, strategyVersion: strategy.version }, failure);
    const driven = driveStrangers(answered.state);
    // Only the decision that was asked of the endpoint carries the observation; any built-in ones driven after it do not.
    const asked = { ...answered.applied, strategyId: strategy.id, latencyMs: Math.max(0, Date.now() - awaitingRequest(state)!.at) };
    const rows = [asked, ...driven.applied];
    let seq = await nextSeq(ctx, gameId);
    let next = driven.state;
    if (driven.awaiting && !awaitingRequest(next)) next = await park(ctx, gameId, next, seq + rows.length);
    await ctx.db.patch(gameId, { state: next, status: next.gs === GS_PLAYING ? "active" : "finished", updatedAt: Date.now() });
    for (const r of rows) await ctx.db.insert("gameEvents", { gameId, seq: seq++, ...r });
    return { committed: true };
  },
});

/** The newest decisions a report reads for one level. */
const REPORT_LIMIT = 5000;

/** The value at percentile `p` (0-100) of `sorted`, by the nearest-rank method. */
function percentile(sorted: number[], p: number): number | null {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]! : null;
}

/** How an external level has fared (P15): of its newest decisions, how many fell back to `standard` and why, and how long it took to
 *  answer. Run from the dashboard or `npx convex run strangerDecision:report '{"strategyId":"ext-easy"}'`. */
export const report = internalQuery({
  args: { strategyId: v.string() },
  handler: async (ctx, { strategyId }) => {
    const rows = await ctx.db.query("gameEvents").withIndex("by_strategyId", (q) => q.eq("strategyId", strategyId)).order("desc").take(REPORT_LIMIT);
    const reasons: Record<string, number> = {};
    for (const r of rows) {
      const reason = r.action?.fallback?.reason;
      if (typeof reason === "string") reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    const fallbacks = Object.values(reasons).reduce((a, b) => a + b, 0);
    const latencies = rows.map((r) => r.latencyMs).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
    return {
      strategyId, decisions: rows.length, fallbacks, fallbackRate: rows.length ? fallbacks / rows.length : null, reasons,
      latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    };
  },
});

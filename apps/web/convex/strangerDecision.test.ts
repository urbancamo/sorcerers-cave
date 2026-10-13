import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { EXTERNAL_LEVELS } from "@sorcerers-cave/engine";
import { WATCHDOG_GRACE_MS } from "./strangerDecision";

const modules = import.meta.glob("./**/*.*s");

// Authenticate as a fresh anonymous user (as game.test.ts does; not imported, so its tests do not run under this file's setup).
async function asUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { as: t.withIdentity({ subject: `${userId}|session` }), userId };
}

// Stage 6.3 (docs/requirements/combat/2026-10-13-stage-6-external-strategy-plan.md): a stranger decision made by an external level is
// asked of an endpoint outside the mutation, committed when it answers, and replaced by `standard` on any failure.

const URL = "https://strategy.example/decide";
const SECRET = "s3cret";
const EASY = EXTERNAL_LEVELS["ext-easy"]!.deadlineMs;
const ENV = ["STRANGER_STRATEGY", "EXTERNAL_STRATEGY_URL", "EXTERNAL_STRATEGY_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.STRANGER_STRATEGY = "ext-easy";
  process.env.EXTERNAL_STRATEGY_URL = URL;
  process.env.EXTERNAL_STRATEGY_SECRET = SECRET;
  vi.useFakeTimers();
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const LEGAL = { version: 1, decision: { allocations: [{ artifact: 3, stranger: 0 }] } };

/** A game one `attack` away from a fight in which a Hero guards a Sword. */
async function setup() {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  await t.run(async (ctx) => {
    const g = (await ctx.db.get(id))!;
    await ctx.db.patch(id, { state: { ...g.state, phase: "encounter", strangers: [0, 2], treasures: [3, 5] } });
  });
  const start = () => as.mutation(api.game.applyAction, { id, action: { type: "attack" } });
  const state = async () => (await as.query(api.game.get, { id }))!.state;
  const log = async () => (await t.run((ctx) => ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", id)).collect()));
  /** Run the job scheduled for "now" (the endpoint call) and wait for it, leaving the later watchdog unfired. */
  const runResolve = async () => { vi.advanceTimersByTime(1); await t.finishInProgressScheduledFunctions(); };
  return { t, as, id, start, state, log, runResolve };
}
type Setup = Awaited<ReturnType<typeof setup>>;
const fallbackOf = async (s: Setup) => (await s.log()).find((r) => r.action.type === "strangersAssignArtefacts")?.action;

describe("an external level parks the decision", () => {
  test("the fight waits: only the player's action is logged, the request is recorded and two jobs are scheduled", async () => {
    const s = await setup();
    const res = await s.start();
    expect(res.state.fight.pending).toMatchObject({ by: "strangers", kind: "loadout", request: { deadlineMs: EASY } });
    expect(typeof res.state.fight.pending.request.id).toBe("string");
    expect((await s.log()).map((r) => r.action.type)).toEqual(["attack"]);
    const jobs = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(2);
  });

  test("the watchdog is scheduled after the level's own deadline plus a grace", async () => {
    const s = await setup();
    const before = Date.now();
    await s.start();
    const jobs = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const watchdog = jobs.find((j) => (j.args[0] as { failure?: string }).failure === "timeout")!;
    expect(watchdog.scheduledTime - before).toBeGreaterThanOrEqual(EASY + WATCHDOG_GRACE_MS);
    expect(watchdog.scheduledTime - before).toBeLessThan(EASY + WATCHDOG_GRACE_MS + 1000);
  });

  test("a built-in level is untouched: decided in the same call, nothing scheduled", async () => {
    process.env.STRANGER_STRATEGY = "standard";
    const s = await setup();
    const res = await s.start();
    expect(res.state.fight.pending).toBeUndefined();
    expect((await s.log()).map((r) => r.action.type)).toEqual(["attack", "strangersAssignArtefacts"]);
    expect(await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });

  test("while it waits the player cannot act or answer for the strangers", async () => {
    const s = await setup();
    await s.start();
    const res = await s.as.mutation(api.game.applyAction, { id: s.id, action: { type: "retreat" } });
    expect(res.events).toEqual([{ type: "blocked" }]);
    await expect(s.as.mutation(api.game.applyAction, { id: s.id, action: { type: "strangersAssignArtefacts" } })).rejects.toThrow(/stranger/i);
    expect((await s.log()).map((r) => r.action.type)).toEqual(["attack"]);
  });
});

describe("the endpoint answers", () => {
  test("a legal answer is committed as the strategy's own logged action, and the request is cleared", async () => {
    const fetchMock = vi.fn(async () => json(LEGAL));
    vi.stubGlobal("fetch", fetchMock);
    const s = await setup();
    await s.start();
    await s.runResolve();
    const state = await s.state();
    expect(state.fight.pending).toBeUndefined();
    expect(state.fight.gear).toEqual([[3], []]);
    const rows = await s.log();
    expect(rows.map((r) => r.action.type)).toEqual(["attack", "strangersAssignArtefacts"]);
    expect(rows.map((r) => r.seq)).toEqual([0, 1]);
    expect(rows[1]!.action).toMatchObject({ strategyId: "ext-easy", strategyVersion: 1 });
    expect(rows[1]!.action.fallback).toBeUndefined();
  });

  test("the request carries the secret and only what a human could see (P4)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json(LEGAL));
    vi.stubGlobal("fetch", fetchMock);
    const s = await setup();
    const started = await s.start();
    await s.runResolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ version: 1, requestId: started.state.fight.pending.request.id, strategyId: "ext-easy", strategyVersion: 1, kind: "loadout" });
    expect(body.context.view.strangers).toEqual([0, 2]);
    expect(init.body as string).not.toMatch(/"seed"\s*:/);
    expect(init.body as string).not.toContain(SECRET);
  });

  test("an illegal answer is replaced by standard's and recorded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ version: 1, decision: { allocations: [{ artifact: 99, stranger: 0 }] } })));
    const s = await setup();
    await s.start();
    await s.runResolve();
    expect(await fallbackOf(s)).toMatchObject({ strategyId: "standard", fallback: { from: "ext-easy" } });
    expect((await s.state()).fight.gear).toEqual([[3], []]);
  });

  test.each([
    ["a non-OK status", () => json({ error: "boom" }, 500), /500/],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 }), /json/i],
    ["a body of the wrong version", () => json({ version: 2, decision: {} }), /version/i],
    ["a body with no decision", () => json({ version: 1 }), /decision/i],
  ])("%s falls back to standard with the reason recorded", async (_name, respond, reason) => {
    vi.stubGlobal("fetch", vi.fn(async () => respond()));
    const s = await setup();
    await s.start();
    await s.runResolve();
    const action = await fallbackOf(s);
    expect(action).toMatchObject({ strategyId: "standard", fallback: { from: "ext-easy" } });
    expect(action!.fallback.reason).toMatch(reason);
    expect((await s.state()).fight.pending).toBeUndefined();
  });

  test("a network error falls back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    const s = await setup();
    await s.start();
    await s.runResolve();
    expect((await fallbackOf(s))!.fallback.reason).toMatch(/network down/);
  });

  test("no endpoint configured falls back at once and the secret is never sent", async () => {
    delete process.env.EXTERNAL_STRATEGY_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const s = await setup();
    await s.start();
    await s.runResolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await fallbackOf(s))!.fallback.reason).toMatch(/not configured/);
  });
});

describe("the endpoint is slow, or never answers", () => {
  test("it is given the level's deadline and no longer: then standard decides, reason timeout", async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      signal = init.signal ?? undefined;
      signal?.addEventListener("abort", () => rej(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const s = await setup();
    await s.start();
    vi.advanceTimersByTime(1);                                         // start the resolve job only, not the later watchdog
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(signal?.aborted).toBe(false);                               // still within its time
    vi.advanceTimersByTime(EASY);
    await s.t.finishInProgressScheduledFunctions();
    expect(signal?.aborted).toBe(true);
    expect(await fallbackOf(s)).toMatchObject({ strategyId: "standard", fallback: { from: "ext-easy", reason: "timeout" } });
    expect((await s.state()).fight.pending).toBeUndefined();
  });

  test("a fetch that ignores the abort signal is still cut off at the deadline", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const s = await setup();
    await s.start();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    vi.advanceTimersByTime(EASY);
    await s.t.finishInProgressScheduledFunctions();                    // never returns if the action is not cut off
    expect((await fallbackOf(s))!.fallback.reason).toBe("timeout");
  });

  test("the watchdog commits the fallback if the action never reported back", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const s = await setup();
    await s.start();
    const request = (await s.state()).fight.pending.request.id as string;
    // Only the watchdog's own arguments are replayed: the resolve action is never allowed to run.
    await s.t.mutation(internal.strangerDecision.commit, { gameId: s.id, requestId: request, failure: "timeout" });
    expect(await fallbackOf(s)).toMatchObject({ strategyId: "standard", fallback: { from: "ext-easy", reason: "timeout" } });
    expect((await s.state()).fight.pending).toBeUndefined();
  });
});

describe("a stale or duplicate answer changes nothing", () => {
  test("an answer for a request that was already settled is dropped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(LEGAL)));
    const s = await setup();
    const started = await s.start();
    const request = started.state.fight.pending.request.id as string;
    await s.runResolve();
    const before = { state: await s.state(), rows: (await s.log()).length };
    const again = await s.t.mutation(internal.strangerDecision.commit, { gameId: s.id, requestId: request, raw: LEGAL.decision });
    expect(again).toEqual({ committed: false, reason: "stale" });
    expect(await s.state()).toEqual(before.state);
    expect((await s.log()).length).toBe(before.rows);
  });

  test("a late real answer after the timeout fallback is dropped, whichever won", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const s = await setup();
    const started = await s.start();
    const request = started.state.fight.pending.request.id as string;
    await s.t.mutation(internal.strangerDecision.commit, { gameId: s.id, requestId: request, failure: "timeout" });
    const rows = (await s.log()).length;
    const late = await s.t.mutation(internal.strangerDecision.commit, { gameId: s.id, requestId: request, raw: LEGAL.decision });
    expect(late).toEqual({ committed: false, reason: "stale" });
    expect((await s.log()).length).toBe(rows);
  });

  test("an answer carrying the wrong request id is dropped and the decision stays pending", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const s = await setup();
    await s.start();
    const res = await s.t.mutation(internal.strangerDecision.commit, { gameId: s.id, requestId: "someone-else", raw: LEGAL.decision });
    expect(res).toEqual({ committed: false, reason: "stale" });
    expect((await s.state()).fight.pending.kind).toBe("loadout");
  });

  test("the watchdog firing after a normal answer does nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(LEGAL)));
    const s = await setup();
    await s.start();
    await s.runResolve();
    const rows = (await s.log()).length;
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await s.log()).length).toBe(rows);
    expect((await fallbackOf(s))!.fallback).toBeUndefined();
  });
});

describe("only standard is ranked (D2)", () => {
  test("a finished game against a non-standard level cannot be recorded on the leaderboard", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
    await t.run(async (ctx) => {
      const g = (await ctx.db.get(id))!;
      await ctx.db.patch(id, { status: "finished", state: { ...g.state, gs: 1, variants: { ...(g.state.variants ?? {}), strangerLevel: "ext-easy" } } });
    });
    await expect(as.mutation(api.highScores.save, { gameId: id as Id<"games">, name: "x" })).rejects.toThrow(/stranger/i);
  });
});

// Stage 6.5 (P15): every decision asked of an endpoint records which level was asked and how long the answer took, on its log row;
// a report turns those rows into a fallback rate and latency percentiles per level.
describe("observability", () => {
  test("an answered decision records the level asked and its latency; other rows record neither", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(LEGAL)));
    const s = await setup();
    await s.start();
    await s.runResolve();
    const [attack, decision] = await s.log();
    expect(attack!.strategyId).toBeUndefined();
    expect(attack!.latencyMs).toBeUndefined();
    expect(decision!.strategyId).toBe("ext-easy");
    expect(decision!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(decision!.latencyMs).toBeLessThan(EASY);
  });

  test("a fallback still names the level that was asked, with the time it took to give up", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const s = await setup();
    await s.start();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    vi.advanceTimersByTime(EASY);
    await s.t.finishInProgressScheduledFunctions();
    const decision = (await s.log())[1]!;
    expect(decision.strategyId).toBe("ext-easy");                      // not "standard", whose decision it carries
    expect(decision.latencyMs).toBeGreaterThanOrEqual(EASY);
  });

  test("the report gives the fallback rate, reasons and latency percentiles for a level", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(LEGAL)));
    const s = await setup();
    await s.start();
    await s.runResolve();
    const row = (latencyMs: number, reason?: string) => ({
      gameId: s.id, seq: 100 + latencyMs, events: [], strategyId: "ext-easy", latencyMs,
      action: { type: "strangersEngage", strategyId: reason ? "standard" : "ext-easy", ...(reason ? { fallback: { from: "ext-easy", reason } } : {}) },
    });
    await s.t.run(async (ctx) => {
      for (const r of [row(10), row(20), row(30), row(40, "timeout"), row(50, "endpoint answered 500")]) await ctx.db.insert("gameEvents", r);
      await ctx.db.insert("gameEvents", { ...row(5), strategyId: "ext-hard" });
    });
    const report = await s.t.query(internal.strangerDecision.report, { strategyId: "ext-easy" });
    expect(report).toMatchObject({ strategyId: "ext-easy", decisions: 6, fallbacks: 2, fallbackRate: 2 / 6, reasons: { timeout: 1, "endpoint answered 500": 1 } });
    expect(report.latencyMs.p50).toBeGreaterThan(0);
    expect(report.latencyMs.p95).toBe(50);
    expect((await s.t.query(internal.strangerDecision.report, { strategyId: "ext-hard" })).decisions).toBe(1);
    expect(await s.t.query(internal.strangerDecision.report, { strategyId: "nobody" })).toMatchObject({ decisions: 0, fallbackRate: null });
  });
});

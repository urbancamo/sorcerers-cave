/// <reference types="vite/client" />
import { FACT_CHECK_SYSTEM, PLANNER_SYSTEM } from "./storyPrompt";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { GS_ESCAPED, replay, type GameAction } from "@sorcerers-cave/engine";
import games from "../src/data/scenario-games.json";
import topScores from "../../../packages/engine/src/fixtures/top-score-games.json";
import { queueStory } from "./stories";

const modules = import.meta.glob("./**/*.*s");

const para = Array(30).fill("The lantern burned low and they went on down the long stair together").join(" ") + ".";
const STORY = `# The Count\n\n${[para, para, para, para].join("\n\n")}`; // about 1,560 words: inside the default range

type Rec = { seed: number; picks: number[]; variants: Record<string, boolean>; actions: GameAction[] };
const pinned = (topScores as unknown as { games: { rules: string; rank: number; score: number }[] }).games;
// A stored game that still replays to its pinned score (older recordings may not, after rule changes).
const sample = pinned.filter((g) => g.rules === "base").map((g) => ({ code: `B${String(g.rank).padStart(3, "0")}`, score: g.score })).find(({ code, score }) => {
  const r = (games as unknown as Record<string, Rec>)[code]; if (!r) return false;
  try { const f = replay(r.seed, r.picks, r.actions, r.variants as never); return f[f.length - 1]!.state.gs === GS_ESCAPED; } catch { return false; }
})!;
const rec = (games as unknown as Record<string, Rec>)[sample.code]!;

async function seedScore(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", { state: {}, status: "finished", seed: rec.seed, picks: rec.picks, variants: rec.variants, createdAt: 0, updatedAt: 0 });
    for (let i = 0; i < rec.actions.length; i++) await ctx.db.insert("gameEvents", { gameId, seq: i, action: rec.actions[i], events: [] });
    return ctx.db.insert("highScores", { gameId, name: "Alice", score: sample.score, outcome: GS_ESCAPED, party: [], state: {}, createdAt: 0 });
  });
}

/** A fetch that plays the planner, the writer, then the checker; counts calls and records requests. */
function fakeApi(story = STORY) {
  const calls: { system: string; model: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { system: string; model: string };
    calls.push({ system: body.system, model: body.model });
    const step = (calls.length - 1) % 5; // plan, write, check, edit, check
    const text = ["a plan", "a draft", "none", story, "none"][step]!;
    return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 4000, output_tokens: 2500 } }), { status: 200 });
  }));
  return calls;
}

beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "test-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("a score at or above its table's threshold queues a pending story, once; below it, or with no key, nothing", async () => {
  vi.useFakeTimers(); // the queued generation runs through the scheduler: drive it here so it cannot leak into the next test
  fakeApi();
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  const rows = () => t.run((ctx) => ctx.db.query("stories").collect());
  await t.run((ctx) => queueStory(ctx, id, 199, undefined));
  expect(await rows()).toHaveLength(0);
  await t.run((ctx) => queueStory(ctx, id, 249, { sibyl: true })); // the kit and Sibyl tables need 250
  await t.run((ctx) => queueStory(ctx, id, 249, { extensionKit: true }));
  expect(await rows()).toHaveLength(0);
  await t.run((ctx) => queueStory(ctx, id, 200, undefined));
  await t.run((ctx) => queueStory(ctx, id, 200, undefined)); // idempotent
  expect(await rows()).toHaveLength(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  expect((await rows())[0]).toMatchObject({ status: "ready" }); // the scheduled run completed, against this test's own stub
  vi.unstubAllEnvs();
  const t2 = convexTest(schema, modules);
  const id2 = await seedScore(t2);
  await t2.run((ctx) => queueStory(ctx, id2, 999, undefined)); // no key: generation is off
  expect(await t2.run((ctx) => ctx.db.query("stories").collect())).toHaveLength(0);
});

test("generate replays the run, writes and checks, and stores a ready markdown story with its priced runs", async () => {
  const calls = fakeApi();
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "retry" });
  expect(calls).toHaveLength(5);
  const s = await t.query(api.stories.forScore, { highScoreId: id });
  expect(s).toMatchObject({ status: "ready", title: "The Count" });
  expect(s!.text).toMatch(/^# The Count/);
  const runs = await t.run((ctx) => ctx.db.query("storyRuns").collect());
  expect(runs.map((r) => [r.pass, r.status, r.promptVersion, r.trigger])).toEqual([["plan", "ok", 0, "retry"], ["write", "ok", 0, "retry"], ["check", "ok", 0, "retry"], ["edit", "ok", 0, "retry"], ["check", "ok", 0, "retry"]]);
  expect(runs[0]!.costUsd).toBeCloseTo((4000 * 3 + 2500 * 15) / 1e6, 8);
});

test("the newest saved prompt version is the one used, and is recorded on the story", async () => {
  const calls = fakeApi();
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("storyPrompts", { version: 1, writer: "OLD", editor: "OLD", model: "claude-sonnet-5-5", minWords: 1, maxWords: 9999, createdAt: 1 });
    await ctx.db.insert("storyPrompts", { version: 2, writer: "NEW WRITER", editor: "NEW EDITOR", model: "claude-opus-5-5", minWords: 1, maxWords: 9999, createdAt: 2 });
  });
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "rewrite" });
  expect(calls.map((c) => [c.system === PLANNER_SYSTEM ? "PLANNER" : c.system === FACT_CHECK_SYSTEM ? "FACT" : c.system, c.model])).toEqual([["PLANNER", "claude-opus-5-5"], ["NEW WRITER", "claude-opus-5-5"], ["FACT", "claude-opus-5-5"], ["NEW EDITOR", "claude-opus-5-5"], ["FACT", "claude-opus-5-5"]]);
  const story = await t.run((ctx) => ctx.db.query("stories").first());
  expect(story).toMatchObject({ promptVersion: 2, model: "claude-opus-5-5" });
});

test("a rewrite keeps the old text as previousText on success, and leaves it in place on failure", async () => {
  fakeApi("# Second\n\nA brand new tale.");
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("storyPrompts", { version: 1, writer: "w", editor: "e", model: "claude-sonnet-5-5", minWords: 1, maxWords: 99, createdAt: 1 });
    await ctx.db.insert("stories", { highScoreId: id, status: "ready", title: "First", text: "# First\n\nThe old tale.", words: 3, attempts: 1, promptVersion: 0, createdAt: 0, updatedAt: 0 });
  });
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "rewrite" });
  let s = await t.run((ctx) => ctx.db.query("stories").first());
  expect(s).toMatchObject({ status: "ready", title: "Second", previousText: "# First\n\nThe old tale.", promptVersion: 1, attempts: 2 });

  vi.stubGlobal("fetch", vi.fn(async () => new Response("overloaded", { status: 529 })));
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "rewrite" });
  s = await t.run((ctx) => ctx.db.query("stories").first());
  expect(s).toMatchObject({ status: "ready", title: "Second", text: "# Second\n\nA brand new tale." }); // untouched
  expect(s!.error).toMatch(/write failed: API 529/);
  expect((await t.query(api.stories.forScore, { highScoreId: id }))!.text).toContain("brand new tale");
});

test("with no API key a story fails with the reason, and the failed call is recorded", async () => {
  vi.unstubAllEnvs();
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "save" });
  expect(await t.query(api.stories.forScore, { highScoreId: id })).toMatchObject({ status: "failed", text: null });
  const s = await t.run((ctx) => ctx.db.query("stories").first());
  expect(s!.error).toMatch(/ANTHROPIC_API_KEY is not set/);
  expect((await t.run((ctx) => ctx.db.query("storyRuns").collect()))[0]).toMatchObject({ status: "error", costUsd: 0 });
});

test("pause and the daily and monthly caps stop generation before any model call", async () => {
  const calls = fakeApi();
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  const now = Date.now();
  await t.run((ctx) => ctx.db.insert("storySettings", { paused: true, updatedAt: now }));
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "save" });
  expect((await t.run((ctx) => ctx.db.query("stories").first()))).toMatchObject({ status: "failed", error: "generation is paused" });

  await t.run(async (ctx) => {
    const settings = (await ctx.db.query("storySettings").first())!;
    await ctx.db.patch(settings._id, { paused: false, dailyCapUsd: 1 });
    await ctx.db.insert("storyRuns", { highScoreId: id, pass: "write", trigger: "save", promptVersion: 0, model: "m", inputTokens: 1, outputTokens: 1, costUsd: 1.5, durationMs: 1, status: "ok", createdAt: now });
  });
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "retry" });
  expect((await t.run((ctx) => ctx.db.query("stories").first()))!.error).toBe("daily cap reached");

  await t.run(async (ctx) => {
    const settings = (await ctx.db.query("storySettings").first())!;
    await ctx.db.patch(settings._id, { dailyCapUsd: undefined, monthlyCapUsd: 1 });
  });
  await t.action(internal.storyGen.generate, { highScoreId: id, trigger: "retry" });
  expect((await t.run((ctx) => ctx.db.query("stories").first()))!.error).toBe("monthly cap reached");
  expect(calls).toHaveLength(0); // nothing was spent
});

test("forScore hides the text until the story is ready, and is null for an entry with none", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  expect(await t.query(api.stories.forScore, { highScoreId: id })).toBeNull();
  await t.run((ctx) => ctx.db.insert("stories", { highScoreId: id, status: "pending", text: "# Half\n\nwritten", attempts: 1, createdAt: 0, updatedAt: 0 }));
  expect(await t.query(api.stories.forScore, { highScoreId: id })).toMatchObject({ status: "pending", text: null });
});

test("setSettings creates the document, keeps unspecified fields, and 0 clears a cap", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(internal.stories.setSettings, { dailyCapUsd: 2 })).toMatchObject({ paused: false, dailyCapUsd: 2 });
  expect(await t.mutation(internal.stories.setSettings, { paused: true })).toMatchObject({ paused: true, dailyCapUsd: 2 });
  expect(await t.mutation(internal.stories.setSettings, { monthlyCapUsd: 20 })).toMatchObject({ paused: true, dailyCapUsd: 2, monthlyCapUsd: 20 });
  expect((await t.mutation(internal.stories.setSettings, { dailyCapUsd: 0 })).dailyCapUsd).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("storySettings").collect())).toHaveLength(1);
  await expect(t.mutation(internal.stories.setSettings, { dailyCapUsd: -1 })).rejects.toThrow(/0 or more/);
});

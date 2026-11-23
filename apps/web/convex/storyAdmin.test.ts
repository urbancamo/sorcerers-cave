/// <reference types="vite/client" />
import { activePrompt } from "./stories";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { GS_ESCAPED, replay, type GameAction } from "@sorcerers-cave/engine";
import games from "../src/data/scenario-games.json";
import topScores from "../../../packages/engine/src/fixtures/top-score-games.json";
import { asUser } from "./game.test";
import { renderCharacters } from "./storyCharacters";
import { aggregateStories, categoriseFailure, promptProblems } from "./storyAdminLib";

const modules = import.meta.glob("./**/*.*s");

const para = Array(30).fill("The lantern burned low and they went on down the long stair together").join(" ") + ".";
const STORY = `# The Count\n\n${[para, para, para, para].join("\n\n")}`;
type Rec = { seed: number; picks: number[]; variants: Record<string, boolean>; actions: GameAction[] };
const pinned = (topScores as unknown as { games: { rules: string; rank: number; score: number }[] }).games;
const sample = pinned.filter((g) => g.rules === "base").map((g) => ({ code: `B${String(g.rank).padStart(3, "0")}`, score: g.score })).find(({ code }) => {
  const r = (games as unknown as Record<string, Rec>)[code]; if (!r) return false;
  try { const f = replay(r.seed, r.picks, r.actions, r.variants as never); return f[f.length - 1]!.state.gs === GS_ESCAPED; } catch { return false; }
})!;
const rec = (games as unknown as Record<string, Rec>)[sample.code]!;

async function seedScore(t: ReturnType<typeof convexTest>, code = "ABCD") {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", { state: {}, status: "finished", code, seed: rec.seed, picks: rec.picks, variants: rec.variants, createdAt: 0, updatedAt: 0 });
    for (let i = 0; i < rec.actions.length; i++) await ctx.db.insert("gameEvents", { gameId, seq: i, action: rec.actions[i], events: [] });
    const highScoreId = await ctx.db.insert("highScores", { gameId, name: "Alice", score: sample.score, outcome: GS_ESCAPED, party: [], state: {}, createdAt: 0 });
    const storyId = await ctx.db.insert("stories", { highScoreId, status: "ready", title: "Old", text: "old text", words: 2, promptVersion: 0, attempts: 1, createdAt: 0, updatedAt: 0 });
    return { gameId, highScoreId, storyId };
  });
}

function fakeApi() {
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    n++;
    const text = ["a plan", "a draft", "none", STORY, "none"][(n - 1) % 5]!; // plan, write, check, edit, check
    return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 4000, output_tokens: 2500 } }), { status: 200 });
  }));
}

beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "test-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const newPrompt = { writer: "W", editor: "E", model: "claude-sonnet-5-5", minWords: 1400, maxWords: 1900 };

test("viewing needs ANALYTICS; changing anything needs SYSTEM", async () => {
  const t = convexTest(schema, modules);
  const plain = (await asUser(t)).as, viewer = (await asUser(t, ["ANALYTICS"])).as, admin = (await asUser(t, ["SYSTEM"])).as;
  await expect(plain.query(api.storyAdmin.overview, {})).rejects.toThrow();
  await expect(t.query(api.storyAdmin.overview, {})).rejects.toThrow();
  expect((await viewer.query(api.storyAdmin.overview, {})).counts).toEqual({ pending: 0, ready: 0, failed: 0 });
  await expect(viewer.mutation(api.storyAdmin.savePrompt, newPrompt)).rejects.toThrow();
  await expect(viewer.mutation(api.storyAdmin.updateSettings, { paused: true })).rejects.toThrow();
  await expect(viewer.query(api.storyAdmin.rewritePreview, { scope: { kind: "all" } })).rejects.toThrow();
  expect(await admin.mutation(api.storyAdmin.savePrompt, newPrompt)).toBe(1);
});

test("STORIES views and edits the Stories tab and nothing else; ANALYTICS only views", async () => {
  const t = convexTest(schema, modules);
  const stories = (await asUser(t, ["STORIES"])).as, analytics = (await asUser(t, ["ANALYTICS"])).as, tester = (await asUser(t, ["TEST"])).as;
  expect((await stories.query(api.storyAdmin.overview, {})).counts).toEqual({ pending: 0, ready: 0, failed: 0 });
  expect(await stories.mutation(api.storyAdmin.savePrompt, newPrompt)).toBe(1);
  expect(await stories.mutation(api.storyAdmin.updateSettings, { paused: true })).toMatchObject({ paused: true });
  await expect(analytics.mutation(api.storyAdmin.savePrompt, newPrompt)).rejects.toThrow();
  await expect(tester.query(api.storyAdmin.overview, {})).rejects.toThrow();
  await expect(stories.query(api.analytics.summary, {})).rejects.toThrow(); // no game analytics
  await expect(stories.query(api.adminUsers.list, {})).rejects.toThrow(); // no user administration
});

test("saving a prompt appends a new version and activates it; bad input is refused", async () => {
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as;
  expect((await admin.query(api.storyAdmin.prompts, {})).activeVersion).toBe(0);
  expect(await admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, note: " shorter " })).toBe(1);
  expect(await admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, writer: "W2" })).toBe(2);
  const p = await admin.query(api.storyAdmin.prompts, {});
  expect(p.activeVersion).toBe(2);
  expect(p.versions.map((v) => v.version)).toEqual([2, 1]);
  expect(p.versions[1]!.note).toBe("shorter");
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, writer: " " })).rejects.toThrow(/writer prompt is empty/);
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, model: "gpt-x" })).rejects.toThrow(/model must be/);
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, minWords: 2000 })).rejects.toThrow(/word range/);
});

test("the planner, fact-check, voices and bible are saved with a version, validated, and defaulted for older versions", async () => {
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as;
  const defaults = (await admin.query(api.storyAdmin.prompts, {})).defaults;
  expect(defaults.planner).toMatch(/planning a short story/);
  expect(defaults.factCheck).toMatch(/fact-checker/);
  expect(defaults.voices).toMatch(/^close-third: /);
  expect(defaults.bible).toMatch(/^## header/);

  // A version saved the old way (five fields) shows today's defaults for the rest, and uses them.
  await admin.mutation(api.storyAdmin.savePrompt, newPrompt);
  expect((await admin.query(api.storyAdmin.prompts, {})).versions[0]).toMatchObject({ planner: defaults.planner, bible: defaults.bible });

  // A version with its own planner and bible keeps them.
  const mine = { ...newPrompt, planner: "MY PLANNER", factCheck: "MY CHECK", voices: "solo: Just one.", bible: "## header\nH\n## creatures\nDragon: A dragon." };
  await admin.mutation(api.storyAdmin.savePrompt, mine);
  expect((await admin.query(api.storyAdmin.prompts, {})).versions[0]).toMatchObject({ planner: "MY PLANNER", factCheck: "MY CHECK", voices: "solo: Just one.", bible: mine.bible });
  const used = await t.run(async (ctx) => activePrompt(ctx));
  expect(used).toMatchObject({ planner: "MY PLANNER", factCheck: "MY CHECK", voices: "solo: Just one.", bible: mine.bible });

  // Bad edits are refused with the reason.
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, planner: " " })).rejects.toThrow(/planner prompt is empty/);
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, factCheck: "" })).rejects.toThrow(/fact-check prompt is empty/);
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, voices: "no colon" })).rejects.toThrow(/expected "id: instruction"/);
  await expect(admin.mutation(api.storyAdmin.savePrompt, { ...newPrompt, bible: "## header\nH\n## creatures\nDragn: x" })).rejects.toThrow(/not a creature/);
});

test("a STORIES editor can pause and lower a cap but not raise or remove one; SYSTEM can", async () => {
  const t = convexTest(schema, modules);
  const editor = (await asUser(t, ["STORIES"])).as, admin = (await asUser(t, ["SYSTEM"])).as;
  // First setting a cap (there was none) is a lowering, so an editor may do it.
  expect(await editor.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 2, monthlyCapUsd: 20 })).toMatchObject({ dailyCapUsd: 2, monthlyCapUsd: 20 });
  expect(await editor.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 1 })).toMatchObject({ dailyCapUsd: 1 });
  expect(await editor.mutation(api.storyAdmin.updateSettings, { paused: true })).toMatchObject({ paused: true });
  expect(await editor.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 1, paused: false })).toMatchObject({ paused: false }); // same value is not a raise
  await expect(editor.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 5 })).rejects.toThrow(/System role/);
  await expect(editor.mutation(api.storyAdmin.updateSettings, { monthlyCapUsd: 0 })).rejects.toThrow(/System role/); // removing
  expect(await admin.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 5 })).toMatchObject({ dailyCapUsd: 5 });
  expect(await admin.mutation(api.storyAdmin.updateSettings, { monthlyCapUsd: 0 })).toMatchObject({ monthlyCapUsd: null });
});

test("settings: pause and caps can be set and cleared", async () => {
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as;
  expect(await admin.mutation(api.storyAdmin.updateSettings, { paused: true, dailyCapUsd: 2, monthlyCapUsd: 20 })).toEqual({ paused: true, dailyCapUsd: 2, monthlyCapUsd: 20 });
  expect(await admin.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 0 })).toEqual({ paused: true, dailyCapUsd: null, monthlyCapUsd: 20 });
  await expect(admin.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: -1 })).rejects.toThrow();
});

test("a rewrite previews its size, needs the confirmed count, rewrites with the active prompt, and cannot run twice", async () => {
  vi.useFakeTimers();
  fakeApi();
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as;
  const { storyId } = await seedScore(t);
  await admin.mutation(api.storyAdmin.savePrompt, newPrompt); // version 1: the seeded story (version 0) is now older
  const preview = await admin.query(api.storyAdmin.rewritePreview, { scope: { kind: "older" } });
  expect(preview).toMatchObject({ count: 1, exceedsDailyCap: false });
  expect(preview.estimatedUsd).toBeGreaterThan(0);
  await expect(admin.mutation(api.storyAdmin.startRewrite, { scope: { kind: "older" }, expected: 5 })).rejects.toThrow(/not 5/);
  const jobId = await admin.mutation(api.storyAdmin.startRewrite, { scope: { kind: "older" }, expected: 1 });
  await expect(admin.mutation(api.storyAdmin.startRewrite, { scope: { kind: "all" }, expected: 1 })).rejects.toThrow(/already running/);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const job = (await admin.query(api.storyAdmin.jobs, {}))[0]!;
  expect(job).toMatchObject({ status: "done", total: 1, done: 1, failed: 0 });
  const s = await t.run((ctx) => ctx.db.get(storyId));
  expect(s).toMatchObject({ status: "ready", promptVersion: 1, title: "The Count", previousText: "old text" });
  void jobId;
});

test("a rewrite halts, without counting failures, when a spending cap is reached mid-job", async () => {
  vi.useFakeTimers();
  fakeApi();
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as;
  await seedScore(t, "AAAA"); await seedScore(t, "BBBB"); await seedScore(t, "CCCC");
  await admin.mutation(api.storyAdmin.updateSettings, { dailyCapUsd: 0.45 }); // each story costs about $0.25 (five calls)
  await admin.mutation(api.storyAdmin.startRewrite, { scope: { kind: "all" }, expected: 3 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await admin.query(api.storyAdmin.jobs, {}))[0]).toMatchObject({ status: "stopped", done: 2, failed: 0, reason: "daily cap reached" });
  // With the cap spent, a new rewrite is refused at the door.
  await expect(admin.mutation(api.storyAdmin.startRewrite, { scope: { kind: "all" }, expected: 3 })).rejects.toThrow(/cap reached/);
});

test("stopping a job is final; a single story can be chosen by game code", async () => {
  vi.useFakeTimers();
  fakeApi();
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as;
  await seedScore(t, "WXYZ");
  expect(await admin.query(api.storyAdmin.rewritePreview, { scope: { kind: "one", gameCode: " wxyz " } })).toMatchObject({ count: 1, label: "Game WXYZ" });
  expect(await admin.query(api.storyAdmin.rewritePreview, { scope: { kind: "one", gameCode: "NOPE" } })).toMatchObject({ count: 0 });
  const jobId = await admin.mutation(api.storyAdmin.startRewrite, { scope: { kind: "one", gameCode: "WXYZ" }, expected: 1 });
  await admin.mutation(api.storyAdmin.stopJob, { jobId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await admin.query(api.storyAdmin.jobs, {}))[0]).toMatchObject({ status: "stopped", done: 0 });
});

test("trying an unsaved prompt returns a story, stores nothing on the entry, and records a trial run", async () => {
  fakeApi();
  const t = convexTest(schema, modules);
  const admin = (await asUser(t, ["SYSTEM"])).as, viewer = (await asUser(t, ["ANALYTICS"])).as;
  const { highScoreId, storyId } = await seedScore(t);
  await expect(viewer.action(api.storyAdmin.tryPrompt, { highScoreId, ...newPrompt })).rejects.toThrow();
  const r = await admin.action(api.storyAdmin.tryPrompt, { highScoreId, ...newPrompt });
  expect(r).toMatchObject({ ok: true, title: "The Count" });
  expect(await t.run((ctx) => ctx.db.get(storyId))).toMatchObject({ title: "Old" });
  const runs = await t.run((ctx) => ctx.db.query("storyRuns").collect());
  expect(runs).toHaveLength(5); // plan, write, check, edit, check
  expect(runs.every((x) => x.trigger === "trial" && x.promptVersion === -1)).toBe(true);
});

test("aggregateStories totals spend, rates and failure reasons", () => {
  const now = Date.UTC(2026, 10, 22, 12);
  const run = (over = {}) => ({ createdAt: now - 1000, pass: "write" as const, trigger: "save", promptVersion: 0, model: "m", inputTokens: 1000, outputTokens: 500, costUsd: 0.1, durationMs: 2000, status: "ok" as const, ...over });
  const a = aggregateStories(
    [run(), run({ pass: "check", costUsd: 0.05 }), run({ createdAt: now - 3 * 86_400_000, status: "error" })],
    [{ status: "ready", words: 1500, promptVersion: 0, attempts: 1 }, { status: "failed", attempts: 1, error: "guard: too short (900 words)" }],
    now,
  );
  expect(a.counts).toEqual({ pending: 0, ready: 1, failed: 1 });
  expect(a.successRate).toBe(50);
  expect(a.avgWords).toBe(1500);
  expect(a.runs).toMatchObject({ total: 3, ok: 2, failed: 1, costUsd: 0.25 });
  expect(a.spend.todayUsd).toBe(0.15);
  expect(a.perDay).toHaveLength(30);
  expect(a.failureReasons).toEqual([{ reason: "Failed the length, format or wording check", count: 1 }]);
});

test("failure reasons are grouped and prompt problems listed", () => {
  expect(categoriseFailure("daily cap reached")).toBe("Spending cap reached");
  expect(categoriseFailure("Anthropic API 529: overloaded")).toBe("API error");
  expect(categoriseFailure("something odd")).toBe("Other");
  expect(promptProblems({ ...newPrompt })).toEqual([]);
  expect(promptProblems({ ...newPrompt, editor: "", maxWords: 50 }).length).toBe(2);
  expect(promptProblems({ ...newPrompt, characters: renderCharacters() })).toEqual([]);
  expect(promptProblems({ ...newPrompt, characters: "## header\nH\n## Gnome\ngeneral: x\nnames: a" }).join(" ")).toMatch(/Gnome/);
});

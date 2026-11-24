import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { RATE_LIMITS, RATE_NAMES } from "./rateLimits";

const modules = import.meta.glob("./**/*.*s");
type Roles = ("SYSTEM" | "USER" | "ANALYTICS" | "TEST")[];

async function asUser(t: ReturnType<typeof convexTest>, roles?: Roles) {
  const userId = await t.run((ctx) => ctx.db.insert("users", roles ? { roles } : {}));
  return { as: t.withIdentity({ subject: `${userId}|session` }), userId };
}
// An admin sets the limits through the real mutation, as the System tab does.
async function setLimits(t: ReturnType<typeof convexTest>, limits: Record<string, { max: number; windowSec: number }>) {
  const { as } = await asUser(t, ["SYSTEM"]);
  await as.mutation(api.settings.setRateLimits, { limits: Object.entries(limits).map(([name, l]) => ({ name, ...l })) });
}
const MIN = 60;
const CLIENT = { userAgent: "x", viewport: "1x1", build: "t" };
const report = () => ({ description: "The Dragon did not wake up", category: "rules" as const, client: CLIENT });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-24T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("the limits themselves", () => {
  test("every limit has sensible defaults and a name a person can read", () => {
    for (const name of RATE_NAMES) {
      const d = RATE_LIMITS[name];
      expect(d.label.length).toBeGreaterThan(3);
      expect(d.max).toBeGreaterThan(0);
      expect(d.windowSec).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("limits are enforced per player, with a message the player can read", () => {
  test("starting solo games", async () => {
    const t = convexTest(schema, modules);
    await setLimits(t, { newGame: { max: 2, windowSec: 600 } });
    const a = await asUser(t);
    const b = await asUser(t);
    for (let i = 0; i < 2; i++) await a.as.mutation(api.game.newGame, { seed: i, picks: [0] });
    await expect(a.as.mutation(api.game.newGame, { seed: 9, picks: [0] })).rejects.toThrow(/Too many games started.*10 minutes/);
    await b.as.mutation(api.game.newGame, { seed: 1, picks: [0] }); // another player is unaffected
  });

  test("the window reopens when it has passed, and the count starts again", async () => {
    const t = convexTest(schema, modules);
    await setLimits(t, { newGame: { max: 1, windowSec: 60 } });
    const a = await asUser(t);
    await a.as.mutation(api.game.newGame, { seed: 1, picks: [0] });
    await expect(a.as.mutation(api.game.newGame, { seed: 2, picks: [0] })).rejects.toThrow(/Too many/);
    vi.advanceTimersByTime(61_000);
    await a.as.mutation(api.game.newGame, { seed: 3, picks: [0] });
    await expect(a.as.mutation(api.game.newGame, { seed: 4, picks: [0] })).rejects.toThrow(/Too many/);
  });

  test("a refused use is not counted against the player", async () => {
    const t = convexTest(schema, modules);
    await setLimits(t, { newGame: { max: 1, windowSec: 60 } });
    const a = await asUser(t);
    await a.as.mutation(api.game.newGame, { seed: 1, picks: [0] });
    for (let i = 0; i < 5; i++) await expect(a.as.mutation(api.game.newGame, { seed: 2, picks: [0] })).rejects.toThrow();
    const row = await t.run((ctx) => ctx.db.query("rateLimitHits").collect());
    expect(row.map((r) => r.count)).toEqual([1]);
  });

  test("creating multiplayer games, and joining by code (a wrong code counts too)", async () => {
    const t = convexTest(schema, modules);
    await setLimits(t, { createMultiplayer: { max: 1, windowSec: 600 }, joinAttempt: { max: 2, windowSec: 600 } });
    const a = await asUser(t);
    await a.as.action(api.multiplayer.createMultiplayer, { partyName: "One", color: "green" });
    await expect(a.as.action(api.multiplayer.createMultiplayer, { partyName: "Two", color: "green" })).rejects.toThrow(/Too many multiplayer games/);
    const b = await asUser(t);
    for (let i = 0; i < 2; i++) expect(await b.as.action(api.multiplayer.joinByCode, { code: "ZZZZ", partyName: "X", color: "blue" })).toMatchObject({ ok: false });
    await expect(b.as.action(api.multiplayer.joinByCode, { code: "ZZZZ", partyName: "X", color: "blue" })).rejects.toThrow(/Too many join attempts/);
  });

  test("chat: per player and per game", async () => {
    const t = convexTest(schema, modules);
    await setLimits(t, { chatUser: { max: 2, windowSec: 60 }, chatGame: { max: 3, windowSec: 3600 } });
    const host = await asUser(t);
    const { gameId, code } = await host.as.action(api.multiplayer.createMultiplayer, { partyName: "Host", color: "green" });
    const guest = await asUser(t);
    await guest.as.action(api.multiplayer.joinByCode, { code, partyName: "Guest", color: "blue" });
    const say = (u: typeof host) => u.as.mutation(api.multiplayer.sendMessage, { gameId, text: "hi" });
    await say(host); await say(host);
    await expect(say(host)).rejects.toThrow(/Too many chat messages/);
    await say(guest); // the game's third
    await expect(say(guest)).rejects.toThrow(/Too many messages in this game/);
    const chat = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(chat.filter((m) => m.text === "hi")).toHaveLength(3);
  });

  test("bug reports and screenshot uploads: a player cap and a whole-site cap", async () => {
    const t = convexTest(schema, modules);
    await setLimits(t, { bugReportUser: { max: 2, windowSec: 3600 }, bugReportSite: { max: 3, windowSec: 3600 }, uploadUser: { max: 1, windowSec: 3600 }, uploadSite: { max: 2, windowSec: 3600 } });
    const [a, b, c] = [await asUser(t), await asUser(t), await asUser(t)];
    await a.as.mutation(api.bugReport.submit, report());
    await a.as.mutation(api.bugReport.submit, report());
    await expect(a.as.mutation(api.bugReport.submit, report())).rejects.toThrow(/Too many reports/);
    await b.as.mutation(api.bugReport.submit, report()); // the site's third
    await expect(c.as.mutation(api.bugReport.submit, report())).rejects.toThrow(/Too many reports/); // new accounts do not get round it

    await a.as.mutation(api.bugReport.generateUploadUrl, {});
    await expect(a.as.mutation(api.bugReport.generateUploadUrl, {})).rejects.toThrow(/Too many uploads/);
    await b.as.mutation(api.bugReport.generateUploadUrl, {});
    await expect(c.as.mutation(api.bugReport.generateUploadUrl, {})).rejects.toThrow(/Too many uploads/);
  });

  test("high-score names: a player's cap across games comes back as a reason, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"ok":false}' }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }))));
    const key = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "k";
    try {
      const t = convexTest(schema, modules);
      await setLimits(t, { highScoreName: { max: 1, windowSec: 3600 } });
      const a = await asUser(t);
      const id = await a.as.mutation(api.game.newGame, { seed: 1, picks: [0] });
      await a.as.mutation(api.game.applyAction, { id, action: { type: "exitCave" } });
      expect(await a.as.action(api.highScores.submit, { gameId: id, name: "Rude" })).toMatchObject({ ok: false, reason: expect.stringMatching(/can't be used/) });
      expect(await a.as.action(api.highScores.submit, { gameId: id, name: "Rude2" })).toMatchObject({ ok: false, reason: expect.stringMatching(/Too many names tried/) });
    } finally {
      vi.unstubAllGlobals();
      if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
    }
  });
});

describe("the admin settings", () => {
  test("with nothing changed, every limit is at its default", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, ["SYSTEM"]);
    const list = await as.query(api.settings.rateLimits, {});
    expect(list.map((l) => l.name)).toEqual(RATE_NAMES);
    for (const l of list) expect(l).toMatchObject({ max: l.defaultMax, windowSec: l.defaultWindowSec });
  });

  test("a saved change takes effect on the next use, and a value equal to its default is not stored", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.settings.setRateLimits, { limits: [
      { name: "chatUser", max: 5, windowSec: 120 },
      { name: "newGame", max: RATE_LIMITS.newGame.max, windowSec: RATE_LIMITS.newGame.windowSec },
    ] });
    const list = await as.query(api.settings.rateLimits, {});
    expect(list.find((l) => l.name === "chatUser")).toMatchObject({ max: 5, windowSec: 120, defaultMax: RATE_LIMITS.chatUser.max });
    const row = await t.run((ctx) => ctx.db.query("systemSettings").first());
    expect(Object.keys(row?.rateLimits ?? {})).toEqual(["chatUser"]);
  });

  test("saving the limits leaves the Multiplayer switch alone, and the switch leaves the limits alone", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, ["SYSTEM"]);
    await as.mutation(api.settings.setOptions, { multiplayerEnabled: true });
    await as.mutation(api.settings.setRateLimits, { limits: [{ name: "chatUser", max: 5, windowSec: 120 }] });
    expect(await t.query(api.settings.get, {})).toEqual({ multiplayerEnabled: true });
    await as.mutation(api.settings.setOptions, { multiplayerEnabled: false });
    expect((await as.query(api.settings.rateLimits, {})).find((l) => l.name === "chatUser")?.max).toBe(5);
  });

  test("bad values are refused, not clamped", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, ["SYSTEM"]);
    const bad = (l: { name: string; max: number; windowSec: number }) => as.mutation(api.settings.setRateLimits, { limits: [l] });
    await expect(bad({ name: "nope", max: 5, windowSec: 60 })).rejects.toThrow(/Unknown limit/);
    await expect(bad({ name: "chatUser", max: 0, windowSec: 60 })).rejects.toThrow(/whole number from 1/);
    await expect(bad({ name: "chatUser", max: 1.5, windowSec: 60 })).rejects.toThrow(/whole number/);
    await expect(bad({ name: "chatUser", max: 10_000_000, windowSec: 60 })).rejects.toThrow(/whole number/);
    await expect(bad({ name: "chatUser", max: 5, windowSec: 1 })).rejects.toThrow(/period/);
    await expect(bad({ name: "chatUser", max: 5, windowSec: 99 * 24 * 3600 })).rejects.toThrow(/period/);
    expect(await t.run((ctx) => ctx.db.query("systemSettings").first())).toBeNull();
  });

  test("only SYSTEM may read or change them", async () => {
    const t = convexTest(schema, modules);
    const limits = [{ name: "chatUser", max: 5, windowSec: 120 }];
    for (const roles of [undefined, ["USER"], ["ANALYTICS"], ["TEST"]] as (Roles | undefined)[]) {
      const { as } = await asUser(t, roles);
      await expect(as.query(api.settings.rateLimits, {})).rejects.toThrow();
      await expect(as.mutation(api.settings.setRateLimits, { limits })).rejects.toThrow();
    }
    await expect(t.query(api.settings.rateLimits, {})).rejects.toThrow();
    await expect(t.mutation(api.settings.setRateLimits, { limits })).rejects.toThrow();
  });
});

describe("housekeeping", () => {
  test("the sweep removes old counters and keeps recent ones", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimitHits", { key: "old", windowStart: now - 30 * 24 * 3600 * 1000, count: 1 });
      await ctx.db.insert("rateLimitHits", { key: "new", windowStart: now - 1000, count: 1 });
    });
    expect(await t.mutation(internal.rateLimits.sweep, {})).toBe(1);
    expect((await t.run((ctx) => ctx.db.query("rateLimitHits").collect())).map((r) => r.key)).toEqual(["new"]);
  });
});

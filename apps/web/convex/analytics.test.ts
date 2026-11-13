import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asUser } from "./game.test";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.*s");

const stat = (gameId: Id<"games">, over: Record<string, unknown> = {}) => ({
  gameId, seat: 0, mode: "solo" as const, outcome: "escaped" as const, score: 100, turn: 30, deepestLevel: 2, areas: 10,
  dragonKills: 0, membersLost: 0, partySize: 2, extensionKit: false, sibyl: false, finishedAt: 1000, ...over,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const g = (updatedAt: number, status: "active" | "finished" = "finished", extra: Record<string, unknown> = {}) =>
      ctx.db.insert("games", { state: { turn: 4, level: 2, party: [{}, {}] }, status, code: "ABCD", createdAt: 0, updatedAt, ...extra });
    const a = await g(1000), b = await g(2000), c = await g(3000);
    await ctx.db.insert("gameStats", stat(a, { finishedAt: 1000 }));
    await ctx.db.insert("gameStats", stat(b, { outcome: "dead", score: 0, finishedAt: 2000 }));
    await ctx.db.insert("gameStats", stat(c, { outcome: "quit", score: 0, finishedAt: 3000 }));
    await ctx.db.insert("gameStatsTotals", { key: "all", games: 3, solo: 3, multi: 0, escaped: 1, dead: 1, quit: 1, escapedScoreSum: 100 });
    return { a, b, c };
  });
}

describe("role gating", () => {
  test.each([
    ["signed out", undefined, "Unauthenticated"],
    ["an ordinary player", [], "Forbidden"],
    ["a TEST-only admin", ["TEST"], "Forbidden"],
  ] as const)("%s is refused every analytics query", async (_who, roles, msg) => {
    const t = convexTest(schema, modules);
    const caller = roles ? (await asUser(t, [...roles])).as : t;
    await expect(caller.query(api.analytics.summary, {})).rejects.toThrow(msg);
    await expect(caller.query(api.analytics.history, { paginationOpts: { numItems: 5, cursor: null } })).rejects.toThrow(msg);
    await expect(caller.query(api.analytics.liveGames, { since: 0 })).rejects.toThrow(msg);
  });

  test.each([["ANALYTICS"], ["SYSTEM"]] as const)("%s may read", async (role) => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t, [role]);
    expect((await as.query(api.analytics.summary, {})).totals.games).toBe(0);
  });
});

describe("summary", () => {
  test("headline totals come from the totals row; charts from the recorded games", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { as } = await asUser(t, ["ANALYTICS"]);
    const s = await as.query(api.analytics.summary, {});
    expect(s.totals).toMatchObject({ games: 3, escaped: 1, dead: 1, quit: 1, meanEscapedScore: 100 });
    expect(s.window.n).toBe(3);
    expect(s.window.outcomes.solo).toEqual({ escaped: 1, dead: 1, quit: 1 });
  });
});

describe("history", () => {
  test("lists newest first, with the game's code, and pages", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { as } = await asUser(t, ["ANALYTICS"]);
    const p1 = await as.query(api.analytics.history, { paginationOpts: { numItems: 2, cursor: null } });
    expect(p1.page.map((r) => r.outcome)).toEqual(["quit", "dead"]);
    expect(p1.page[0]!.code).toBe("ABCD");
    const p2 = await as.query(api.analytics.history, { paginationOpts: { numItems: 2, cursor: p1.continueCursor } });
    expect(p2.page.map((r) => r.outcome)).toEqual(["escaped"]);
  });
  test("filters by outcome", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const { as } = await asUser(t, ["ANALYTICS"]);
    const r = await as.query(api.analytics.history, { paginationOpts: { numItems: 10, cursor: null }, outcome: "dead" });
    expect(r.page.map((x) => x.outcome)).toEqual(["dead"]);
  });
});

describe("liveGames", () => {
  test("lists active games touched since the cut-off, newest first, flagging test games, without the state", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("games", { state: { turn: 9, level: 3, party: [{}, {}, {}] }, status: "active", code: "LIVE", createdAt: 0, updatedAt: 5000 });
      await ctx.db.insert("games", { state: { testMode: true, turn: 1, level: 1, party: [{}] }, status: "active", code: "TEST", createdAt: 0, updatedAt: 6000 });
      await ctx.db.insert("games", { state: { turn: 1 }, status: "active", code: "OLDD", createdAt: 0, updatedAt: 100 }); // before the cut-off
      await ctx.db.insert("games", { state: { turn: 1 }, status: "finished", code: "DONE", createdAt: 0, updatedAt: 7000 }); // not active
      await ctx.db.insert("games", { state: { phase: "playing", turnCount: 12, parties: [{}, {}] }, status: "active", mode: "multi", lobby: "started", code: "MULT", createdAt: 0, updatedAt: 4000 });
    });
    const { as } = await asUser(t, ["ANALYTICS"]);
    const live = await as.query(api.analytics.liveGames, { since: 1000 });
    expect(live.map((g) => g.code)).toEqual(["TEST", "LIVE", "MULT"]);
    expect(live[0]).toMatchObject({ testMode: true, mode: "solo" });
    expect(live[1]).toMatchObject({ turn: 9, level: 3, partySize: 3, testMode: false });
    expect(live[2]).toMatchObject({ mode: "multi", turn: 12, parties: 2, lobby: "started" });
    expect(live[0]).not.toHaveProperty("state");
  });
});

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { packCoord, GS_ESCAPED, GS_DEAD, GS_PLAYING } from "@sorcerers-cave/engine";
import { statsFromState } from "./gameStats";
import { api } from "./_generated/api";
import { asUser, asTester } from "./game.test";

const modules = import.meta.glob("./**/*.*s");

const finalState = (over: Record<string, unknown> = {}) => ({
  gs: GS_ESCAPED, turn: 23, testMode: false,
  areas: [{ coord: packCoord(1, 50, 50) }, { coord: packCoord(4, 50, 51) }],
  party: [
    { creatureId: 0, status: 0, dragonKills: 1, treasure: [] },
    { creatureId: 5, status: 3, dragonKills: 0, treasure: [] },
    { creatureId: 6, status: 2, dragonKills: 0, treasure: [] },
  ],
  variants: { extensionKit: true },
  ...over,
});

const totals = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("gameStatsTotals").first());
const rows = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("gameStats").collect());

describe("statsFromState", () => {
  test("derives the figures from a final state", async () => {
    const t = convexTest(schema, modules);
    const gameId = await t.run((ctx) => ctx.db.insert("games", { state: {}, status: "finished", createdAt: 0, updatedAt: 0 }));
    const r = statsFromState(finalState() as never, 99, { gameId, seat: 0, mode: "solo", picks: [0, 5], finishedAt: 5 });
    expect(r).toMatchObject({
      outcome: "escaped", score: 99, turn: 23, deepestLevel: 4, areas: 2, dragonKills: 1,
      membersLost: 2, partySize: 3, picks: [0, 5], extensionKit: true, sibyl: false, finishedAt: 5,
    });
  });
  test("is null while the game is still being played", async () => {
    const t = convexTest(schema, modules);
    const gameId = await t.run((ctx) => ctx.db.insert("games", { state: {}, status: "active", createdAt: 0, updatedAt: 0 }));
    expect(statsFromState(finalState({ gs: GS_PLAYING }) as never, 0, { gameId, seat: 0, mode: "solo", finishedAt: 0 })).toBeNull();
  });
});

describe("recording a finished solo game", () => {
  test("quitting records one row and bumps the totals; later actions do not record it again", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
    await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
    await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
    expect(await rows(t)).toHaveLength(1);
    expect((await rows(t))[0]).toMatchObject({ gameId: id, seat: 0, mode: "solo", outcome: "quit", picks: [0] });
    expect(await totals(t)).toMatchObject({ games: 1, solo: 1, quit: 1, dead: 0, escaped: 0 });
  });

  test("a Test Mode game is never recorded", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asTester(t);
    const id = await as.mutation(api.game.startTestGame, { seed: 1, picks: [0] });
    await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
    expect(await rows(t)).toHaveLength(0);
    expect(await totals(t)).toBeNull();
  });
});

describe("backfill", () => {
  const seed = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => {
    await ctx.db.insert("games", { state: finalState(), status: "finished", picks: [0, 5], createdAt: 0, updatedAt: 7 });
    await ctx.db.insert("games", { state: finalState({ gs: GS_DEAD }), status: "finished", createdAt: 0, updatedAt: 8 });
    await ctx.db.insert("games", { state: finalState({ testMode: true }), status: "finished", createdAt: 0, updatedAt: 9 }); // test: skipped
    await ctx.db.insert("games", { state: finalState({ gs: GS_PLAYING }), status: "active", createdAt: 0, updatedAt: 10 }); // not finished
  });
  const page = { paginationOpts: { numItems: 50, cursor: null } };

  test("records finished, non-test solo games once, and is safe to re-run", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect(await t.mutation(internal.gameStats.backfill, page)).toMatchObject({ recorded: 2, isDone: true });
    expect(await t.mutation(internal.gameStats.backfill, page)).toMatchObject({ recorded: 0 });
    expect((await rows(t)).map((r) => r.outcome).sort()).toEqual(["dead", "escaped"]);
    expect((await rows(t)).find((r) => r.outcome === "escaped")).toMatchObject({ finishedAt: 7, picks: [0, 5] });
    expect(await totals(t)).toMatchObject({ games: 2, solo: 2, escaped: 1, dead: 1 });
  });

  test("multiplayer parties come from their archive rows, keyed by seat via the party name", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await asUser(t);
    await t.run(async (ctx) => {
      const gameId = await ctx.db.insert("games", { state: {}, status: "active", mode: "multi", createdAt: 0, updatedAt: 0 });
      await ctx.db.insert("players", { gameId, userId, seat: 1, partyName: "Reds", color: "red", ready: true, lastSeen: 0 });
      const st = finalState();
      await ctx.db.insert("highScores", { gameId, name: "Reds", score: 55, outcome: GS_ESCAPED, party: st.party, state: st, createdAt: 3, mode: "multi", partyName: "Reds", seatCount: 3 });
      await ctx.db.insert("highScores", { gameId, name: "Gone", score: 5, outcome: GS_ESCAPED, party: st.party, state: st, createdAt: 4, mode: "multi", partyName: "Gone" }); // no seat row
    });
    expect(await t.mutation(internal.gameStats.backfillMulti, page)).toMatchObject({ recorded: 1 });
    expect((await rows(t))[0]).toMatchObject({ mode: "multi", seat: 1, score: 55, seatCount: 3, finishedAt: 3 });
  });
});

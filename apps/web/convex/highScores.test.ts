import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { packCoord, GS_ESCAPED, GS_DEAD } from "@sorcerers-cave/engine";
import { asUser } from "./game.test";

const modules = import.meta.glob("./**/*.*s");

type LoggedRow = { action: unknown; events: unknown[] };

// Insert a finished game, its leaderboard row, and a few logged action/event rows, then derive stats.
async function seedScore(t: ReturnType<typeof convexTest>, over: { rows?: LoggedRow[] } = {}) {
  return t.run(async (ctx) => {
    const now = 0;
    const state = {
      gs: GS_ESCAPED,
      turn: 23,
      sorcererKilled: true,
      areas: [
        { coord: packCoord(1, 50, 50) },
        { coord: packCoord(2, 50, 50) },
        { coord: packCoord(4, 50, 51) }, // deepest → level 4
      ],
      party: [
        { creatureId: 0, status: 0, dragonKills: 1, treasure: [] }, // Hero, survived, slew a Dragon
        { creatureId: 5, status: 3, dragonKills: 0, treasure: [] }, // Man, fallen
      ],
    };
    const gameId = await ctx.db.insert("games", { state, status: "finished", createdAt: now, updatedAt: now });
    const rows = over.rows ?? [
      { action: { type: "resolveRound" }, events: [{ type: "combatRoll" }, { type: "strangerKilled", creatureId: 5 }] },
      { action: { type: "resolveRound" }, events: [{ type: "combatRoll" }, { type: "strangerKilled" }, { type: "strangerKilled" }, { type: "fightWon" }] },
      { action: { type: "useArtifact", artifact: 6 }, events: [{ type: "artifactUsed", artifact: 6 }] },
      { action: { type: "useArtifact", artifact: 4 }, events: [{ type: "artifactUsed", artifact: 4 }, { type: "carpetUsed", dir: 1 }] },
    ];
    for (let i = 0; i < rows.length; i++) {
      await ctx.db.insert("gameEvents", { gameId, seq: i, action: rows[i]!.action, events: rows[i]!.events });
    }
    const id = await ctx.db.insert("highScores", {
      gameId, name: "Alice", score: 99, outcome: GS_ESCAPED, party: state.party, state, createdAt: now,
    });
    return id;
  });
}

test("stats derives expedition figures from the state and the event log", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  const s = await t.query(api.highScores.stats, { id });
  expect(s).toEqual({
    maxDepth: 4,        // deepest area level
    turns: 23,
    areasMapped: 3,
    roundsFought: 2,    // two action-rows produced combat rolls
    enemiesSlain: 3,    // three strangerKilled events across the log
    artifactsUsed: 2,   // two artifactUsed events
    dragonsSlain: 1,
    sorcererSlain: true,
    membersLost: 1,     // the fallen Man
  });
});

test("stats reports zeros when the log has no combat or artifact use", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t, { rows: [{ action: { type: "move", dir: 1 }, events: [{ type: "moved", area: 1, level: 1 }] }] });
  const s = await t.query(api.highScores.stats, { id });
  expect(s?.enemiesSlain).toBe(0);
  expect(s?.roundsFought).toBe(0);
  expect(s?.artifactsUsed).toBe(0);
});

test("log returns a recorded score's game log (public — any viewer can download it)", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  // Public query: no identity — a leaderboard entry's log is downloadable by anyone.
  const log = await t.query(api.highScores.log, { id });
  expect(log?.game.status).toBe("finished");
  expect(log?.moves.map((m) => m.seq)).toEqual([0, 1, 2, 3]); // ordered by seq
  expect(log?.moves[0]!.action).toEqual({ type: "resolveRound" });
  expect(log?.moves[3]!.events).toContainEqual({ type: "carpetUsed", dir: 1 });
});

test("log returns null for an unknown score id", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  await t.run(async (ctx) => ctx.db.delete(id)); // valid id shape, no longer present
  expect(await t.query(api.highScores.log, { id })).toBeNull();
});

// ---------------------------------------------------------------------------
// Extension kit (SC-EXT-29): a finished game's kit flag rides onto its leaderboard entry.
// ---------------------------------------------------------------------------

test("save records extensionKit from the finished game's state.variants", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [18, 20], variants: { extensionKit: true } }); // Witch + Wolf
  await as.mutation(api.game.applyAction, { id, action: { type: "exitCave" } }); // escape at the gateway
  const scoreId = await as.mutation(api.highScores.save, { gameId: id, name: "Kitter" });
  const row = await t.run((ctx) => ctx.db.get(scoreId));
  expect(row?.extensionKit).toBe(true);
});

test("a kit-off game's score has no extensionKit flag", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "exitCave" } });
  const scoreId = await as.mutation(api.highScores.save, { gameId: id, name: "Plain" });
  const row = await t.run((ctx) => ctx.db.get(scoreId));
  expect(row?.extensionKit).toBeFalsy();
});

test("list splits the tables: kit scores only under extensionKit true, base only under default (SC-EXT-29)", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const kitId = await as.mutation(api.game.newGame, { seed: 1, picks: [18, 20], variants: { extensionKit: true } });
  await as.mutation(api.game.applyAction, { id: kitId, action: { type: "exitCave" } });
  await as.mutation(api.highScores.save, { gameId: kitId, name: "Kitter" });
  const baseId = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  await as.mutation(api.game.applyAction, { id: baseId, action: { type: "exitCave" } });
  await as.mutation(api.highScores.save, { gameId: baseId, name: "Plain" });

  const baseRows = await t.query(api.highScores.list, {});
  expect(baseRows.find((r) => r.name === "Plain")).toBeDefined();
  expect(baseRows.find((r) => r.name === "Kitter")).toBeUndefined();

  const kitRows = await t.query(api.highScores.list, { extensionKit: true });
  expect(kitRows.find((r) => r.name === "Kitter")?.extensionKit).toBe(true);
  expect(kitRows.find((r) => r.name === "Plain")).toBeUndefined();
});

// --- Four leaderboards: mode (solo/multi) × extensionKit (design 2026-07-28) ---------------------

/** Seed one solo row and four multiplayer rows spanning kit stamping, the state-derived kit
 *  fallback, and a wiped (non-escaped) seat. Scores descend in insert order so the by_score
 *  index returns them in a deterministic order. */
async function seedModeRows(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const now = 0;
    const base = { turn: 1, areas: [], party: [] };
    const gameId = await ctx.db.insert("games", {
      state: { ...base, gs: GS_ESCAPED }, status: "finished", createdAt: now, updatedAt: now,
    });
    const mk = (name: string, score: number, extra: Record<string, unknown> = {}, outcome: number = GS_ESCAPED, state?: unknown) =>
      ctx.db.insert("highScores", {
        gameId, name, score, outcome, party: [], createdAt: now,
        state: state ?? { ...base, gs: outcome }, ...extra,
      });
    await mk("SoloBase", 50); // legacy row: no mode field ⇒ solo base
    await mk("MpBase", 40, { mode: "multi", seatCount: 2 });
    await mk("MpKitStamped", 30, { mode: "multi", extensionKit: true, seatCount: 3 });
    // Recorded between the MP-kit deploy and the stamping fix: kit only visible in the state.
    await mk("MpKitByState", 20, { mode: "multi" }, GS_ESCAPED, { ...base, gs: GS_ESCAPED, variants: { extensionKit: true } });
    await mk("MpKitWipe", 10, { mode: "multi", extensionKit: true, seatCount: 3 }, GS_DEAD);
  });
}

test("list splits the four leaderboards and lists only escaped multiplayer seats", async () => {
  const t = convexTest(schema, modules);
  await seedModeRows(t);
  expect((await t.query(api.highScores.list, {})).map((r) => r.name)).toEqual(["SoloBase"]);
  expect((await t.query(api.highScores.list, { mode: "multi" })).map((r) => r.name)).toEqual(["MpBase"]);
  // Kit MP table: the stamped row AND the state-derived fallback row; never the wipe.
  expect((await t.query(api.highScores.list, { mode: "multi", extensionKit: true })).map((r) => r.name))
    .toEqual(["MpKitStamped", "MpKitByState"]);
});

test("multiplayer rows surface the recorded player count (absent on legacy rows)", async () => {
  const t = convexTest(schema, modules);
  await seedModeRows(t);
  const rows = await t.query(api.highScores.list, { mode: "multi", extensionKit: true });
  expect(rows.find((r) => r.name === "MpKitStamped")?.seatCount).toBe(3);
  expect(rows.find((r) => r.name === "MpKitByState")?.seatCount).toBeUndefined();
});

test("save rejects a test-mode game", async () => {
  const t = convexTest(schema, modules);
  const { as, userId } = await asUser(t);
  const gameId = await t.run((ctx) => {
    const state = { gs: GS_ESCAPED, testMode: true, party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] };
    return ctx.db.insert("games", { ownerId: userId, state, status: "finished", createdAt: 0, updatedAt: 0 });
  });
  await expect(as.mutation(api.highScores.save, { gameId, name: "Tester" })).rejects.toThrow();
});

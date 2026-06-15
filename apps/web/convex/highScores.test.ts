import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { packCoord, GS_ESCAPED } from "@sorcerers-cave/engine";

const modules = import.meta.glob("./**/*.*s");

// Insert a finished game, its leaderboard row, and a few logged events directly, then derive stats.
async function seedScore(t: ReturnType<typeof convexTest>, over: { events?: unknown[][] } = {}) {
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
    const events = over.events ?? [
      [{ type: "strangerKilled", creatureId: 5 }, { type: "fightWon" }],
      [{ type: "strangerKilled" }, { type: "strangerKilled" }],
    ];
    for (let i = 0; i < events.length; i++) {
      await ctx.db.insert("gameEvents", { gameId, seq: i, action: { type: "attack" }, events: events[i] });
    }
    const id = await ctx.db.insert("highScores", {
      gameId, name: "Alice", score: 99, outcome: GS_ESCAPED, party: state.party, state, createdAt: now,
    });
    return id;
  });
}

test("stats derives expedition figures from the state and counts kills from the event log", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t);
  const s = await t.query(api.highScores.stats, { id });
  expect(s).toEqual({
    maxDepth: 4,        // deepest area level
    turns: 23,
    areasMapped: 3,
    enemiesSlain: 3,    // three strangerKilled events across the log
    dragonsSlain: 1,
    sorcererSlain: true,
    membersLost: 1,     // the fallen Man
  });
});

test("stats reports zero enemies slain when the log has no kills", async () => {
  const t = convexTest(schema, modules);
  const id = await seedScore(t, { events: [[{ type: "moved", area: 1, level: 1 }]] });
  const s = await t.query(api.highScores.stats, { id });
  expect(s?.enemiesSlain).toBe(0);
});

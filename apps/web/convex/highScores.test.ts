import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { packCoord, GS_ESCAPED } from "@sorcerers-cave/engine";

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
      { action: { type: "fightOn" }, events: [{ type: "combatRoll" }, { type: "strangerKilled", creatureId: 5 }] },
      { action: { type: "fightOn" }, events: [{ type: "strangerKilled" }, { type: "strangerKilled" }, { type: "fightWon" }] },
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
    roundsFought: 2,    // two fightOn actions
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

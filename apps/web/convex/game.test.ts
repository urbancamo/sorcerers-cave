import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { newGame as createGameState } from "@sorcerers-cave/engine";

const modules = import.meta.glob("./**/*.*s");

// Authenticate the convex-test client as a fresh anonymous user (no JWT available in tests).
// getAuthUserId parses the user id from the subject's first `|`-segment.
export async function asUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { as: t.withIdentity({ subject: `${userId}|session` }), userId };
}

test("newGame builds and persists a real engine GameState", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 123, picks: [0] }); // Hero, cost 6
  const game = await as.query(api.game.get, { id });
  expect(game?.status).toBe("active");
  // The engine advances the seed through deck shuffles, so assert engine structure, not the input seed.
  expect(game?.state.phase).toBe("explore");
  expect(game?.state.turn).toBe(1);
  expect(game?.state.areas.length).toBe(1);        // the gateway
  expect(game?.state.party.map((m: { creatureId: number }) => m.creatureId)).toEqual([0]);
  // The server runs the SAME deterministic engine as the client.
  expect(game?.state).toEqual(createGameState(123, [0]));
});

test("newGame requires authentication", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.game.newGame, { seed: 1, picks: [0] })).rejects.toThrow();
});

test("newGame rejects an illegal party selection", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  await expect(as.mutation(api.game.newGame, { seed: 1, picks: [] })).rejects.toThrow();
  await expect(as.mutation(api.game.newGame, { seed: 1, picks: [8] })).rejects.toThrow(); // Wizard not selectable (cost null)
});

// ---------------------------------------------------------------------------
// Task 2: applyAction round-trip + query authority
// ---------------------------------------------------------------------------
import { reduce } from "@sorcerers-cave/engine";
// `asUser` and `createGameState` are defined above (Task 1).

test("applyAction matches the local engine and logs the event", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  // The authoritative result must equal a local deterministic reduce of the same state.
  const expected = reduce(createGameState(7, [0]), { type: "move", dir: 1 }); // move North from the gateway
  const res = await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  expect(res.state).toEqual(expected.state);
  const game = await as.query(api.game.get, { id });
  expect(game?.state).toEqual(expected.state);
  // A non-blocked action is logged.
  const logged = await t.run((ctx) =>
    ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", id)).collect(),
  );
  expect(logged.length).toBe(1);
  expect(logged[0]!.seq).toBe(0);
});

test("applyAction accepts a resolveRound action carrying matches (arg validator)", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  // Regression: the action validator rejected the resolveRound `matches` field. It must be accepted
  // (the engine then no-ops it in the explore phase — we only assert the mutation doesn't throw).
  await expect(as.mutation(api.game.applyAction, {
    id, action: { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] },
  })).resolves.toBeDefined();
});

test("an illegal action is a no-op and is not logged", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  const before = await as.query(api.game.get, { id });
  const res = await as.mutation(api.game.applyAction, { id, action: { type: "attack" } }); // illegal in explore
  expect(res.events).toEqual([{ type: "blocked" }]);
  const after = await as.query(api.game.get, { id });
  expect(after?.state).toEqual(before?.state); // unchanged
  const logged = await t.run((ctx) =>
    ctx.db.query("gameEvents").withIndex("by_game", (q) => q.eq("gameId", id)).collect(),
  );
  expect(logged.length).toBe(0); // blocked no-op not logged
});

test("a non-owner cannot read or mutate another player's game (IDOR guard)", async () => {
  const t = convexTest(schema, modules);
  const owner = await asUser(t);
  const id = await owner.as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  const attacker = await asUser(t);
  expect(await attacker.as.query(api.game.get, { id })).toBeNull();               // can't read
  await expect(attacker.as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } }))
    .rejects.toThrow(/Forbidden/);                                                // can't mutate
});

test("quitting finishes the game", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
  const game = await as.query(api.game.get, { id });
  expect(game?.status).toBe("finished");
});

test("a finished game accepts no more changes", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
  const res = await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  expect(res.events).toEqual([]);
});

// ---------------------------------------------------------------------------
// Save / resume by four-letter code
// ---------------------------------------------------------------------------

test("newGame allocates a unique four-uppercase-letter code", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id1 = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const id2 = await as.mutation(api.game.newGame, { seed: 2, picks: [0] });
  const g1 = await as.query(api.game.get, { id: id1 });
  const g2 = await as.query(api.game.get, { id: id2 });
  expect(g1?.code).toMatch(/^[A-Z]{4}$/);
  expect(g2?.code).toMatch(/^[A-Z]{4}$/);
  expect(g1?.code).not.toBe(g2?.code);
});

test("save returns the game's resume code", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const code = await as.mutation(api.game.save, { id });
  expect(code).toMatch(/^[A-Z]{4}$/);
  const game = await as.query(api.game.get, { id });
  expect(game?.code).toBe(code);
});

test("resumeByCode restores the owner's saved game (and normalises input)", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const code = await as.mutation(api.game.save, { id });
  expect(await as.mutation(api.game.resumeByCode, { code })).toBe(id);
  // Whitespace and lowercase input are normalised.
  expect(await as.mutation(api.game.resumeByCode, { code: ` ${code.toLowerCase()} ` })).toBe(id);
});

test("resumeByCode is owner-scoped: a guessed code cannot hijack another player's game", async () => {
  const t = convexTest(schema, modules);
  const owner = await asUser(t);
  const id = await owner.as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const code = await owner.as.mutation(api.game.save, { id });

  const attacker = await asUser(t);
  expect(await attacker.as.mutation(api.game.resumeByCode, { code })).toBeNull(); // not their game
  // …and ownership is untouched: the owner can still resume it.
  expect(await owner.as.mutation(api.game.resumeByCode, { code })).toBe(id);
});

test("resumeByCode returns null for an unknown code", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  expect(await as.mutation(api.game.resumeByCode, { code: "ZZZZ" })).toBeNull();
});

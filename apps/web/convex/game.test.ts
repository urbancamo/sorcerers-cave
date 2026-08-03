import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach, afterEach } from "vitest";
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
import { reduce, replay } from "@sorcerers-cave/engine";
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

// ---------------------------------------------------------------------------
// game-move-log: initial conditions persisted + downloadable move log
// ---------------------------------------------------------------------------

test("newGame persists the seed and picks so the game can be replayed from scratch", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 123, picks: [6, 4] }); // Woman + Priest
  const game = await as.query(api.game.get, { id });
  expect(game?.seed).toBe(123);
  expect(game?.picks).toEqual([6, 4]);
});

test("log returns the game's initial conditions and its ordered, self-contained move records", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } }); // North — logged
  await as.mutation(api.game.applyAction, { id, action: { type: "attack" } });        // illegal → blocked, NOT logged

  const log = await as.query(api.game.log, { id });
  expect(log?.game.seed).toBe(7);
  expect(log?.game.picks).toEqual([0]);
  expect(log?.game.code).toBeTruthy();
  expect(log?.moves.length).toBe(1);                                  // only the non-blocked move
  expect(log?.moves[0]!.seq).toBe(0);
  expect(log?.moves[0]!.action).toEqual({ type: "move", dir: 1 });
  expect(Array.isArray(log?.moves[0]!.events)).toBe(true);

  // The log is self-contained: seed + picks + actions replay to the authoritative state.
  const frames = replay(7, [0], log!.moves.map((m) => m.action));
  const game = await as.query(api.game.get, { id });
  expect(frames[frames.length - 1]!.state).toEqual(game?.state);
});

test("log is owner-scoped (IDOR guard)", async () => {
  const t = convexTest(schema, modules);
  const owner = await asUser(t);
  const id = await owner.as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const intruder = await asUser(t);
  expect(await intruder.as.query(api.game.log, { id })).toBeNull();
});

// ---------------------------------------------------------------------------
// Replay-by-code (spec docs/requirements/2026-07-10-replay-by-code-feature-spec.md, §RB-1/§RB-2)
// Deliberately shareable: NOT owner-scoped (decision §RB-6-3), carries no owner PII.
// ---------------------------------------------------------------------------

test("replayByCode returns null for an unknown code", async () => {
  // RB-1-1: read-only query, null when no eligible game matches.
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  expect(await as.query(api.game.replayByCode, { code: "ZZZZ" })).toBeNull();
});

test("replayByCode normalises 'abcd' to 'ABCD'", async () => {
  // RB-1-2: trim().toUpperCase() + by_code index, mirroring resumeByCode.
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const code = await as.mutation(api.game.save, { id });
  const bundle = await as.query(api.game.replayByCode, { code: ` ${code.toLowerCase()} ` });
  expect(bundle).not.toBeNull();
  expect(bundle?.game.code).toBe(code);
});

test("replayByCode returns the bundle for a game the caller does NOT own", async () => {
  // RB-1-3: shareable-by-code — no ownership guard (decision §RB-6-3).
  const t = convexTest(schema, modules);
  const owner = await asUser(t);
  const id = await owner.as.mutation(api.game.newGame, { seed: 5, picks: [0] });
  const code = await owner.as.mutation(api.game.save, { id });
  const stranger = await asUser(t);
  const bundle = await stranger.as.query(api.game.replayByCode, { code });
  expect(bundle).not.toBeNull();
  expect(bundle?.game.seed).toBe(5);
  // …and an unauthenticated caller gets it too (it is a share link, not an account feature).
  expect(await t.query(api.game.replayByCode, { code })).not.toBeNull();
});

test("replayByCode bundle carries no ownerId or user PII", async () => {
  // RB-1-7: reachable by anyone with the code, so no owner identity in the bundle.
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const code = await as.mutation(api.game.save, { id });
  const bundle = await as.query(api.game.replayByCode, { code });
  const flat = JSON.stringify(bundle);
  expect(flat).not.toContain("ownerId");
  expect(flat).not.toContain("email");
  expect(bundle?.game).toEqual({
    code,
    seed: 1,
    picks: [0],
    color: null,
    status: "active",
    createdAt: expect.any(Number),
  });
});

test("replayByCode bundle carries seed, picks and ordered moves", async () => {
  // RB-1-4: self-contained bundle in the shape `log` already returns.
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 7, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  await as.mutation(api.game.applyAction, { id, action: { type: "attack" } }); // blocked → not logged
  const code = await as.mutation(api.game.save, { id });
  const bundle = await as.query(api.game.replayByCode, { code });
  expect(bundle?.replayable).toBe(true);
  expect(bundle?.game.seed).toBe(7);
  expect(bundle?.game.picks).toEqual([0]);
  expect(bundle?.moves.map((m) => m.seq)).toEqual([0]); // seq order, blocked no-op absent
  expect(bundle?.moves[0]!.action).toEqual({ type: "move", dir: 1 });
  expect(Array.isArray(bundle?.moves[0]!.events)).toBe(true);
});

test("replayByCode flags a pre-logging game as unreplayable", async () => {
  // RB-1-5: seed/picks null (pre-logging row) → bundle still returned, flagged not reconstructable.
  const t = convexTest(schema, modules);
  const { as, userId } = await asUser(t);
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("games", {
      ownerId: userId,
      code: "OLDG",
      state: createGameState(1, [0]),
      status: "finished",
      createdAt: now,
      updatedAt: now,
    });
  });
  const bundle = await as.query(api.game.replayByCode, { code: "OLDG" });
  expect(bundle).not.toBeNull();
  expect(bundle?.replayable).toBe(false);
  expect(bundle?.game.seed).toBeNull();
  expect(bundle?.game.picks).toBeNull();
});

test("replayByCode does not replay a multi game", async () => {
  // RB-1-6: solo only in this milestone — mode "multi" resolves to null.
  const t = convexTest(schema, modules);
  const { as, userId } = await asUser(t);
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("games", {
      ownerId: userId,
      code: "MULT",
      mode: "multi",
      seed: 1,
      picks: [0],
      state: createGameState(1, [0]),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  });
  expect(await as.query(api.game.replayByCode, { code: "MULT" })).toBeNull();
});

// ---------------------------------------------------------------------------
// Extension kit (SC-EXT-29, design US-01/§1.1): variants persist and round-trip through
// save/log/replayByCode so a kit-on game's code reproduces it; a code without the flag decodes
// kit-off (backward compat — every pre-kit row is unaffected).
// ---------------------------------------------------------------------------

test("newGame accepts a kit-only pick only when variants.extensionKit is set (server-side authority)", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  // Witch (id 18) is unselectable without the kit — mirrors the client's PartySelect validation.
  await expect(as.mutation(api.game.newGame, { seed: 1, picks: [18] })).rejects.toThrow();
  await expect(as.mutation(api.game.newGame, { seed: 1, picks: [18], variants: { extensionKit: false } })).rejects.toThrow();
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [18], variants: { extensionKit: true } });
  const game = await as.query(api.game.get, { id });
  expect(game?.variants).toEqual({ extensionKit: true });
  expect(game?.state.variants).toEqual({ extensionKit: true });
  expect(game?.state).toEqual(createGameState(1, [18], { extensionKit: true }));
});

test("newGame with no variants stays byte-identical to today (variants absent on the row)", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const game = await as.query(api.game.get, { id });
  expect(game?.variants).toBeUndefined();
  expect(game?.state.variants).toBeUndefined();
});

test("newGame with an explicit variants: undefined key (the real PartySelect/GameScreen call shape when the kit toggle is off) behaves identically to omitting it", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0], variants: undefined });
  const game = await as.query(api.game.get, { id });
  expect(game?.variants).toBeUndefined();
  expect(game?.state.variants).toBeUndefined();
});

test("log and replayByCode return variants so the client's replay() reconstructs a kit-on game", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 9, picks: [18, 20], variants: { extensionKit: true } }); // Witch + Wolf
  await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  const code = await as.mutation(api.game.save, { id });

  const log = await as.query(api.game.log, { id });
  expect(log?.game.variants).toEqual({ extensionKit: true });
  const frames = replay(log!.game.seed!, log!.game.picks!, log!.moves.map((m) => m.action), log!.game.variants);
  const game = await as.query(api.game.get, { id });
  expect(frames[frames.length - 1]!.state).toEqual(game?.state);

  const bundle = await as.query(api.game.replayByCode, { code });
  expect(bundle?.game.variants).toEqual({ extensionKit: true });
});

test("save/resume round-trips variants: a kit-on game's state.variants survives a save + resumeByCode + get load", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [18, 20], variants: { extensionKit: true } });
  const code = await as.mutation(api.game.save, { id });
  const resumedId = await as.mutation(api.game.resumeByCode, { code });
  const game = await as.query(api.game.get, { id: resumedId! });
  expect(game?.variants).toEqual({ extensionKit: true });
  expect(game?.state.variants).toEqual({ extensionKit: true });
});

test("replayByCode omits variants for a kit-off game — decodes kit-off same as an old, pre-kit code", async () => {
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  const code = await as.mutation(api.game.save, { id });
  const bundle = await as.query(api.game.replayByCode, { code });
  expect(bundle?.game.variants).toBeUndefined();
  // The PII-shape test above pins the exact object for a kit-off game with no `variants` key
  // present in a literal comparison — undefined here composes with that guarantee (toEqual ignores
  // undefined-valued keys), so this stays additive rather than a re-assertion of that test.
});

test("replayByCode log replays to the stored final state", async () => {
  // RB-2-1 + RB-2-2: replay(seed, picks, actions) — last frame deep-equals the persisted state.
  const t = convexTest(schema, modules);
  const { as } = await asUser(t);
  const id = await as.mutation(api.game.newGame, { seed: 42, picks: [6, 4] }); // Woman + Priest
  await as.mutation(api.game.applyAction, { id, action: { type: "move", dir: 1 } });
  await as.mutation(api.game.applyAction, { id, action: { type: "quit" } });
  const code = await as.mutation(api.game.save, { id });
  const bundle = await as.query(api.game.replayByCode, { code });
  const frames = replay(bundle!.game.seed!, bundle!.game.picks!, bundle!.moves.map((m) => m.action));
  // RB-2-3 invariant: moves.length + 1 frames, frame 0 the untouched deal.
  expect(frames.length).toBe(bundle!.moves.length + 1);
  expect(frames[0]!.action).toBeNull();
  const game = await as.query(api.game.get, { id });
  expect(frames[frames.length - 1]!.state).toEqual(game?.state);
});

// ---------------------------------------------------------------------------
// Test Mode: startTestGame
// ---------------------------------------------------------------------------
describe("startTestGame", () => {
  const ORIGINAL_SECRET = process.env.TEST_MODE_SECRET;
  beforeEach(() => { process.env.TEST_MODE_SECRET = "correct-uuid"; });
  // Assigning `undefined` to a process.env property does NOT delete it in Node — it coerces to the
  // literal (truthy) string "undefined". Since TEST_MODE_SECRET is unset in any normal dev/CI
  // environment, ORIGINAL_SECRET is undefined here, so restoring must delete the key rather than
  // assign undefined, or every afterEach would leave the env polluted with "undefined".
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.TEST_MODE_SECRET;
    else process.env.TEST_MODE_SECRET = ORIGINAL_SECRET;
  });

  test("creates a testMode:true game when the secret matches", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const id = await as.mutation(api.game.startTestGame, { secret: "correct-uuid", seed: 1, picks: [0] });
    const game = await as.query(api.game.get, { id });
    expect(game?.state.testMode).toBe(true);
  });

  test("rejects a wrong secret and creates no game", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    await expect(as.mutation(api.game.startTestGame, { secret: "wrong", seed: 1, picks: [0] })).rejects.toThrow();
    const mine = await as.query(api.game.listMine, {});
    expect(mine).toHaveLength(0);
  });

  test("fails closed when TEST_MODE_SECRET is not configured", async () => {
    delete process.env.TEST_MODE_SECRET;
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    await expect(as.mutation(api.game.startTestGame, { secret: "anything", seed: 1, picks: [0] })).rejects.toThrow();
  });

  test("requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.game.startTestGame, { secret: "correct-uuid", seed: 1, picks: [0] })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test Mode: replay() threads testMode through (SC-Test-1) — mirrors the variants-threading
// tests above (log and replayByCode return variants...), since testMode needs the exact same
// treatment: surfaced on the log/replayByCode bundles and passed as replay()'s 5th argument.
// ---------------------------------------------------------------------------
describe("log/replayByCode surface testMode, and replay() reproduces a test-mode game's overrides", () => {
  const ORIGINAL_SECRET = process.env.TEST_MODE_SECRET;
  beforeEach(() => { process.env.TEST_MODE_SECRET = "correct-uuid"; });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.TEST_MODE_SECRET;
    else process.env.TEST_MODE_SECRET = ORIGINAL_SECRET;
  });

  test("bundle.game.testMode is true for a test-mode game, and replay() reproduces the queued override", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const id = await as.mutation(api.game.startTestGame, { secret: "correct-uuid", seed: 1, picks: [0] });
    // testForceReaction needs no particular phase (only the testMode gate) — arming testNextReaction
    // is exactly the divergence a testMode-blind replay would silently drop (it would come back
    // `blocked`, leaving testNextReaction unset, instead of arming it).
    await as.mutation(api.game.applyAction, { id, action: { type: "testForceReaction", outcome: "friendly" } });
    const code = await as.mutation(api.game.save, { id });

    const log = await as.query(api.game.log, { id });
    expect(log?.game.testMode).toBe(true);
    const bundle = await as.query(api.game.replayByCode, { code });
    expect(bundle?.game.testMode).toBe(true);

    const frames = replay(log!.game.seed!, log!.game.picks!, log!.moves.map((m) => m.action), log!.game.variants, log!.game.testMode);
    const game = await as.query(api.game.get, { id });
    // The real regression: without threading testMode into newGame, the replayed testForceReaction
    // comes back `blocked` and testNextReaction never arms, diverging from the persisted state.
    expect(frames[frames.length - 1]!.state).toEqual(game?.state);
    expect((game?.state as { testNextReaction?: string }).testNextReaction).toBe("friendly");
  });

  test("bundle.game.testMode is undefined for an ordinary (non-test) game", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
    const code = await as.mutation(api.game.save, { id });
    const log = await as.query(api.game.log, { id });
    expect(log?.game.testMode).toBeUndefined();
    const bundle = await as.query(api.game.replayByCode, { code });
    expect(bundle?.game.testMode).toBeUndefined();
  });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import * as highScores from "./highScores";

const modules = import.meta.glob("./**/*.*s");

// A signed-in anonymous player, as in game.test.ts (not imported from it, which would run that whole file again).
async function asUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return t.withIdentity({ subject: `${userId}|session` });
}
// A finished game that escaped (exit at the gateway), ready to be recorded.
async function escapedGame(as: Awaited<ReturnType<typeof asUser>>): Promise<Id<"games">> {
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  await as.mutation(api.game.applyAction, { id, action: { type: "exitCave" } });
  return id;
}

// The Claude Messages API, answered with `text`.
const claude = (text: string, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } }), { status }));

const rows = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("highScores").collect());

describe("highScores.submit: names are screened before they reach the board", () => {
  let key: string | undefined;
  beforeEach(() => { key = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = "test-key"; });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
  });

  test("a name the model passes is recorded", async () => {
    vi.stubGlobal("fetch", claude('{"ok":true}'));
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    const res = await as.action(api.highScores.submit, { gameId, name: "  Gandalf  " });
    expect(res.ok).toBe(true);
    expect((await rows(t)).map((r) => r.name)).toEqual(["Gandalf"]);
  });

  test("a flagged name saves nothing and comes back with a reason; another name can then be offered", async () => {
    const fetchMock = claude('{"ok":false}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    const refused = await as.action(api.highScores.submit, { gameId, name: "Something Rude" });
    expect(refused).toEqual({ ok: false, reason: expect.stringMatching(/can't be used/i) });
    expect(await rows(t)).toEqual([]);
    vi.stubGlobal("fetch", claude('{"ok":true}'));
    expect((await as.action(api.highScores.submit, { gameId, name: "Gandalf" })).ok).toBe(true);
    expect((await rows(t)).map((r) => r.name)).toEqual(["Gandalf"]);
  });

  test("a model that is down or answers oddly saves nothing and asks to try again", async () => {
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    vi.stubGlobal("fetch", claude("overloaded", 529));
    expect(await as.action(api.highScores.submit, { gameId, name: "Gandalf" })).toEqual({ ok: false, reason: expect.stringMatching(/try again/i) });
    vi.stubGlobal("fetch", claude("Looks fine!"));
    expect(await as.action(api.highScores.submit, { gameId, name: "Gandalf" })).toEqual({ ok: false, reason: expect.stringMatching(/try again/i) });
    expect(await rows(t)).toEqual([]);
  });

  test("a web address, email address or phone number is refused without a model call", async () => {
    const fetchMock = claude('{"ok":true}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    for (const name of ["buy at example.com", "me@example.org", "07700 900123"]) {
      expect(await as.action(api.highScores.submit, { gameId, name })).toEqual({ ok: false, reason: expect.stringMatching(/web address/i) });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rows(t)).toEqual([]);
  });

  test("an empty name is recorded as Anonymous with nothing to screen", async () => {
    const fetchMock = claude('{"ok":false}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    expect((await as.action(api.highScores.submit, { gameId, name: "   " })).ok).toBe(true);
    expect((await rows(t)).map((r) => r.name)).toEqual(["Anonymous"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("with no API key configured the local check still applies and ordinary names are recorded", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = claude('{"ok":false}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    expect((await as.action(api.highScores.submit, { gameId, name: "me@example.org" })).ok).toBe(false);
    expect((await as.action(api.highScores.submit, { gameId, name: "Gandalf" })).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a score already recorded is returned as it is, with no second model call", async () => {
    const fetchMock = claude('{"ok":true}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    const first = await as.action(api.highScores.submit, { gameId, name: "Gandalf" });
    const again = await as.action(api.highScores.submit, { gameId, name: "Somebody Else" });
    expect(again).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await rows(t)).map((r) => r.name)).toEqual(["Gandalf"]);
  });

  test("only so many names can be tried for one game", async () => {
    const fetchMock = claude('{"ok":false}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const gameId = await escapedGame(as);
    for (let i = 0; i < 10; i++) await as.action(api.highScores.submit, { gameId, name: `Try ${i}` });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(await as.action(api.highScores.submit, { gameId, name: "One more" })).toEqual({ ok: false, reason: expect.stringMatching(/as many names/i) });
    expect(fetchMock).toHaveBeenCalledTimes(10); // the eleventh costs nothing
    // A name that needs no screening can still be recorded.
    expect((await as.action(api.highScores.submit, { gameId, name: " " })).ok).toBe(true);
  });

  test("it keeps save's rules: you must be signed in, own the game, and the game must be an escape", async () => {
    vi.stubGlobal("fetch", claude('{"ok":true}'));
    const t = convexTest(schema, modules);
    const owner = await asUser(t);
    const gameId = await escapedGame(owner);
    await expect(t.action(api.highScores.submit, { gameId, name: "Gandalf" })).rejects.toThrow(/Unauthenticated/);
    const other = await asUser(t);
    await expect(other.action(api.highScores.submit, { gameId, name: "Gandalf" })).rejects.toThrow(/Forbidden/);
    const running = await owner.mutation(api.game.newGame, { seed: 2, picks: [0] });
    await expect(owner.action(api.highScores.submit, { gameId: running, name: "Gandalf" })).rejects.toThrow(/not finished/);
    const dead = await owner.mutation(api.game.newGame, { seed: 3, picks: [0] });
    await owner.mutation(api.game.applyAction, { id: dead, action: { type: "quit" } });
    await expect(owner.action(api.highScores.submit, { gameId: dead, name: "Gandalf" })).rejects.toThrow(/escapes/);
    expect(await rows(t)).toEqual([]);
  });

  test("a request that could not be saved never costs a model call", async () => {
    const fetchMock = claude('{"ok":true}');
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const as = await asUser(t);
    const running = await as.mutation(api.game.newGame, { seed: 2, picks: [0] });
    await expect(as.action(api.highScores.submit, { gameId: running, name: "Gandalf" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("there is no public way to the board that skips the check: save is internal, submit is the public door", () => {
    const visibility = (fn: unknown) => fn as { isInternal?: boolean; isPublic?: boolean };
    expect(visibility(highScores.save).isInternal).toBe(true);
    expect(visibility(highScores.save).isPublic).toBeUndefined();
    expect(visibility(highScores.submit).isPublic).toBe(true);
    expect(visibility(highScores.canSave).isInternal).toBe(true);
    expect(visibility(highScores.noteAttempt).isInternal).toBe(true);
  });
});

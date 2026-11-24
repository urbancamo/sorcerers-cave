import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import * as multiplayer from "./multiplayer";

const modules = import.meta.glob("./**/*.*s");

async function asUser(t: ReturnType<typeof convexTest>, roles?: ("SYSTEM")[]) {
  const userId = await t.run((ctx) => ctx.db.insert("users", roles ? { roles } : {}));
  return t.withIdentity({ subject: `${userId}|session` });
}
// The Claude Messages API, answered with `text`.
const claude = (text: string, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } }), { status }));
const seats = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("players").collect());
const games = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("games").collect());

let key: string | undefined;
beforeEach(() => { key = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = "test-key"; });
afterEach(() => {
  vi.unstubAllGlobals();
  if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
});

describe("createMultiplayer screens the party name", () => {
  test("a name the model passes creates the game", async () => {
    vi.stubGlobal("fetch", claude('{"ok":true}'));
    const t = convexTest(schema, modules);
    const host = await asUser(t);
    const { gameId, code } = await host.action(api.multiplayer.createMultiplayer, { partyName: "  The Bold  ", color: "green" });
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect((await seats(t)).map((p) => [p.gameId, p.partyName])).toEqual([[gameId, "The Bold"]]);
  });

  test("a flagged name is refused with a message, and no game or seat is created", async () => {
    vi.stubGlobal("fetch", claude('{"ok":false}'));
    const t = convexTest(schema, modules);
    const host = await asUser(t);
    await expect(host.action(api.multiplayer.createMultiplayer, { partyName: "Something Rude", color: "green" })).rejects.toThrow(/can't be used/);
    expect(await games(t)).toEqual([]);
    expect(await seats(t)).toEqual([]);
  });

  test("a web address is refused without a model call; a model that fails saves nothing", async () => {
    const f = claude('{"ok":true}');
    vi.stubGlobal("fetch", f);
    const t = convexTest(schema, modules);
    const host = await asUser(t);
    await expect(host.action(api.multiplayer.createMultiplayer, { partyName: "visit example.com", color: "green" })).rejects.toThrow(/web address/);
    expect(f).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", claude("overloaded", 529));
    await expect(host.action(api.multiplayer.createMultiplayer, { partyName: "The Bold", color: "green" })).rejects.toThrow(/try again/i);
    expect(await games(t)).toEqual([]);
  });

  test("with no API key only the local check applies", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const f = claude('{"ok":false}');
    vi.stubGlobal("fetch", f);
    const t = convexTest(schema, modules);
    const host = await asUser(t);
    await host.action(api.multiplayer.createMultiplayer, { partyName: "The Bold", color: "green" });
    await expect(host.action(api.multiplayer.createMultiplayer, { partyName: "me@example.org", color: "blue" })).rejects.toThrow(/email/);
    expect(f).not.toHaveBeenCalled();
  });

  test("an empty name is refused by the game's own rule, with nothing to screen", async () => {
    const f = claude('{"ok":true}');
    vi.stubGlobal("fetch", f);
    const t = convexTest(schema, modules);
    const host = await asUser(t);
    await expect(host.action(api.multiplayer.createMultiplayer, { partyName: "   ", color: "green" })).rejects.toThrow(/Party name is required/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("joinByCode screens the party name only when the join would succeed", () => {
  async function lobby(t: ReturnType<typeof convexTest>) {
    vi.stubGlobal("fetch", claude('{"ok":true}'));
    const host = await asUser(t);
    const { code } = await host.action(api.multiplayer.createMultiplayer, { partyName: "Host", color: "green" });
    return { host, code };
  }

  test("a passed name seats the player, and counts as one join attempt", async () => {
    const t = convexTest(schema, modules);
    const { code } = await lobby(t);
    const f = claude('{"ok":true}');
    vi.stubGlobal("fetch", f);
    const guest = await asUser(t);
    expect(await guest.action(api.multiplayer.joinByCode, { code, partyName: "Guest", color: "blue" })).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    expect((await seats(t)).map((p) => p.partyName).sort()).toEqual(["Guest", "Host"]);
    const hits = await t.run((ctx) => ctx.db.query("rateLimitHits").collect());
    expect(hits.filter((h) => h.key.startsWith("joinAttempt:")).map((h) => h.count)).toEqual([1]);
  });

  test("a flagged name is refused with the message and the player is not seated", async () => {
    const t = convexTest(schema, modules);
    const { code } = await lobby(t);
    vi.stubGlobal("fetch", claude('{"ok":false}'));
    const guest = await asUser(t);
    expect(await guest.action(api.multiplayer.joinByCode, { code, partyName: "Rude", color: "blue" })).toEqual({
      ok: false, reason: "name_rejected", message: expect.stringMatching(/can't be used/),
    });
    expect((await seats(t)).map((p) => p.partyName)).toEqual(["Host"]);
  });

  test("no model call for a wrong code, a taken name, a taken colour, or a rejoin", async () => {
    const t = convexTest(schema, modules);
    const { host, code } = await lobby(t);
    const f = claude('{"ok":false}');
    vi.stubGlobal("fetch", f);
    const guest = await asUser(t);
    expect(await guest.action(api.multiplayer.joinByCode, { code: "ZZZZ", partyName: "Guest", color: "blue" })).toEqual({ ok: false, reason: "not_found" });
    expect(await guest.action(api.multiplayer.joinByCode, { code, partyName: "host", color: "blue" })).toEqual({ ok: false, reason: "name_taken" });
    expect(await guest.action(api.multiplayer.joinByCode, { code, partyName: "Guest", color: "green" })).toEqual({ ok: false, reason: "color_taken" });
    expect(await host.action(api.multiplayer.joinByCode, { code, partyName: "Whatever", color: "red" })).toMatchObject({ ok: true }); // already seated
    expect(f).not.toHaveBeenCalled();
  });

  test("a model failure while joining is a message to try again, not a seat", async () => {
    const t = convexTest(schema, modules);
    const { code } = await lobby(t);
    vi.stubGlobal("fetch", claude("oops", 500));
    const guest = await asUser(t);
    expect(await guest.action(api.multiplayer.joinByCode, { code, partyName: "Guest", color: "blue" })).toMatchObject({ ok: false, reason: "name_rejected", message: expect.stringMatching(/try again/i) });
    expect(await seats(t)).toHaveLength(1);
  });
});

describe("setPartyName screens the new name", () => {
  test("passes and renames; a flagged name leaves the old one", async () => {
    const t = convexTest(schema, modules);
    vi.stubGlobal("fetch", claude('{"ok":true}'));
    const host = await asUser(t);
    const { gameId } = await host.action(api.multiplayer.createMultiplayer, { partyName: "Host", color: "green" });
    expect(await host.action(api.multiplayer.setPartyName, { gameId, partyName: "Hosts Reborn" })).toEqual({ ok: true });
    expect((await seats(t))[0]!.partyName).toBe("Hosts Reborn");
    vi.stubGlobal("fetch", claude('{"ok":false}'));
    expect(await host.action(api.multiplayer.setPartyName, { gameId, partyName: "Rude" })).toMatchObject({ ok: false, reason: "name_rejected" });
    expect((await seats(t))[0]!.partyName).toBe("Hosts Reborn");
  });
});

describe("the cap on names tried, and the doors that skip screening", () => {
  test("a player can only have so many party names checked in a period", async () => {
    const t = convexTest(schema, modules);
    const admin = await asUser(t, ["SYSTEM"]);
    await admin.mutation(api.settings.setRateLimits, { limits: [{ name: "partyNameCheck", max: 1, windowSec: 3600 }] });
    const f = claude('{"ok":true}');
    vi.stubGlobal("fetch", f);
    const host = await asUser(t);
    const { gameId } = await host.action(api.multiplayer.createMultiplayer, { partyName: "Host", color: "green" });
    expect(await host.action(api.multiplayer.setPartyName, { gameId, partyName: "Another" })).toMatchObject({ ok: false, reason: "name_rejected", message: expect.stringMatching(/Too many party names/) });
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("the functions that write the name without screening are internal", () => {
    const vis = (fn: unknown) => fn as { isInternal?: boolean; isPublic?: boolean };
    for (const fn of [multiplayer.createGameRow, multiplayer.joinSeat, multiplayer.renamePartyRow]) {
      expect(vis(fn).isInternal).toBe(true);
      expect(vis(fn).isPublic).toBeUndefined();
    }
    for (const fn of [multiplayer.createMultiplayer, multiplayer.joinByCode, multiplayer.setPartyName]) expect(vis(fn).isPublic).toBe(true);
  });
});

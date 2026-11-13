import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asUser } from "./game.test";
import { hashToken } from "./inviteToken";

const modules = import.meta.glob("./**/*.*s");

// A login account as the Password provider leaves it: a user whose username is in `email`, with an account, a session and a refresh token.
async function loginUser(t: ReturnType<typeof convexTest>, username: string, roles: ("SYSTEM" | "USER" | "ANALYTICS" | "TEST")[]) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: username, roles });
    await ctx.db.insert("authAccounts", { userId, provider: "password", providerAccountId: username, secret: "hash" });
    const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 1e6 });
    await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 1e6 });
    return { userId, sessionId };
  });
}
const as = async (t: ReturnType<typeof convexTest>, roles: ("SYSTEM" | "USER" | "ANALYTICS" | "TEST")[]) => asUser(t, roles);

describe("role gating", () => {
  test.each([["signed out", undefined, "Unauthenticated"], ["a player", [], "Forbidden"], ["an ANALYTICS admin", ["ANALYTICS"], "Forbidden"]] as const)(
    "%s is refused every user-administration call", async (_w, roles, msg) => {
      const t = convexTest(schema, modules);
      const caller = roles ? (await asUser(t, [...roles])).as : t;
      const { userId } = await loginUser(t, "other", ["TEST"]);
      const inviteId = await t.run((ctx) => ctx.db.insert("invites", { username: "p", roles: ["TEST"], tokenHash: "h", expiresAt: 1, createdAt: 1, createdBy: userId }));
      await expect(caller.query(api.adminUsers.list, {})).rejects.toThrow(msg);
      await expect(caller.mutation(api.adminUsers.create, { username: "newbie", roles: ["TEST"] })).rejects.toThrow(msg);
      await expect(caller.mutation(api.adminUsers.reissue, { inviteId })).rejects.toThrow(msg);
      await expect(caller.mutation(api.adminUsers.removeInvite, { inviteId })).rejects.toThrow(msg);
      await expect(caller.mutation(api.adminUsers.setRoles, { userId, roles: ["TEST"] })).rejects.toThrow(msg);
      await expect(caller.mutation(api.adminUsers.remove, { userId })).rejects.toThrow(msg);
    });
});

describe("list", () => {
  test("shows password users and pending invites, not anonymous players", async () => {
    const t = convexTest(schema, modules);
    const me = await as(t, ["USER"]);
    await t.run((ctx) => ctx.db.patch(me.userId, { email: "boss" }));
    await loginUser(t, "tess", ["TEST"]);
    await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
    await me.as.mutation(api.adminUsers.create, { username: "newbie", roles: ["ANALYTICS"] });
    const l = await me.as.query(api.adminUsers.list, {});
    expect(l.users.map((u) => u.username).sort()).toEqual(["boss", "tess"]);
    expect(l.users.find((u) => u.username === "tess")?.roles).toEqual(["TEST"]);
    expect(l.pending).toHaveLength(1);
    expect(l.pending[0]).toMatchObject({ username: "newbie", roles: ["ANALYTICS"] });
    expect(l.pending[0]).not.toHaveProperty("tokenHash");
  });
});

describe("create", () => {
  test("records the invite with a 7-day expiry and returns a UUID token that is stored only as a hash", async () => {
    const t = convexTest(schema, modules);
    const { as: admin, userId } = await as(t, ["USER"]);
    const before = Date.now();
    const { token, expiresAt } = await admin.mutation(api.adminUsers.create, { username: "  Newbie ", roles: ["TEST", "ANALYTICS", "TEST"] });
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(expiresAt - before).toBeGreaterThanOrEqual(7 * 86_400_000);
    const rows = await t.run((ctx) => ctx.db.query("invites").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: "newbie", roles: ["ANALYTICS", "TEST"], createdBy: userId, tokenHash: await hashToken(token) });
    expect(JSON.stringify(rows[0])).not.toContain(token);
  });

  test.each(["ab", "has space", "bad!char", "-leading", "x".repeat(41)])("rejects the username %j", async (name) => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    await expect(admin.mutation(api.adminUsers.create, { username: name, roles: ["TEST"] })).rejects.toThrow("username");
  });

  test("needs at least one role", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    await expect(admin.mutation(api.adminUsers.create, { username: "newbie", roles: [] })).rejects.toThrow("at least one role");
  });

  test("a username already used by a user or a pending invite is refused", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    await loginUser(t, "tess", ["TEST"]);
    await expect(admin.mutation(api.adminUsers.create, { username: "Tess", roles: ["TEST"] })).rejects.toThrow("already taken");
    await admin.mutation(api.adminUsers.create, { username: "newbie", roles: ["TEST"] });
    await expect(admin.mutation(api.adminUsers.create, { username: "newbie", roles: ["TEST"] })).rejects.toThrow("already taken");
  });

  test("only a SYSTEM user can invite someone with SYSTEM", async () => {
    const t = convexTest(schema, modules);
    const userAdmin = await as(t, ["USER"]);
    await expect(userAdmin.as.mutation(api.adminUsers.create, { username: "boss2", roles: ["SYSTEM"] })).rejects.toThrow("only a SYSTEM user");
    const sys = await as(t, ["SYSTEM"]);
    await expect(sys.as.mutation(api.adminUsers.create, { username: "boss2", roles: ["SYSTEM"] })).resolves.toBeDefined();
  });
});

describe("reissue and removeInvite", () => {
  test("reissue makes a new link and the old one stops working", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    const first = await admin.mutation(api.adminUsers.create, { username: "newbie", roles: ["TEST"] });
    const inviteId = (await admin.query(api.adminUsers.list, {})).pending[0]!.id;
    const second = await admin.mutation(api.adminUsers.reissue, { inviteId });
    expect(second.token).not.toBe(first.token);
    expect(await t.query(api.invites.check, { token: first.token })).toBeNull();
    expect(await t.query(api.invites.check, { token: second.token })).toEqual({ username: "newbie" });
  });

  test("removing an invite kills its link", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    const { token } = await admin.mutation(api.adminUsers.create, { username: "newbie", roles: ["TEST"] });
    await admin.mutation(api.adminUsers.removeInvite, { inviteId: (await admin.query(api.adminUsers.list, {})).pending[0]!.id });
    expect(await t.query(api.invites.check, { token })).toBeNull();
    expect((await admin.query(api.adminUsers.list, {})).pending).toEqual([]);
  });

  test("a USER admin cannot reissue or remove an invite for a SYSTEM user", async () => {
    const t = convexTest(schema, modules);
    const sys = await as(t, ["SYSTEM"]);
    await sys.as.mutation(api.adminUsers.create, { username: "boss2", roles: ["SYSTEM"] });
    const inviteId = (await sys.as.query(api.adminUsers.list, {})).pending[0]!.id;
    const lesser = await as(t, ["USER"]);
    await expect(lesser.as.mutation(api.adminUsers.reissue, { inviteId })).rejects.toThrow("only a SYSTEM user");
    await expect(lesser.as.mutation(api.adminUsers.removeInvite, { inviteId })).rejects.toThrow("only a SYSTEM user");
  });
});

describe("setRoles", () => {
  test("replaces a user's roles", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    const { userId } = await loginUser(t, "tess", ["TEST"]);
    await admin.mutation(api.adminUsers.setRoles, { userId, roles: ["ANALYTICS", "TEST"] });
    expect((await t.run((ctx) => ctx.db.get(userId)))?.roles).toEqual(["ANALYTICS", "TEST"]); // in the canonical order
  });
  test("you cannot change your own roles", async () => {
    const t = convexTest(schema, modules);
    const me = await as(t, ["USER"]);
    await t.run((ctx) => ctx.db.patch(me.userId, { email: "boss" }));
    await expect(me.as.mutation(api.adminUsers.setRoles, { userId: me.userId, roles: ["SYSTEM"] })).rejects.toThrow("your own roles");
  });
  test("a USER admin cannot grant SYSTEM, nor change a SYSTEM user's roles", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    const tess = await loginUser(t, "tess", ["TEST"]);
    const root = await loginUser(t, "root", ["SYSTEM"]);
    await expect(admin.mutation(api.adminUsers.setRoles, { userId: tess.userId, roles: ["SYSTEM"] })).rejects.toThrow("only a SYSTEM user");
    await expect(admin.mutation(api.adminUsers.setRoles, { userId: root.userId, roles: ["TEST"] })).rejects.toThrow("only a SYSTEM user");
  });
  test("a SYSTEM user can grant and remove SYSTEM", async () => {
    const t = convexTest(schema, modules);
    const { as: sys } = await as(t, ["SYSTEM"]);
    const tess = await loginUser(t, "tess", ["TEST"]);
    await sys.mutation(api.adminUsers.setRoles, { userId: tess.userId, roles: ["SYSTEM"] });
    expect((await t.run((ctx) => ctx.db.get(tess.userId)))?.roles).toEqual(["SYSTEM"]);
    await sys.mutation(api.adminUsers.setRoles, { userId: tess.userId, roles: ["TEST"] });
    expect((await t.run((ctx) => ctx.db.get(tess.userId)))?.roles).toEqual(["TEST"]);
  });
  test("an anonymous player is not an administrable user", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    const player = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
    await expect(admin.mutation(api.adminUsers.setRoles, { userId: player, roles: ["TEST"] })).rejects.toThrow("No such user");
    await expect(admin.mutation(api.adminUsers.remove, { userId: player })).rejects.toThrow("No such user");
  });
});

describe("remove", () => {
  test("deletes the login completely but keeps their games and stats", async () => {
    const t = convexTest(schema, modules);
    const { as: admin } = await as(t, ["USER"]);
    const tess = await loginUser(t, "tess", ["TEST"]);
    const gameId = await t.run(async (ctx) => {
      const g = await ctx.db.insert("games", { ownerId: tess.userId, state: {}, status: "finished", createdAt: 0, updatedAt: 0 });
      await ctx.db.insert("gameStats", { gameId: g, seat: 0, mode: "solo", outcome: "quit", score: 0, turn: 1, deepestLevel: 1, areas: 1, dragonKills: 0, membersLost: 0, partySize: 1, extensionKit: false, sibyl: false, finishedAt: 1 });
      return g;
    });
    await admin.mutation(api.adminUsers.remove, { userId: tess.userId });
    const left = await t.run(async (ctx) => ({
      user: await ctx.db.get(tess.userId),
      accounts: (await ctx.db.query("authAccounts").collect()).length,
      sessions: (await ctx.db.query("authSessions").collect()).length,
      tokens: (await ctx.db.query("authRefreshTokens").collect()).length,
      game: await ctx.db.get(gameId),
      stats: (await ctx.db.query("gameStats").collect()).length,
    }));
    expect(left).toMatchObject({ user: null, accounts: 0, sessions: 0, tokens: 0, stats: 1 });
    expect(left.game).not.toBeNull();
  });
  test("you cannot delete yourself", async () => {
    const t = convexTest(schema, modules);
    const me = await as(t, ["USER"]);
    await t.run((ctx) => ctx.db.patch(me.userId, { email: "boss" }));
    await expect(me.as.mutation(api.adminUsers.remove, { userId: me.userId })).rejects.toThrow("your own account");
  });
  test("a USER admin cannot delete a SYSTEM user; a SYSTEM user can", async () => {
    const t = convexTest(schema, modules);
    const root = await loginUser(t, "root", ["SYSTEM"]);
    const { as: admin } = await as(t, ["USER"]);
    await expect(admin.mutation(api.adminUsers.remove, { userId: root.userId })).rejects.toThrow("only a SYSTEM user");
    const { as: sys } = await as(t, ["SYSTEM"]);
    await expect(sys.mutation(api.adminUsers.remove, { userId: root.userId })).resolves.toBeNull();
  });
});

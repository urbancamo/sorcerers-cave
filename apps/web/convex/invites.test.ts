import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { asUser } from "./game.test";
import { hashToken } from "./inviteToken";

const modules = import.meta.glob("./**/*.*s");

async function invited(t: ReturnType<typeof convexTest>, username = "newbie", roles: ("USER" | "ANALYTICS" | "TEST")[] = ["ANALYTICS", "TEST"]) {
  const { as } = await asUser(t, ["USER"]);
  return (await as.mutation(api.adminUsers.create, { username, roles })).token;
}

describe("check", () => {
  test("names who the link is for, with no sign-in", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.invites.check, { token: await invited(t) })).toEqual({ username: "newbie" });
  });
  test("an unknown, expired or absurd token gives null", async () => {
    const t = convexTest(schema, modules);
    const token = await invited(t);
    expect(await t.query(api.invites.check, { token: "00000000-0000-4000-8000-000000000000" })).toBeNull();
    expect(await t.query(api.invites.check, { token: "x".repeat(500) })).toBeNull();
    await t.run(async (ctx) => { const i = await ctx.db.query("invites").first(); await ctx.db.patch(i!._id, { expiresAt: Date.now() - 1 }); });
    expect(await t.query(api.invites.check, { token })).toBeNull();
  });
});

describe("redeem", () => {
  test("creates the login with the invited roles, uses up the link, and signs nobody in", async () => {
    const t = convexTest(schema, modules);
    const token = await invited(t);
    expect(await t.action(api.invites.redeem, { token, password: "a-long-password" })).toEqual({ username: "newbie" });
    const made = await t.run(async (ctx) => ({
      user: await ctx.db.query("users").withIndex("email", (q) => q.eq("email", "newbie")).first(),
      accounts: await ctx.db.query("authAccounts").collect(),
      invites: await ctx.db.query("invites").collect(),
      sessions: await ctx.db.query("authSessions").collect(),
    }));
    expect(made.user?.roles).toEqual(["ANALYTICS", "TEST"]);
    expect(made.accounts).toHaveLength(1);
    expect(made.accounts[0]).toMatchObject({ provider: "password", providerAccountId: "newbie", userId: made.user!._id });
    expect(made.accounts[0]!.secret).not.toContain("a-long-password"); // hashed
    expect(made.invites).toEqual([]);
    expect(made.sessions).toEqual([]);
    await expect(t.action(api.invites.redeem, { token, password: "another-password" })).rejects.toThrow("invalid or has expired");
  });

  test("a too-short password is refused and the link still works", async () => {
    const t = convexTest(schema, modules);
    const token = await invited(t);
    await expect(t.action(api.invites.redeem, { token, password: "short" })).rejects.toThrow("at least 10");
    expect(await t.query(api.invites.check, { token })).toEqual({ username: "newbie" });
  });

  test("an unknown or expired link is refused", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.invites.redeem, { token: "00000000-0000-4000-8000-000000000000", password: "a-long-password" })).rejects.toThrow("invalid or has expired");
    const token = await invited(t);
    await t.run(async (ctx) => { const i = await ctx.db.query("invites").first(); await ctx.db.patch(i!._id, { expiresAt: Date.now() - 1 }); });
    await expect(t.action(api.invites.redeem, { token, password: "a-long-password" })).rejects.toThrow("invalid or has expired");
    expect(await t.run((ctx) => ctx.db.query("users").withIndex("email", (q) => q.eq("email", "newbie")).first())).toBeNull();
  });

  test("the token is not what is stored: hashing is one-way and exact", async () => {
    expect(await hashToken("a")).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("a")).not.toBe(await hashToken("b"));
  });
});

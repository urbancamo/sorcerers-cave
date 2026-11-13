import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { hasRole } from "./roles";
import { passwordProfile } from "./auth";
import { asUser } from "./game.test";

const modules = import.meta.glob("./**/*.*s");

describe("hasRole", () => {
  test("no user, no roles field and an empty set hold nothing", () => {
    expect(hasRole(null, "TEST")).toBe(false);
    expect(hasRole({}, "TEST")).toBe(false);
    expect(hasRole({ roles: [] }, "ANALYTICS")).toBe(false);
  });
  test("a role grants only itself", () => {
    expect(hasRole({ roles: ["ANALYTICS"] }, "ANALYTICS")).toBe(true);
    expect(hasRole({ roles: ["ANALYTICS"] }, "TEST")).toBe(false);
  });
  test("SYSTEM implies every role", () => {
    for (const r of ["SYSTEM", "USER", "ANALYTICS", "TEST"] as const) expect(hasRole({ roles: ["SYSTEM"] }, r)).toBe(true);
  });
});

describe("roles.me", () => {
  test("signed out ⇒ no roles", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.roles.me, {})).toEqual({ roles: [], username: null, userId: null });
  });
  test("an anonymous player has no roles", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    expect((await as.query(api.roles.me, {})).roles).toEqual([]);
  });
  test("reports held roles, and SYSTEM expands to all four", async () => {
    const t = convexTest(schema, modules);
    const a = await asUser(t, ["ANALYTICS"]);
    expect((await a.as.query(api.roles.me, {})).roles).toEqual(["ANALYTICS"]);
    const s = await asUser(t, ["SYSTEM"]);
    expect((await s.as.query(api.roles.me, {})).roles).toEqual(["SYSTEM", "USER", "ANALYTICS", "TEST"]);
  });
});

describe("admin.setRoles (internal seed helper)", () => {
  test("replaces the role set, de-duplicated", async () => {
    const t = convexTest(schema, modules);
    const { userId, as } = await asUser(t);
    await t.mutation(internal.admin.setRoles, { userId, roles: ["TEST", "TEST", "ANALYTICS"] });
    expect((await as.query(api.roles.me, {})).roles).toEqual(["ANALYTICS", "TEST"]);
  });
});

// Real password sign-in mints JWTs, which convex-test cannot do, so the provider's `profile` gate is tested directly.
describe("passwordProfile (the sign-up gate)", () => {
  test("signIn normalises the username into the account id", () => {
    expect(passwordProfile({ flow: "signIn", email: "  Mark " })).toEqual({ email: "mark" });
  });
  test.each(["signUp", "reset", "reset-verification", "email-verification", undefined])("flow %s is refused", (flow) => {
    expect(() => passwordProfile({ flow, email: "mark", password: "x" })).toThrow("Invalid credentials");
  });
  test("a missing or blank username is refused", () => {
    expect(() => passwordProfile({ flow: "signIn" })).toThrow();
    expect(() => passwordProfile({ flow: "signIn", email: "  " })).toThrow();
  });
  test("roles in the params are ignored (no escalation through sign-in)", () => {
    expect(passwordProfile({ flow: "signIn", email: "x", roles: ["SYSTEM"] })).toEqual({ email: "x" });
  });
});

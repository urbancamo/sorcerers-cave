import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeUsername } from "./auth";
import { roleValidator } from "./schema";

/**
 * Create (or re-confirm) an admin account. Run from the CLI only, e.g.
 *   npx convex run admin:seedUser '{"username":"mark","password":"…","roles":["SYSTEM"]}'   (add --prod)
 * Internal, so no client can call it: public sign-up is closed (auth.ts), and this is the only path that
 * writes `users.roles`. Idempotent: an existing account with the same password is returned unchanged.
 */
export const seedUser = internalAction({
  args: { username: v.string(), password: v.string(), roles: v.array(roleValidator) },
  handler: async (ctx, { username, password, roles }) => {
    const name = normalizeUsername(username);
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: name, secret: password },
      profile: { email: name, roles },
    });
    // createAccount keeps the existing profile on a repeat run, so set the roles explicitly.
    await ctx.runMutation(internal.admin.setRoles, { userId: user._id, roles });
    return { userId: user._id, username: name, roles };
  },
});

export const setRoles = internalMutation({
  args: { userId: v.id("users"), roles: v.array(roleValidator) },
  handler: async (ctx, { userId, roles }) => {
    await ctx.db.patch(userId, { roles: [...new Set(roles)] });
  },
});

/** Change an admin's password from the CLI (there is no in-app password change). */
export const setPassword = internalAction({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: normalizeUsername(username), secret: password },
    });
    return null;
  },
});

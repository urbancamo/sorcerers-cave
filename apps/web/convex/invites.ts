import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashToken } from "./inviteToken";
import { validatePassword } from "./passwords";
import { roleValidator } from "./schema";

// The invited user's side: open the link, see who it is for, choose a password. Deliberately public (the person has no login yet);
// what protects it is the token, an unguessable UUID that is single-use, expires, and is stored only as a hash.

const BAD_LINK = "This link is invalid or has expired. Ask for a new one.";
const tooLong = (token: string) => token.length > 64;

/** Who a link is for, or null when it is unknown or has expired. */
export const check = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (tooLong(token)) return null;
    const hash = await hashToken(token);
    const invite = await ctx.db.query("invites").withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash)).first();
    return invite && invite.expiresAt > Date.now() ? { username: invite.username } : null;
  },
});

/** Use up the invite for this token, atomically, so a link works once. Null when unknown or expired. */
export const claim = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const invite = await ctx.db.query("invites").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).first();
    if (!invite || invite.expiresAt <= Date.now()) return null;
    await ctx.db.delete(invite._id);
    return { username: invite.username, roles: invite.roles, expiresAt: invite.expiresAt, createdAt: invite.createdAt, createdBy: invite.createdBy };
  },
});

/** Put a claimed invite back (the account could not be created), so the link still works. */
export const restore = internalMutation({
  args: { tokenHash: v.string(), username: v.string(), roles: v.array(roleValidator), expiresAt: v.number(), createdAt: v.number(), createdBy: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.insert("invites", args);
    return null;
  },
});

/** Set the password for an invited user: creates their login, with the roles they were invited with. They sign in afterwards. */
export const redeem = action({
  args: { token: v.string(), password: v.string() },
  handler: async (ctx, { token, password }): Promise<{ username: string }> => {
    validatePassword(password); // before the link is used up, so a too-short password can be corrected
    if (tooLong(token)) throw new Error(BAD_LINK);
    const tokenHash = await hashToken(token);
    const invite = await ctx.runMutation(internal.invites.claim, { tokenHash });
    if (!invite) throw new Error(BAD_LINK);
    try {
      await createAccount(ctx, {
        provider: "password",
        account: { id: invite.username, secret: password },
        profile: { email: invite.username, roles: invite.roles },
      });
    } catch (e) {
      await ctx.runMutation(internal.invites.restore, { tokenHash, ...invite });
      throw e;
    }
    return { username: invite.username };
  },
});

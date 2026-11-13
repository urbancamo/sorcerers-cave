import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { hasRole, requireRole, type Role } from "./roles";
import { roleValidator } from "./schema";
import { hashToken, INVITE_TTL_MS, newToken } from "./inviteToken";
import { validateUsername } from "./passwords";

// User administration (the admin panel's Users tab). Every function needs the USER role (SYSTEM implies it). SYSTEM itself is
// guarded: only a SYSTEM user may grant it, remove it, or delete someone who holds it, so a USER admin cannot promote themselves.

const ROLE_ORDER: Role[] = ["SYSTEM", "USER", "ANALYTICS", "TEST"];

/** The roles as a set, in the canonical order, and at least one. */
function cleanRoles(roles: Role[]): Role[] {
  const set = ROLE_ORDER.filter((r) => roles.includes(r));
  if (!set.length) throw new Error("Choose at least one role.");
  return set;
}

async function caller(ctx: MutationCtx) {
  const id = await requireRole(ctx, "USER");
  return { id, isSystem: hasRole(await ctx.db.get(id), "SYSTEM") };
}

const needSystem = (touchesSystem: boolean, isSystem: boolean) => {
  if (touchesSystem && !isSystem) throw new Error("Forbidden: only a SYSTEM user can change who holds SYSTEM.");
};

/** A login account (a password user), not an anonymous player: only those are administered here. */
async function adminUser(ctx: MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user || !user.email) throw new Error("No such user.");
  return user;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "USER");
    // A password user has a username (stored in `email`); anonymous players have none and are not listed.
    const users = await ctx.db.query("users").withIndex("email", (q) => q.gt("email", "")).take(500);
    const invites = await ctx.db.query("invites").take(200);
    return {
      users: users.map((u) => ({ id: u._id, username: u.email!, roles: u.roles ?? [], createdAt: u._creationTime })),
      pending: invites.map((i) => ({ id: i._id, username: i.username, roles: i.roles, createdAt: i.createdAt, expiresAt: i.expiresAt })),
    };
  },
});

/** Invite a new user: records their username and roles and returns the one-time token for their set-password link. */
export const create = mutation({
  args: { username: v.string(), roles: v.array(roleValidator) },
  handler: async (ctx, { username, roles }) => {
    const me = await caller(ctx);
    const name = validateUsername(username);
    const set = cleanRoles(roles);
    needSystem(set.includes("SYSTEM"), me.isSystem);
    const taken = (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", name)).first())
      || (await ctx.db.query("invites").withIndex("by_username", (q) => q.eq("username", name)).first());
    if (taken) throw new Error("That username is already taken.");
    const token = newToken();
    const now = Date.now();
    await ctx.db.insert("invites", { username: name, roles: set, tokenHash: await hashToken(token), expiresAt: now + INVITE_TTL_MS, createdAt: now, createdBy: me.id });
    return { token, expiresAt: now + INVITE_TTL_MS };
  },
});

/** A new link for a pending user (the old one stops working), for when it expired or was lost. */
export const reissue = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const me = await caller(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite) throw new Error("No such invitation.");
    needSystem(invite.roles.includes("SYSTEM"), me.isSystem);
    const token = newToken();
    const expiresAt = Date.now() + INVITE_TTL_MS;
    await ctx.db.patch(inviteId, { tokenHash: await hashToken(token), expiresAt });
    return { token, expiresAt };
  },
});

export const removeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const me = await caller(ctx);
    const invite = await ctx.db.get(inviteId);
    if (!invite) return null;
    needSystem(invite.roles.includes("SYSTEM"), me.isSystem);
    await ctx.db.delete(inviteId);
    return null;
  },
});

/** Replace a user's roles. You cannot change your own, and SYSTEM can be granted or taken away only by a SYSTEM user. */
export const setRoles = mutation({
  args: { userId: v.id("users"), roles: v.array(roleValidator) },
  handler: async (ctx, { userId, roles }) => {
    const me = await caller(ctx);
    if (userId === me.id) throw new Error("You cannot change your own roles.");
    const target = await adminUser(ctx, userId);
    const set = cleanRoles(roles);
    needSystem(set.includes("SYSTEM") || (target.roles ?? []).includes("SYSTEM"), me.isSystem);
    await ctx.db.patch(userId, { roles: set });
    return null;
  },
});

/**
 * Delete a user's login: the account, its sessions and refresh tokens, and the user row, so they can no longer sign in. Their games and
 * recorded statistics are kept (the games simply have no owner who can open them), so analytics do not change.
 */
export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await caller(ctx);
    if (userId === me.id) throw new Error("You cannot delete your own account.");
    const target = await adminUser(ctx, userId);
    needSystem((target.roles ?? []).includes("SYSTEM"), me.isSystem);
    for (const s of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect()) {
      for (const t of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()) await ctx.db.delete(t._id);
      await ctx.db.delete(s._id);
    }
    for (const a of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect()) {
      for (const c of await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", a._id)).collect()) await ctx.db.delete(c._id);
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(userId);
    return null;
  },
});

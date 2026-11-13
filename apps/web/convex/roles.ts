import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type Role = "SYSTEM" | "USER" | "ANALYTICS" | "TEST";

/** True when the user holds `role`. SYSTEM implies every role. Anonymous players have no roles at all. */
export function hasRole(user: Pick<Doc<"users">, "roles"> | null | undefined, role: Role): boolean {
  const roles = user?.roles ?? [];
  return roles.includes("SYSTEM") || roles.includes(role);
}

/** The caller's user id, provided they hold `role`; throws "Unauthenticated" / "Forbidden" otherwise. */
export async function requireRole(ctx: QueryCtx | MutationCtx, role: Role): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");
  if (!hasRole(await ctx.db.get(userId), role)) throw new Error("Forbidden");
  return userId;
}

/** The roles the caller effectively holds (SYSTEM expands to all four); empty when signed out or anonymous. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    const all: Role[] = ["SYSTEM", "USER", "ANALYTICS", "TEST"];
    return { roles: all.filter((r) => hasRole(user, r)), username: user?.email ?? null, userId: user?._id ?? null };
  },
});

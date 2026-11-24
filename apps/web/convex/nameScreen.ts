import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { anthropicCall } from "./storyGen";
import { localProblem, moderateName, type NameVerdict } from "./nameCheck";

/**
 * Screen a party name (multiplayer) before it is stored: the local check, then a per-player cap on how many names can be tried (each one is
 * a model call), then Claude. With no `ANTHROPIC_API_KEY`, only the local check applies (see OPTIONS.md).
 */
export async function screenName(ctx: ActionCtx, userId: Id<"users">, name: string): Promise<NameVerdict> {
  const local = localProblem(name);
  if (local) return { ok: false, reason: local };
  const rate = await ctx.runMutation(internal.rateLimits.consume, { name: "partyNameCheck", subject: userId });
  if (!rate.ok) return { ok: false, reason: rate.message };
  return moderateName(process.env.ANTHROPIC_API_KEY ? anthropicCall : null, name, process.env.NAME_CHECK_MODEL || undefined);
}

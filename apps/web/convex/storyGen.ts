import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { replay, type GameAction } from "@sorcerers-cave/engine";
import { digestText, storyDigest } from "./storyDigest";
import { writeStory, type ModelCall } from "./storyWriter";

/** The Claude Messages API over `fetch` (no SDK needed). The key lives only in the Convex environment. */
export const anthropicCall: ModelCall = async ({ model, system, user, maxTokens }) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  if (j.stop_reason === "max_tokens") throw new Error(`the reply hit the ${maxTokens}-token limit and was cut off`);
  return {
    text: (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
    inputTokens: j.usage?.input_tokens ?? 0,
    outputTokens: j.usage?.output_tokens ?? 0,
  };
};

export type Trigger = "save" | "rewrite" | "retry";
export type GenerateResult = { ok: true } | { ok: false; reason: string };

/** Reasons that mean "stop everything" rather than "this story failed": a bulk rewrite halts on them. */
export const isBlockReason = (reason: string): boolean => /paused|cap reached/.test(reason);

/**
 * Write (or rewrite) the story for one high-score entry: replay the run, reduce it to the digest, run the two-pass writer, and
 * store the result with a record of every model call. Shared by the `generate` action and the rewrite batches.
 */
export async function generateStory(ctx: ActionCtx, highScoreId: Id<"highScores">, trigger: Trigger): Promise<GenerateResult> {
  const started = await ctx.runMutation(internal.stories.begin, { highScoreId, trigger });
  if (!started.ok) return { ok: false, reason: started.reason };
  const { storyId, prompt } = started;
  const fail = async (reason: string): Promise<GenerateResult> => {
    await ctx.runMutation(internal.stories.finish, { storyId, trigger, promptVersion: prompt.version, runs: [], result: { ok: false, reason } });
    return { ok: false, reason };
  };

  const input = await ctx.runQuery(internal.stories.replayInput, { highScoreId });
  if (!input) return fail("no replay data for this entry");
  let digest: string;
  try {
    digest = digestText(storyDigest(replay(input.seed, input.picks, input.actions as GameAction[], input.variants as never)));
  } catch (e) {
    return fail(`could not replay the run: ${e instanceof Error ? e.message.slice(0, 150) : "error"}`);
  }

  const r = await writeStory(anthropicCall, prompt, digest, Date.now, String(highScoreId));
  await ctx.runMutation(internal.stories.finish, {
    storyId, trigger, promptVersion: prompt.version, runs: r.runs,
    result: r.ok ? { ok: true, title: r.title, text: r.text, words: r.words, model: prompt.model } : { ok: false, reason: r.reason },
  });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

/**
 * Run one entry by hand with
 *   npx convex run storyGen:generate '{"highScoreId":"<id>","trigger":"retry"}'
 */
export const generate = internalAction({
  args: { highScoreId: v.id("highScores"), trigger: v.union(v.literal("save"), v.literal("rewrite"), v.literal("retry")) },
  handler: async (ctx, { highScoreId, trigger }): Promise<GenerateResult> => generateStory(ctx, highScoreId, trigger),
});

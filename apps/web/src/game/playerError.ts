import { ConvexError } from "convex/values";

/** The message to show a player for a failed server call: the text the server wrote for them (a ConvexError, as a rate limit throws), else `fallback`. */
export function playerError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  return e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback;
}

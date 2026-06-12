import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// convex-test needs every function module discoverable; this glob covers them.
const modules = import.meta.glob("./**/*.*s");

test("newGame creates a game that get returns", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.game.newGame, { seed: 123 });
  const game = await t.query(api.game.get, { id });
  expect(game?.status).toBe("active");
  expect(game?.state.seed).toBe(123);
});

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { newGame as createGameState } from "@sorcerers-cave/engine";

const modules = import.meta.glob("./**/*.*s");

test("newGame builds and persists a real engine GameState", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.game.newGame, { seed: 123, picks: [0] }); // Hero, cost 6
  const game = await t.query(api.game.get, { id });
  expect(game?.status).toBe("active");
  // The engine advances the seed through deck shuffles, so assert engine structure, not the input seed.
  expect(game?.state.phase).toBe("explore");
  expect(game?.state.turn).toBe(1);
  expect(game?.state.areas.length).toBe(1);        // the gateway
  expect(game?.state.party.map((m: { creatureId: number }) => m.creatureId)).toEqual([0]);
  // The server runs the SAME deterministic engine as the client.
  expect(game?.state).toEqual(createGameState(123, [0]));
});

test("newGame rejects an illegal party selection", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.game.newGame, { seed: 1, picks: [] })).rejects.toThrow();
  await expect(t.mutation(api.game.newGame, { seed: 1, picks: [8] })).rejects.toThrow(); // Wizard not selectable (cost null)
});

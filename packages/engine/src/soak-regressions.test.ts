import { describe, it, expect } from "vitest";
import { newGame } from "./index";
import { reduce } from "./reduce";
import { checkInvariants } from "./invariants";
import { GS_DEAD } from "./state";
import game from "./fixtures/soak-apprentice-last-member.json";
import type { GameAction } from "./actions";

/** Games found by the invariant soak, replayed from their action lists. Each must now end cleanly. */
describe("soak regressions", () => {
  it("2026-11-08: the Apprentice is the last living member when the party retreats after the Sorcerer's death — nobody is left, the game ends", () => {
    let s = newGame(game.seed, game.picks, game.variants as never);
    for (const a of game.actions as GameAction[]) {
      s = reduce(s, a).state;
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(s.gs).toBe(GS_DEAD);
    expect(s.phase).toBe("gameOver");
  });
});

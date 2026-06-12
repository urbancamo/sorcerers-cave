import { describe, it, expect } from "vitest";
import { legalActions } from "./selectors";
import { reduce } from "./reduce";
import { newGame } from "./setup";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP } from "./coords";
import { GS_QUIT } from "./state";
import { makeState } from "./testkit";

describe("legalActions (interactive contract)", () => {
  it("offers the Gateway's lateral moves, exitCave (level-1 stair-up), and quit", () => {
    const acts = legalActions(makeState()); // Gateway 175 = NSEW + stairUp, level 1
    expect(acts).toContainEqual({ type: "move", dir: DIR_N });
    expect(acts).toContainEqual({ type: "move", dir: DIR_E });
    expect(acts).toContainEqual({ type: "move", dir: DIR_S });
    expect(acts).toContainEqual({ type: "move", dir: DIR_W });
    expect(acts).toContainEqual({ type: "exitCave" });
    expect(acts).toContainEqual({ type: "quit" });
    // On level 1 a stair-up is the cave exit, NOT a move up.
    expect(acts).not.toContainEqual({ type: "move", dir: DIR_UP });
  });

  it("returns no actions once the game is over", () => {
    expect(legalActions(makeState({ gs: GS_QUIT, phase: "gameOver" }))).toEqual([]);
  });
});

describe("interactive loop — drive the engine purely through reduce + selectors", () => {
  it("plays a turn and the offered actions track the new area", () => {
    // Controlled deck: moving South draws 31 (NSEWC), which connects (has a north door).
    const start = makeState({ largePack: [31, 31, 31], largeIdx: 0 });
    expect(start.phase).toBe("explore");

    const dispatch = (s: typeof start, a: ReturnType<typeof legalActions>[number]) => reduce(s, a);
    const { state, events } = dispatch(start, { type: "move", dir: DIR_S });

    expect(state.turn).toBe(2);
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "moved", area: 1, level: 1 });
    // The new area (31 = NSEWC) offers fresh moves.
    expect(legalActions(state).some((a) => a.type === "move")).toBe(true);
  });

  it("a real shuffled game starts in the explore phase with legal actions", () => {
    const g = newGame(1, [0]);
    expect(g.phase).toBe("explore");
    expect(legalActions(g).length).toBeGreaterThan(0);
  });
});

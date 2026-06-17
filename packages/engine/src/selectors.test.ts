import { describe, it, expect } from "vitest";
import { legalActions } from "./selectors";
import { reduce } from "./reduce";
import { newGame } from "./setup";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP } from "./coords";
import { packCoord } from "./coords";
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

  it("offers a heavy-treasure take only to members with spare carry capacity", () => {
    // Gold (25kg). A Dwarf (carry 25) already holding Gems (25kg) is full; a Man (carry 50) has room.
    const s = makeState({
      phase: "pickup",
      treasures: [1], // Gold, 25kg
      party: [
        { creatureId: 7, status: 0, dragonKills: 0, treasure: [2] }, // Dwarf, full (carrying Gems)
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },  // Man, has room
      ],
    });
    const acts = legalActions(s);
    expect(acts).toContainEqual({ type: "takeTreasure", ti: 0, mi: 1 });     // Man can carry it
    expect(acts).not.toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 }); // Dwarf is full
    expect(acts).toContainEqual({ type: "leaveTreasure" });
  });

  it("offers the 100kg Treasure Chest only to a carrier big enough", () => {
    const s = makeState({
      phase: "pickup",
      treasures: [14], // Treasure Chest, 100kg
      party: [
        { creatureId: 12, status: 0, dragonKills: 0, treasure: [] }, // Giant (carry 150) — fits
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] },  // Hero (carry 75) — too small
      ],
    });
    const acts = legalActions(s);
    expect(acts).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });     // Giant fits 100kg
    expect(acts).not.toContainEqual({ type: "takeTreasure", ti: 0, mi: 1 }); // Hero (75) cannot
  });
});

describe("legalActions — usable artifacts (E-1)", () => {
  const M = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
  const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

  it("offers Strength Potion on a boostable member during a fight", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [M(0, [8])] });
    expect(legalActions(s)).toContainEqual({ type: "useArtifact", artifact: 8, target: 0 });
  });

  it("offers Lotus Dust per stranger in an encounter", () => {
    const s = makeState({ phase: "encounter", areas: [A], strangers: [10, 3], party: [M(5, [5])] });
    const acts = legalActions(s);
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 5, target: 0 });
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 5, target: 1 });
  });

  it("offers Healing Balm (Priest) and Magic Staff (Wizard) on downed members while exploring", () => {
    const s = makeState({ phase: "explore", areas: [A], party: [M(4, [6]), M(8, [9]), M(5, [], 3), M(2, [], 2)] });
    const acts = legalActions(s);
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 6, target: 2 }); // revive the dead Man
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 9, target: 3 }); // un-stone the Ogre
  });

  it("does not offer artifacts that no living bearer holds", () => {
    const s = makeState({ phase: "explore", areas: [A], party: [M(0)] });
    expect(legalActions(s).some((a) => a.type === "useArtifact")).toBe(false);
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

import type { GameState, PlacedArea } from "./state";
import { GATEWAY_START_COORD } from "./state";

/** Build a minimal GameState for deterministic tests. Override any field. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const gateway: PlacedArea = {
    card: 175,
    coord: GATEWAY_START_COORD,
    faceUp: true,
    visited: false,
    contents: [],
    flags: 0,
    indiffCount: 0,
  };
  return {
    gs: 0,
    phase: "explore",
    turn: 1,
    score: 0,
    curses: 0,
    sorcererKilled: false,
    areas: [gateway],
    partyArea: 0,
    level: 1,
    prev: 0,
    prev2: 0,
    party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
    largePack: [],
    largeIdx: 0,
    smallPack: [],
    smallIdx: 0,
    strangers: [],
    treasures: [],
    hazards: [],
    seed: 1,
    fight: null,
    ...overrides,
  };
}

import { BORNEABLE } from "./loot";
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
    bonusScore: 0,
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

/** Fixture helper: the wielded/worn subset of a member's gear. Party effects apply only to items in use (loot.ts), so a test member that
 *  is meant to HAVE its Sword, Ring, … lists them in `borne` as well as `treasure`. A test of "merely carried" builds the member by hand. */
export const inUseGear = (treasure: readonly number[]): number[] => treasure.filter((t) => BORNEABLE.includes(t));

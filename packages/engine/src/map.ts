import { decodeArea, type DecodedArea } from "./decode";
import {
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  targetCoord, unpackCoord,
} from "./coords";
import { AF_DESTROYED, type GameState, type PlacedArea } from "./state";

export interface MoveResult {
  state: GameState;
  moved: boolean;
  deadEnd: boolean;
}

const STAIR_UP_BIT = 32;

function hasExit(d: DecodedArea, dir: number): boolean {
  switch (dir) {
    case DIR_N: return d.n;
    case DIR_E: return d.e;
    case DIR_S: return d.s;
    case DIR_W: return d.w;
    case DIR_UP: return d.stairUp;
    case DIR_DOWN: return d.stairDown;
    default: return false;
  }
}

/** Does the destination card have the doorway facing back toward us? (lateral moves only) */
function hasReverseDoor(d: DecodedArea, dir: number): boolean {
  switch (dir) {
    case DIR_N: return d.s;
    case DIR_E: return d.w;
    case DIR_S: return d.n;
    case DIR_W: return d.e;
    default: return false;
  }
}

function pruneExit(card: number, dir: number): number {
  switch (dir) {
    case DIR_N: return card & ~1;
    case DIR_E: return card & ~2;
    case DIR_S: return card & ~4;
    case DIR_W: return card & ~8;
    default: return card;
  }
}

/**
 * Attempt to move the party one step in `dir` (spec §6.1). Pure: returns a new state.
 * - Existing destination: stairs always connect; lateral moves need a matching reverse doorway.
 * - No destination: draw the next large-pack card; place face-up (move) if it connects,
 *   else face-down (dead-end) and prune the exit on the current card.
 */
export function tryMove(state: GameState, dir: number): MoveResult {
  const current0 = state.areas[state.partyArea]!;
  const dec = decodeArea(current0.card);
  if (!hasExit(dec, dir)) return { state, moved: false, deadEnd: false };

  const next = structuredClone(state);
  const current = next.areas[next.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);
  const targetLevel = unpackCoord(target).level;

  const foundIdx = next.areas.findIndex((a) => a.coord === target);
  if (foundIdx >= 0) {
    const dest = next.areas[foundIdx]!;
    // An earthquake-collapsed area is removed from play: the doorway onto it is now blocked
    // by rubble. Prune the exit (so it's no longer offered) and report a dead end.
    if ((dest.flags & AF_DESTROYED) !== 0) {
      current.card = pruneExit(current.card, dir);
      return { state: next, moved: false, deadEnd: true };
    }
    const connects = dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(dest.card), dir);
    if (connects) {
      dest.faceUp = true;
      next.prev2 = next.prev;
      next.prev = next.partyArea;
      next.partyArea = foundIdx;
      next.level = targetLevel;
      return { state: next, moved: true, deadEnd: false };
    }
    current.card = pruneExit(current.card, dir);
    return { state: next, moved: false, deadEnd: true };
  }

  // No existing area — draw a card.
  if (next.largeIdx >= next.largePack.length) return { state, moved: false, deadEnd: false };
  let drawn = next.largePack[next.largeIdx]!;
  next.largeIdx += 1;
  if (targetLevel === 1) drawn = drawn & ~STAIR_UP_BIT; // only the Gateway exits level 1
  const connects = dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(drawn), dir);

  if (connects) {
    const mirroredStairs = dir === DIR_DOWN ? STAIR_UP_BIT : 0; // climb-back link, not printed art
    if (dir === DIR_DOWN) drawn = drawn | STAIR_UP_BIT; // mirror a stair-up so you can climb back
    const placed: PlacedArea = { card: drawn, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, mirroredStairs };
    next.areas.push(placed);
    next.prev2 = next.prev;
    next.prev = next.partyArea;
    next.partyArea = next.areas.length - 1;
    next.level = targetLevel;
    return { state: next, moved: true, deadEnd: false };
  }

  const placed: PlacedArea = { card: drawn, coord: target, faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 };
  next.areas.push(placed);
  current.card = pruneExit(current.card, dir);
  return { state: next, moved: false, deadEnd: true };
}

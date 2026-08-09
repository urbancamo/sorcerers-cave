import { decodeArea, type DecodedArea } from "./decode";
import {
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  targetCoord, unpackCoord,
} from "./coords";
import { AF_DESTROYED, type GameState, type PlacedArea } from "./state";
import { SPECIAL_CANONICAL_CARD, SPECIAL_WHIRLPOOL } from "./data/areaCards";

export interface MoveResult {
  state: GameState;
  moved: boolean;
  deadEnd: boolean;
}

const STAIR_UP_BIT = 32;
const STAIR_DOWN_BIT = 64;

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
    // Bug fix 2026-08-08: verticals were never actually pruned (fell through to the default,
    // untouched) — a discovered dead end via a stair kept re-offering itself forever, unlike a
    // lateral one. Only reachable in practice via an AF_DESTROYED collapse (§Earthquake) or the
    // Whirlpool's new "no stairway may lead here" block (§Whirlpool revision); both already call
    // this expecting it to work like the lateral case.
    case DIR_UP: return card & ~STAIR_UP_BIT;
    case DIR_DOWN: return card & ~STAIR_DOWN_BIT;
    default: return card;
  }
}

/**
 * Ensure the far end of a stair connection can be retraced (spec §"Secret Doors"). If `dest` lacks the
 * matching stair (`bit`), mirror it onto the card, flag it as a link (not printed art), and lay the next
 * lettered secret-door marker. A no-op when the stair is already pictured. Used when a vertical move
 * lands on an ALREADY-PLACED area — the fresh-draw path below does the same for newly drawn cards.
 */
function mirrorReturnStair(next: GameState, dest: PlacedArea, bit: number): void {
  if ((dest.card & bit) !== 0) return; // already has the return stair — nothing to mirror
  dest.card |= bit;
  dest.mirroredStairs = (dest.mirroredStairs ?? 0) | bit;
  if (dest.secretDoor === undefined) {
    dest.secretDoor = next.secretDoors ?? 0;
    next.secretDoors = dest.secretDoor + 1;
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
    // Whirlpool revision (2026-08-08): "any stairway leading to this area is considered blocked" —
    // no vertical connection may ever land on a Whirlpool, from either direction, whether the tile
    // was already placed (here) or is freshly drawn (below).
    if ((dir === DIR_UP || dir === DIR_DOWN) && decodeArea(dest.card).special === SPECIAL_WHIRLPOOL) {
      current.card = pruneExit(current.card, dir);
      return { state: next, moved: false, deadEnd: true };
    }
    const connects = dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(dest.card), dir);
    if (connects) {
      // A vertical move into an already-placed area still needs the matching stair at the far end so
      // the party can retrace — mirror it (and lay a secret-door marker) just as a freshly drawn area
      // does, otherwise climbing/descending into an existing tile leaves no way back (§"Secret Doors").
      if (dir === DIR_UP) mirrorReturnStair(next, dest, STAIR_DOWN_BIT);
      else if (dir === DIR_DOWN) mirrorReturnStair(next, dest, STAIR_UP_BIT);
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

  // No existing area — draw a card. Test Mode (§Test Mode): an armed testNextArea for THIS exact
  // direction takes over the draw entirely — including bypassing the empty-pack early return, since
  // nothing is actually drawn from largePack. Consumed here, once, whether or not the placement
  // below ends up connecting (it always will — see the `connects` override two lines down). Checks
  // `testMode` explicitly rather than trusting testNextArea's mere presence — defense in depth
  // against a hand-crafted state, matching this codebase's existing style elsewhere (e.g. the
  // Precise Locations adjacency gate, enforced independently in both selectors.ts and reduce.ts).
  const override = next.testMode && next.testNextArea?.dir === dir ? next.testNextArea : undefined;
  let drawn: number;
  if (override) {
    drawn = SPECIAL_CANONICAL_CARD[override.special]!;
    delete next.testNextArea;
  } else {
    if (next.largeIdx >= next.largePack.length) return { state, moved: false, deadEnd: false };
    drawn = next.largePack[next.largeIdx]!;
    next.largeIdx += 1;
  }
  // A printed stair-up on a level-1 card is a *cave exit*, not a stair to a level above (§ level-1 exits:
  // "any stairway leading up from the first level is an exit from the Cave"). It is kept — exiting is the
  // `exitCave` action (a DIR_UP move stays blocked on level 1), so several cards, not only the Gateway,
  // can let a party escape. Without this a party whose Gateway is destroyed can be trapped forever.
  // Test Mode (§Test Mode): a scripted placement always connects, regardless of the special's
  // printed orientation — the whole point is guaranteeing the tester reaches the scenario asked
  // for. (In practice every SPECIAL_CANONICAL_CARD entry has all four exits anyway — see Task 1's
  // own test — so this only matters if that ever changes.)
  const rawConnects = !!override || dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(drawn), dir);
  // Whirlpool revision (2026-08-08): a vertical draw that turns up the Whirlpool never connects
  // either — "any stairway leading to this area is considered blocked." Bug fix 2026-08-09
  // (QOTO-01): a Test Mode override does NOT exempt this one — it's not a printed-orientation
  // technicality Test Mode exists to bypass, it's a hard rule the real game enforces, and the whole
  // point of queuing a Whirlpool onto a vertical move in the test rig is to confirm the block still
  // fires. (An override still bypasses the ordinary reverse-door/orientation check above, and is
  // still consumed here either way — see the face-down placement this falls through to below.)
  const connects = rawConnects &&
    !((dir === DIR_UP || dir === DIR_DOWN) && decodeArea(drawn).special === SPECIAL_WHIRLPOOL);

  if (connects) {
    // A stairway leading to an area with no matching stair pictured has a secret door at that end
    // (§"Secret Doors"): descending onto a card with no stair up, or ascending onto one with no
    // stair down. Mirror the missing stair so the party can retrace its steps, exclude it from
    // tile-art selection, and lay the next letter A, B, C…
    let mirroredStairs = 0;
    let secretDoor: number | undefined;
    if (dir === DIR_DOWN && (drawn & STAIR_UP_BIT) === 0) {
      drawn = drawn | STAIR_UP_BIT;
      mirroredStairs = STAIR_UP_BIT;
    } else if (dir === DIR_UP && (drawn & STAIR_DOWN_BIT) === 0) {
      drawn = drawn | STAIR_DOWN_BIT;
      mirroredStairs = STAIR_DOWN_BIT;
    }
    if (mirroredStairs !== 0) {
      secretDoor = next.secretDoors ?? 0;
      next.secretDoors = secretDoor + 1;
    }
    const placed: PlacedArea = { card: drawn, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, mirroredStairs, secretDoor };
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

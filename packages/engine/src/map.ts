import { decodeArea, decodeOpen, type DecodedArea } from "./decode";
import {
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  targetCoord, unpackCoord,
} from "./coords";
import { AF_DESTROYED, type GameState, type PlacedArea } from "./state";
import { SPECIAL_CANONICAL_CARD, AREA_TILE_CANONICAL_CARD, SPECIAL_WHIRLPOOL, TILE_MIN, TILE_MAX } from "./data/areaCards";

export interface MoveResult {
  state: GameState;
  moved: boolean;
  deadEnd: boolean;
}

const STAIR_UP_BIT = 32;
const STAIR_DOWN_BIT = 64;

export function hasExit(d: DecodedArea, dir: number): boolean {
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

/** Would a move in `dir` onto this ALREADY-PLACED area actually connect? Destroyed (earthquake
 *  rubble) and a vertical move onto a Whirlpool never connect; any other vertical move always
 *  connects (the target's own stair is mirrored on arrival if it's missing); a lateral move
 *  connects only if the destination shows the matching reverse doorway. Shared by `tryMove`'s
 *  existing-area branch and `isPartyStuck` (§6.3.2, Dead End rule) so the two can never drift. */
export function existingAreaConnects(dest: PlacedArea, dir: number): boolean {
  if (isBlockedDoorway(dest, dir)) return false;
  return dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeOpen(dest), dir);
}

/** A doorway onto `dest` that can NEVER open, whatever the party does: an earthquake-collapsed tile,
 *  or a stairway onto the Whirlpool. (A missing reverse door is a different, plain geometry mismatch.) */
export function isBlockedDoorway(dest: PlacedArea, dir: number): boolean {
  if ((dest.flags & AF_DESTROYED) !== 0) return true;
  return (dir === DIR_UP || dir === DIR_DOWN) && decodeArea(dest.card).special === SPECIAL_WHIRLPOOL;
}

/** The card bit of a doorway or stairway. */
export function doorBit(dir: number): number {
  switch (dir) {
    case DIR_N: return 1;
    case DIR_E: return 2;
    case DIR_S: return 4;
    case DIR_W: return 8;
    case DIR_UP: return STAIR_UP_BIT;
    case DIR_DOWN: return STAIR_DOWN_BIT;
    default: return 0;
  }
}

/** Mark a doorway dead after a failed move. The printed `card` is left exactly as dealt — a placed card's
 *  doors never change; only this mask records that the doorway has been tried and leads nowhere. */
export function closeDoor(area: PlacedArea, dir: number): void {
  area.deadDoors = (area.deadDoors ?? 0) | doorBit(dir);
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

/** A card taken off the large pack for a move (or a Test Mode scripted one), not yet laid. */
export interface DrawnCard {
  card: number;
  /** Test Mode: a scripted SPECIAL always connects regardless of its printed orientation. */
  bypassDoors: boolean;
  /** True when it came from a Test Mode script rather than the pack, so no pack slot was used. */
  scripted: boolean;
}

/** True when a move toward empty space has nothing to draw: the pack is empty and no Test Mode script is armed
 *  for this direction (SC-6.1-6 — the move is then a permanent no-op that prunes nothing). */
export function nothingToDraw(next: GameState, dir: number): boolean {
  return !(next.testMode && next.testNextArea?.dir === dir) && next.largeIdx >= next.largePack.length;
}

/**
 * Take the next area card for a move in `dir`. Test Mode (§Test Mode): an armed testNextArea for THIS exact
 * direction takes over the draw entirely, and is consumed (deleted) the first time it is read.
 * Mutates `next` (the pack index, the script). Call `nothingToDraw` first.
 */
export function drawAreaCard(next: GameState, dir: number): DrawnCard {
  const override = next.testMode && next.testNextArea?.dir === dir ? next.testNextArea : undefined;
  if (override) {
    // SC-Test-8: `override.special` also admits the plain-tile pseudo-ids (TILE_MIN..TILE_MAX),
    // whose canonical card lives in the sibling AREA_TILE_CANONICAL_CARD table.
    const card = SPECIAL_CANONICAL_CARD[override.special] ?? AREA_TILE_CANONICAL_CARD[override.special]!;
    delete next.testNextArea;
    // Exception (SC-Test-8/SC-Test-11): a scripted plain tile (chamber or tunnel, TILE_MIN..TILE_MAX) has a
    // real, possibly partial, door layout, so it obeys the reverse-door check like a real draw — otherwise
    // cueing one whose doors do not face back at the party would let it walk through a wall. Specials always
    // connect: every SPECIAL_CANONICAL_CARD has all four exits.
    const honoursDoors = override.special >= TILE_MIN && override.special <= TILE_MAX;
    return { card, bypassDoors: !honoursDoors, scripted: true };
  }
  const card = next.largePack[next.largeIdx]!;
  next.largeIdx += 1;
  return { card, bypassDoors: false, scripted: false };
}

/** Would this drawn card connect to a party moving in `dir`? (`moveCheck`, spec §How to Implement.) */
export function drawnCardConnects(drawn: DrawnCard, dir: number): boolean {
  const rawConnects = drawn.bypassDoors || dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(drawn.card), dir);
  // Whirlpool revision (2026-08-08): a vertical draw that turns up the Whirlpool never connects either — "any
  // stairway leading to this area is considered blocked." Bug fix 2026-08-09 (QOTO-01): a Test Mode override
  // does NOT exempt this one — it is a hard rule the real game enforces, and the whole point of queuing a
  // Whirlpool onto a vertical move in the test rig is to confirm the block still fires.
  return rawConnects && !((dir === DIR_UP || dir === DIR_DOWN) && decodeArea(drawn.card).special === SPECIAL_WHIRLPOOL);
}

/** Lay a connecting card face up at the target of `dir` and move the party onto it. */
export function layConnecting(next: GameState, dir: number, drawn: DrawnCard): void {
  const current = next.areas[next.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);
  let card = drawn.card;
  // A printed stair-up on a level-1 card is a *cave exit*, not a stair to a level above (§ level-1 exits: "any
  // stairway leading up from the first level is an exit from the Cave"). It is kept — exiting is the `exitCave`
  // action (a DIR_UP move stays blocked on level 1), so several cards, not only the Gateway, can let a party
  // escape. A stairway leading to an area with no matching stair pictured has a secret door at that end
  // (§"Secret Doors"): descending onto a card with no stair up, or ascending onto one with no stair down.
  // Mirror the missing stair so the party can retrace its steps, exclude it from tile-art selection, and lay
  // the next letter A, B, C…
  let mirroredStairs = 0;
  let secretDoor: number | undefined;
  if (dir === DIR_DOWN && (card & STAIR_UP_BIT) === 0) {
    card = card | STAIR_UP_BIT;
    mirroredStairs = STAIR_UP_BIT;
  } else if (dir === DIR_UP && (card & STAIR_DOWN_BIT) === 0) {
    card = card | STAIR_DOWN_BIT;
    mirroredStairs = STAIR_DOWN_BIT;
  }
  if (mirroredStairs !== 0) {
    secretDoor = next.secretDoors ?? 0;
    next.secretDoors = secretDoor + 1;
  }
  const placed: PlacedArea = { card, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, mirroredStairs, secretDoor };
  next.areas.push(placed);
  next.prev2 = next.prev;
  next.prev = next.partyArea;
  next.partyArea = next.areas.length - 1;
  next.level = unpackCoord(target).level;
}

/** Lay a card that does NOT connect face down at the target of `dir` (a dead end) and close that doorway on the
 *  party's area. The party does not move. */
export function layDeadEnd(next: GameState, dir: number, drawn: DrawnCard): void {
  const current = next.areas[next.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  next.areas.push({ card: drawn.card, coord: targetCoord(dir, level, x, y), faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 });
  closeDoor(current, dir);
}

/**
 * Attempt to move the party one step in `dir` (spec §6.1). Pure: returns a new state.
 * - Existing destination: stairs always connect; lateral moves need a matching reverse doorway.
 * - No destination: draw the next large-pack card; place face-up (move) if it connects,
 *   else face-down (dead-end) and close the doorway on the current card.
 *
 * This is the plain move. The Dead End rule (§6.3.2, `variants.forcedRedraw`) wraps it in `redraw.ts`, and
 * `retreat` (which has its own deliberately harsher dead-end rule) calls it directly.
 */
export function tryMove(state: GameState, dir: number): MoveResult {
  const current0 = state.areas[state.partyArea]!;
  if (!hasExit(decodeOpen(current0), dir)) return { state, moved: false, deadEnd: false };

  const next = structuredClone(state);
  const current = next.areas[next.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);

  const foundIdx = next.areas.findIndex((a) => a.coord === target);
  if (foundIdx >= 0) {
    const dest = next.areas[foundIdx]!;
    if (existingAreaConnects(dest, dir)) {
      // A vertical move into an already-placed area still needs the matching stair at the far end so
      // the party can retrace — mirror it (and lay a secret-door marker) just as a freshly drawn area
      // does, otherwise climbing/descending into an existing tile leaves no way back (§"Secret Doors").
      if (dir === DIR_UP) mirrorReturnStair(next, dest, STAIR_DOWN_BIT);
      else if (dir === DIR_DOWN) mirrorReturnStair(next, dest, STAIR_UP_BIT);
      dest.faceUp = true;
      next.prev2 = next.prev;
      next.prev = next.partyArea;
      next.partyArea = foundIdx;
      next.level = unpackCoord(target).level;
      return { state: next, moved: true, deadEnd: false };
    }
    closeDoor(current, dir);
    return { state: next, moved: false, deadEnd: true };
  }

  if (nothingToDraw(next, dir)) return { state, moved: false, deadEnd: false };
  const drawn = drawAreaCard(next, dir);
  if (drawnCardConnects(drawn, dir)) {
    layConnecting(next, dir, drawn);
    return { state: next, moved: true, deadEnd: false };
  }
  layDeadEnd(next, dir, drawn);
  return { state: next, moved: false, deadEnd: true };
}

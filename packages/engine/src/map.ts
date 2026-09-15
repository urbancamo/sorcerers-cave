import { decodeArea, type DecodedArea } from "./decode";
import {
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  targetCoord, unpackCoord,
} from "./coords";
import { AF_DESTROYED, type GameState, type PlacedArea } from "./state";
import { SPECIAL_CANONICAL_CARD, AREA_TILE_CANONICAL_CARD, SPECIAL_WHIRLPOOL } from "./data/areaCards";
import { randBelow } from "./rng";

export interface MoveResult {
  state: GameState;
  moved: boolean;
  deadEnd: boolean;
  // Dead End rule (§6.3.2, "forced redraw"): one entry per completed reject-and-redraw cycle
  // (`allowDeadEndSwap` only) — empty whenever the swap mechanism didn't engage.
  swaps: { removed: number; drawn: number }[];
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

/** Would a move in `dir` onto this ALREADY-PLACED area actually connect? Destroyed (earthquake
 *  rubble) and a vertical move onto a Whirlpool never connect; any other vertical move always
 *  connects (the target's own stair is mirrored on arrival if it's missing); a lateral move
 *  connects only if the destination shows the matching reverse doorway. Shared by `tryMove`'s
 *  existing-area branch and `isPartyStuck` (§6.3.2, Dead End rule) so the two can never drift. */
export function existingAreaConnects(dest: PlacedArea, dir: number): boolean {
  if ((dest.flags & AF_DESTROYED) !== 0) return false;
  if ((dir === DIR_UP || dir === DIR_DOWN) && decodeArea(dest.card).special === SPECIAL_WHIRLPOOL) return false;
  return dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(dest.card), dir);
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

/** `pruneExit`'s inverse — restores a bit `pruneExit` cleared. Only ever used to roll back a
 *  face-down placement that turned out to be rescuable (§6.3.2, Dead End rule). */
function restoreExit(card: number, dir: number): number {
  switch (dir) {
    case DIR_N: return card | 1;
    case DIR_E: return card | 2;
    case DIR_S: return card | 4;
    case DIR_W: return card | 8;
    case DIR_UP: return card | STAIR_UP_BIT;
    case DIR_DOWN: return card | STAIR_DOWN_BIT;
    default: return card;
  }
}

/**
 * True iff the party has no actionable doorway or stairway left anywhere it can currently reach by
 * backtracking (§6.3.2, Dead End rule — "all available doorways and stairways have been tried,
 * including those which may be reached by backtracking"). BFS from `partyArea` over already-placed
 * areas, expanding only through CONFIRMED connections (`existingAreaConnects` — the exact geometry
 * `tryMove`'s existing-area branch uses), so an area merely sitting at an adjacent coordinate with no
 * open door to it is never considered reachable.
 *
 * An unpruned bit on a reachable area counts as "actionable" only when trying it could still change
 * anything:
 *  - Toward an already-placed area that does NOT currently connect: yes — trying it costs no turn
 *    (SC-4-9) and hasn't been attempted from here yet, even though we can already tell it will fail.
 *  - Toward an already-placed area that DOES connect: no. A successful connection's bit is never
 *    pruned (pruning only ever fires on failure), so counting it would count it forever — its only
 *    value (reaching that neighbor) is already captured by that neighbor's own presence in the
 *    reachable set, whatever lies beyond it is checked independently there.
 *  - Toward unexplored space: yes, but only while a card remains to draw for it
 *    (`largeIdx < largePack.length`) — once the pack is exhausted, `tryMove` treats that direction as
 *    a permanent no-op (SC-6.1-6) that never prunes the bit, so an unconditional read would see a
 *    phantom "option" that can never actually resolve.
 */
export function isPartyStuck(state: GameState, partyArea: number): boolean {
  const packHasCards = state.largeIdx < state.largePack.length;
  const visited = new Set<number>();
  const queue = [partyArea];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (visited.has(idx)) continue;
    visited.add(idx);
    const area = state.areas[idx]!;
    const dec = decodeArea(area.card);
    const { level, x, y } = unpackCoord(area.coord);
    for (const dir of [DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN]) {
      if (!hasExit(dec, dir)) continue;
      const target = targetCoord(dir, level, x, y);
      const destIdx = state.areas.findIndex((a) => a.coord === target);
      if (destIdx < 0) {
        if (packHasCards) return false;
        continue;
      }
      if (existingAreaConnects(state.areas[destIdx]!, dir)) {
        if (!visited.has(destIdx)) queue.push(destIdx);
      } else {
        return false;
      }
    }
  }
  return true;
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
 *
 * `allowDeadEndSwap` (default false — byte-identical to before this parameter existed) engages the
 * Dead End rule (§6.3.2, "forced redraw", `variants.forcedRedraw`): only the caller passing `true`
 * ever sees the swap-and-redraw loop below; every other call site (including `retreat`, which has
 * its own deliberately harsher dead-end rule) is untouched.
 */
export function tryMove(state: GameState, dir: number, allowDeadEndSwap = false): MoveResult {
  const current0 = state.areas[state.partyArea]!;
  const dec = decodeArea(current0.card);
  if (!hasExit(dec, dir)) return { state, moved: false, deadEnd: false, swaps: [] };

  const next = structuredClone(state);
  const current = next.areas[next.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);
  const targetLevel = unpackCoord(target).level;

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
      next.level = targetLevel;
      return { state: next, moved: true, deadEnd: false, swaps: [] };
    }
    current.card = pruneExit(current.card, dir);
    return { state: next, moved: false, deadEnd: true, swaps: [] };
  }

  // No existing area — draw a card, retrying on a rescuable dead end (§6.3.2) when allowed. Test
  // Mode (§Test Mode): an armed testNextArea for THIS exact direction takes over the draw entirely
  // — including bypassing the empty-pack early return, since nothing is actually drawn from
  // largePack. It is consumed (deleted) the first time it's read, so by construction it can only
  // ever apply to the loop's first attempt — every later attempt falls through to a real draw.
  if (!(next.testMode && next.testNextArea?.dir === dir) && next.largeIdx >= next.largePack.length) {
    return { state, moved: false, deadEnd: false, swaps: [] };
  }

  const swaps: { removed: number; drawn: number }[] = [];
  let pendingRemoved: number | undefined;
  // Bounded at one attempt per undrawn card, computed ONCE before the first draw: each iteration
  // draws exactly one card and, on a rescued rejection, reinserts exactly one card before the next
  // iteration, so the undrawn count is loop-invariant and this bound can never be exceeded by the
  // swap mechanism itself.
  const maxAttempts = allowDeadEndSwap ? Math.max(1, next.largePack.length - next.largeIdx) : 1;

  for (let attempt = 1; ; attempt++) {
    const override = next.testMode && next.testNextArea?.dir === dir ? next.testNextArea : undefined;
    let drawn: number;
    if (override) {
      // SC-Test-8: `override.special` also admits the plain-tile pseudo-ids (TILE_MIN..TILE_MAX),
      // whose canonical card lives in the sibling AREA_TILE_CANONICAL_CARD table.
      drawn = SPECIAL_CANONICAL_CARD[override.special] ?? AREA_TILE_CANONICAL_CARD[override.special]!;
      delete next.testNextArea;
    } else {
      drawn = next.largePack[next.largeIdx]!;
      next.largeIdx += 1;
    }
    if (pendingRemoved !== undefined) {
      swaps.push({ removed: pendingRemoved, drawn });
      pendingRemoved = undefined;
    }

    // A printed stair-up on a level-1 card is a *cave exit*, not a stair to a level above (§ level-1
    // exits: "any stairway leading up from the first level is an exit from the Cave"). It is kept —
    // exiting is the `exitCave` action (a DIR_UP move stays blocked on level 1), so several cards,
    // not only the Gateway, can let a party escape. Without this a party whose Gateway is destroyed
    // can be trapped forever. Test Mode (§Test Mode): a scripted placement always connects,
    // regardless of the special's printed orientation — the whole point is guaranteeing the tester
    // reaches the scenario asked for. (In practice every SPECIAL_CANONICAL_CARD entry has all four
    // exits anyway — see Task 1's own test — so this only matters if that ever changes.)
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
      return { state: next, moved: true, deadEnd: false, swaps };
    }

    const placed: PlacedArea = { card: drawn, coord: target, faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 };
    next.areas.push(placed);
    current.card = pruneExit(current.card, dir);

    // Placed and pruned FIRST, then checked: the rejected card's OTHER doors could open unrelated
    // connections elsewhere, so "is the party stuck" must be evaluated against the state as it would
    // actually be left, not a hypothetical pre-placement guess.
    if (attempt >= maxAttempts || !isPartyStuck(next, next.partyArea)) {
      return { state: next, moved: false, deadEnd: true, swaps };
    }

    // Rescuable dead end (§6.3.2): undo the placement and the prune, reshuffle the rejected card
    // back into the pack at a uniformly random position among the still-undrawn cards (not a fixed
    // "middle" index — see the spec for why), and retry the same direction.
    next.areas.pop();
    current.card = restoreExit(current.card, dir);
    const remaining = next.largePack.length - next.largeIdx; // undrawn AFTER this draw
    const r = randBelow(next.seed, remaining + 1);
    next.seed = r.seed;
    next.largePack.splice(next.largeIdx + r.value, 0, drawn);
    pendingRemoved = drawn;
  }
}

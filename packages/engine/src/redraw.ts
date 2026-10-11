// The Dead End rule (§6.3.2, "forced redraw", `variants.forcedRedraw`) — docs/requirements/
// 2026-09-30-swap-dead-end-area-card-reimplemented-v2.md.
//
// When a drawn area card would leave the party with no way to carry on exploring — it is a dead end, or it
// connects but seals the party into a closed region (a "Sealing Card") — it is put back into the pack and a
// better one is taken, as the printed rule allows. Everything here is a pure function of the game state; the only
// randomness is the state's own seeded generator, so a replay reproduces every swap.
//
// `viableExitsCheck` searches the whole region the party can walk to (backtracking counts) and stores nothing on
// the map. The "Entry Dry Run" rehearses laying and entering a card on a COPY of the state, using the reducer's own
// entry code (passed in as `enter`, which also keeps this file free of an import cycle with reduce.ts).
import { decodeOpen } from "./decode";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, targetCoord, unpackCoord } from "./coords";
import { SPECIAL_CHASM, SPECIAL_WHIRLPOOL } from "./data/areaCards";
import { randBelow } from "./rng";
import { getSubLocation, oppositeDir } from "./subLocation";
import type { GameState, PlacedArea } from "./state";
import {
  drawAreaCard, drawnCardConnects, existingAreaConnects, isBlockedDoorway, layConnecting, layDeadEnd,
  nothingToDraw, tryMove, type DrawnCard, type MoveResult,
} from "./map";

export type SwapReason = "deadEnd" | "sealed";

/** What a move made under the Dead End rule produced, beyond the plain `MoveResult`. */
export interface RedrawResult extends MoveResult {
  /** Set when the drawn card was put back and another taken. */
  swap?: { removed: number; drawn: number; reason: SwapReason };
  /** The party is left in a region with no way to carry on exploring, while cards remain in the pack. */
  noViableExits: boolean;
}

/** The reducer's own entry code, run on a copy: everything that happens once the party is on a freshly laid card. */
export type EnterArea = (state: GameState) => void;

const LATERAL = [DIR_N, DIR_E, DIR_S, DIR_W];
const ALL_DIRS = [...LATERAL, DIR_UP, DIR_DOWN];

type ExitClass = { kind: "viable" } | { kind: "link"; idx: number; dir: number } | { kind: "ignore" };

const hasUndrawn = (state: GameState): boolean => state.largeIdx < state.largePack.length;

/**
 * Classify every open exit of an area (`areaCardViableExits`). A doorway toward empty space is viable while the pack
 * has a card to draw for it; toward a laid card it is a link if the two connect, and otherwise ignored (an
 * already-known dead end, a collapsed tile, a stairway onto the Whirlpool). A stairway up from level 1 leaves the
 * Cave, which is not exploring.
 */
export function areaCardViableExits(state: GameState, idx: number): { dir: number; result: ExitClass }[] {
  const area = state.areas[idx]!;
  const dec = decodeOpen(area);
  const { level, x, y } = unpackCoord(area.coord);
  const out: { dir: number; result: ExitClass }[] = [];
  for (const dir of ALL_DIRS) {
    const open = dir === DIR_N ? dec.n : dir === DIR_E ? dec.e : dir === DIR_S ? dec.s : dir === DIR_W ? dec.w : dir === DIR_UP ? dec.stairUp : dec.stairDown;
    if (!open) continue;
    if (dir === DIR_UP && level === 1) { out.push({ dir, result: { kind: "ignore" } }); continue; }
    const target = targetCoord(dir, level, x, y);
    const destIdx = state.areas.findIndex((a) => a.coord === target);
    if (destIdx < 0) {
      out.push({ dir, result: hasUndrawn(state) ? { kind: "viable" } : { kind: "ignore" } });
      continue;
    }
    const dest = state.areas[destIdx]!;
    if (isBlockedDoorway(dest, dir)) out.push({ dir, result: { kind: "ignore" } });
    else if (existingAreaConnects(dest, dir)) out.push({ dir, result: { kind: "link", idx: destIdx, dir } });
    else out.push({ dir, result: { kind: "ignore" } });
  }
  return out;
}

/** A Chasm can be descended (reusable, deliberate): a viable exit if a card can be drawn for the level below, or a
 *  tile is already there. The engine offers all four doorways at a Chasm, so it is otherwise walked like any area. */
function chasmDescends(state: GameState, area: PlacedArea): boolean {
  if (decodeOpen(area).special !== SPECIAL_CHASM) return false;
  if (hasUndrawn(state)) return true;
  const { level, x, y } = unpackCoord(area.coord);
  const below = targetCoord(DIR_DOWN, level, x, y);
  return state.areas.some((a) => a.coord === below && !isBlockedDoorway(a, DIR_DOWN));
}

/**
 * Is there ANY way left to carry on exploring, from `startIdx`? (`viableExitsCheck`.) False only after the whole region
 * the party can walk to has been searched: backtracking counts, traps and the Whirlpool do not (decisions 1 and 6),
 * and the search never marks the map — its visited set is local to the call. The Whirlpool is keyed by (area, arrival
 * doorway) because the doorway opposite the one the party came in by is not usable there.
 */
export function viableExitsCheck(state: GameState, startIdx: number): boolean {
  const visited = new Set<string>();
  // The party's own arrival doorway matters only on a Whirlpool; getSubLocation derives it for the party's tile.
  let startArrival: number | undefined;
  if (startIdx === state.partyArea) {
    const sub = getSubLocation(state);
    if (sub.at === "doorway") startArrival = sub.dir;
  }
  const stack: { idx: number; arrival?: number }[] = [{ idx: startIdx, arrival: startArrival }];
  while (stack.length > 0) {
    const { idx, arrival } = stack.pop()!;
    const area = state.areas[idx]!;
    const special = decodeOpen(area).special;
    const key = special === SPECIAL_WHIRLPOOL ? `${idx}:${arrival ?? "-"}` : `${idx}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (chasmDescends(state, area)) return true;
    for (const { dir, result } of areaCardViableExits(state, idx)) {
      if (special === SPECIAL_WHIRLPOOL && arrival !== undefined && dir === oppositeDir(arrival)) continue;
      if (result.kind === "viable") return true;
      if (result.kind === "link") stack.push({ idx: result.idx, arrival: dir === DIR_UP || dir === DIR_DOWN ? undefined : oppositeDir(dir) });
    }
  }
  return false;
}

/** Rehearse laying `drawn` and entering it, on a copy. Its only output is the resulting map and where the party
 *  stands; the real state, pack order, seed and Test Mode scripts are never touched. */
function entryDryRun(base: GameState, dir: number, drawn: DrawnCard, enter: EnterArea): GameState {
  const copy = structuredClone(base);
  layConnecting(copy, dir, drawn);
  enter(copy);
  return copy;
}

/** After an entry (real or rehearsed), can the party still explore? An exhausted pack ends exploration by the
 *  rules, so it is not the party's misfortune and counts as acceptable. */
function leavesAWayOn(after: GameState): boolean {
  return !hasUndrawn(after) || viableExitsCheck(after, after.partyArea);
}

/** Put the original card back and take `pack[j]` in its place, in place: the drawn card's slot takes the
 *  replacement, the replacement's old undrawn slot is removed, and the original goes to a random undrawn position —
 *  so the pack stays a valid permutation whichever way the move ends (including a Whirlpool drag that rewinds
 *  `largeIdx`). A scripted original never lived in the pack, so there is nothing to put back. */
function applySwap(state: GameState, j: number, original: DrawnCard): GameState {
  const s = structuredClone(state);
  const replacement = s.largePack[j]!;
  if (original.scripted) {
    s.largePack.splice(j, 1);
    return s;
  }
  s.largePack[s.largeIdx - 1] = replacement;
  s.largePack.splice(j, 1);
  const r = randBelow(s.seed, s.largePack.length - s.largeIdx + 1);
  s.seed = r.seed;
  s.largePack.splice(s.largeIdx + r.value, 0, original.card);
  return s;
}

interface Swapped {
  state: GameState;      // the swap applied, the replacement not yet laid
  card: DrawnCard;
  strict: boolean;       // false: it connects but still seals the party in
}

/**
 * Find the replacement card (`swapAreaCard`). Strict tier: the entrance is valid and an Entry Dry Run, on a copy with
 * the swap already applied, leaves a way on. Connecting tier (dead ends only): the entrance is valid, "until a way is
 * found". Candidates are tried in a random order from the state's generator; a rejected one is discarded, and the
 * accepted swap — generator position included — becomes the real one. Null leaves the pack untouched.
 */
function swapAreaCard(next: GameState, dir: number, original: DrawnCard, reason: SwapReason, enter: EnterArea): Swapped | null {
  const tiers: ("strict" | "connecting")[] = reason === "deadEnd" ? ["strict", "connecting"] : ["strict"];
  let seed = next.seed;
  for (const tier of tiers) {
    const considered = new Set<number>();
    for (;;) {
      const candidates: number[] = [];
      for (let j = next.largeIdx; j < next.largePack.length; j++) if (!considered.has(j)) candidates.push(j);
      if (candidates.length === 0) break;
      const r = randBelow(seed, candidates.length);
      seed = r.seed;
      const j = candidates[r.value]!;
      considered.add(j);
      const card: DrawnCard = { card: next.largePack[j]!, bypassDoors: false, scripted: false };
      if (!drawnCardConnects(card, dir)) continue;
      const swapped = applySwap({ ...next, seed }, j, original);
      if (tier === "connecting") return { state: swapped, card, strict: false };
      if (leavesAWayOn(entryDryRun(swapped, dir, card, enter))) return { state: swapped, card, strict: true };
    }
  }
  return null;
}

/**
 * A move under the Dead End rule. Only a fresh draw can be swapped: a doorway toward a card already laid, or toward
 * an empty pack, is the plain move. `retreat` never comes here (its own harsher rule).
 *
 * Order of operations (spec §Order of operations): draw; if the card connects, rehearse the entry and treat a card that
 * leaves no way on as a Sealing Card; if it does not, lay it face down with the doorway crossed off and ask whether
 * any way on remains. Either failure triggers `swapAreaCard`.
 */
export function moveWithRedraw(state: GameState, dir: number, enter: EnterArea): RedrawResult {
  const plain = (): RedrawResult => ({ ...tryMove(state, dir), noViableExits: false });
  const cur = state.areas[state.partyArea]!;
  const dec = decodeOpen(cur);
  const open = dir === DIR_N ? dec.n : dir === DIR_E ? dec.e : dir === DIR_S ? dec.s : dir === DIR_W ? dec.w : dir === DIR_UP ? dec.stairUp : dec.stairDown;
  if (!open) return plain();
  const { level, x, y } = unpackCoord(cur.coord);
  const target = targetCoord(dir, level, x, y);
  if (state.areas.some((a) => a.coord === target)) return plain();

  const next = structuredClone(state);
  if (nothingToDraw(next, dir)) return plain();
  const drawn = drawAreaCard(next, dir);
  const n = next.largePack.length - next.largeIdx; // undrawn cards remaining after this draw

  let reason: SwapReason;
  if (drawnCardConnects(drawn, dir)) {
    if (n === 0 || leavesAWayOn(entryDryRun(next, dir, drawn, enter))) {
      layConnecting(next, dir, drawn);
      return { state: next, moved: true, deadEnd: false, noViableExits: false };
    }
    reason = "sealed";
  } else {
    const wouldBe = structuredClone(next);
    layDeadEnd(wouldBe, dir, drawn);
    if (viableExitsCheck(wouldBe, wouldBe.partyArea)) {
      layDeadEnd(next, dir, drawn);
      return { state: next, moved: false, deadEnd: true, noViableExits: false };
    }
    reason = "deadEnd";
  }

  const swapped = swapAreaCard(next, dir, drawn, reason, enter);
  if (swapped) {
    layConnecting(swapped.state, dir, swapped.card);
    return {
      state: swapped.state, moved: true, deadEnd: false,
      swap: { removed: drawn.card, drawn: swapped.card.card, reason },
      noViableExits: !swapped.strict && n >= 1,
    };
  }
  if (reason === "deadEnd") {
    layDeadEnd(next, dir, drawn);
    return { state: next, moved: false, deadEnd: true, noViableExits: n >= 1 };
  }
  layConnecting(next, dir, drawn);
  return { state: next, moved: true, deadEnd: false, noViableExits: n >= 1 };
}

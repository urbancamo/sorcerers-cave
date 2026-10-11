// SOAK TEST for the Dead End rule (`redraw.ts`, `variants.forcedRedraw`). NOT part of the normal build: the
// file is named `.soak.ts` (not `.test.ts`), so `vitest run` / `pnpm test` never pick it up.
//
//   pnpm --filter @sorcerers-cave/engine soak                       # 5 minutes
//   SOAK_SECONDS=3600 pnpm --filter @sorcerers-cave/engine soak     # an hour
//   SOAK_SEED=12345 pnpm --filter @sorcerers-cave/engine soak       # a different stream of cases
//   SOAK_REPLAY=map:1234 SOAK_SEED=12345 pnpm … soak                # re-run exactly one failing case
//
// Two kinds of case run round-robin until the clock runs out; the first violation stops the run and prints the
// kind, iteration and seed to replay it:
//
//  map  — a random cave is grown with the real `tryMove` (all 61 base cards, half the time the 30 kit tiles too,
//         random dead doors, collapsed tiles, several levels), the party is dropped somewhere, and for every
//         fresh-draw doorway three entry behaviours (nothing / an Earthquake on the way in / a trap fall) are
//         tried. `moveWithRedraw` is compared with an expectation worked out independently of redraw.ts: its own
//         reachable-region search (a fixed-point relaxation, not the engine's DFS), its own reading of the spec's
//         order of operations, and an exhaustive look at every candidate card in the pack. It checks that a swap
//         happens exactly when the spec says, that the card chosen is acceptable, that no acceptable card is ever
//         missed, that the pack stays a permutation, that the input state is never touched, and that it is
//         deterministic.
//  play — whole games through the real reducer with the rule on, with invariants checked after every action: tiles
//         never overlap, a placed card is never rewritten (only stairs may be added), dead doors only accumulate,
//         the pack is a permutation (kit off), every "no viable exits" warning is true, and replaying the action
//         log reproduces the final state exactly.
import { it } from "vitest";
import { AREA_CARDS, EXT_AREA_CARDS, SPECIAL_WHIRLPOOL, SPECIAL_CHASM } from "./data/areaCards";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, packCoord, targetCoord, unpackCoord } from "./coords";
import { AF_DESTROYED, AF_UNRESOLVED, type GameState } from "./state";
import { closeDoor, layConnecting, tryMove } from "./map";
import { moveWithRedraw, viableExitsCheck } from "./redraw";
import { newGame } from "./setup";
import { reduce } from "./reduce";
import { legalActions } from "./selectors";
import { makeState } from "./testkit";
import type { GameAction, GameEvent } from "./actions";

// (no @types/node in this package; only these two bits of Node are used)
declare const process: { env: Record<string, string | undefined>; stderr: { write(s: string): void } };

const SECONDS = Number(process.env.SOAK_SECONDS ?? 300);
const BASE_SEED = Number(process.env.SOAK_SEED ?? 20261010);
const REPLAY = process.env.SOAK_REPLAY; // e.g. "map:1234" or "play:77"

// ---------------------------------------------------------------------------------------------------------------
// small utilities

type Rng = { next(): number; int(n: number): number; pick<T>(xs: readonly T[]): T; chance(p: number): boolean };
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n), pick: (xs) => xs[Math.floor(next() * xs.length)]!, chance: (p) => next() < p };
}
const caseSeed = (kind: string, iter: number) => (BASE_SEED * 2654435761 + iter * 40503 + (kind === "map" ? 1 : 2)) >>> 0;

class SoakFailure extends Error {}
function check(cond: unknown, msg: string, ctx?: () => unknown): asserts cond {
  if (!cond) throw new SoakFailure(msg + (ctx ? "\n  context: " + JSON.stringify(ctx()) : ""));
}
const sortedPack = (s: GameState) => [...s.largePack].sort((a, b) => a - b).join(",");
const snap = (s: GameState) => JSON.stringify(s);

const LATERAL = [DIR_N, DIR_E, DIR_S, DIR_W];
const ALL = [...LATERAL, DIR_UP, DIR_DOWN];
// per direction: card bit, the reverse doorway a lateral neighbour needs, opposite direction
const BIT: Record<number, number> = { [DIR_N]: 1, [DIR_E]: 2, [DIR_S]: 4, [DIR_W]: 8, [DIR_UP]: 32, [DIR_DOWN]: 64 };
const REV: Record<number, number> = { [DIR_N]: 4, [DIR_E]: 8, [DIR_S]: 1, [DIR_W]: 2 };
const OPP: Record<number, number> = { [DIR_N]: DIR_S, [DIR_S]: DIR_N, [DIR_E]: DIR_W, [DIR_W]: DIR_E };
const special = (card: number) => (card >> 7) & 15;

// ---------------------------------------------------------------------------------------------------------------
// the independent oracle: "is there any way left to carry on exploring from `start`?"

function oracleViable(s: GameState, start: number): boolean {
  const at = new Map<number, number>();
  s.areas.forEach((a, i) => at.set(a.coord, i));
  const packLeft = s.largeIdx < s.largePack.length;
  const open = (i: number) => s.areas[i]!.card & ~(s.areas[i]!.deadDoors ?? 0);

  // arrival doorway of the starting tile (matters on a Whirlpool only): the lateral side the party came in by
  let arrival0: number | undefined;
  if (start === s.partyArea && !s.fellThroughTrap && s.prev !== s.partyArea) {
    const c = unpackCoord(s.areas[start]!.coord), p = unpackCoord(s.areas[s.prev]!.coord);
    if (p.level === c.level) arrival0 = p.y < c.y ? DIR_N : p.y > c.y ? DIR_S : p.x < c.x ? DIR_W : p.x > c.x ? DIR_E : undefined;
  }

  const seen = new Set<string>();
  const work: [number, number | undefined][] = [[start, arrival0]];
  while (work.length) {
    const [i, arr] = work.pop()!;
    const a = s.areas[i]!;
    const key = special(a.card) === SPECIAL_WHIRLPOOL ? `${i}/${arr ?? "x"}` : `${i}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { level, x, y } = unpackCoord(a.coord);
    if (special(a.card) === SPECIAL_CHASM) {
      const below = at.get(packCoord(level + 1, x, y));
      if (packLeft || (below !== undefined && !(s.areas[below]!.flags & AF_DESTROYED) && special(s.areas[below]!.card) !== SPECIAL_WHIRLPOOL)) return true;
    }
    for (const dir of ALL) {
      if (!(open(i) & BIT[dir]!)) continue;
      if (special(a.card) === SPECIAL_WHIRLPOOL && arr !== undefined && dir === OPP[arr]) continue;
      if (dir === DIR_UP && level === 1) continue; // leaves the Cave
      const j = at.get(targetCoord(dir, level, x, y));
      if (j === undefined) { if (packLeft) return true; continue; }
      const d = s.areas[j]!;
      if (d.flags & AF_DESTROYED) continue;
      const vertical = dir === DIR_UP || dir === DIR_DOWN;
      if (vertical) {
        if (special(d.card) === SPECIAL_WHIRLPOOL) continue;
        work.push([j, undefined]);
      } else if (open(j) & REV[dir]!) work.push([j, OPP[dir]]);
    }
  }
  return false;
}

/** Does a card drawn for a move in `dir` connect? */
function connects(card: number, dir: number): boolean {
  if (dir === DIR_UP || dir === DIR_DOWN) return special(card) !== SPECIAL_WHIRLPOOL;
  return (card & REV[dir]!) !== 0;
}

// ---------------------------------------------------------------------------------------------------------------
// MAP CASES

function genMap(rng: Rng): GameState {
  const kit = rng.chance(0.5);
  const pool = kit ? [...AREA_CARDS, ...EXT_AREA_CARDS] : [...AREA_CARDS];
  const draws = Array.from({ length: 400 }, () => rng.pick(pool));
  let s = makeState({ largePack: draws, largeIdx: 0, seed: 1 + rng.int(2 ** 30) });
  const want = 2 + rng.int(40);
  for (let i = 0; i < want * 8 && s.areas.length < want; i++) {
    const live = s.areas.map((a, k) => k).filter((k) => !(s.areas[k]!.flags & AF_DESTROYED));
    s.partyArea = rng.pick(live);
    s.prev = s.partyArea;
    s.level = unpackCoord(s.areas[s.partyArea]!.coord).level;
    const dir = rng.pick(ALL);
    if (dir === DIR_UP && s.level === 1) continue;
    const r = tryMove(s, dir);
    if (r.moved || r.deadEnd) s = r.state;
    if (rng.chance(0.07) && s.areas.length > 2) s.areas[1 + rng.int(s.areas.length - 1)]!.flags |= AF_DESTROYED;
  }
  const live = s.areas.map((a, k) => k).filter((k) => !(s.areas[k]!.flags & AF_DESTROYED));
  s.partyArea = rng.pick(live);
  s.prev = rng.chance(0.8) ? rng.pick(live) : s.partyArea;
  s.level = unpackCoord(s.areas[s.partyArea]!.coord).level;
  s.fellThroughTrap = rng.chance(0.1);
  // a random-length pack, from 0 cards up to a dozen
  const k = rng.chance(0.2) ? rng.int(3) : rng.int(13);
  s.largePack = Array.from({ length: k }, () => rng.pick(pool));
  s.largeIdx = 0;
  return s;
}


/** A fully explored 5x5 block with a single hole in the middle and every doorway toward empty space closed except the
 *  party's own doorway into the hole. The tile that goes in the hole is surrounded, so a card that connects there
 *  usually seals the party in — the situation that only the Sealing-Card and connecting-tier branches reach. */
function pocketMap(rng: Rng): GameState {
  const kit = rng.chance(0.5);
  const pool = kit ? [...AREA_CARDS, ...EXT_AREA_CARDS] : [...AREA_CARDS];
  const cell = (cx: number, cy: number) => packCoord(1, 48 + cx, 48 + cy);
  const areas: GameState["areas"] = [];
  const party = rng.pick(pool.filter((c) => (c & 2) !== 0 && special(c) !== SPECIAL_WHIRLPOOL));
  let partyIdx = 0;
  for (let cy = 0; cy < 5; cy++) {
    for (let cx = 0; cx < 5; cx++) {
      if (cx === 2 && cy === 2) continue; // the hole
      const isParty = cx === 1 && cy === 2;
      if (isParty) partyIdx = areas.length;
      areas.push({ card: isParty ? party : rng.pick(pool), coord: cell(cx, cy), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    }
  }
  const occupied = new Set(areas.map((a) => a.coord));
  const frontier: [number, number][] = [];
  areas.forEach((a, i) => {
    for (const dir of LATERAL) {
      const { level, x, y } = unpackCoord(a.coord);
      if (!(a.card & BIT[dir]!) || occupied.has(targetCoord(dir, level, x, y))) continue;
      if (i === partyIdx && dir === DIR_E) continue; // the party's way into the hole stays open
      a.deadDoors = (a.deadDoors ?? 0) | BIT[dir]!;
      frontier.push([i, dir]);
    }
  });
  if (frontier.length && rng.chance(0.3)) { const [i, dir] = rng.pick(frontier); areas[i]!.deadDoors! &= ~BIT[dir]!; }
  for (const a of areas) if (a.deadDoors === 0) delete a.deadDoors;
  if (rng.chance(0.3)) areas[rng.int(areas.length)]!.flags |= AF_DESTROYED;
  const pool2 = Array.from({ length: 1 + rng.int(8) }, () => rng.pick(pool));
  const s = makeState({ areas, partyArea: partyIdx, prev: rng.int(areas.length), level: 1, largePack: pool2, largeIdx: 0, seed: 1 + rng.int(2 ** 30) });
  if (s.areas[s.partyArea]!.flags & AF_DESTROYED) s.areas[s.partyArea]!.flags &= ~AF_DESTROYED;
  return s;
}

type Stub = (s: GameState) => void;
function stubs(s0: GameState): Record<string, Stub> {
  const far = s0.areas.findIndex((a) => unpackCoord(a.coord).level !== s0.level && !(a.flags & AF_DESTROYED));
  return {
    none: () => undefined,
    // an Earthquake destroys the tile the party came from
    quake: (s) => { if (s.prev !== s.partyArea) s.areas[s.prev]!.flags |= AF_DESTROYED; },
    // a trap in some chambers (those whose card is a multiple of 3) drops the party onto a fixed tile elsewhere
    fall: (s) => {
      if (far >= 0 && s.areas[s.partyArea]!.card % 3 === 0) { s.partyArea = far; s.level = unpackCoord(s.areas[far]!.coord).level; }
    },
  };
}

const stats = { maps: 0, plays: 0, moves: 0, actions: 0, noSwap: 0, strictDeadEnd: 0, strictSealed: 0, connectingTier: 0, nullDeadEnd: 0, nullSealed: 0, warnings: 0 };

function mapCase(iter: number): void {
  const rng = mulberry32(caseSeed("map", iter));
  const s0 = rng.chance(0.4) ? pocketMap(rng) : genMap(rng);
  stats.maps++;
  const where = () => ({ iter, areas: s0.areas.length, party: s0.partyArea, pack: s0.largePack });

  // 1. the region search agrees with the oracle, from the party and from a few other tiles
  for (const start of [s0.partyArea, ...Array.from({ length: 3 }, () => rng.int(s0.areas.length))]) {
    if (s0.areas[start]!.flags & AF_DESTROYED) continue;
    check(viableExitsCheck(s0, start) === oracleViable(s0, start), `viableExitsCheck disagrees with the oracle (start ${start})`, where);
  }

  // 2. every fresh-draw doorway, under each entry behaviour
  const party = s0.areas[s0.partyArea]!;
  const { level, x, y } = unpackCoord(party.coord);
  const occupied = new Set(s0.areas.map((a) => a.coord));
  for (const [stubName, enter] of Object.entries(stubs(s0))) {
    for (const dir of ALL) {
      if (!((party.card & ~(party.deadDoors ?? 0)) & BIT[dir]!)) continue;
      if (dir === DIR_UP && level === 1) continue;
      const target = targetCoord(dir, level, x, y);
      if (occupied.has(target) || s0.largeIdx >= s0.largePack.length) continue;
      stats.moves++;
      moveCase(s0, dir, stubName, enter, where);
    }
  }
}

function moveCase(s0: GameState, dir: number, stubName: string, enter: Stub, where: () => unknown): void {
  const ctx = () => ({ ...(where() as object), dir, stub: stubName });
  const before = snap(s0);
  const res = moveWithRedraw(s0, dir, enter);
  check(snap(s0) === before, "moveWithRedraw mutated the state it was given", ctx);
  const again = moveWithRedraw(s0, dir, enter);
  check(snap(again.state) === snap(res.state) && JSON.stringify(again.swap) === JSON.stringify(res.swap), "not deterministic", ctx);

  // ---- the independent expectation
  const drawn = s0.largePack[s0.largeIdx]!;
  const S1 = structuredClone(s0);
  S1.largeIdx += 1; // the draw
  const n = S1.largePack.length - S1.largeIdx;
  const party = S1.areas[S1.partyArea]!;
  const { level, x, y } = unpackCoord(party.coord);
  const targetC = targetCoord(dir, level, x, y);

  const entryLeavesWay = (card: number): boolean => {
    const t = structuredClone(S1);
    layConnecting(t, dir, { card, bypassDoors: false, scripted: false });
    enter(t);
    return t.largeIdx >= t.largePack.length || oracleViable(t, t.partyArea);
  };

  let needSwap: boolean;
  let reason: "deadEnd" | "sealed" = "deadEnd";
  if (connects(drawn, dir)) {
    needSwap = n > 0 && !entryLeavesWay(drawn);
    reason = "sealed";
  } else {
    const wb = structuredClone(S1);
    wb.areas.push({ card: drawn, coord: targetC, faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 });
    closeDoor(wb.areas[wb.partyArea]!, dir);
    needSwap = !oracleViable(wb, wb.partyArea);
  }
  const undrawn = S1.largePack.slice(S1.largeIdx);
  const strictCards = needSwap ? undrawn.filter((c) => connects(c, dir) && entryLeavesWay(c)) : [];
  const connectingCards = needSwap ? undrawn.filter((c) => connects(c, dir)) : [];

  // ---- compare
  const laidArea = res.state.areas[res.state.areas.length - 1]!;
  if (!needSwap) {
    stats.noSwap++;
    check(!res.swap, "swapped when it should not have", ctx);
    check(res.noViableExits === false, "warned when it should not have", ctx);
    check(res.moved === connects(drawn, dir) && res.deadEnd === !connects(drawn, dir), "wrong outcome with no swap needed", ctx);
    check(laidArea.card === drawn || (laidArea.card & ~96) === (drawn & ~96), "wrong card laid", ctx);
    check(res.state.largePack.join() === s0.largePack.join(), "pack changed without a swap", ctx);
    return;
  }
  if (strictCards.length > 0) {
    check(res.swap, "missed an acceptable card: no swap although one exists", ctx);
    check(res.swap.reason === reason, "wrong swap reason", ctx);
    check(res.swap.removed === drawn, "swap.removed is not the drawn card", ctx);
    check(strictCards.includes(res.swap.drawn), "swapped for a card that is not acceptable", ctx);
    check(res.noViableExits === false, "warned after a strict swap", ctx);
    check(res.moved, "swap did not move the party", ctx);
    if (reason === "sealed") stats.strictSealed++; else stats.strictDeadEnd++;
  } else if (reason === "deadEnd" && connectingCards.length > 0) {
    check(res.swap && res.swap.reason === "deadEnd", "connecting tier missed a card that connects", ctx);
    check(connectingCards.includes(res.swap.drawn), "connecting tier chose a card that does not connect", ctx);
    check(res.noViableExits === (n >= 1), "connecting-tier warning wrong", ctx);
    check(res.moved, "connecting tier did not move the party", ctx);
    stats.connectingTier++;
  } else {
    check(!res.swap, "swapped although nothing is acceptable", ctx);
    check(res.noViableExits === (n >= 1), "null-result warning wrong", ctx);
    check(res.state.largePack.join() === s0.largePack.join(), "pack changed on a null swap", ctx);
    if (reason === "deadEnd") { check(res.deadEnd && !res.moved, "null dead-end result wrong", ctx); stats.nullDeadEnd++; }
    else { check(res.moved && !res.deadEnd, "null sealing result wrong", ctx); stats.nullSealed++; }
  }
  if (res.swap) {
    check(sortedPack(res.state) === sortedPack(s0), "swap broke the pack permutation", ctx);
    check(res.state.largeIdx === s0.largeIdx + 1, "swap moved largeIdx", ctx);
    check(res.state.largePack.length === s0.largePack.length, "swap changed the pack size", ctx);
    check((laidArea.card & ~96) === (res.swap.drawn & ~96), "laid card is not the swap's card", ctx);
  }
  check(new Set(res.state.areas.map((a) => a.coord)).size === res.state.areas.length, "two tiles share a cell", ctx);
  if (res.noViableExits) stats.warnings++;
}

// ---------------------------------------------------------------------------------------------------------------
// PLAY CASES

const PICKS = [[0], [1, 7], [3], [5, 6, 7], [2, 7]];

function playCase(iter: number): void {
  const rng = mulberry32(caseSeed("play", iter));
  const kit = rng.chance(0.4);
  const picks = rng.pick(PICKS);
  let s: GameState;
  try { s = newGame(1 + rng.int(2 ** 30), picks, kit ? { extensionKit: true } : undefined); } catch { return; }
  s.variants = { ...(s.variants ?? {}), forcedRedraw: true };
  stats.plays++;
  const start = structuredClone(s);
  const log: GameAction[] = [];
  const moveBias = 0.4 + rng.next() * 0.55;
  const packAtStart = sortedPack(s);
  const ctx = () => ({ iter, kit, picks, steps: log.length });

  for (let step = 0; step < 1500 && s.gs === 0; step++) {
    const acts = legalActions(s);
    if (acts.length === 0) break;
    const moves = acts.filter((a) => a.type === "move");
    const a = moves.length && rng.chance(moveBias) ? rng.pick(moves) : rng.pick(acts);
    const prev = s;
    const r = reduce(s, a);
    log.push(a);
    stats.actions++;
    s = r.state;

    // map invariants
    check(new Set(s.areas.map((x) => x.coord)).size === s.areas.length, "two tiles share a cell", ctx);
    check(s.largeIdx <= s.largePack.length, "largeIdx beyond the pack", ctx);
    if (!kit) check(sortedPack(s) === packAtStart, "the pack stopped being a permutation of the deal", ctx);
    prev.areas.forEach((old, i) => {
      const now = s.areas[i];
      check(now, "an area disappeared", ctx);
      const replaced = (now.flags & AF_UNRESOLVED) !== 0 || old.coord !== now.coord;
      if (replaced) return; // a Spell remap lays a brand new card
      check((now.card & ~96) === (old.card & ~96), "a placed card was rewritten", () => ({ ...(ctx() as object), area: i, old: old.card, now: now.card }));
      check(((now.deadDoors ?? 0) & ~(old.deadDoors ?? 0) & ~now.card) === 0, "deadDoors names a doorway the card lacks", ctx);
      const lost = (old.deadDoors ?? 0) & ~(now.deadDoors ?? 0);
      check((lost & ~96) === 0, "a dead door was reopened", ctx); // only a revealed stair may clear its bit
    });
    for (const ar of s.areas) check(((ar.deadDoors ?? 0) & ~ar.card) === 0, "deadDoors names a doorway the card lacks", ctx);

    // event invariants
    if (a.type === "move") eventChecks(prev, s, r.events, ctx);
    else check(!r.events.some((e) => e.type === "deadEndCardSwapped" || e.type === "deadEndNoViableExits"), "swap event from a non-move action", ctx);
  }

  // replaying the log reproduces the game exactly
  let t = start;
  for (const a of log) t = reduce(t, a).state;
  check(snap(t) === snap(s), "replaying the action log did not reproduce the final state", ctx);
}

function eventChecks(prev: GameState, now: GameState, events: GameEvent[], ctx: () => unknown): void {
  const swaps = events.filter((e) => e.type === "deadEndCardSwapped");
  check(swaps.length <= 1, "more than one swap in a move", ctx);
  const warn = events.some((e) => e.type === "deadEndNoViableExits");
  const moved = events.some((e) => e.type === "moved");
  if (warn) {
    stats.warnings++;
    // the warning is only ever truthful: the party really has no way on (judged on the map as it is left)
    if (now.phase !== "gameOver" && now.largeIdx < now.largePack.length) {
      check(!oracleViable(now, now.partyArea), "warned of no viable exits but a way on exists", () => ({ ...(ctx() as object), phase: now.phase }));
    }
  }
  if (swaps.length) check(moved, "a swap that did not end in a move", ctx);
  void prev;
}

// ---------------------------------------------------------------------------------------------------------------

it(`soak: Dead End rule (${SECONDS}s)`, { timeout: (SECONDS + 180) * 1000 }, () => {
  const t0 = Date.now();
  let last = t0;
  const log = (m: string) => process.stderr.write(`[soak ${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}\n`);
  const run = (kind: "map" | "play", iter: number) => {
    try {
      if (kind === "map") mapCase(iter); else playCase(iter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`SOAK FAILURE in ${kind} case ${iter}: ${msg}\n  replay: SOAK_SEED=${BASE_SEED} SOAK_REPLAY=${kind}:${iter} pnpm --filter @sorcerers-cave/engine soak\n  stats: ${JSON.stringify(stats)}`);
    }
  };

  if (REPLAY) {
    const [kind, iter] = REPLAY.split(":");
    run(kind as "map" | "play", Number(iter));
    log(`replayed ${REPLAY}: no failure`);
    return;
  }

  log(`seed ${BASE_SEED}, ${SECONDS}s`);
  for (let i = 0; (Date.now() - t0) / 1000 < SECONDS; i++) {
    for (let k = 0; k < 40; k++) run("map", i * 40 + k);
    run("play", i);
    if (Date.now() - last > 15000) { last = Date.now(); log(JSON.stringify(stats)); }
  }
  log("done " + JSON.stringify(stats));

  // The generators must actually reach every branch of the rule, or the run proves nothing.
  if (SECONDS >= 20) {
    for (const k of ["noSwap", "strictDeadEnd", "strictSealed", "connectingTier", "nullDeadEnd", "nullSealed", "warnings"] as const) {
      check(stats[k] > 0, `coverage: the soak never exercised "${k}" — the generators are not reaching that branch`, () => stats);
    }
  }
});

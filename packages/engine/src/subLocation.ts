import { decodeArea } from "./decode";
import { DIR_N, DIR_E, DIR_S, DIR_W, unpackCoord } from "./coords";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL, SPECIAL_CHASM } from "./data/areaCards";
import type { GameState } from "./state";

/** The four special areas Peter's precise-locations notes cover — Deep Pool, Viper Pit, Whirlpool,
 *  Chasm all get a doorway/island sub-location (never "centre": see `getSubLocation`). */
export const SUB_LOCATION_SPECIALS: ReadonlySet<number> = new Set([
  SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL, SPECIAL_CHASM,
]);

/** Viper Pit and Whirlpool restrict a doorway-to-doorway crossing to the two ADJACENT doorways
 *  around the ledge/shallows — never straight across (Peter's Case 1; §8.1). Deep Pool has no such
 *  limit ("swim to any of the other doorways"); Chasm has no lateral crossing at all. */
export const RING_ADJACENCY_SPECIALS: ReadonlySet<number> = new Set([SPECIAL_VIPER_PIT, SPECIAL_WHIRLPOOL]);

/** Viper Pit and Deep Pool are the two areas Peter's jump-to-island house rule applies to (§8.2) —
 *  Whirlpool has no island at all, and Chasm's island is reached only via a secret stair/trap. */
export const ISLAND_JUMP_SPECIALS: ReadonlySet<number> = new Set([SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL]);

export type SubAt = "doorway" | "centre" | "island";
export interface SubLocation {
  at: SubAt;
  dir?: number; // DIR_N..DIR_W — only meaningful when at === "doorway"
}

/** The compass direction directly opposite `dir` (N<->S, E<->W) — the one doorway a Viper-Pit or
 *  Whirlpool ledge-walk can never reach directly (§8.1). Retracing the entry doorway is unaffected:
 *  it is never the opposite of itself. */
export function oppositeDir(dir: number): number {
  switch (dir) {
    case DIR_N: return DIR_S;
    case DIR_S: return DIR_N;
    case DIR_E: return DIR_W;
    case DIR_W: return DIR_E;
    default: return dir;
  }
}

/** Direction (DIR_N..DIR_W) from the CURRENT area back toward `state.prev` — i.e. which doorway the
 *  party is standing in. Undefined for a vertical arrival (secret stair/trap — no lateral doorway)
 *  or when there's no meaningful previous area (e.g. game start, prev === partyArea). */
function doorwayDir(state: GameState): number | undefined {
  if (state.prev === state.partyArea) return undefined;
  const cur = state.areas[state.partyArea];
  const prev = state.areas[state.prev];
  if (!cur || !prev) return undefined;
  const c = unpackCoord(cur.coord);
  const p = unpackCoord(prev.coord);
  if (p.level !== c.level) return undefined; // vertical arrival — no lateral doorway
  if (p.y < c.y) return DIR_N;
  if (p.y > c.y) return DIR_S;
  if (p.x < c.x) return DIR_W;
  if (p.x > c.x) return DIR_E;
  return undefined;
}

/** True when the party's arrival at its current area was vertical (a secret stair, or a trap fall —
 *  both land on a special area's island, §10.5) rather than through a lateral doorway. */
function arrivedVertically(state: GameState): boolean {
  if (state.fellThroughTrap) return true;
  if (state.prev === state.partyArea) return false;
  const cur = state.areas[state.partyArea];
  const prev = state.areas[state.prev];
  if (!cur || !prev) return false;
  return unpackCoord(cur.coord).level !== unpackCoord(prev.coord).level;
}

/**
 * Where the party currently sits on its tile (Peter's precise-locations model, §10.5). Pure —
 * derived from existing position/arrival fields, plus the one explicit override `jumpToIsland`
 * writes (`state.subLocation`), for the one same-tile shift geometry alone can't capture.
 *
 * The four special areas (Deep Pool/Viper Pit/Whirlpool/Chasm) are always "doorway" or "island",
 * never "centre" — there is no settled middle ground on a pit/pool/chasm tile. Every other chamber
 * or tunnel is "doorway" while its encounter is still being resolved (`phase === "encounter"` —
 * small cards drawn, hazards/traps live, Withdraw still on the table) and "centre" once the party
 * has committed (Approach/Attack/Loot) or there was never an encounter to resolve.
 */
export function getSubLocation(state: GameState): SubLocation {
  const area = state.areas[state.partyArea];
  if (!area) return { at: "centre" };
  const dec = decodeArea(area.card);
  if (SUB_LOCATION_SPECIALS.has(dec.special)) {
    if (state.subLocation?.area === state.partyArea && state.subLocation.at === "island") return { at: "island" };
    if (arrivedVertically(state)) return { at: "island" };
    return { at: "doorway", dir: doorwayDir(state) };
  }
  if (state.phase === "encounter") return { at: "doorway", dir: doorwayDir(state) };
  return { at: "centre" };
}

// ALL_TREASURES (not the base-only TREASURES): a kit-on game's floor lanes can hold a kit treasure
// (15-21) — the base table's lookup miss silently misclassified every kit ARTIFACT (Elixir, Holy
// Water, Magic Axe, Scroll, Magic Shield) as a plain "treasure" category card (wrong border tint,
// wrong bucket wherever a consumer branches on `card.category === "artifact"`) — found live via the
// Task 16 manual smoke test (a drawn Magic Axe showed category "treasure").
import {
  decodeArea, unpackCoord, ALL_TREASURES, AF_DESTROYED, AF_UNRESOLVED, fluteLulls, getSubLocation,
  DIR_N, DIR_E, DIR_S, DIR_W, type GameState, type PlacedArea,
} from "@sorcerers-cave/engine";
import { resolveTile, resolveCardVariant, normExits, type TileArt, type CardArt, type Rot } from "../data/manifest";
import type { Area, Card } from "./ports";

export interface ArtTables { tiles: TileArt[]; cards: CardArt[]; }

/** engine special int -> ports/manifest special key. Indices 6-11 are the extension kit's six
 *  special areas (design §1.2/Part 2 US-02..07); their manifest `special` strings are verified
 *  against `docs/assets/manifest.json`'s `tilesExtension` entries (carry-forward from Task 5). */
const SPECIAL: (string | null)[] = [
  null, "gateway", "deep-pool", "viper-pit", "tomb-of-kings", "great-hall",
  "chasm", "bell-rope", "lair", "whirlpool", "gallery", "well",
];

export const areaKey = (level: number, col: number, row: number): string => `${level},${col},${row}`;

const DIR_NUM_TO_LETTER: Record<number, 'N' | 'E' | 'S' | 'W'> = { [DIR_N]: 'N', [DIR_E]: 'E', [DIR_S]: 'S', [DIR_W]: 'W' };

/** Encode the live chamber working set into persisted-content codes (100+cid / 200+tid / 300+hid). */
export function encodeWorkingSet(state: GameState): number[] {
  return [
    ...state.strangers.map((id) => 100 + id),
    ...state.treasures.map((id) => 200 + id),
    ...state.hazards.map((id) => 300 + id),
    ...(state.sleeping ?? []).map((id) => 400 + id),
    // Extension kit (SC-EXT-10, design US-06): Gallery statues in the party's LIVE chamber working
    // set — carry-forward from Task 5/7 (this branch was missing, so live statues rendered as
    // nothing until the party moved on and the persisted 500+id codes took over, reduce.ts:74).
    ...(state.statues ?? []).map((id) => 500 + id),
    ...(state.lulled ?? []).map((id) => 100 + id), // flute-lulled Dragons; rendered asleep via the dragonsAsleep flag
  ];
}

function decodeTopology(card: number) {
  const d = decodeArea(card);
  const exits = normExits((d.n ? "N" : "") + (d.e ? "E" : "") + (d.s ? "S" : "") + (d.w ? "W" : ""));
  return { d, exits, special: SPECIAL[d.special] ?? null };
}

export function laneCards(
  codes: readonly number[], cards: CardArt[], dragonsAsleep = false,
): { strangers: Card[]; treasure: Card[]; hazards: Card[] } {
  const strangers: Card[] = [], treasure: Card[] = [], hazards: Card[] = [];
  const seen = new Map<string, number>();
  for (const code of codes) {
    const stone = code >= 500; // 500+cid = a Gallery statue (SC-EXT-10) — inert, stone scenery
    const lotusAsleep = !stone && code >= 400; // 400+cid = a creature put to sleep by Lotus Dust (permanent)
    const kind = stone || lotusAsleep ? "creature" : code >= 300 ? "hazard" : code >= 200 ? "treasure" : "creature";
    const entityId = stone ? code - 500 : lotusAsleep ? code - 400 : code >= 300 ? code - 300 : code >= 200 ? code - 200 : code - 100;
    // A Dragon (id 10) sleeps while the party holds the Charmed Flute (dynamic; see fluteLulls).
    const asleep = lotusAsleep || (kind === "creature" && entityId === 10 && dragonsAsleep);
    // The nth copy of an entity in this lane gets the nth physical card's art, so duplicates (e.g.
    // two Men, several Dragons) each show their own illustration instead of all sharing the first.
    const occKey = `${kind}-${entityId}`;
    const n = seen.get(occKey) ?? 0; seen.set(occKey, n + 1);
    const art = resolveCardVariant(kind, entityId, n, cards);
    const baseId = art?.cardId ?? `${kind}-${entityId}#${n}`;
    const category: Card["category"] =
      kind === "creature" ? "creature"
      : kind === "hazard" ? "hazard"
      : ALL_TREASURES[entityId]?.kind === "artifact" ? "artifact" : "treasure";
    const card: Card = {
      id: `${baseId}#${n}` + (asleep ? "·z" : stone ? "·s" : ""),
      name: art?.name ?? `${kind} ${entityId}`,
      category,
      entityId: String(entityId),
      file: art?.file ?? "",
      asleep,
      stone,
    };
    if (kind === "creature") strangers.push(card);
    else if (kind === "hazard") hazards.push(card);
    else treasure.push(card);
  }
  return { strangers, treasure, hazards };
}

function displayName(special: string | null, isChamber: boolean): string {
  switch (special) {
    case "gateway": return "The Gateway";
    case "deep-pool": return "Deep Pool";
    case "viper-pit": return "Viper Pit";
    case "tomb-of-kings": return "Tomb of Kings";
    case "great-hall": return "Great Hall";
    // Extension kit (design Part 2 US-02..07) — the six kit special areas.
    case "chasm": return "The Chasm";
    case "bell-rope": return "The Bell Rope";
    case "lair": return "The Lair";
    case "whirlpool": return "The Whirlpool";
    case "gallery": return "The Gallery";
    case "well": return "The Well";
    default: return isChamber ? "Chamber" : "Tunnel";
  }
}

/**
 * Project an engine PlacedArea (at index `idx`) into a ports `Area`.
 * `liveContents` overrides the floor codes (used for the party's active chamber working set).
 */
export function projectArea(
  pa: PlacedArea, idx: number, state: GameState, art: ArtTables, liveContents?: readonly number[],
): Area {
  const { level, x, y } = unpackCoord(pa.coord);
  const { d, exits, special } = decodeTopology(pa.card);
  // The tile is drawn in its PRINTED orientation: stairs added only for level connectivity
  // (descent/carpet) are excluded from tile selection so the art is never rotated to fit.
  const mirrored = pa.mirroredStairs ?? 0;
  const resolved = resolveTile(
    { exits, stairUp: d.stairUp && (mirrored & 32) === 0, stairDown: d.stairDown && (mirrored & 64) === 0, special, isChamber: d.chamber },
    art.tiles,
  );
  // Dragons in the party's CURRENT area sleep while it holds the Charmed Flute (§ Charmed Flute);
  // leaving the area wakes them, so the flag is scoped to the party's tile.
  const dragonsAsleep = idx === state.partyArea && fluteLulls(state);
  // Heavy treasure left in a Deep Pool lives on `dropped` (reclaimable on return); display-only
  // hazard scars (e.g. an Earthquake) live on `markers`. Show both on the floor alongside contents.
  // Extension kit (SC-EXT-13, design US-08): a parked Crypt has no content code of its own (unlike
  // Medusa's lurk, `state.cryptCoord` is a bare coordinate pointer, not an `area.contents` entry) —
  // without this, nothing renders at all while it waits to be entered, contradicting the design's
  // "the crypt card lays down and stays visible in the area (lurk presentation, like Medusa's parked
  // card)". Reuses the SAME code (200+21, Crypt/Gems) a "find" resolves onto the floor, so the visual
  // provenance is identical whether the crypt is still sealed or has already been opened.
  const cryptLurk = state.cryptCoord !== undefined && pa.coord === state.cryptCoord ? [200 + 21] : [];
  const floor = [
    ...(liveContents ?? pa.contents),
    ...(pa.dropped ?? []).map((t) => 200 + t),
    ...(pa.markers ?? []),
    ...cryptLurk,
  ];
  const lanes = laneCards(floor, art.cards, dragonsAsleep);
  // Precise Locations (SC-10.5-9): treasure sunk at a specific sub-location, kept apart from the
  // generic `treasure` lane above so it can be rendered precisely (a doorway or the island), not
  // lumped into the tile-wide floor.
  const sunkTreasure = pa.sunkTreasure?.length
    ? pa.sunkTreasure.map((b) => ({
        at: b.at === "island" ? ("island" as const) : DIR_NUM_TO_LETTER[b.at]!,
        items: laneCards(b.items.map((tid) => 200 + tid), art.cards).treasure,
      }))
    : undefined;
  // Precise Locations (SC-10.5): only the party's own (current) area has a meaningful sub-location.
  const subLocation = idx === state.partyArea
    ? (({ at, dir }) => (dir !== undefined ? { at, dir: DIR_NUM_TO_LETTER[dir] } : { at }))(getSubLocation(state))
    : undefined;
  return {
    tileId: resolved?.tileId ?? art.tiles[0]!.tileId,
    rot: (resolved?.rot ?? 0) as Area["rot"],
    level, col: x, row: y,
    exits,
    type: d.chamber ? "chamber" : "tunnel",
    up: d.stairUp, down: d.stairDown,
    special,
    name: displayName(special, d.chamber),
    note: null,
    party: idx === state.partyArea,
    subLocation,
    sunkTreasure,
    visited: pa.visited,
    // Extension kit (SC-EXT-28, design US-22): a Spell-remapped area is placed `faceUp:true` (it is
    // NOT the ordinary dead-end-frontier face-down case) but must still render as an unrevealed card
    // back until it is genuinely (re-)entered — `AF_UNRESOLVED` is the renderer's own signal for
    // that, cleared by `resolveArea` the moment a forward entry resolves it (reduce.ts:355). Without
    // this the map would show the freshly-drawn tile's real art immediately on the remap, before
    // anyone has set foot on it — contradicting the design's "the map visibly swaps the previous
    // tile for a face-down card back." A `withdraw` landing on this tile does NOT clear the flag
    // (disclosed engine gap, reduce.ts:353) — the tile stays face-down under the party until a later
    // forward entry resolves it; documented, not fixed here (no engine change in this pass).
    faceDown: !pa.faceUp || (pa.flags & AF_UNRESOLVED) !== 0,
    destroyed: (pa.flags & AF_DESTROYED) !== 0,
    secretDoor: pa.secretDoor ?? null,
    strangers: lanes.strangers,
    treasure: lanes.treasure,
    hazards: lanes.hazards,
  };
}

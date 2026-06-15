import { decodeArea, unpackCoord, TREASURES, AF_DESTROYED, fluteLulls, type GameState, type PlacedArea } from "@sorcerers-cave/engine";
import { resolveTile, resolveCardVariant, normExits, type TileArt, type CardArt, type Rot } from "../data/manifest";
import type { Area, Card } from "./ports";

export interface ArtTables { tiles: TileArt[]; cards: CardArt[]; }

/** engine special int -> ports/manifest special key */
const SPECIAL: (string | null)[] = [null, "gateway", "deep-pool", "viper-pit", "tomb-of-kings", "great-hall"];

export const areaKey = (level: number, col: number, row: number): string => `${level},${col},${row}`;

/** Encode the live chamber working set into persisted-content codes (100+cid / 200+tid / 300+hid). */
export function encodeWorkingSet(state: GameState): number[] {
  return [
    ...state.strangers.map((id) => 100 + id),
    ...state.treasures.map((id) => 200 + id),
    ...state.hazards.map((id) => 300 + id),
    ...(state.sleeping ?? []).map((id) => 400 + id),
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
    const lotusAsleep = code >= 400; // 400+cid = a creature put to sleep by Lotus Dust (permanent)
    const kind = lotusAsleep ? "creature" : code >= 300 ? "hazard" : code >= 200 ? "treasure" : "creature";
    const entityId = lotusAsleep ? code - 400 : code >= 300 ? code - 300 : code >= 200 ? code - 200 : code - 100;
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
      : TREASURES[entityId]?.kind === "artifact" ? "artifact" : "treasure";
    const card: Card = {
      id: `${baseId}#${n}` + (asleep ? "·z" : ""),
      name: art?.name ?? `${kind} ${entityId}`,
      category,
      entityId: String(entityId),
      file: art?.file ?? "",
      asleep,
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
  const lanes = laneCards(liveContents ?? pa.contents, art.cards, dragonsAsleep);
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
    visited: pa.visited,
    faceDown: !pa.faceUp,
    destroyed: (pa.flags & AF_DESTROYED) !== 0,
    secretDoor: pa.secretDoor ?? null,
    strangers: lanes.strangers,
    treasure: lanes.treasure,
    hazards: lanes.hazards,
  };
}

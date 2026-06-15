import type { AssetManifest, AssetItem } from "@sorcerers-cave/assets";
import { ASSET_BASE } from "@sorcerers-cave/assets";

export type Rot = 0 | 90 | 180 | 270;
export type TileKind = "chamber" | "tunnel" | "gateway";
export type Category = "creature" | "treasure" | "hazard";

/** A tile artwork (canonical, north-up) resolved from the manifest. */
export interface TileArt {
  tileId: string;
  file: string;
  exits: string;        // canonical, N,E,S,W order
  type: TileKind;
  stairUp: boolean;
  stairDown: boolean;
  special: string | null;
}

/** A small-card artwork resolved from the manifest. */
export interface CardArt {
  cardId: string;
  file: string;
  name: string;
  category: Category;
  entityId: number | null;
}

/** The topology a placed area needs art for (engine-agnostic; the caller decodes engine cards). */
export interface Topology {
  exits: string;        // ABSOLUTE exits (engine's final orientation)
  stairUp: boolean;
  stairDown: boolean;
  special: string | null;
  isChamber: boolean;
}

const NESW = ["N", "E", "S", "W"] as const;

/** Canonicalise an exits string to N,E,S,W order (drops anything else). */
export function normExits(exits: string): string {
  return NESW.filter((d) => exits.includes(d)).join("");
}

const tileIdOf = (file: string) => file.replace(/^area-tile-/, "").replace(/\.png$/, "");
const cardIdOf = (file: string) => file.replace(/^small-card-/, "").replace(/\.png$/, "");
const urlOf = (dir: string, file: string) => `${ASSET_BASE}/${dir}/${file}`;

/** Parse the raw manifest into tile and card art tables. */
export function parseManifest(m: AssetManifest): { tiles: TileArt[]; cards: CardArt[] } {
  const tilesCat = m.categories["tiles"];
  const cardsCat = m.categories["cards"];
  const tiles: TileArt[] = (tilesCat?.items ?? []).map((it: AssetItem) => ({
    tileId: tileIdOf(it.file),
    file: urlOf(tilesCat!.dir, it.file),
    exits: normExits(it.exits ?? ""),
    type: (it.tileType ?? "tunnel") as TileKind,
    stairUp: !!it.stairUp,
    stairDown: !!it.stairDown,
    special: it.special ?? null,
  }));
  const cards: CardArt[] = (cardsCat?.items ?? []).map((it: AssetItem) => ({
    cardId: cardIdOf(it.file),
    file: urlOf(cardsCat!.dir, it.file),
    name: it.name ?? "",
    category: (it.category ?? "treasure") as Category,
    entityId: it.entityId ?? null,
  }));
  return { tiles, cards };
}

/**
 * Resolve a topology to a tile artwork; null if no art matches.
 * Tiles are LANDSCAPE and the cave grid is landscape-celled, so a rotated tile never fits a
 * cell — every area card is therefore drawn in its printed orientation (rot 0). The full deck
 * is covered at rot 0 (enforced by tileOrientation.test); rotation is intentionally not done.
 */
export function resolveTile(topo: Topology, tiles: TileArt[]): { tileId: string; rot: Rot } | null {
  const want = normExits(topo.exits);
  for (const t of tiles) {
    if (
      t.special === topo.special &&
      t.stairUp === topo.stairUp &&
      t.stairDown === topo.stairDown &&
      (topo.special !== null || (t.type === "chamber") === topo.isChamber) &&
      t.exits === want
    ) {
      return { tileId: t.tileId, rot: 0 };
    }
  }
  return null;
}

/** Resolve a small card by category + engine entity id; null if none. */
export function resolveCard(category: Category, entityId: number, cards: CardArt[]): CardArt | null {
  return cards.find((c) => c.category === category && c.entityId === entityId) ?? null;
}

/** All distinct card images for an entity, in manifest (deck) order — the physical copies of that
 *  creature/treasure/hazard. Used to give each duplicate (e.g. the 6 Men) its own illustration. */
export function cardsFor(category: Category, entityId: number, cards: CardArt[]): CardArt[] {
  return cards.filter((c) => c.category === category && c.entityId === entityId);
}

/** The nth physical copy's image for an entity, wrapping if there are more copies than images. */
export function resolveCardVariant(category: Category, entityId: number, n: number, cards: CardArt[]): CardArt | null {
  const arts = cardsFor(category, entityId, cards);
  return arts.length ? arts[n % arts.length]! : null;
}

/** Index tiles by tileId for O(1) lookup (used by the renderer adapter in D-2). */
export function indexTilesById(tiles: TileArt[]): Map<string, TileArt> {
  return new Map(tiles.map((t) => [t.tileId, t]));
}

/** Fetch + parse the served manifest at runtime (browser). */
export async function loadManifest(base: string = ASSET_BASE): Promise<{ tiles: TileArt[]; cards: CardArt[] }> {
  const res = await fetch(`${base}/manifest.json`);
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  return parseManifest((await res.json()) as AssetManifest);
}

// Typed contract for the extracted card/tile/token assets (docs/assets/manifest.json).
// Engine entities reference assets by stable integer id; this package maps ids -> sprites.
// The id->sprite mapping is populated in Milestone B/E; here we own only the shape.

/** The kind of game entity a small card depicts (its printed name-banner type). */
export type CardCategory = "creature" | "treasure" | "hazard";

/** Area-tile classification. */
export type TileType = "chamber" | "tunnel" | "gateway";
export type TileSpecial = "deep-pool" | "viper-pit" | "tomb-of-kings" | "great-hall" | "gateway";

export interface AssetItem {
  file: string;
  w: number;
  h: number;
  // Present on small cards (identified from the yellow name banner):
  name?: string; // e.g. "Dragon", "Charmed Flute", "Earthquake"
  category?: CardCategory; // the card type
  entityId?: number | null; // engine id (CREATURES/TREASURES/hazard); null for the Sybil variant
  // Present on area tiles (classified from the art via connected-component analysis):
  exits?: string; // edges reached by the main structure, e.g. "NES" (stubs excluded)
  tileType?: TileType;
  special?: TileSpecial | null;
  // Staircases are independent (a tile may have both), mirroring the engine decoder:
  // up = doorway-topped staircase; down = light-to-dark fade. NSEWUD-style tiles have both.
  stairUp?: boolean;
  stairDown?: boolean;
}

export interface AssetCategory {
  dir: string;
  source: string;
  description: string;
  count: number;
  items: AssetItem[];
}

export interface AssetManifest {
  generated: string;
  categories: Record<string, AssetCategory>;
}

/** Public URL prefix the web app serves the PNGs from. */
export const ASSET_BASE = "/assets";

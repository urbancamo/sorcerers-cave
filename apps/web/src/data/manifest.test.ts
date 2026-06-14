import { describe, it, expect } from "vitest";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { normExits, parseManifest, resolveTile, resolveCard, type Topology, type Category } from "./manifest";

const FIXTURE: AssetManifest = {
  generated: "test",
  categories: {
    tiles: {
      dir: "tiles", source: "base", description: "", count: 3,
      items: [
        { file: "area-tile-s01-1.png", w: 1728, h: 1210, exits: "NE", tileType: "tunnel", special: null, stairUp: false, stairDown: false },
        { file: "area-tile-s07-2.png", w: 1728, h: 1210, exits: "N", tileType: "chamber", special: null, stairUp: true, stairDown: true },
        { file: "area-tile-s14-2.png", w: 1728, h: 1210, exits: "NESW", tileType: "gateway", special: "gateway", stairUp: true, stairDown: false },
      ],
    },
    cards: {
      dir: "cards", source: "base", description: "", count: 2,
      items: [
        { file: "small-card-s01-1.png", w: 1, h: 1, name: "Dragon", category: "creature", entityId: 10 },
        { file: "small-card-s02-1.png", w: 1, h: 1, name: "Magic Sword", category: "treasure", entityId: 3 },
      ],
    },
  },
};

describe("normExits", () => {
  it("normalises to N,E,S,W order", () => {
    expect(normExits("EN")).toBe("NE");
    expect(normExits("WSEN")).toBe("NESW");
  });
});

describe("parseManifest", () => {
  it("derives tileId/cardId from filenames and serves URLs under /assets", () => {
    const { tiles, cards } = parseManifest(FIXTURE);
    expect(tiles.map((t) => t.tileId)).toEqual(["s01-1", "s07-2", "s14-2"]);
    expect(tiles[0]!.file).toBe("/assets/tiles/area-tile-s01-1.png");
    expect(tiles[0]!.exits).toBe("NE");
    expect(cards.map((c) => c.cardId)).toEqual(["s01-1", "s02-1"]);
    expect(cards[0]!.file).toBe("/assets/cards/small-card-s01-1.png");
  });
});

describe("resolveTile", () => {
  const { tiles } = parseManifest(FIXTURE);
  const topo = (o: Partial<Topology>): Topology => ({ exits: "", stairUp: false, stairDown: false, special: null, isChamber: false, ...o });

  it("matches a tunnel only in its printed orientation (never rotated)", () => {
    expect(resolveTile(topo({ exits: "NE", isChamber: false }), tiles)).toEqual({ tileId: "s01-1", rot: 0 });
    // "ES" would be "NE" rotated 90° — rotation is intentionally not done, so there is no match.
    expect(resolveTile(topo({ exits: "ES", isChamber: false }), tiles)).toBeNull();
  });
  it("matches a both-stairs chamber and respects stair flags", () => {
    expect(resolveTile(topo({ exits: "N", isChamber: true, stairUp: true, stairDown: true }), tiles)).toEqual({ tileId: "s07-2", rot: 0 });
    expect(resolveTile(topo({ exits: "E", isChamber: true, stairUp: true, stairDown: true }), tiles)).toBeNull(); // would need rotation
    expect(resolveTile(topo({ exits: "N", isChamber: true, stairUp: false, stairDown: false }), tiles)).toBeNull(); // no matching stair flags
  });
  it("matches a special tile by its special key", () => {
    expect(resolveTile(topo({ exits: "NESW", special: "gateway", stairUp: true }), tiles)).toEqual({ tileId: "s14-2", rot: 0 });
  });
  it("returns null when nothing matches", () => {
    expect(resolveTile(topo({ exits: "NESW", isChamber: false }), tiles)).toBeNull();
  });
});

describe("resolveCard", () => {
  const { cards } = parseManifest(FIXTURE);
  it("resolves by category + entityId", () => {
    expect(resolveCard("creature", 10, cards)?.name).toBe("Dragon");
    expect(resolveCard("treasure", 3, cards)?.name).toBe("Magic Sword");
    expect(resolveCard("hazard", 0, cards)).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeArea, AREA_CARDS, smallPackTemplate } from "@sorcerers-cave/engine";

// engine special int -> manifest special string|null (SPECIAL_* in data/areaCards)
const ENGINE_SPECIAL: (string | null)[] = [null, "gateway", "deep-pool", "viper-pit", "tomb-of-kings", "great-hall"];

function topologyOf(value: number): Topology {
  const d = decodeArea(value);
  const exits = (d.n ? "N" : "") + (d.e ? "E" : "") + (d.s ? "S" : "") + (d.w ? "W" : "");
  return { exits, stairUp: d.stairUp, stairDown: d.stairDown, special: ENGINE_SPECIAL[d.special] ?? null, isChamber: d.chamber };
}

describe("real manifest ↔ engine coverage (D-1 de-risk)", () => {
  // The canonical, shared manifest — loaded inside the describe so import.meta.url
  // is resolved at test-execution time (file: scheme) rather than at jsdom module-load time.
  let real: ReturnType<typeof parseManifest>;
  beforeAll(() => {
    // process.cwd() = apps/web under vitest; manifest lives at ../../docs/assets/manifest.json
    const REAL: AssetManifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../docs/assets/manifest.json"), "utf8"),
    ) as AssetManifest;
    real = parseManifest(REAL);
  });

  it("parses 60 tiles and 72 cards from the real manifest", () => {
    expect(real.tiles.length).toBe(60);
    expect(real.cards.length).toBe(72);
  });

  it("every engine area-card topology resolves to a tile + rotation", () => {
    const unresolved = AREA_CARDS
      .map((value, i) => ({ i, value, topo: topologyOf(value) }))
      .filter((e) => resolveTile(e.topo, real.tiles) === null);
    // If this fails, the list names every engine topology lacking matching art — a real finding.
    expect(unresolved, JSON.stringify(unresolved, null, 2)).toEqual([]);
  });

  it("every small-pack entity resolves to a card", () => {
    const unresolved = new Set<string>();
    for (const code of smallPackTemplate()) {
      const category: Category = code >= 300 ? "hazard" : code >= 200 ? "treasure" : "creature";
      const entityId = code >= 300 ? code - 300 : code >= 200 ? code - 200 : code - 100;
      if (resolveCard(category, entityId, real.cards) === null) unresolved.add(`${category}:${entityId}`);
    }
    expect([...unresolved], JSON.stringify([...unresolved])).toEqual([]);
  });
});

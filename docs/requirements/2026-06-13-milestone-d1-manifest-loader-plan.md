# Milestone D-1 — Manifest Loader & Topology→Art Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the asset-manifest loader and the engine-topology → tile-artwork+rotation binding, and prove with a coverage test that every engine area-card topology and every small-pack entity resolves to real art — de-risking the one substantive gap in the frontend integration.

**Architecture:** A pure, engine-agnostic module `apps/web/src/data/manifest.ts` parses our (single, shared) `docs/assets/manifest.json` into tile/card art tables and resolves a `Topology` to a `{tileId, rot}` and a card to its art. A coverage test in `apps/web` imports `@sorcerers-cave/engine` (decoder + decks) and asserts full resolution against the real manifest. A small sync script serves the PNGs from `apps/web/public/assets` for later phases.

**Tech Stack:** TypeScript, Vitest (the `apps/web` "ui" project), the workspace packages `@sorcerers-cave/engine` and `@sorcerers-cave/assets` (both already deps of `apps/web`, exporting `./src/index.ts`).

---

## Design notes (read first)

- **Card bit layout** (engine `decodeArea`): N=1, E=2, S=4, W=8, chamber=16, stairUp=32, stairDown=64, special=`(value>>7)&7`. Engine specials: `0 none, 1 gateway, 2 deep-pool, 3 viper-pit, 4 tomb, 5 great-hall`.
- **Manifest tiles** carry canonical (north-up) `exits` (e.g. `"NE"`), `tileType` (`chamber|tunnel|gateway`), `special` (`"deep-pool"|"viper-pit"|"tomb-of-kings"|"great-hall"|"gateway"|null`), and independent `stairUp`/`stairDown`. 60 tiles. Filenames are `area-tile-<id>.png` (tileId = `<id>`, e.g. `s12-3`).
- **Manifest cards** carry `name`, `category` (`creature|treasure|hazard` — artifacts fold into `treasure`), `entityId` (engine id; `null` for the Sybil variant). 72 cards. Filenames `small-card-<id>.png`.
- **Binding:** the engine has no rotation; its decoded exits are *absolute/final*. A manifest tile's exits are *canonical*. So resolve = find a tile whose `special`/`stairUp`/`stairDown` match and whose canonical exits, rotated by some `rot∈{0,90,180,270}` (clockwise), equal the engine's exits (and chamber/tunnel matches for non-special tiles). Stairs are vertical — unaffected by lateral rotation, so they must match directly.
- **Exit canonicalisation:** order exits as `N,E,S,W` (so the full set renders `"NESW"`, matching `ports.ts` examples). `rotateExits` and the comparison use the same ordering — internal consistency is what matters.
- **The coverage test is diagnostic.** If any topology/entity fails to resolve, the implementer MUST report the exact failures (card index, value, decoded topology) — do NOT loosen the matcher to force a green. Genuine gaps are a finding we handle deliberately.

---

## File structure

- **Create** `apps/web/src/data/manifest.ts` — pure loader + binding (depends only on `@sorcerers-cave/assets` types).
- **Create** `apps/web/src/data/manifest.test.ts` — unit tests + the engine coverage test (depends on `@sorcerers-cave/engine`).
- **Create** `apps/web/scripts/sync-assets.mjs` — copies `docs/assets/{tiles,cards,tokens,manifest.json}` → `apps/web/public/assets`.
- **Modify** `apps/web/package.json` — add `sync-assets` script.
- **Modify** `apps/web/.gitignore` — ignore `public/assets/`.

---

### Task 1: The manifest loader + binding module

**Files:**
- Create: `apps/web/src/data/manifest.ts`
- Create: `apps/web/src/data/manifest.test.ts`

- [ ] **Step 1: Write the module's unit tests first**

Create `apps/web/src/data/manifest.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { rotateExits, normExits, parseManifest, resolveTile, resolveCard, type Topology } from "./manifest";

const FIXTURE: AssetManifest = {
  generated: "test",
  categories: {
    tiles: {
      dir: "tiles", source: "base", description: "", rotationApplied: -90, count: 3,
      items: [
        { file: "area-tile-s01-1.png", w: 1728, h: 1210, channels: "srgb", sheet: 1, index: 1, sourcePage: 3, rotationApplied: -90, exits: "NE", tileType: "tunnel", special: null, stairUp: false, stairDown: false },
        { file: "area-tile-s07-2.png", w: 1728, h: 1210, channels: "srgb", sheet: 7, index: 2, sourcePage: 9, rotationApplied: -90, exits: "N", tileType: "chamber", special: null, stairUp: true, stairDown: true },
        { file: "area-tile-s14-2.png", w: 1728, h: 1210, channels: "srgb", sheet: 14, index: 2, sourcePage: 16, rotationApplied: -90, exits: "NESW", tileType: "gateway", special: "gateway", stairUp: true, stairDown: false },
      ],
    },
    cards: {
      dir: "cards", source: "base", description: "", rotationApplied: -90, count: 2,
      items: [
        { file: "small-card-s01-1.png", w: 1, h: 1, channels: "srgb", sheet: 1, index: 1, sourcePage: 3, rotationApplied: -90, name: "Dragon", category: "creature", entityId: 10 },
        { file: "small-card-s02-1.png", w: 1, h: 1, channels: "srgb", sheet: 2, index: 1, sourcePage: 4, rotationApplied: -90, name: "Magic Sword", category: "treasure", entityId: 3 },
      ],
    },
  },
};

describe("rotateExits / normExits", () => {
  it("normalises to N,E,S,W order", () => {
    expect(normExits("EN")).toBe("NE");
    expect(normExits("WSEN")).toBe("NESW");
  });
  it("rotates clockwise (N→E→S→W)", () => {
    expect(rotateExits("N", 90)).toBe("E");
    expect(rotateExits("NE", 90)).toBe("ES");
    expect(rotateExits("NE", 180)).toBe("SW");
    expect(rotateExits("NESW", 90)).toBe("NESW"); // full set is rotation-invariant
    expect(rotateExits("E", 0)).toBe("E");
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

  it("matches a tunnel via rotation", () => {
    // s01-1 is canonical "NE"; an engine area whose absolute exits are "ES" = "NE" rotated 90°.
    expect(resolveTile(topo({ exits: "ES", isChamber: false }), tiles)).toEqual({ tileId: "s01-1", rot: 90 });
  });
  it("matches a both-stairs chamber and respects stair flags", () => {
    expect(resolveTile(topo({ exits: "E", isChamber: true, stairUp: true, stairDown: true }), tiles)).toEqual({ tileId: "s07-2", rot: 90 });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test manifest`
Expected: FAIL (`./manifest` does not exist).

- [ ] **Step 3: Implement `manifest.ts`**

Create `apps/web/src/data/manifest.ts`:

```typescript
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

/** Rotate an exits string clockwise by `rot` degrees; returns it canonicalised. */
export function rotateExits(exits: string, rot: Rot): string {
  const k = (rot / 90) % 4;
  const mapped = [...exits]
    .map((d) => {
      const i = NESW.indexOf(d as (typeof NESW)[number]);
      return i < 0 ? d : NESW[(i + k) % 4];
    })
    .join("");
  return normExits(mapped);
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

/** Resolve a topology to a tile artwork + rotation; null if no art matches. */
export function resolveTile(topo: Topology, tiles: TileArt[]): { tileId: string; rot: Rot } | null {
  const want = normExits(topo.exits);
  for (const t of tiles) {
    if (t.special !== topo.special) continue;
    if (t.stairUp !== topo.stairUp) continue;
    if (t.stairDown !== topo.stairDown) continue;
    if (topo.special === null && (t.type === "chamber") !== topo.isChamber) continue;
    for (const rot of [0, 90, 180, 270] as Rot[]) {
      if (rotateExits(t.exits, rot) === want) return { tileId: t.tileId, rot };
    }
  }
  return null;
}

/** Resolve a small card by category + engine entity id; null if none. */
export function resolveCard(category: Category, entityId: number, cards: CardArt[]): CardArt | null {
  return cards.find((c) => c.category === category && c.entityId === entityId) ?? null;
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test manifest`
Expected: PASS (unit tests green). The coverage test is added in Task 2.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter web typecheck`
Expected: clean.

```bash
git add apps/web/src/data/manifest.ts apps/web/src/data/manifest.test.ts
git commit -m "feat(web): manifest loader + topology→tile-art binding (D-1)"
```

---

### Task 2: Engine coverage test (the de-risk)

**Files:**
- Modify: `apps/web/src/data/manifest.test.ts`

- [ ] **Step 1: Add the coverage test against the real engine + real manifest**

Append to `apps/web/src/data/manifest.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeArea, AREA_CARDS, smallPackTemplate } from "@sorcerers-cave/engine";

// The canonical, shared manifest (identical to the design pack's copy).
const REAL: AssetManifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../docs/assets/manifest.json", import.meta.url)), "utf8"),
) as AssetManifest;
const real = parseManifest(REAL);

// engine special int -> manifest special string|null (SPECIAL_* in data/areaCards)
const ENGINE_SPECIAL: (string | null)[] = [null, "gateway", "deep-pool", "viper-pit", "tomb-of-kings", "great-hall"];

function topologyOf(value: number): Topology {
  const d = decodeArea(value);
  const exits = (d.n ? "N" : "") + (d.e ? "E" : "") + (d.s ? "S" : "") + (d.w ? "W" : "");
  return { exits, stairUp: d.stairUp, stairDown: d.stairDown, special: ENGINE_SPECIAL[d.special] ?? null, isChamber: d.chamber };
}

describe("real manifest ↔ engine coverage (D-1 de-risk)", () => {
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
```

- [ ] **Step 2: Run the coverage test**

Run: `pnpm --filter web test manifest`
Expected: PASS — every engine area-card topology and small-pack entity resolves to art.

**IF the coverage test FAILS:** do NOT weaken the matcher to force green. Instead:
1. Capture the printed `unresolved` list (each entry has the engine card index, raw value, and decoded topology — or the `category:entityId` for cards).
2. Determine whether each gap is (a) a genuine missing/mismatched art tile, (b) a `special`/`stairs`/`chamber` classification mismatch between engine and manifest, or (c) an exits-rotation that has no canonical art. 
3. Report findings (counts + the specific list) in your status as **DONE_WITH_CONCERNS** and STOP — the controller decides how to close real gaps (this is exactly the de-risk this phase exists to surface). Do not invent art or fudge the test.

- [ ] **Step 3: Typecheck and commit (only if green)**

Run: `pnpm --filter web typecheck`
Expected: clean.

```bash
git add apps/web/src/data/manifest.test.ts
git commit -m "test(web): prove engine topology + small-pack fully resolve to art (D-1)"
```

---

### Task 3: Serve the assets

**Files:**
- Create: `apps/web/scripts/sync-assets.mjs`
- Modify: `apps/web/package.json`
- Modify: `apps/web/.gitignore`

This makes the PNGs (and manifest) available at `apps/web/public/assets` for later rendering phases without committing binaries to git.

- [ ] **Step 1: Write the sync script**

Create `apps/web/scripts/sync-assets.mjs`:

```javascript
// Copy the canonical asset set into apps/web/public/assets so Vite serves it at /assets.
// PNGs are gitignored (not committed); run `pnpm --filter web sync-assets` after checkout.
import { cpSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const src = resolve(repoRoot, "docs/assets");
const dest = resolve(here, "../public/assets");

mkdirSync(dest, { recursive: true });
// manifest is tiny — always refresh it.
cpSync(resolve(src, "manifest.json"), resolve(dest, "manifest.json"));
// PNG dirs are large — copy only if the target is missing/empty (idempotent, fast re-runs).
for (const dir of ["tiles", "cards", "tokens"]) {
  const from = resolve(src, dir);
  const to = resolve(dest, dir);
  if (!existsSync(from)) continue;
  if (existsSync(to) && readdirSync(to).length > 0) continue;
  cpSync(from, to, { recursive: true });
}
console.log(`Synced assets → ${dest}`);
```

- [ ] **Step 2: Add the npm script**

In `apps/web/package.json`, add to `scripts`:

```json
    "sync-assets": "node scripts/sync-assets.mjs",
```

- [ ] **Step 3: Gitignore the served copy**

Append to `apps/web/.gitignore`:

```
# Synced asset copy (regenerate with `pnpm --filter web sync-assets`)
public/assets/
```

- [ ] **Step 4: Run it and verify the manifest is served**

Run: `pnpm --filter web sync-assets`
Expected: `Synced assets → …/public/assets`. Verify with:

Run: `test -f apps/web/public/assets/manifest.json && echo OK`
Expected: `OK`. Also confirm `apps/web/public/assets/tiles/` contains `area-tile-s01-1.png`.

- [ ] **Step 5: Confirm git ignores the binaries, then commit the tooling**

Run: `git status --porcelain apps/web/public` 
Expected: empty (the copy is ignored).

```bash
git add apps/web/scripts/sync-assets.mjs apps/web/package.json apps/web/.gitignore
git commit -m "chore(web): sync-assets script serves PNGs at /assets (D-1)"
```

---

## Definition of Done

- [ ] `manifest.ts` parses our manifest into tile/card art tables; `rotateExits`/`normExits`/`resolveTile`/`resolveCard` unit-tested.
- [ ] **Coverage test green:** every engine `AREA_CARDS` topology resolves to a `{tileId, rot}`, and every small-pack entity resolves to a `CardArt` — OR a precise gap report exists (DONE_WITH_CONCERNS) for the controller to triage.
- [ ] `sync-assets` script serves `manifest.json` + PNG dirs at `apps/web/public/assets`; `public/assets/` gitignored (no binaries committed).
- [ ] `pnpm --filter web test` and `pnpm --filter web typecheck` green; no new engine changes.

# Handoff: Sorcerer's Cave — 3D Cave View

## Overview
This pack delivers the **front-end view layer** for the browser adaptation of *Sorcerer's Cave*: a WebGL (Three.js) renderer that shows the dungeon as a stack of levels you can orbit, zoom, and walk the party through — tiles butting edge-to-edge so corridors connect, staircases drawn as vertical connectors between levels, and the small cards (creatures / treasure / hazards) laid persistently on each chamber floor. It also includes the **chamber-discovery overlay** (hazard banners, reaction rolls, encounter choices, dice).

The goal of this handoff is to **port this working view layer into your game's codebase and wire it behind your real engine** through a small documented contract — not to rebuild it from scratch.

## About the design files — read this first
Unlike a typical hi-fi mockup handoff, the files here are **working, modular source**, not throwaway HTML to be re-implemented pixel-by-pixel. The renderer is **framework-free ES-module JavaScript + Three.js** with a deliberately clean seam between the view and the rules. Two ways to adopt it:

1. **Lift the modules** (`src/cave3d.js`, `src/reveal.js`) into your app as the view package and **implement the `ports.ts` contract** on your engine (or an adapter). Fastest path; preserves the proven camera feel and choreography exactly.
2. If your front-end is a framework app (React/Vue/Svelte), mount the renderer as a single canvas component and keep its internals as-is — it does not need to become idiomatic React to work. Only the **HUD overlay** (DOM + CSS in `reference/shell.html`) is worth re-expressing in your component system; the 3D core should stay vanilla.

Either way, **`ports.ts` is the contract that matters** — get that right and the renderer drops in.

## Fidelity
**High-fidelity and functional.** Final colours, typography, spacing, camera behaviour, animations, and interaction choreography are all present and working. Treat measured values (below + in `reference/shell.html`) as the intended spec.

## Architecture — the engine⟷view contract
The view talks to the engine through exactly three methods plus a few read-only fields. It never mutates engine state.

```
engine.state()        → StateSnapshot   // HUD binding
engine.openMoves()    → Move[]          // legal moves incl. stairs & undrawn frontiers
engine.tryMove(dir)   → MoveEvent       // the view choreographs the returned event
engine.areas / .placed / .current / .startLevel   // read-only
```

Full typed definitions, the `Area`/`Card` shapes, the `MoveEvent` union, and the `RevealContext` are in **`ports.ts`**. The **worked reference implementation** the prototype runs against is **`src/cave-engine-stub.reference.js`** — read it as the canonical example of every return shape (deck, edge-matching draw, stair draw, chamber draw).

**Golden rule:** the engine owns every rule (deck/shuffle/draw, move legality, edge-matching so corridors connect, hazards, combat, generation). The view is a pure renderer of state + events.

## Port map — what to do with each file

| File | Role | Action |
|---|---|---|
| `src/cave3d.js` | The renderer: camera rig, alpha-cut texture pipeline, tile/stair builders, card-laying, **level isolation** (fades levels above the focus so they can't occlude a tile view), input, HUD wiring, animation loop. | **Port as-is.** The valuable part. |
| `src/reveal.js` | Chamber-discovery overlay. Pure event narration via `RevealContext`. | **Port as-is.** |
| `src/encounter-data.js` | Rules *data* for the reveal beat (hazard order, creature stats). | **Reconcile** — your engine should own these canonical values; keep this only if the view needs display copy. |
| `ports.ts` | The engine⟷view contract (this is the spec). | **Implement** on your engine or an adapter. |
| `src/cave-engine-stub.reference.js` | Reference engine the prototype runs on. | **Replace** with your real engine (behind `ports.ts`). |
| `src/cave-data.reference.js` | Generated snapshot (`TILES`, `CARDS`, `LAYOUT`, `TILE_AR`) built from the manifest; also holds the authored demo dungeon + party. | **Replace** with engine-fed data + a manifest loader. The authored `LAYOUT`/demo party are prototype scaffolding only. |
| `reference/shell.html` | The page shell: HUD markup, full CSS (design tokens, panels, dice, banners), font links, Three.js import map. | **Reference** for the HUD + tokens. Port the overlay into your app shell. |
| `reference/manifest.example.json` | The asset manifest (tile exits/stairs/special + card name/category). | **Reference** for your manifest loader's input shape. |

### The one data-flow change to plan for
Today `cave3d.js` imports `cave-data.js` directly for `TILE_AR` and card metadata (glow colours, inspect). In the real app the data should flow **engine → view**: the engine (fed by a manifest loader) is the source of truth, and the view receives tile/card data through state and events rather than importing a static module. This is a small, well-contained inversion — the import sites are near the top of `cave3d.js` and in `boot()`.

## World / coordinate model (match your engine to this)
The renderer places areas in 3D from their grid coordinates:

```
worldPos(area) = ( col * TILE_W,  -(level - startLevel) * LEVEL_GAP,  row * TILE_D )

TILE_W   = 4.3                 // east–west tile size (X)
TILE_AR  = 1728 / 1210         // tile art aspect (landscape)
TILE_D   = TILE_W / TILE_AR    // north–south tile size (Z) ≈ 3.04
LEVEL_GAP = 5.2                // vertical gap between levels (Y)
```

- **Axes:** East = +X, South = +Z, **down a level = −Y** (`level` increases downward; `startLevel` is the shallowest).
- **Exits & rotation:** `area.exits` is the open-sides string **after** `area.rot` is applied (clockwise). Tiles butt as full rectangles; because the art is centred with corridor stubs reaching each open edge's midpoint, matching `exits` on a shared edge means the corridors line up. Edge-matching at draw time is the engine's job.
- **Tile art:** landscape **1728×1210 PNG**, drawn with **North up**; the engine rotates via `area.rot`. No per-tile orientation flags needed.
- **Stairs:** drawn wherever an `area.down` sits directly above an area at `(level+1, col, row)`. Keep descending/ascending stairs vertically aligned (same col,row) so the connector is vertical.

## Key view behaviours (already implemented in `cave3d.js`)
- **Navigation:** click a glowing doorway or press `N/E/S/W` (and `U`/`D` for stairs) → `engine.tryMove(dir)` → animate token + camera follow; new tiles rise into place.
- **Level isolation (occlusion fix):** snap-to-tile, level focus, and the reveal beat call `setIsolation(level)`, which fades out every level **stacked above** the focus (and stops it writing depth) so it can't obscure the tile view. Levels below stay for context. **Free orbit** clears isolation and restores the full multi-level map. Implemented as a per-level opacity/visibility pass in the render loop (`updateIsolation`).
- **Persistent chamber cards:** on a chamber's first visit the drawn cards are laid flat on its floor, fanned like a hand (creatures upper-left, treasure lower-left), and **persist** for the whole game (`layContents`). Re-entering shows them again.
- **Alpha-cut tiles:** tile PNGs are luminance-keyed at load (`smoothstep(12,48)`) so the dark "unexcavated rock" becomes transparent and only lit corridors/rooms float over the void.

## Design tokens
Colours (CSS custom properties in `reference/shell.html`):

| Token | Hex | Use |
|---|---|---|
| `--void` | `#070709` | background / negative space |
| `--brass` | `#c9a14e` | primary accent, treasure |
| `--brass-bright` | `#e6c578` | highlights, active state, party |
| `--crimson` | `#a8443a` | danger, creatures, hazard alert |
| `--arcane` | `#5f8f8a` | hazard category |
| `--cream` | `#f6efce` | headings on dark |
| `--parchment` | `#e8dbbb` | body text on dark |
| `--stone` / `--stone-dim` | `#b8b1a2` / `#6f6a5f` | muted text, rungs |
| `--panel` / `--panel-2` | `#15151b` / `#1d1d24` | HUD panel fills |
| `--line` / `--line-strong` | `rgba(232,219,187,.13/.26)` | hairlines / borders |

**Card-category colour map** (used for floor-card edge glow, side-panel seal, and the in-scene glow ring):
`creature → #a8443a`, `treasure & artifact → #c9a14e`, `hazard → #5f8f8a`.

Typography (Google Fonts):
- **Display / headings:** `Cinzel` (400–700)
- **Blackletter accent:** `Grenze Gotisch`
- **Body / flavour:** `EB Garamond`
- **UI / chrome:** system UI sans (`ui-sans-serif, system-ui, …`)

## Dependencies
- **Three.js `0.160.0`** — ES module + `OrbitControls` from `three/addons`. The prototype loads both via an import map (see end of `reference/shell.html`); in a bundler, `npm i three@0.160.0` and `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'` (or `'three/examples/jsm/controls/OrbitControls.js'`).
- No other runtime libraries. The reveal overlay and HUD are plain DOM + CSS.

## Assets
- **Source set:** `uploads/sorcerers-cave-assets-min/` in the project — `tiles/` (60 tile PNGs, `area-tile-sNN-V.png`), `cards/` (small card PNGs, `small-card-sNN-V.png`), and `tokens/` (markers, level chips, secret doors).
- **Manifest:** `reference/manifest.example.json` maps every tile to its `exits` / `stairUp` / `stairDown` / `special`, and every card to `name` / `category` / `entityId`. Your manifest loader should consume this shape and produce the engine's tile/card tables.
- **Orientation:** tiles are landscape **1728×1210**, North-up; rotate via `area.rot`.
- Move the asset folder into your app's static/public path and point the loader's base path at it (the prototype uses `uploads/sorcerers-cave-assets-min/...`).

## Files in this pack
```
design_handoff_cave_view/
├── README.md                         ← you are here
├── INTEGRATION.md                    ← step-by-step port guide (Claude Code / WebStorm)
├── ports.ts                          ← the engine⟷view contract (THE spec)
├── src/
│   ├── cave3d.js                     ← renderer — port as-is
│   ├── reveal.js                     ← discovery overlay — port as-is
│   ├── encounter-data.js             ← reveal rules data — reconcile w/ engine
│   ├── cave-engine-stub.reference.js ← reference engine impl of ports.ts — replace
│   └── cave-data.reference.js        ← generated data snapshot — replace w/ engine feed
├── reference/
│   ├── shell.html                    ← page shell: HUD markup, CSS tokens, import map
│   └── manifest.example.json         ← asset manifest input shape
└── screenshots/                      ← rendered reference imagery (see below)
```

## Screenshots (`screenshots/`)
Reference renders composited from the **real tile + card art** using the same
alpha-cut + edge-butting the live renderer uses (the running WebGL view is best
seen locally):
- `01-level-1-map.png` · `02-level-2-map.png` · `03-level-3-map.png` — top-down
  level maps; tiles butt so corridors connect, stair badges (▴/▾) mark vertical
  links, and cards lie in the chambers where they were discovered.
- `04-chamber-cards.png` — a chamber close-up: creatures fan upper-left, treasure
  lower-left, each with its category-coloured edge.
- `05-multilevel-stack.png` — the zoom-out "cave at a glance": levels stacked in
  depth, linked by the dashed-brass staircase connectors.

See **`INTEGRATION.md`** for the concrete, ordered steps to wire this into your engine repo.

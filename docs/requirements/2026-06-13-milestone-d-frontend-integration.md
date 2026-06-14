# Milestone D — Frontend Integration (3D Cave View) — Architecture & Roadmap

> Status: Approved architecture, ready to plan Phase D-1.
> Source design pack: `design_handoff_cave_view/` (read its `README.md`, `INTEGRATION.md`, and `ports.ts`).

## Goal
Adopt the Claude Design 3D cave view as the basis for the front end and wire it behind our existing pure engine + Convex, producing a playable browser game.

## Approved decisions (2026-06-13)
1. **Tile binding — thin adapter mapping.** The 149-test engine stays unchanged. An adapter decodes each area's abstract topology and maps it to a real manifest tile + rotation. (Requires a coverage check that every engine card topology has matching art — done first, in D-1.)
2. **Engine location — server-authoritative Convex with an optimistic client mirror.** The engine is the source of truth inside Convex mutations; the browser keeps a deterministic local mirror so the view's *synchronous* `tryMove` contract is satisfied for choreography. Because the engine is deterministic from `(seed, actions)`, the optimistic mirror and the server agree; the client reconciles from the authoritative snapshot if they ever diverge.
3. **Renderer — mount vanilla, HUD in React.** Port `cave3d.js` / `reveal.js` as-is into a single React canvas component; re-express only the HUD overlay in React + Tailwind. Preserves the proven camera/animation feel (the handoff's intended path).

## The engine ⟷ view seam
The view talks to the engine only through `ports.ts` (`CaveEngine`: `areas`, `placed`, `current`, `startLevel`, `state()`, `openMoves()`, `tryMove(dir)`; plus `RevealContext`). Our engine exposes `reduce(state, action) → {state, events}` + `legalActions(state)`. An adapter bridges them — the engine is never reshaped.

### Adapter responsibilities (`apps/web/src/view/engineAdapter.ts`)
- Hold a **local mirror** `GameState` (seeded from the Convex authoritative snapshot).
- `tryMove(dir)`: map `'N'…'D'` → engine `DIR_*` action; `reduce` locally for an immediate `MoveEvent` (choreography) **and** dispatch the Convex `applyAction` mutation. Reconcile the mirror if the authoritative query later diverges.
- Project `GameState` → `ports.ts` shapes:
  - `Area` ← `PlacedArea`: `coord` → `level/col/row`; **topology → `tileId` + `rot` + `exits`** via the D-1 manifest map; `contents` → `strangers/treasure/hazards` as `Card[]`.
  - `StateSnapshot` ← HUD fields; `Move[]` ← derived from `legalActions` + frontier scan.
  - `MoveEvent` ← assembled from the before/after mirror diff + `reduce`'s `events` (`moved`/`drewChamber`/`deadEnd`/`enteredSpecial`/stair flags → `descended`/`ascended`/`chamber`).
- `RevealContext`: `reveal.js` narrates `ev.chamber`; each encounter decision maps to a real engine action (`test`/`attack`/`fightOn`/`takeTreasure`/`useArtifact`/`withdraw`) dispatched through the adapter. The abstract rolls in `reveal.js` become visual beats over real engine resolution.

## Key gaps & how each is closed
| Gap | Resolution | Phase |
|---|---|---|
| Engine uses abstract bit-topology, no rotation; view needs `tileId`+`rot`+`exits` | Manifest-driven topology→(tileId,rot) index + coverage test | D-1 |
| `tryMove` is synchronous; Convex is server-authoritative | Deterministic engine runs both sides; optimistic client mirror + reactive reconcile | D-2/D-3 |
| `reduce` returns `{state,events}`, not a `MoveEvent` | Adapter assembles `MoveEvent` from diff + events | D-2 |
| Small-pack codes vs `Card{name,category,file}` | `entityId` → manifest card art (name/category/file) | D-1/D-2 |
| ~~Two manifests to reconcile~~ | **None.** The handoff's `manifest.example.json` is byte-identical to our `docs/assets/manifest.json` — the view's `TILES`/`CARDS` are a *generated projection* of it. One source of truth; loader consumes our manifest directly. | n/a |
| Assets not served | Our PNGs already exist at `docs/assets/{tiles,cards,tokens}/`; serve them from `apps/web/public/assets` (copy/symlink) and repoint the view's `uploads/sorcerers-cave-assets-min/...` paths to our `ASSET_BASE` (`/assets`) | D-1 |
| `apps/web` is still the Milestone-A scaffold | Greenfield wiring across D-3/D-4/D-5 | D-3+ |

## Coordinate sanity
Adapter must satisfy the renderer's model: `worldPos = (col*TILE_W, -(level-startLevel)*LEVEL_GAP, row*TILE_D)`; East=+X, South=+Z, deeper level=−Y; `exits` already rotated by `rot`. Our engine: `coord = level*10000 + y*100 + x`, level 1 = surface increasing downward (matches). Map `x→col`, `y→row`, engine level → view level; compute `rot` so the chosen art tile's canonical exits align to the engine's absolute exits.

## Phased roadmap (each phase = working, testable software)
- **D-1 — Assets & manifest loader (de-risks Gap 1 first).** Serve our existing `docs/assets/{tiles,cards,tokens}/` PNGs from `apps/web/public/assets`. Write `data/manifest.ts` over our (single, shared) `manifest.json`: tile table (by tileId), card table (by entityId), and the **topology → (tileId, rot)** index. Ship a **coverage test** asserting every engine `AREA_CARDS` topology (and small-pack entity ids) resolves to art — high confidence since these *are* this game's tiles; the test pins it. *Deliverable: data tables + green coverage test; Gap 1 proven closeable.*
- **D-2 — Engine adapter + ports (headless).** Copy `ports.ts`; implement `engineAdapter` over a local engine mirror; project `GameState` → `Area/StateSnapshot/Move/MoveEvent`; unit-test against engine scenarios (move/draw/stairs/chamber/revisit). *Deliverable: adapter satisfies `CaveEngine`, fully tested without the DOM.*
- **D-3 — Convex server-authority.** `games` schema (`seed`, `picks`, `snapshot: GameState`, `actionLog`, `status`); `newGame` + `applyAction` mutations running the engine in Convex (validate via `legalActions`, `reduce`, persist); `getGame` query; client sync hook feeding the adapter mirror + dispatching actions. Verify `@sorcerers-cave/engine` bundles into Convex. *Deliverable: authoritative round-trip — move persists, reload resumes.*
- **D-4 — Mount renderer + HUD.** Port `cave3d.js`/`reveal.js` into `src/view/`; replace `cave-data.js` imports with adapter/manifest feed; React canvas component; HUD overlay from `reference/shell.html` in React + Tailwind (design tokens, dice, banners, reveal panel). *Deliverable: playable exploration loop in the browser (doorways draw connecting tiles, stairs traverse levels with camera follow, chamber cards persist, level isolation).*
- **D-5 — Encounters, party select, scoring.** Wire `reveal.js` choices to engine actions (reaction/fight/pickup/use-artifact); party-selection screen (`validatePicks`); end-game scoring screen. *Deliverable: full game playable end-to-end.*

## Acceptance (from INTEGRATION.md §5, adapted)
- `ports.ts` in the web package; adapter satisfies it; renderer imports adapter+manifest, not `cave-data.js`.
- Doorway/keys → `tryMove` → connecting tile drawn, party + camera move; `U`/`D` traverse levels; chamber cards lay and persist; level isolation hides levels above focus; Free orbit restores the stack.
- No view code references game rules; no engine code references the DOM.
- Convex persists `(seed, actions)`; reload resumes the authoritative game.

# Integration Guide — wiring the cave view into your engine repo

A concrete, ordered path for porting `src/cave3d.js` + `src/reveal.js` into your
game codebase and connecting them to your real engine. Written for **Claude Code
in JetBrains WebStorm**, but the steps are tool-agnostic.

> Read `README.md` first for the port map, and keep `ports.ts` open — it is the
> contract every step below targets.

---

## 0. Decide the boundary (one minute)
- **Engine** (your work, framework-free): deck, shuffle, edge-matching draw, move
  legality, hazards, combat, scoring, generation, persistence.
- **View** (this pack): everything visual. Talks to the engine only through
  `ports.ts`. Never decides a rule.

If your engine's public API already differs from `ports.ts`, **do not reshape your
engine** — write a thin adapter (`view/engineAdapter.ts`) that wraps it and
exposes the `CaveEngine` surface. The renderer imports the adapter, not your
engine internals.

## 1. Target module layout
```
src/
├── engine/        ← your rules. Framework-free. Exports a CaveEngine (or is wrapped).
│   └── ports.ts   ← copy from this pack; your engine implements/satisfies it
├── data/
│   └── manifest.ts ← loads the asset manifest → engine tile/card tables
├── view/
│   ├── cave3d.js   ← from src/ (renderer)
│   ├── reveal.js   ← from src/ (discovery overlay)
│   └── engineAdapter.ts ← optional: wraps your engine to the CaveEngine surface
└── app/
    └── shell.(html|tsx) ← HUD markup + CSS from reference/shell.html; mounts the view
```

## 2. Suggested Claude Code prompts (run in order)
Open **both** this handoff folder and your engine source in the WebStorm project so
Claude Code can see both sides, then work one seam at a time:

1. **Define the contract**
   > "Copy `ports.ts` into `src/engine/ports.ts`. Summarise the `CaveEngine` and
   > `RevealContext` interfaces and list exactly which methods/fields my engine
   > must provide."

2. **Satisfy it (or adapt)**
   > "Compare `src/engine/ports.ts` with my engine's public API. Either make my
   > engine implement `CaveEngine`, or generate `src/view/engineAdapter.ts` that
   > wraps it. Map every field of `Area`, `Card`, and `MoveEvent`. Use
   > `src/cave-engine-stub.reference.js` as the reference for each return shape."

3. **Bring in the renderer**
   > "Move `src/cave3d.js` and `src/reveal.js` into `src/view/`. Replace the
   > direct `cave-data.js` imports with data fed from the engine/manifest loader.
   > Keep the Three.js core vanilla; do not rewrite it as React."

4. **Manifest loader**
   > "Write `src/data/manifest.ts` that loads `manifest.example.json`'s shape and
   > produces my engine's tile and card tables (tile → exits/stairs/special,
   > card → name/category/entityId). Point the asset base path at my static dir."

5. **Mount + HUD**
   > "Create the app shell from `reference/shell.html`: a full-viewport `#scene`
   > canvas mount plus the HUD overlay (stats, roster, prompt, dock, compass,
   > reveal panel). Preserve the CSS tokens and the reveal/dice/banner styles."

6. **Verify the loop**
   > "Run it. Confirm: doorways draw connecting tiles, stairs traverse levels with
   > camera follow, chamber cards lay on the floor and persist, level isolation
   > hides levels above the focus, and Free orbit restores the full stack."

## 3. Wiring the discovery overlay
In `boot()` of `cave3d.js`, `Reveal.init(ctx)` is called with a `RevealContext`
(see `ports.ts`). The view calls `Reveal.run(area, ev.chamber)` when a
`MoveEvent` carries `chamber`. `reveal.js` only narrates and reports the player's
choice through the callbacks — your engine should drive the *real* hazard/combat
resolution and feed results back as ordinary state/events. Keep the abstracted
rolls in `reveal.js` as the visual beat, or replace their outcomes with calls
into your engine.

## 4. Things that are prototype scaffolding (replace, don't port)
- The authored `LAYOUT` (a fixed, hand-validated 3-level dungeon) in
  `cave-data.reference.js` — your engine's procedural generation replaces it.
- The demo `PARTY` array in `cave3d.js` — real party selection replaces it.
- `cave-engine-stub.reference.js` in full — reference only.

## 5. Acceptance checklist
- [ ] `ports.ts` lives in the engine package; engine (or adapter) satisfies it.
- [ ] Renderer imports the adapter/engine + manifest data, not `cave-data.js`.
- [ ] Doorway/keys → `tryMove` → connecting tile drawn, party + camera move.
- [ ] `U`/`D` traverse levels with vertical camera follow.
- [ ] Chamber cards lay on the floor (fanned) and persist across revisits.
- [ ] Level isolation hides levels above the focus; Free orbit restores all.
- [ ] No view code references game rules; no engine code references the DOM.

## 6. Coordinate sanity check
The renderer assumes `worldPos(area) = (col*TILE_W, -(level-startLevel)*LEVEL_GAP,
row*TILE_D)` with East=+X, South=+Z, deeper level=−Y, and `area.exits` already
rotated by `area.rot`. If your engine uses different axis conventions, normalise
them in the adapter (map your col/row/level/rot into these) rather than editing
the renderer. Constants: `TILE_W=4.3`, `TILE_AR=1728/1210`, `TILE_D=TILE_W/TILE_AR`,
`LEVEL_GAP=5.2` (all in `cave3d.js`, safe to tune for spacing feel).

# Milestone D-4 — Mount the 3D Renderer + HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the vanilla Three.js renderer (`cave3d.js`) and discovery overlay (`reveal.js`) into the web app, invert their data flow to read from our `CaveEngine` adapter + manifest art (instead of the prototype's `cave-data.js`/stub), mount them in a React canvas component with the ported HUD, and get a playable 3D exploration loop in the browser.

**Architecture:** The renderer stays vanilla JS but becomes *re-bootable*: nothing runs at import; `boot(opts)` builds the scene from an injected `engine`, `tiles` art map, `party`, and `tileAR`, and returns a `dispose()`. A `<CaveCanvas>` React component renders the HUD shell (ported from `reference/shell.html`, ids preserved) + a `#scene` mount, loads the manifest, and calls `boot`/`dispose` on mount/unmount. A no-Convex harness page verifies the renderer in isolation (Playwright); then `GameScreen` wires it to the real `useCaveGame` hook.

**Tech Stack:** Three.js `0.160.0`, the vanilla renderer/overlay (ported as-is + inverted), React 19 + Tailwind v4, the D-1 manifest loader, the D-2 adapter, the D-3 `useCaveGame` hook, Vitest (pure units) + Playwright (browser).

---

## Design notes (read first)

- **The renderer's contract is already our adapter.** `cave3d.js` only uses `engine.areas` / `.placed` / `.current` / `.startLevel` / `.openMoves()` / `.tryMove()` — exactly the `CaveEngine` surface our `createCaveAdapter` implements. So the "engine" injected into `boot` is our adapter. No renderer logic about rules changes.
- **Import-time side effects must move into `boot`.** Today `cave3d.js` (lines 17, 26–38, 68, 351, 414–438, 508) creates the engine/renderer, queries the DOM, wires listeners, and calls `boot()` at module load. Convert these top-level `const`s to module-scope `let` assigned inside `boot`, move the side-effect blocks into `boot`, delete the trailing `boot()` call, and `export` `boot`. `boot` must return a `dispose()` that cancels the animation frame and removes all listeners + the renderer canvas (so React unmount/HMR doesn't leak a second WebGL context).
- **Data injection (the inversion):**
  - Remove imports `TILE_AR` (line 3), `CaveEngine` (4), `CREATURE_STATS` (6). Keep `three`, `OrbitControls`, `Reveal`.
  - `boot({ mount, engine, tiles, party, tileAR })`: assign module `engine = injected`; `startLevel = engine.startLevel`; `TILE_D = TILE_W / tileAR`.
  - **Tile texture path** (line 75): replace the hardcoded `'uploads/sorcerers-cave-assets-min/tiles/area-tile-'+area.tileId+'.png'` with `tiles.get(area.tileId)?.file ?? ''` (`tiles` is a `Map<string, TileArt>` from `indexTilesById`; `TileArt.file` is the served `/assets/...` URL).
  - **Card textures already work:** `makeCardObject` (line 251) uses `card.file`, and our projection already puts the served URL on every `Card.file`. No change.
  - **`CARDS` metadata / `window.__cardCat`** (boot lines 481–482, `addCardGlow` 85–87): our adapter areas have no `area.cardId` (cards live in `area.strangers/treasure/hazards`), so `addCardGlow` (guarded by `if(area.cardId)` at line 83) is dormant and the `CARDS` import is unused — **delete** the `const {CARDS}=await import('./cave-data.js')` block. The on-floor card glow (`makeCardObject`, uses `card.category`) is unaffected.
  - **`PARTY`** (line 23) demo array → injected `party` param. It needs the union of fields the renderer + reveal use: `{ sig, name, lead, items, fs, mp, charisma }`. `renderRoster` uses `sig/name/lead/items`; `boot`'s `revealParty` (485–486) becomes `party.map(p => ({name,fs,mp,charisma}))`. Build `party` in React from the engine's `GameState.party` (Task 2/4).
- **`mount`:** pass the React container element to `boot` (don't `getElementById('scene')`); the renderer appends its canvas there. The HUD's other ids are still queried by `getElementById` (they exist because `<CaveCanvas>` renders the full HUD markup).
- **Keep the renderer vanilla `.js`.** Add `apps/web/src/view/cave3d.d.ts` declaring `boot`'s typed signature so `.tsx` can import it without `allowJs`. `reveal.js`/`encounter-data.js` are imported only by `cave3d.js` (untyped) — no `.d.ts` needed.
- **Verification reality:** Three.js needs WebGL/canvas — not available in jsdom. So D-4's automated checks are **typecheck + `vite build` + pure-unit tests** for extractable helpers; the *visual* proof is a **Playwright** load of a no-Convex harness page (Task 3). The full Convex round-trip (Task 4) is browser-verified by the user.
- **Assets must be synced:** the renderer fetches `/assets/...`. Run `pnpm --filter web sync-assets` before any browser check.

---

## File structure

- **Modify** `apps/web/package.json` — add `three@0.160.0` + `@types/three`.
- **Create** `apps/web/src/view/cave3d.js`, `reveal.js`, `encounter-data.js` — ported from the handoff (cave3d inverted).
- **Create** `apps/web/src/view/cave3d.d.ts` — typed `boot` signature.
- **Create** `apps/web/src/view/CaveHud.tsx` + `apps/web/src/view/cave.css` — HUD shell (from `reference/shell.html`).
- **Create** `apps/web/src/view/CaveCanvas.tsx` — React mount (HUD + `#scene` + boot/dispose).
- **Create** `apps/web/src/view/viewParty.ts` + `viewParty.test.ts` — pure GameState→party mapper.
- **Create** `apps/web/cave-test.html` + `apps/web/src/cave-test.tsx` — no-Convex render harness.
- **Modify** `apps/web/src/game/GameScreen.tsx` — render `<CaveCanvas>` from the live hook.

---

### Task 1: Port + invert the renderer (`cave3d.js` / `reveal.js`)

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/view/cave3d.js`, `apps/web/src/view/reveal.js`, `apps/web/src/view/encounter-data.js`, `apps/web/src/view/cave3d.d.ts`

- [ ] **Step 1: Add Three.js**

Add to `apps/web/package.json` dependencies: `"three": "0.160.0"`; devDependencies: `"@types/three": "^0.160.0"`. Run `pnpm install` (from repo root or `pnpm --filter web install`).

- [ ] **Step 2: Copy the overlay + data files verbatim**

Copy `design_handoff_cave_view/src/reveal.js` → `apps/web/src/view/reveal.js` and `design_handoff_cave_view/src/encounter-data.js` → `apps/web/src/view/encounter-data.js` **unchanged** (reveal.js already talks only to `RevealContext` + `encounter-data`; its DOM ids are provided by the HUD in Task 2).

- [ ] **Step 3: Port `cave3d.js` with the data-flow inversion**

Copy `design_handoff_cave_view/src/cave3d.js` → `apps/web/src/view/cave3d.js`, then apply these edits (see Design notes for rationale). Preserve ALL other code exactly.

1. **Imports (lines 1–6):** keep `import * as THREE from 'three';`, `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`, `import { Reveal } from './reveal.js';`. **Delete** the `TILE_AR`, `CaveEngine`, and `CREATURE_STATS` imports.
2. **Constants/state → module `let`:** change `const TILE_W=4.3, TILE_D=TILE_W/TILE_AR, LEVEL_GAP=5.2;` → `const TILE_W=4.3, LEVEL_GAP=5.2; let TILE_D;`. Delete `const engine=new CaveEngine();` and `const startLevel=engine.startLevel;` → declare `let engine, startLevel;` near the top. Delete the demo `const PARTY=[...]` (line 23) → `let PARTY=[];`.
3. **Renderer/scene block (26–38):** change the leading `const`s to module-scope `let renderer, scene, camera, controls, maxAniso;` declared near the top, and MOVE the assignment block (`renderer=new THREE.WebGLRenderer(...)` … `controls.maxPolarAngle=...; maxAniso=renderer.capabilities.getMaxAnisotropy();`) and `mount.appendChild(renderer.domElement)` INTO `boot` (use the injected `mount`, not `getElementById('scene')`). Move `scene.add(platformGroup,tileGroup,stairGroup,fxGroup,exitGroup,contentGroup);` (line 68) into `boot` (after `scene` is created). Keep the `const platformGroup=new THREE.Group()` … declarations at top (pure).
4. **Card-panel consts (351):** change `const cardPanel=...,cardImg=...,emptyBox=...` to module `let cardPanel,cardImg,emptyBox;` and assign them inside `boot` (after the HUD exists).
5. **Tile texture path (75):** `loadAlphaTexture(area.tileId ? tiles.get(area.tileId)?.file ?? '' : '')` — add a module `let tiles;` set from the `boot` param.
6. **Input + dock listeners (414–438):** move the `pointerdown`/`pointerup` (renderer.domElement), the `keydown` (window), the dock-button `addEventListener`s (`snapBtn`/`orbitBtn`/`resetBtn`), the `needle` query, and the `resize` listener INTO `boot`. Store every listener + its target so `dispose` can remove them. (`resetBtn` calls `location.reload()` — acceptable to keep.)
7. **`boot` signature + body:** `export async function boot({ mount, engine: eng, tiles: tileMap, party: partyArr, tileAR })`. At the top set `engine=eng; startLevel=eng.startLevel; tiles=tileMap; PARTY=partyArr; TILE_D=TILE_W/tileAR;`, then the moved renderer/scene/listener setup, then the EXISTING boot body — but **delete** the `const {CARDS}=await import('./cave-data.js'); window.__cardData=...; window.__cardCat=...` lines (unused; keep a `window.__cardCat={}` only if `addCardGlow` references it — simplest: delete `addCardGlow`'s body usage is guarded by `area.cardId`, so leave `window.__cardCat={}` at line 352 as-is). Change `revealParty` (485–486) to `const revealParty=PARTY.map(p=>({name:p.name,fs:p.fs,mp:p.mp,charisma:!!p.charisma}));`.
8. **Animation loop + dispose:** capture the rAF id: `let rafId; function animate(){ rafId=requestAnimationFrame(animate); ... }`. At the end of `boot`, after `animate();`, build and **return** `dispose`:
   ```js
   return function dispose(){
     cancelAnimationFrame(rafId);
     removeEventListener('keydown', onKeyDown);
     removeEventListener('resize', onResize);
     renderer.domElement.removeEventListener('pointerdown', onPointerDown);
     renderer.domElement.removeEventListener('pointerup', onPointerUp);
     renderer.dispose();
     renderer.domElement.remove();
   };
   ```
   (Name the moved listener callbacks — `onKeyDown`/`onResize`/`onPointerDown`/`onPointerUp` — so they can be removed. Keydown is also used by `Reveal` via its own listener inside `Reveal.init`; leave Reveal's own listener alone.)
9. **Delete the trailing `boot();` call (line 508).**

- [ ] **Step 4: Declare the boot type**

Create `apps/web/src/view/cave3d.d.ts`:

```typescript
import type { CaveEngine } from "./ports";
import type { TileArt } from "../data/manifest";

export interface ViewPartyMember {
  sig: string; name: string; lead?: boolean; items: string[];
  fs: number; mp: number; charisma: boolean;
}
export interface BootOptions {
  mount: HTMLElement;
  engine: CaveEngine;
  tiles: Map<string, TileArt>;
  party: ViewPartyMember[];
  tileAR: number;
}
export function boot(opts: BootOptions): Promise<() => void>;
```

- [ ] **Step 5: Verify it builds and typechecks**

Run: `pnpm --filter web typecheck` (expect clean — the `.d.ts` types the import; `.js` itself isn't typechecked).
Run: `pnpm --filter web build` (expect a successful Vite production build — this proves `three` resolves, the ESM imports are valid, and nothing references the deleted `cave-data.js`/stub).

NOTE TO IMPLEMENTER: there is no runtime test in this task (Three.js needs a browser). The build + typecheck are the gate. If `vite build` errors on a leftover `cave-data.js`/`cave-engine-stub`/`CREATURE_STATS` reference, you missed an inversion edit — fix it. Do NOT copy `cave-data.reference.js` or the stub into the app.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/view/cave3d.js apps/web/src/view/reveal.js apps/web/src/view/encounter-data.js apps/web/src/view/cave3d.d.ts
git commit -m "feat(web): port + invert the 3D renderer to boot from the engine adapter (D-4)"
```
(The lockfile may be at the repo root — `git add` whatever `pnpm install` changed.)

---

### Task 2: HUD shell + `CaveCanvas` mount

**Files:**
- Create: `apps/web/src/view/cave.css`
- Create: `apps/web/src/view/CaveHud.tsx`
- Create: `apps/web/src/view/viewParty.ts`, `apps/web/src/view/viewParty.test.ts`
- Create: `apps/web/src/view/CaveCanvas.tsx`

- [ ] **Step 1: Port the HUD markup + CSS**

Read `design_handoff_cave_view/reference/shell.html`. Create `apps/web/src/view/cave.css` containing its entire `<style>` block (the `:root` tokens, panels, dice, banners, reveal styles) verbatim. Create `apps/web/src/view/CaveHud.tsx` as a React component rendering the HUD markup from shell.html's `<body>` **converted to JSX** (`class`→`className`, self-close tags, `for`→`htmlFor`), preserving **every element id the renderer/overlay query**: `scene`, `modelabel`, `st-depth`, `st-turn`, `st-party`, `st-tiles`, `rose` (+ child `.needle`), `rosterBody`, `prompt` (+ `promptText`), `toast`, `snapBtn`, `orbitBtn`, `levelGrp`, `resetBtn`, `cardpanel` (+ `.emptybox`), `cardimg`, `cardwhere`, `cardname`, `cardkind` (+ `cardtag`/`cardtaglabel`), `sel-nm`, `sel-sub`, `loader`, and the reveal overlay `reveal`, `rv-name`, `rv-sub`, `rv-banner`, `rv-actions`. Import `./cave.css` at the top of `CaveHud.tsx`. (The fonts/import-map `<script>` from shell.html is NOT needed — Vite + the `three` npm dep replace it; add the Google Fonts `<link>`s to `apps/web/index.html` if the typography matters, else skip.)

- [ ] **Step 2: Write the pure `viewParty` test**

Create `apps/web/src/view/viewParty.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { newGame } from "@sorcerers-cave/engine";
import { viewParty } from "./viewParty";

describe("viewParty", () => {
  it("maps the engine party to renderer/reveal party members", () => {
    const state = newGame(1, [0, 6]); // Hero + Woman (cost 6+2 > 6? Hero=6, so use [0] or [5,6])
    const p = viewParty(state);
    expect(p.length).toBe(state.party.length);
    const hero = p.find((m) => m.name === "Hero")!;
    expect(hero.fs).toBeGreaterThan(0);
    expect(typeof hero.charisma).toBe("boolean");
    expect(hero.lead).toBe(true);          // first member leads
    expect(typeof hero.sig).toBe("string");
    expect(Array.isArray(hero.items)).toBe(true);
  });
});
```

NOTE: `newGame(1,[0,6])` may exceed the party budget (Hero cost 6 + Woman cost 2 = 8 > 6). Use a valid party for the test, e.g. `[5, 6]` (Man 3 + Woman 2 = 5) or `[0]`. Pick a valid one and assert accordingly.

- [ ] **Step 3: Implement `viewParty`**

Create `apps/web/src/view/viewParty.ts`:

```typescript
import { CREATURES, FLAG_CHARISMA, type GameState } from "@sorcerers-cave/engine";
import type { ViewPartyMember } from "./cave3d";

/** Map the engine's living party into the renderer/reveal party shape. */
export function viewParty(state: GameState): ViewPartyMember[] {
  return state.party.map((m, i) => {
    const c = CREATURES[m.creatureId]!;
    return {
      sig: c.name[0]!.toUpperCase(),
      name: c.name,
      lead: i === 0,
      items: m.treasure.map((t) => String(t)),
      fs: c.fs,
      mp: c.mp,
      charisma: (c.flags & FLAG_CHARISMA) !== 0,
    };
  });
}
```

(If `FLAG_CHARISMA` isn't exported from the engine index, read `packages/engine/src/data/creatures.ts` and import it from there or inline the bit value `2`.)

- [ ] **Step 4: Run the test**

Run: `pnpm --filter web test viewParty` → PASS.

- [ ] **Step 5: Implement `CaveCanvas`**

Create `apps/web/src/view/CaveCanvas.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { CaveEngine } from "./ports";
import type { GameState } from "@sorcerers-cave/engine";
import { loadManifest, indexTilesById } from "../data/manifest";
import { boot } from "./cave3d";
import { viewParty } from "./viewParty";
import { CaveHud } from "./CaveHud";

const TILE_AR = 1728 / 1210; // all tiles are 1728×1210 landscape (manifest)

/** Mounts the vanilla Three.js renderer, booted from the injected engine adapter. */
export function CaveCanvas({ engine, state }: { engine: CaveEngine; state: GameState }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const { tiles } = await loadManifest();
      if (cancelled) return;
      dispose = await boot({ mount, engine, tiles: indexTilesById(tiles), party: viewParty(state), tileAR: TILE_AR });
    })();
    return () => { cancelled = true; dispose?.(); };
    // Boot once per engine instance; live updates flow through the adapter the renderer already holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return <CaveHud mountRef={mountRef} />;
}
```

`CaveHud` should accept `{ mountRef }` and attach it to the `#scene` div (`<div id="scene" ref={mountRef} />`).

- [ ] **Step 6: Typecheck + build + commit**

Run: `pnpm --filter web typecheck` then `pnpm --filter web build` then `pnpm --filter web test`.
Expected: all green (the `viewParty` unit + prior tests; build succeeds).

```bash
git add apps/web/src/view/cave.css apps/web/src/view/CaveHud.tsx apps/web/src/view/CaveCanvas.tsx apps/web/src/view/viewParty.ts apps/web/src/view/viewParty.test.ts
git commit -m "feat(web): HUD shell + CaveCanvas mount for the renderer (D-4)"
```

---

### Task 3: No-Convex render harness + Playwright verification

**Files:**
- Create: `apps/web/cave-test.html`
- Create: `apps/web/src/cave-test.tsx`

This proves the renderer actually draws — without Convex — and is the visual gate for D-4.

- [ ] **Step 1: Create the harness entry**

Create `apps/web/cave-test.html` (a second Vite page; it does NOT import `convex.ts`, so it needs no `VITE_CONVEX_URL`):

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Cave render test</title></head>
  <body style="margin:0;background:#070709">
    <div id="root"></div>
    <script type="module" src="/src/cave-test.tsx"></script>
  </body>
</html>
```

Create `apps/web/src/cave-test.tsx`:

```tsx
import ReactDOM from "react-dom/client";
import { newGame, reduce, type GameAction } from "@sorcerers-cave/engine";
import type { CaveEngine } from "./view/ports";
import { createCaveAdapter } from "./view/engineAdapter";
import { parseManifest } from "./data/manifest";
import { loadManifest } from "./data/manifest";
import { CaveCanvas } from "./view/CaveCanvas";

// Build a purely client-side adapter (no Convex) so the renderer can be exercised standalone.
async function main() {
  const { tiles, cards } = await loadManifest();
  const state = newGame(20260613, [5, 6]); // Man + Woman, a valid party
  // local-only adapter: onAction reduces in place so moves work without a server
  let mirror = state;
  const adapter: CaveEngine = createCaveAdapter(state, { tiles, cards }, {
    onAction: (a: GameAction) => { mirror = reduce(mirror, a).state; (adapter as { sync(s: typeof mirror): void }).sync(mirror); },
  });
  ReactDOM.createRoot(document.getElementById("root")!).render(<CaveCanvas engine={adapter} state={state} />);
}
void main();
```

NOTE TO IMPLEMENTER: `createCaveAdapter`'s `tryMove` already reduces its own mirror optimistically, so the `onAction` re-reduce above would double-apply. SIMPLER: pass `onAction: () => {}` (no-op) — the adapter's internal mirror already advances on `tryMove`, which is all the standalone harness needs. Use the no-op; drop the `reduce`/`mirror` plumbing. (Keep the import list minimal.)

- [ ] **Step 2: Sync assets + build + serve, then Playwright-verify**

Run: `pnpm --filter web sync-assets` (populate `public/assets`).
Run: `pnpm --filter web build` (must succeed with the new entry — add `cave-test.html` to Vite's `build.rollupOptions.input` in `vite.config.ts` if the build doesn't pick it up automatically; in dev it's served directly).

Then verify in a browser with Playwright (the controller will run this, but document the expected result):
- Start the dev server: `pnpm --filter web dev` (background).
- Navigate to `http://localhost:5173/cave-test.html`.
- Assert: a `<canvas>` element exists under `#scene`; the page has **no console errors**; take a screenshot showing tiles rendered (the gateway tile visible, HUD chrome present).
- Pressing an arrow key / clicking a doorway advances the party token (optional deeper check).

NOTE TO IMPLEMENTER: if you cannot drive Playwright yourself, leave the harness in place and report it ready; the controller performs the Playwright check. Do NOT fake a passing visual check. The build succeeding + the harness wired is your committable deliverable; the screenshot is the controller's gate.

- [ ] **Step 3: Commit**

```bash
git add apps/web/cave-test.html apps/web/src/cave-test.tsx apps/web/vite.config.ts
git commit -m "feat(web): standalone no-Convex render harness for the cave view (D-4)"
```

---

### Task 4: Wire `CaveCanvas` into the live game

**Files:**
- Modify: `apps/web/src/game/GameScreen.tsx`

- [ ] **Step 1: Render the 3D view from the live hook**

Update `GameScreen.tsx` so that, once a game is loaded, it renders `<CaveCanvas engine={engine} state={state} />` instead of the text `MoveList`. Get the authoritative `GameState` from the hook's query (extend `useCaveGame` to also return the raw `state` if needed, or read it via `engine`-independent means). Keep the "New game (Hero)" entry and the sign-in flow. The `MoveList` text fallback may stay below the canvas for accessibility/debug, or be removed.

```tsx
// inside GameScreen, after `const { engine, loading } = useCaveGame(gameId);`
// and once you have the authoritative GameState `state`:
if (loading || !engine || !state) return <p>Loading cave…</p>;
return <CaveCanvas engine={engine} state={state} />;
```

To supply `state`: extend `useCaveGame` to return `{ engine, loading, version, state }` where `state` is the latest `(game as {state?: GameState})?.state` — add it to the returned object (no new query).

- [ ] **Step 2: Typecheck + build + full suite**

Run: `pnpm --filter web typecheck`, `pnpm --filter web build`, `pnpm --filter web test`.
Expected: all green. (`App.test.tsx` stays provider-free; the live 3D loop is browser-verified.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/GameScreen.tsx apps/web/src/game/useCaveGame.ts
git commit -m "feat(web): render the 3D cave view in the live game screen (D-4)"
```

---

## Definition of Done

- [ ] `cave3d.js`/`reveal.js`/`encounter-data.js` live in `src/view/`; the renderer runs nothing at import and `boot({mount,engine,tiles,party,tileAR})` builds the scene from our adapter + `/assets` art and returns a working `dispose()`.
- [ ] `CaveHud` reproduces the shell.html HUD (all queried ids + CSS tokens); `CaveCanvas` mounts/disposes the renderer in React; `viewParty` is unit-tested.
- [ ] The no-Convex harness renders the cave; **Playwright confirms** a canvas under `#scene`, no console errors, and tiles drawn (screenshot).
- [ ] `GameScreen` renders the live 3D view from `useCaveGame`.
- [ ] `pnpm --filter web typecheck` + `build` + `test` all green; engine unchanged; no `cave-data.js`/stub copied into the app.

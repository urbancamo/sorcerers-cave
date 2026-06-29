# Mobile Phone UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Sorcerer's Cave web UI work well on phones (portrait + landscape) — exit arrows always visible & tappable, the camera auto-fits the chamber per orientation, and the floating HUD/panels reflow so nothing overlaps.

**Architecture:** Keep the existing Three.js cave and floating-panel HUD. Three changes: (1) the doorway exit markers become camera-facing **billboards** (never edge-on) with larger tap targets, their glyph rotated to point screen-outward; (2) the snap camera computes its distance to **fit** the active chamber + its exits given the viewport aspect, recomputed on resize/rotation; (3) a responsive CSS layer makes the floating panels fluid (roster→handle, inspect→reveal-on-tap, dock wraps, encounter/fight→bottom-sheets). Two small pure helpers (`billboard.ts`, `camera-fit.ts`) carry the only unit-testable logic; the rest is visual and verified in a browser at phone sizes.

**Tech Stack:** React 19 + Vite SPA, vanilla Three.js (`apps/web/src/view/cave3d.js`), plain CSS + Tailwind v4 (`cave.css`, `styles.css`), Vitest (jsdom `ui` project), Convex backend (dev only, for booting the app).

**Design references:** `docs/requirements/2026-06-29-mobile-phone-ui.md` (requirements), `docs/requirements/2026-06-29-mobile-phone-ui-mockup.html` (approved mockup).

**Verification note:** The `view/` layer has no existing unit tests and is inherently visual. Pure helpers are TDD'd in the `ui` vitest project. Visual changes are verified by booting the app (Convex + Vite), driving to the Gateway, and screenshotting at portrait (390×844) and landscape (844×390) via the Playwright MCP. `file:` URLs are blocked — the app is served by Vite's dev server, so navigate to `http://localhost:5173`.

---

## Phase 1 — Billboarded exit chevrons (the headline fix)

The exit markers are 3D `ConeGeometry` chevrons rotated in world space (`cave3d.js:227-266`); in portrait they rotate edge-on and slide off-frame. Replace the cone with a **camera-facing sprite** (never edge-on), keep the flat floor ring, give it a larger tap target, and rotate the glyph to point screen-outward each frame. Direction is unchanged — markers stay anchored at the doorway in world space and the tap still reads `grp.userData.move`.

### Task 1.1: Pure helper for the outward screen angle

**Files:**
- Create: `apps/web/src/view/billboard.ts`
- Test: `apps/web/src/view/billboard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/view/billboard.test.ts
import { describe, it, expect } from "vitest";
import { spriteRotationForScreenVector } from "./billboard";

// A sprite texture whose chevron points "up" (+Y screen) sits at rotation 0.
// spriteRotationForScreenVector returns the SpriteMaterial.rotation (radians, CCW)
// needed to make that chevron point along the screen-space vector (dx, dy),
// where +dy is screen-up (NDC convention).
describe("spriteRotationForScreenVector", () => {
  it("points up when the vector is straight up", () => {
    expect(spriteRotationForScreenVector(0, 1)).toBeCloseTo(0, 5);
  });
  it("points right when the vector is to the right", () => {
    // pointing right = rotate the up-chevron clockwise 90° = -PI/2
    expect(spriteRotationForScreenVector(1, 0)).toBeCloseTo(-Math.PI / 2, 5);
  });
  it("points down when the vector is straight down", () => {
    expect(Math.abs(spriteRotationForScreenVector(0, -1))).toBeCloseTo(Math.PI, 5);
  });
  it("returns 0 for a degenerate (zero-length) vector", () => {
    expect(spriteRotationForScreenVector(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter web exec vitest run src/view/billboard.test.ts`
Expected: FAIL — `spriteRotationForScreenVector` is not exported / file missing.

- [ ] **Step 3: Implement the helper**

```ts
// apps/web/src/view/billboard.ts

/**
 * SpriteMaterial.rotation (radians, CCW) that orients a chevron sprite — whose
 * art points "up" (+Y screen) at rotation 0 — to point along the screen-space
 * vector (dx, dy). +dy is screen-up (matches THREE NDC, where y grows upward).
 *
 * atan2(dy, dx) is the vector's angle from +X. An up-pointing glyph is at +Y
 * (angle PI/2), so the rotation that aligns it with the vector is
 * atan2(dy,dx) - PI/2. Returns 0 for a zero-length vector.
 */
export function spriteRotationForScreenVector(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx) - Math.PI / 2;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter web exec vitest run src/view/billboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/view/billboard.ts apps/web/src/view/billboard.test.ts
git commit -m "feat(view): add billboard sprite-rotation helper for exit chevrons"
```

### Task 1.2: Build billboarded chevron markers

**Files:**
- Modify: `apps/web/src/view/cave3d.js` (imports near line 1-3; `chevron`/`refreshExitMarkers` 227-267)

- [ ] **Step 1: Import the helper**

At the top of `cave3d.js` (after the existing imports, around line 3), add:

```js
import { spriteRotationForScreenVector } from './billboard.js';
```

- [ ] **Step 2: Add a cached chevron sprite-texture builder**

Replace the `chevron(color)` function (lines 227-230) with a sprite-based chevron. The canvas draws a white chevron with soft padding (the transparent margin enlarges the tap target); `SpriteMaterial.color` tints it.

```js
/* ---- exit markers (the navigation affordance) ---- */
let _chevTex=null;
function chevronTexture(){
  if(_chevTex) return _chevTex;
  const s=128, cv=document.createElement('canvas'); cv.width=cv.height=s;
  const cx=cv.getContext('2d');
  // chevron points UP; generous transparent padding around it widens the tap target
  cx.strokeStyle='#ffffff'; cx.lineWidth=14; cx.lineCap='round'; cx.lineJoin='round';
  cx.shadowColor='rgba(0,0,0,0.55)'; cx.shadowBlur=10;
  cx.beginPath(); cx.moveTo(34,78); cx.lineTo(64,44); cx.lineTo(94,78); cx.stroke();
  _chevTex=new THREE.CanvasTexture(cv); _chevTex.colorSpace=THREE.SRGBColorSpace; return _chevTex;
}
function chevronSprite(color){
  const m=new THREE.SpriteMaterial({map:chevronTexture(),color,transparent:true,opacity:0.95,depthTest:true,depthWrite:false});
  const s=new THREE.Sprite(m); s.scale.set(1.1,1.1,1); // big quad = big tap target; glyph sits in the centre
  return s;
}
```

- [ ] **Step 3: Use the sprite in `refreshExitMarkers` and tag groups for billboarding**

In `refreshExitMarkers` (235-266), for the N/S/E/W branch replace the cone block. Keep the flat ring. Store the sprite + the tile-centre world position on the group so the animate loop can point it outward.

Replace lines 243-254 (the `if(m.dir==='N'||...)` block body) with:

```js
    if(m.dir==='N'||m.dir==='S'||m.dir==='E'||m.dir==='W'){
      const edge=0.15; // gap beyond the tile edge — markers hug the doorway tightly
      const off={N:[0,0,-(TILE_D/2+edge)],S:[0,0,TILE_D/2+edge],E:[TILE_W/2+edge,0,0],W:[-(TILE_W/2+edge),0,0]}[m.dir];
      const ring=ringFlat(col,0.34,0.46);ring.rotation.x=-Math.PI/2;ring.position.set(0,0.06,0);
      const spr=chevronSprite(col); spr.position.set(0,0.5,0);
      grp.add(ring,spr);
      grp.position.set(p.x+off[0],p.y,p.z+off[2]);
      grp.userData.spr=spr; grp.userData.outward=true; grp.userData.center=p.clone();
    } else {
```

For the stair branch (the `else` body, 256-261), also use a sprite but point it up (U) / down (D) in screen space:

```js
    } else {
      // stair marker near a corner of the tile
      const corner=m.dir==='D'?[TILE_W*0.30,TILE_D*0.30]:[-TILE_W*0.30,-TILE_D*0.30];
      const ring=ringFlat(col,0.3,0.44);ring.rotation.x=-Math.PI/2;ring.position.y=0.06;
      const spr=chevronSprite(col); spr.position.y=0.5;
      grp.add(ring,spr);
      grp.position.set(p.x+corner[0],p.y+0.02,p.z+corner[1]);
      grp.userData.spr=spr; grp.userData.outward=false; grp.userData.stairDir=m.dir; // U up, D down (screen-space)
    }
```

- [ ] **Step 4: Orient the sprites every frame (billboard + outward)**

In `animate()`, the exit-markers loop is at 736-739. Replace it with a version that keeps the bob/opacity pulse AND sets each sprite's screen rotation. Add a reusable scratch vector near the other module scratch state (e.g. by `const ray=...` line 705): `const _v0=new THREE.Vector3(), _v1=new THREE.Vector3();`

```js
  // exit markers pulse + hover bob + billboard the chevron to point screen-outward
  exitMarkers.forEach(g=>{const f=g.userData.flash;let amp=0.07;
    if(f){const kk=(tt-f.t0);if(kk>0.6){g.userData.flash=null;}amp=0.18;}
    g.position.y=g.userData.base+Math.sin(tt*3+g.position.x)*amp;
    g.children.forEach(c=>{if(c.material)c.material.opacity=0.7+Math.sin(tt*3)*0.25;});
    const spr=g.userData.spr;
    if(spr){
      if(g.userData.outward){
        _v0.copy(g.userData.center).project(camera);                 // tile centre → NDC
        _v1.copy(g.position).project(camera);                        // marker → NDC
        spr.material.rotation=spriteRotationForScreenVector(_v1.x-_v0.x, _v1.y-_v0.y);
      } else {
        spr.material.rotation = g.userData.stairDir==='D' ? Math.PI : 0; // stairs: down / up
      }
    }});
```

- [ ] **Step 5: Typecheck + run the whole web test suite**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run`
Expected: PASS, no type errors. (cave3d.js is JS; typecheck covers the .ts helper + consumers.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/view/cave3d.js
git commit -m "feat(view): billboard exit chevrons so doorways stay visible in portrait"
```

### Task 1.3: Browser-verify chevrons at phone sizes

- [ ] **Step 1: Start the backend + dev server (two background shells)**

```bash
pnpm --filter web convex   # run_in_background: keeps functions synced
pnpm --filter web dev      # run_in_background: serves http://localhost:5173
```

- [ ] **Step 2: Drive to the Gateway and screenshot portrait + landscape**

Using the Playwright MCP: resize to 390×844 (portrait), `browser_navigate` to `http://localhost:5173`, start a solo game (Splash → Start Solitaire), confirm a party in Party Select → Enter the cave, land on the Gateway. Screenshot. Then resize to 844×390 (landscape) and screenshot.

Expected (both orientations): all open doorways show a glowing gold chevron at the tile edge, pointing outward through the doorway; none are edge-on or off-frame; tapping a chevron moves the party that direction (verify one move).

- [ ] **Step 3: If markers are mis-sized/clipped, tune in `chevronSprite` scale and `spr.position.y`, re-screenshot. Commit any tuning.**

```bash
git add apps/web/src/view/cave3d.js
git commit -m "fix(view): tune exit-chevron sprite size for phone viewports"
```

---

## Phase 2 — Camera auto-frames the chamber per orientation

The snap view uses a hardcoded offset `(0,9.5,2.6)` (`cave3d.js:453`, `:844`) and `onResize` only fixes aspect (`:768`). On a narrow portrait viewport the chamber + exits don't fit. Compute the camera distance to fit a target radius given the vertical FOV and aspect, and re-fit on resize.

### Task 2.1: Pure fit-distance helper

**Files:**
- Create: `apps/web/src/view/camera-fit.ts`
- Test: `apps/web/src/view/camera-fit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/view/camera-fit.test.ts
import { describe, it, expect } from "vitest";
import { fitDistance } from "./camera-fit";

// Distance at which a sphere of the given radius is fully visible for a
// perspective camera. For aspect < 1 (portrait) the horizontal FOV is the
// limiting axis, so the distance must be LARGER than for aspect 1.
describe("fitDistance", () => {
  it("matches the vertical-FOV formula on a square viewport", () => {
    const r = 5, fov = 30, aspect = 1;
    const expected = r / Math.sin((fov * Math.PI) / 180 / 2);
    expect(fitDistance(r, fov, aspect)).toBeCloseTo(expected, 4);
  });
  it("requires more distance in portrait than in landscape", () => {
    const portrait = fitDistance(5, 30, 0.46);
    const landscape = fitDistance(5, 30, 2.17);
    expect(portrait).toBeGreaterThan(landscape);
  });
  it("never returns less than the square-viewport distance", () => {
    const square = fitDistance(5, 30, 1);
    expect(fitDistance(5, 30, 0.5)).toBeGreaterThanOrEqual(square);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter web exec vitest run src/view/camera-fit.test.ts`
Expected: FAIL — `fitDistance` missing.

- [ ] **Step 3: Implement the helper**

```ts
// apps/web/src/view/camera-fit.ts

/**
 * Distance from a perspective camera at which a sphere of `radius` fits within
 * BOTH axes of the frustum. `fovDeg` is the vertical FOV; `aspect` = width/height.
 * The horizontal half-FOV is atan(tan(vFov/2) * aspect); the binding axis is the
 * smaller half-angle (portrait → horizontal binds). dist = radius / sin(halfAngle).
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const vHalf = (fovDeg * Math.PI) / 180 / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-6));
  const half = Math.min(vHalf, hHalf);
  return radius / Math.sin(half);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter web exec vitest run src/view/camera-fit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/view/camera-fit.ts apps/web/src/view/camera-fit.test.ts
git commit -m "feat(view): add fitDistance helper for aspect-aware camera framing"
```

### Task 2.2: Frame the snap view to fit, and re-fit on resize

**Files:**
- Modify: `apps/web/src/view/cave3d.js` (import line; `viewSnapTile` 453; Reveal `snapToTile` 829-831; boot initial view 842-845; `onResize` 768)

- [ ] **Step 1: Import the helper**

Near the other view imports (top of file):

```js
import { fitDistance } from './camera-fit.js';
```

- [ ] **Step 2: Add a `frameSnap(area)` that fits the chamber, and remember it for resize**

Add near `viewSnapTile` (around line 453). `SNAP_RADIUS` covers the tile plus a one-tile doorway margin so all four chevrons sit inside the frame. Keep the gentle forward tilt (a small +Z and proportional height).

```js
const SNAP_RADIUS = TILE_W * 0.95; // chamber half-width + doorway margin
let lastSnapArea = null;           // remembered so onResize can re-fit
function frameSnap(area){
  lastSnapArea = area;
  const fov = 30;
  const dist = fitDistance(SNAP_RADIUS, fov, camera.aspect);
  const wp = worldPos(area);
  // look slightly from the south so North reads "up" the screen; height ≈ dist, small forward bias
  flyTo(wp.clone().add(new THREE.Vector3(0, dist * 0.96, dist * 0.27)), wp, fov);
}
```

- [ ] **Step 3: Route snap entry points through `frameSnap`**

Replace `viewSnapTile` body (453) so it uses `frameSnap`:

```js
function viewSnapTile(){const a=engine.current;setMode('snap','Overhead · '+a.name);setIsolation(a.level);frameSnap(a);}
```

Replace the Reveal `snapToTile` callback (829-831) to use it too:

```js
    snapToTile:(area)=>{ setIsolation(area.level); frameSnap(area); setMode('snap','Overhead · '+area.name); },
```

Replace the boot initial-view block (842-845) to use `frameSnap` (it already sets `setMode('snap',…)` just above at 841):

```js
  const ap=worldPos(engine.current);
  camera.up.set(0,1,0); camera.updateProjectionMatrix();
  frameSnap(engine.current);
  controls.update();
```

(Clearing the old hardcoded `camera.fov=30; camera.position.copy(... 9.5,2.6); controls.target.copy(ap)` — `frameSnap` sets fov via `flyTo` and the target.)

- [ ] **Step 4: Re-fit on resize / orientation change**

Replace `onResize` (768):

```js
function onResize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
  // Re-fit the snap view to the new aspect so a portrait/landscape flip keeps the chamber + exits framed.
  // Orbit/level views are user-controlled; leave them be.
  if(lastSnapArea && document.getElementById('orbitBtn') && !document.getElementById('orbitBtn').classList.contains('active')){
    frameSnap(lastSnapArea);
  }
}
```

Also clear `lastSnapArea` when leaving snap mode: in `viewFreeOrbit` (452) and `viewLevel` (461) add `lastSnapArea=null;` at the start of each.

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run`
Expected: PASS.

- [ ] **Step 6: Browser-verify framing**

With the dev server running, screenshot the Gateway at 390×844 and 844×390, then rotate (resize) between them with the app open. Expected: the chamber and all exit chevrons stay fully framed and centred in both; the flip re-fits without manual zoom.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/view/cave3d.js
git commit -m "feat(view): auto-fit the snap camera to chamber + exits per orientation"
```

---

## Phase 3 — Responsive floating HUD (no overlap)

Make the floating panels fluid on phones: viewport-fit safe areas, roster collapses to a tappable handle (already wired to open the party panel), inspect card reveals on tap (reuses cave3d's `.show` toggle), compact stats, fluid prompt, wrapping dock pinned to the safe-area bottom. All in `cave.css` + one meta tweak.

### Task 3.1: Safe-area viewport meta

**Files:**
- Modify: `apps/web/index.html:5`

- [ ] **Step 1: Add `viewport-fit=cover`**

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/index.html
git commit -m "feat(web): opt into safe-area insets with viewport-fit=cover"
```

### Task 3.2: Mobile HUD reflow in cave.css

**Files:**
- Modify: `apps/web/src/view/cave.css` (the `@media(max-width:720px)` block at 211-216)

- [ ] **Step 1: Replace the existing `@media(max-width:720px)` block (211-216) with a fuller mobile layer**

```css
@media (max-width: 720px) {
  .hint { display: none; }

  /* compact brand */
  .brand { top: 12px; left: 14px; }
  .brand .title { font-size: 15px; }
  .brand .mode { font-size: 9.5px; letter-spacing: .18em; }

  /* stats: smaller chips, drop the lowest-priority ones (Party, Deck keep via order) */
  .stats { top: 12px; gap: 6px; }
  .chip { padding: 5px 9px; min-width: 0; }
  .chip .k { font-size: 8px; } .chip .v { font-size: 13px; }
  .stats .chip:nth-child(n+4) { display: none; }

  /* roster collapses to a tappable handle (tap opens the full party panel) */
  .roster { top: auto; bottom: calc(78px + env(safe-area-inset-bottom)); left: 14px; width: auto; }
  .roster .roster-body { display: none; }
  .roster-hd { border-bottom: none; border-radius: 11px; padding: 8px 13px; }

  /* fluid prompt that never collides with the stats row */
  .prompt { top: 58px; max-width: 92vw; font-size: 12.5px; padding: 8px 15px; }

  /* inspect card: hidden until a card is selected (cave3d toggles .show); compact, top-right */
  .cardpanel { right: 10px; top: 56px; width: 150px; }
  .cardpanel .frame { transform: none; }
  .cardpanel .meta .nm { font-size: 17px; }

  /* dock wraps and pins to the safe-area bottom */
  .dock { flex-wrap: wrap; max-width: 94vw; justify-content: center; gap: 6px;
    bottom: calc(12px + env(safe-area-inset-bottom)); padding: 8px 9px; }
  .btn { font-size: 11.5px; padding: 8px 11px; }
  .dock .lbl { display: none; } /* "Levels" label — drop to save width */
}

/* very narrow: tighten further */
@media (max-width: 420px) {
  .brand .mode { display: none; }
  .prompt { max-width: 96vw; }
}
```

- [ ] **Step 2: Browser-verify at 390×844 and 360×740**

Boot to the Gateway. Expected: brand, stats, prompt, roster handle, dock, and (after tapping a tile) the inspect card never overlap each other or the chevrons; the dock wraps cleanly; tapping the roster handle opens the party panel.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/view/cave.css
git commit -m "feat(view): reflow the floating HUD for phones (handle, fluid prompt, wrapping dock)"
```

---

## Phase 4 — Encounter / fight / party panels as bottom-sheets

The encounter (`.scv-enc`), fight (`.scv-fight`) and party (`.scv-pp*`) panels are fixed, centred, fixed-width overlays that get cut off / overflow on phones. On mobile, dock them to the bottom as full-width sheets with max-height + scroll. They already render **real card art** (`FightCard` → `scv-fc-art`), so no art changes are needed.

### Task 4.1: Encounter + fight bottom-sheets

**Files:**
- Modify: `apps/web/src/styles.css` (append a new `@media(max-width:720px)` block near the end of the file)

- [ ] **Step 1: Append the mobile sheet rules to `styles.css`**

```css
/* ===== Mobile: dock action panels to the bottom as full-width sheets ===== */
@media (max-width: 720px) {
  .scv-enc, .scv-fight {
    left: 0; right: 0; bottom: 0; transform: none;
    width: 100%; max-width: 100%;
    max-height: 82vh;
    border-radius: 18px 18px 0 0;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
  }
  .scv-enc { bottom: 0; }

  /* fight matchups: let cards shrink and wrap so two fit across a phone */
  .scv-match { gap: 10px; padding: 8px 10px; }
  .scv-match-front { min-width: 0; min-height: 0; }
  .scv-match-bg { min-width: 0; min-height: 0; }
  .scv-match-foes { max-width: 100%; }
  .scv-fc, .scv-fc-frame, .scv-fc-art { width: 92px; }
  .scv-slot-empty { width: 92px; }
  .scv-fc-relic { width: 34px; }
}
```

- [ ] **Step 2: Browser-verify the fight sheet**

A fight requires drawing a creature chamber. Easiest path: with the dev server running, drive a solo game and move through doorways until a fight surface appears (or use a seeded/known start if one exists). At 390×844 verify: the fight surface is a bottom sheet, the matchup cards fit (two across), the action buttons (Fight/Retreat/roll) are reachable, content scrolls rather than clipping. If reaching a fight reliably is impractical in-session, verify the same CSS against the encounter panel (`.scv-enc`, reached on the first creature chamber) and visually confirm `.scv-fight` rules in DevTools by toggling the class on the panel element.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "feat(web): dock encounter & fight panels to bottom-sheets on phones"
```

### Task 4.2: Party panel as a bottom-sheet drawer

**Files:**
- Read first: `apps/web/src/game/PartyPanel.tsx` and the `.scv-pp*` rules in `apps/web/src/styles.css` (overlay ≈ line 857, modal/preview ≈ 939) to get the exact class names of the overlay + inner modal.
- Modify: `apps/web/src/styles.css` (extend the Phase 4.1 `@media(max-width:720px)` block)

- [ ] **Step 1: Read the party-panel markup + current CSS to confirm the overlay and inner-modal class names.**

- [ ] **Step 2: Add mobile rules turning the centred modal into a bottom sheet**

Using the confirmed class names (the overlay wrapper and the inner panel — shown here as `.scv-pp-overlay` / `.scv-pp`; adjust to the real names found in Step 1), append to the mobile block:

```css
@media (max-width: 720px) {
  .scv-pp-overlay { align-items: flex-end; }            /* dock to bottom */
  .scv-pp {
    width: 100%; max-width: 100%; max-height: 86vh;
    border-radius: 18px 18px 0 0; overflow-y: auto;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 3: Browser-verify** — tap the roster handle at 390×844; the party panel rises as a full-width bottom sheet, scrolls, and dismisses without moving the map.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "feat(web): party panel rises as a bottom-sheet drawer on phones"
```

---

## Phase 5 — Final verification

### Task 5.1: Full gate + cross-orientation pass

- [ ] **Step 1: Run the full checks**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web exec vitest run
```
Expected: all PASS.

- [ ] **Step 2: Cross-orientation smoke test in the browser**

At 390×844 and 844×390: boot → Gateway. Confirm (a) every doorway chevron is visible, outward-pointing, tappable; (b) the chamber + exits stay framed after a portrait↔landscape flip; (c) no HUD panels overlap; (d) the party panel and (if reachable) encounter/fight render as bottom-sheets. Capture one portrait and one landscape screenshot for the PR.

- [ ] **Step 3: Stop the background dev server + Convex shells.**

- [ ] **Step 4: Update the requirements doc status / note the mockup was realised, then open the PR.**

```bash
git add -A
git commit -m "docs: mark mobile-phone-ui implemented"
```

---

## Self-Review

- **Spec coverage:** overlapping panels → Phase 3 + Phase 4 (sheets); invisible portrait arrows → Phase 1 (billboard) + Phase 2 (framing); portrait *and* landscape → Phase 2 re-fit + Phase 3 orientation-aware CSS; "engaging / map navigable" → larger tap targets (1.2), bottom-sheets (4); real card art → confirmed already used (4 preamble). All requirement bullets mapped.
- **Type consistency:** helpers `spriteRotationForScreenVector(dx,dy)` and `fitDistance(radius,fovDeg,aspect)` are referenced with those exact signatures in cave3d.js; `frameSnap(area)`, `lastSnapArea`, `SNAP_RADIUS`, `chevronSprite`, `chevronTexture` are each defined before use.
- **Placeholders:** none — all code blocks are complete. The only "read first" step (4.2 Step 1) is an explicit instruction to confirm two CSS class names before writing the dependent rule, with a stated fallback, not deferred work.
- **Scope:** single subsystem (the in-game cave view + its overlays); one plan is appropriate.

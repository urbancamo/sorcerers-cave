# Milestone D-2 — Engine Adapter & `ports.ts` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a headless adapter that wraps a local engine `GameState` mirror and satisfies the renderer's `ports.ts` `CaveEngine` contract — projecting engine state into `Area`/`StateSnapshot`/`Move`/`MoveEvent` (using the D-1 art binding), with a synchronous `tryMove` driven by the engine's pure `reduce`.

**Architecture:** `apps/web/src/view/ports.ts` (the copied contract). `apps/web/src/view/projection.ts` (pure: engine `PlacedArea`/contents → ports `Area`/`Card`). `apps/web/src/view/engineAdapter.ts` (`createCaveAdapter(state, art, opts)` exposing `CaveEngine`: read-only getters + `state()`/`openMoves()` + `tryMove`). Engine stays untouched; everything is headless and unit-tested. A forward hook `opts.onAction` is the seam D-3 will use to dispatch to Convex.

**Tech Stack:** TypeScript, Vitest (`apps/web` "ui" project), `@sorcerers-cave/engine` (pure `reduce`/`legalActions`/`newGame` + decoders), the D-1 `apps/web/src/data/manifest.ts` binding.

---

## Design notes (read first)

- **The contract** is `design_handoff_cave_view/ports.ts` — copy it verbatim to `apps/web/src/view/ports.ts`. Key shapes: `Area` (tileId, rot, level/col/row, exits, type, up/down, special, name, party, visited, faceDown, strangers/treasure/hazards: `Card[]`); `Card` (id, name, category `creature|treasure|artifact|hazard`, entityId?, file); `StateSnapshot`; `Move` (dir, kind `known|undrawn|stair`, target {level,col,row}); `MoveEvent` union; `CaveEngine`.
- **Coordinate mapping:** engine `coord = level*10000 + y*100 + x` (`unpackCoord` → {level,x,y}); ports uses `level/col/row` with **col = x, row = y**. Directions: ports `'N'|'E'|'S'|'W'|'U'|'D'` ↔ engine `DIR_N=1,DIR_E=2,DIR_S=3,DIR_W=4,DIR_UP=5,DIR_DOWN=6`.
- **Topology → art:** use D-1's `resolveTile(topology, tiles)` for `{tileId, rot}` and `resolveCard(category, entityId, cards)` for card art. The D-1 coverage test proved every *real* engine card resolves; still fall back defensively (`tiles[0]`, `rot 0`) if `null`.
- **Engine special int → string:** `[null,"gateway","deep-pool","viper-pit","tomb-of-kings","great-hall"]` (SPECIAL_* indices).
- **Floor cards:** an area's *persistent* floor is `PlacedArea.contents` (codes `100+creatureId`/`200+treasureId`/`300+hazardId`). For the party's area during an *active* encounter the live floor is the working set `state.strangers/treasures/hazards` (arrays of ids) — encode to the same `100/200/300` codes and use those when non-empty. `ports.Card.category`: creature→`creature`, hazard→`hazard`, treasure→`artifact` if `TREASURES[id].kind==="artifact"` else `treasure`. Give each card a unique `id` (`cardId`, suffixed `#n` for repeats in the same area).
- **`MoveEvent`:** built from the `reduce` `{state, events}` plus a before/after diff. `blocked`/`deadEnd` events → `{moved:false, deadEnd?}`. Otherwise `{moved:true, dir, area: <arrived>, placed: <arrived if a tile was drawn else null>, descended/ascended for U/D, chamber if a `drewChamber` event fired}`. `firstVisit` = the arrived area was not `visited` in the *before* state.
- **`openMoves`** mirrors `legalActions` filtered to `move` actions (so it never offers a move `reduce` would reject); `[]` outside the `explore` phase. `kind`: U/D → `stair`; lateral → `known` if the target coord is already placed, else `undrawn`. (`exitCave`/escape is out of scope here — handled in the HUD later.)
- **`reduce` returns the original (unmutated) state on `blocked`/`deadEnd`**, so assigning the mirror before the block check is safe.
- **Tests are headless** (no DOM). Load the real art tables once via the D-1 loader over the canonical manifest (`resolve(process.cwd(), "../../docs/assets/manifest.json")` in a `beforeAll` — `import.meta.url` is `http:`-schemed under jsdom). Use `newGame(seed, [0])` for integration realism and a small hand-built `mkState` for deterministic move/chamber assertions.

---

## File structure

- **Create** `apps/web/src/view/ports.ts` — verbatim copy of `design_handoff_cave_view/ports.ts`.
- **Create** `apps/web/src/view/projection.ts` — pure projection (`projectArea`, helpers, dir maps).
- **Create** `apps/web/src/view/projection.test.ts`.
- **Create** `apps/web/src/view/engineAdapter.ts` — `createCaveAdapter`.
- **Create** `apps/web/src/view/engineAdapter.test.ts`.

---

### Task 1: Contract + projection module

**Files:**
- Create: `apps/web/src/view/ports.ts`
- Create: `apps/web/src/view/projection.ts`
- Create: `apps/web/src/view/projection.test.ts`

- [ ] **Step 1: Copy the contract**

Copy `design_handoff_cave_view/ports.ts` verbatim to `apps/web/src/view/ports.ts` (no changes).

- [ ] **Step 2: Write the projection tests**

Create `apps/web/src/view/projection.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { newGame, packCoord, type GameState, type PlacedArea } from "@sorcerers-cave/engine";
import { parseManifest, type TileArt, type CardArt } from "../data/manifest";
import { projectArea, encodeWorkingSet, areaKey, type ArtTables } from "./projection";

let art: ArtTables;
beforeAll(() => {
  const m = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/assets/manifest.json"), "utf8")) as AssetManifest;
  const { tiles, cards } = parseManifest(m);
  art = { tiles, cards };
});

const area = (over: Partial<PlacedArea>): PlacedArea => ({
  card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, ...over,
});

describe("projectArea", () => {
  it("projects the gateway with resolved art and view coords", () => {
    const state = newGame(1, [0]);
    const a = projectArea(state.areas[0]!, 0, state, art);
    expect(a.level).toBe(1);
    expect(a.col).toBe(50);
    expect(a.row).toBe(50);
    expect(a.special).toBe("gateway");
    expect(a.up).toBe(true);            // gateway card 175 has stairUp
    expect(a.exits).toBe("NESW");
    expect(typeof a.tileId).toBe("string");
    expect([0, 90, 180, 270]).toContain(a.rot);
    expect(a.party).toBe(true);          // party stands on the gateway
  });

  it("marks faceDown and party correctly", () => {
    const state = newGame(1, [0]);
    const down = projectArea(area({ faceUp: false, coord: packCoord(2, 50, 50) }), 5, state, art);
    expect(down.faceDown).toBe(true);
    expect(down.party).toBe(false);      // idx 5 !== partyArea 0
    expect(down.level).toBe(2);
  });

  it("projects persisted floor contents into typed card lanes", () => {
    const state = newGame(1, [0]);
    // a chamber tile (bit16) with a creature (Dragon id10), a treasure (Magic Sword id3 = artifact), a hazard (id0)
    const a = projectArea(area({ card: 16 | 2, contents: [100 + 10, 200 + 3, 300 + 0] }), 1, state, art);
    expect(a.strangers.map((c) => c.name)).toContain("Dragon");
    expect(a.treasure.find((c) => c.name === "Magic Sword")?.category).toBe("artifact");
    expect(a.hazards.length).toBe(1);
    // unique ids even for repeats
    const dup = projectArea(area({ card: 16, contents: [100 + 10, 100 + 10] }), 1, state, art);
    expect(new Set(dup.strangers.map((c) => c.id)).size).toBe(2);
  });
});

describe("encodeWorkingSet", () => {
  it("encodes the live working set to 100/200/300 codes", () => {
    const s = { strangers: [10, 5], treasures: [3], hazards: [0] } as unknown as GameState;
    expect(encodeWorkingSet(s)).toEqual([110, 105, 203, 300]);
  });
});

describe("areaKey", () => {
  it("keys by level,col,row", () => {
    expect(areaKey(2, 51, 49)).toBe("2,51,49");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter web test projection`
Expected: FAIL (`./projection` does not exist).

- [ ] **Step 4: Implement `projection.ts`**

Create `apps/web/src/view/projection.ts`:

```typescript
import { decodeArea, unpackCoord, TREASURES, type GameState, type PlacedArea } from "@sorcerers-cave/engine";
import { resolveTile, resolveCard, normExits, type TileArt, type CardArt, type Rot } from "../data/manifest";
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
  ];
}

function decodeTopology(card: number) {
  const d = decodeArea(card);
  const exits = normExits((d.n ? "N" : "") + (d.e ? "E" : "") + (d.s ? "S" : "") + (d.w ? "W" : ""));
  return { d, exits, special: SPECIAL[d.special] ?? null };
}

function laneCards(codes: readonly number[], cards: CardArt[]): { strangers: Card[]; treasure: Card[]; hazards: Card[] } {
  const strangers: Card[] = [], treasure: Card[] = [], hazards: Card[] = [];
  const seen = new Map<string, number>();
  for (const code of codes) {
    const kind = code >= 300 ? "hazard" : code >= 200 ? "treasure" : "creature";
    const entityId = code >= 300 ? code - 300 : code >= 200 ? code - 200 : code - 100;
    const art = resolveCard(kind, entityId, cards);
    const baseId = art?.cardId ?? `${kind}-${entityId}`;
    const n = seen.get(baseId) ?? 0; seen.set(baseId, n + 1);
    const category: Card["category"] =
      kind === "creature" ? "creature"
      : kind === "hazard" ? "hazard"
      : TREASURES[entityId]?.kind === "artifact" ? "artifact" : "treasure";
    const card: Card = {
      id: n === 0 ? baseId : `${baseId}#${n}`,
      name: art?.name ?? `${kind} ${entityId}`,
      category,
      entityId: String(entityId),
      file: art?.file ?? "",
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
  const resolved = resolveTile({ exits, stairUp: d.stairUp, stairDown: d.stairDown, special, isChamber: d.chamber }, art.tiles);
  const lanes = laneCards(liveContents ?? pa.contents, art.cards);
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
    strangers: lanes.strangers,
    treasure: lanes.treasure,
    hazards: lanes.hazards,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test projection`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter web typecheck`
Expected: clean.

```bash
git add apps/web/src/view/ports.ts apps/web/src/view/projection.ts apps/web/src/view/projection.test.ts
git commit -m "feat(web): ports.ts contract + engine→ports projection (D-2)"
```

---

### Task 2: Adapter read-only surface (`areas`/`placed`/`current`/`startLevel`/`state`/`openMoves`)

**Files:**
- Create: `apps/web/src/view/engineAdapter.ts`
- Create: `apps/web/src/view/engineAdapter.test.ts`

- [ ] **Step 1: Write the tests**

Create `apps/web/src/view/engineAdapter.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AssetManifest } from "@sorcerers-cave/assets";
import { newGame } from "@sorcerers-cave/engine";
import { parseManifest } from "../data/manifest";
import { createCaveAdapter } from "./engineAdapter";
import type { ArtTables } from "./projection";

let art: ArtTables;
beforeAll(() => {
  const m = JSON.parse(readFileSync(resolve(process.cwd(), "../../docs/assets/manifest.json"), "utf8")) as AssetManifest;
  art = parseManifest(m);
});

describe("createCaveAdapter — read surface", () => {
  it("exposes the gateway as current with startLevel 1", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    expect(eng.startLevel).toBe(1);
    expect(eng.current.special).toBe("gateway");
    expect(eng.current.party).toBe(true);
    expect(eng.areas.length).toBe(1);
    expect(eng.placed.get("1,50,50")?.special).toBe("gateway");
  });

  it("state() snapshots HUD fields", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    const s = eng.state();
    expect(s.level).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.placed).toBe(1);
    expect(s.deckLeft).toBe(60);          // 60-card large pack, none drawn
    expect(s.current.special).toBe("gateway");
  });

  it("openMoves offers the gateway's four lateral frontiers as undrawn", () => {
    const eng = createCaveAdapter(newGame(1, [0]), art);
    const moves = eng.openMoves();
    expect(moves.map((m) => m.dir).sort()).toEqual(["E", "N", "S", "W"]); // gateway 175: NESW, stairUp=escape (excluded), no down
    expect(moves.every((m) => m.kind === "undrawn")).toBe(true);
    expect(moves.find((m) => m.dir === "N")?.target).toEqual({ level: 1, col: 50, row: 49 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test engineAdapter`
Expected: FAIL (`./engineAdapter` does not exist).

- [ ] **Step 3: Implement the read-only surface of `engineAdapter.ts`**

Create `apps/web/src/view/engineAdapter.ts`:

```typescript
import {
  reduce, legalActions, unpackCoord, packCoord, targetCoord,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import type { CaveEngine, Area, StateSnapshot, Move, MoveEvent, Dir } from "./ports";
import { projectArea, encodeWorkingSet, areaKey, type ArtTables } from "./projection";

const DIR_TO_NUM: Record<Dir, number> = { N: 1, E: 2, S: 3, W: 4, U: 5, D: 6 };
const NUM_TO_DIR: Record<number, Dir> = { 1: "N", 2: "E", 3: "S", 4: "W", 5: "U", 6: "D" };

export interface AdapterOptions {
  /** Forward each accepted action (the seam D-3 uses to dispatch to Convex). */
  onAction?: (action: GameAction) => void;
}

export interface CaveAdapter extends CaveEngine {
  /** Replace the local mirror (D-3 reconcile from the authoritative snapshot). */
  sync(next: GameState): void;
}

export function createCaveAdapter(initial: GameState, art: ArtTables, opts: AdapterOptions = {}): CaveAdapter {
  let state = initial;

  // Live floor codes for the party's area when a chamber encounter is active; else undefined (use persisted contents).
  const liveForCurrent = (): number[] | undefined =>
    state.strangers.length || state.treasures.length || state.hazards.length ? encodeWorkingSet(state) : undefined;

  const projectAll = (): Area[] =>
    state.areas.map((pa, i) => projectArea(pa, i, state, art, i === state.partyArea ? liveForCurrent() : undefined));

  const adapter: CaveAdapter = {
    get areas() { return projectAll(); },
    get placed() {
      const m = new Map<string, Area>();
      for (const a of projectAll()) m.set(areaKey(a.level, a.col, a.row), a);
      return m;
    },
    get startLevel() { return Math.min(...state.areas.map((a) => unpackCoord(a.coord).level)); },
    get current() {
      const i = state.partyArea;
      return projectArea(state.areas[i]!, i, state, art, liveForCurrent());
    },
    state(): StateSnapshot {
      const current = adapter.current;
      return {
        level: current.level, col: current.col, row: current.row,
        turn: state.turn,
        placed: state.areas.length,
        deckLeft: state.largePack.length - state.largeIdx,
        current,
      };
    },
    openMoves(): Move[] {
      if (state.phase !== "explore") return [];
      const { level, x, y } = unpackCoord(state.areas[state.partyArea]!.coord);
      const moves: Move[] = [];
      for (const a of legalActions(state)) {
        if (a.type !== "move") continue;
        const dir = NUM_TO_DIR[a.dir]!;
        const t = unpackCoord(targetCoord(a.dir, level, x, y));
        const target = { level: t.level, col: t.x, row: t.y };
        const kind: Move["kind"] = dir === "U" || dir === "D"
          ? "stair"
          : state.areas.some((ar) => ar.coord === packCoord(target.level, target.col, target.row))
            ? "known"
            : "undrawn";
        moves.push({ dir, kind, target });
      }
      return moves;
    },
    tryMove(_dir: Dir): MoveEvent { return { moved: false }; }, // implemented in Task 3
    sync(next: GameState) { state = next; },
  };
  // expose DIR maps + opts to Task 3 via closure (tryMove replaces the stub there)
  void DIR_TO_NUM; void opts;
  return adapter;
}
```

(Task 3 replaces the `tryMove` stub with the real implementation in this same file — the `DIR_TO_NUM`/`opts` references above are wired there. Leaving the `void` no-ops keeps `tsc` happy until then.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test engineAdapter`
Expected: PASS (read surface). `tryMove` is still a stub.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter web typecheck`
Expected: clean.

```bash
git add apps/web/src/view/engineAdapter.ts apps/web/src/view/engineAdapter.test.ts
git commit -m "feat(web): CaveEngine adapter read surface (areas/state/openMoves) (D-2)"
```

---

### Task 3: `tryMove` + `MoveEvent` assembly

**Files:**
- Modify: `apps/web/src/view/engineAdapter.ts`
- Modify: `apps/web/src/view/engineAdapter.test.ts`

- [ ] **Step 1: Add the tests**

Append to `apps/web/src/view/engineAdapter.test.ts`:

```typescript
import { packCoord as pc, type GameState, type PlacedArea } from "@sorcerers-cave/engine";

// Minimal explore-phase GameState for deterministic move tests.
function mkState(areas: PlacedArea[], partyArea: number, over: Partial<GameState> = {}): GameState {
  return {
    gs: 0, phase: "explore", turn: 1, score: 0, curses: 0, bonusScore: 0, sorcererKilled: false,
    areas, partyArea, level: 1, prev: partyArea, prev2: partyArea,
    party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
    largePack: [], largeIdx: 0, smallPack: [], smallIdx: 0,
    strangers: [], treasures: [], hazards: [], seed: 1, fight: null, ...over,
  };
}
const mkArea = (card: number, level: number, col: number, row: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card, coord: pc(level, col, row), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0, ...over });

describe("tryMove + MoveEvent", () => {
  it("moves into a known adjacent area (no tile drawn)", () => {
    // A: E-exit corridor at (50,50); B: W-exit corridor at (51,50). Moving E lands on B.
    const A = mkArea(2, 1, 50, 50);       // exits "E"
    const B = mkArea(8, 1, 51, 50, { visited: true }); // exits "W"
    const eng = createCaveAdapter(mkState([A, B], 0), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.dir).toBe("E");
      expect(ev.area.col).toBe(51);
      expect(ev.placed).toBeNull();        // B already existed
      expect(ev.chamber).toBeUndefined();  // B is a tunnel, no cards
    }
    expect(eng.current.col).toBe(51);      // mirror advanced
  });

  it("reports a dead end when the current card has no exit that way", () => {
    const A = mkArea(2, 1, 50, 50);        // only "E"
    const eng = createCaveAdapter(mkState([A], 0), art);
    const ev = eng.tryMove("N");
    expect(ev.moved).toBe(false);
  });

  it("draws a chamber tile on an undrawn frontier and reveals its cards (firstVisit)", () => {
    const A = mkArea(2, 1, 50, 50);        // exits "E", frontier to the east is undrawn
    // pack a chamber tile with a W reverse-door (8 | 16 = 24); small pack yields a Dragon (id 10)
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [8 | 16], smallPack: [100 + 10] }), art);
    const ev = eng.tryMove("E");
    expect(ev.moved).toBe(true);
    if (ev.moved) {
      expect(ev.placed).not.toBeNull();    // a new tile was drawn
      expect(ev.area.type).toBe("chamber");
      expect(ev.chamber?.firstVisit).toBe(true);
      expect(ev.chamber?.draws.some((c) => c.name === "Dragon")).toBe(true);
    }
  });

  it("forwards the accepted action via opts.onAction", () => {
    const A = mkArea(2, 1, 50, 50);
    const B = mkArea(8, 1, 51, 50, { visited: true });
    const seen: number[] = [];
    const eng = createCaveAdapter(mkState([A, B], 0), art, { onAction: (a) => { if (a.type === "move") seen.push(a.dir); } });
    eng.tryMove("E");
    expect(seen).toEqual([2]); // DIR_E
  });

  it("tags stair descents and never offers moves outside explore", () => {
    // down-stair tile (card 64 = stairDown) at level 1; an undrawn frontier below.
    const A = mkArea(64, 1, 50, 50);
    const eng = createCaveAdapter(mkState([A], 0, { largePack: [0], smallPack: [] }), art);
    const ev = eng.tryMove("D");
    expect(ev.moved).toBe(true);
    if (ev.moved) { expect(ev.descended).toBe("D"); expect(ev.area.level).toBe(2); }
  });
});
```

NOTE TO IMPLEMENTER: card bit values — N=1,E=2,S=4,W=8,chamber=16,stairUp=32,stairDown=64. The hand-built cards above are chosen so the moves are deterministic (no shuffle): `2`="E", `8`="W", `8|16`=`24`=W+chamber, `64`=stairDown. If a specific assertion's outcome differs once you run it (e.g. the engine's stair-draw mirrors a return stair, or a tunnel card's `type`), READ the actual result and adjust the assertion to the real deterministic behaviour — do not change engine code. Keep every test deterministic (fixed cards/seeds, no reliance on shuffle).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test engineAdapter`
Expected: FAIL (`tryMove` is still the stub returning `{moved:false}`).

- [ ] **Step 3: Implement `tryMove`**

In `apps/web/src/view/engineAdapter.ts`, replace the `tryMove` stub line with the real implementation (and remove the `void DIR_TO_NUM; void opts;` no-ops):

```typescript
    tryMove(dir: Dir): MoveEvent {
      const before = state;
      const num = DIR_TO_NUM[dir];
      const action: GameAction = { type: "move", dir: num };
      const { state: next, events } = reduce(before, action);
      const blocked = events.some((e) => e.type === "blocked");
      const deadEnd = events.some((e) => e.type === "deadEnd");
      if (blocked || deadEnd) return deadEnd ? { moved: false, deadEnd: true } : { moved: false };
      state = next;
      opts.onAction?.(action);
      const idx = next.partyArea;
      const arrived = next.areas[idx]!;
      const grew = next.areas.length > before.areas.length;
      const area = projectArea(arrived, idx, next, art, liveForCurrent());
      const ev: MoveEvent = { moved: true, dir, area, placed: grew ? area : null };
      if (dir === "D") ev.descended = "D";
      if (dir === "U") ev.ascended = "U";
      if (events.some((e) => e.type === "drewChamber")) {
        const wasVisited = before.areas.find((a) => a.coord === arrived.coord)?.visited ?? false;
        ev.chamber = { draws: [...area.strangers, ...area.treasure, ...area.hazards], firstVisit: !wasVisited };
      }
      return ev;
    },
```

(`liveForCurrent`/`projectArea`/`DIR_TO_NUM`/`opts` are all already in scope in this closure.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test engineAdapter`
Expected: PASS (adjust any seed/card-dependent assertion to the real deterministic outcome per the Step 1 note — without touching engine code).

- [ ] **Step 5: Full web suite + typecheck + commit**

Run: `pnpm --filter web test` then `pnpm --filter web typecheck`
Expected: all green.

```bash
git add apps/web/src/view/engineAdapter.ts apps/web/src/view/engineAdapter.test.ts
git commit -m "feat(web): adapter tryMove + MoveEvent assembly (D-2)"
```

---

## Definition of Done

- [ ] `ports.ts` lives at `apps/web/src/view/ports.ts` (verbatim); `projection.ts` maps `PlacedArea`/contents → `Area`/`Card` with D-1 art resolution; `engineAdapter.ts` `createCaveAdapter` satisfies `CaveEngine` (read getters, `state()`, `openMoves()`, `tryMove`) plus a `sync()` reconcile hook and an `onAction` forward seam.
- [ ] `tryMove` runs the engine's pure `reduce` on a local mirror and assembles the `MoveEvent` (moved/deadEnd, area, placed-on-draw, descended/ascended, chamber+firstVisit) — verified by deterministic headless tests (known move, dead end, chamber draw, onAction forward, stair descent).
- [ ] `openMoves` is consistent with `legalActions` (never offers a move `reduce` rejects); `[]` outside explore.
- [ ] No engine changes; no DOM references. `pnpm --filter web test` and `pnpm --filter web typecheck` green.

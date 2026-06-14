# Milestone C-1 — Chambers, Hazards, Treasure & Scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chambers real — draw small-pack cards by depth, resolve hazards in priority order, let the party pick up treasure within carry limits, withdraw from strangers, and compute the end-game score — turning the explore skeleton into a loot-and-survive loop.

**Architecture:** Continues the pure `reduce(state, action) → { state, events }` engine. Chamber resolution runs inside the move path; it drives the new `phase` field (`pickup` when loot is free, `encounter` when strangers block it) so the UI/`legalActions` know what to offer. Combat (reaction rolls, fights) is **out of scope** — strangers are detected and block treasure, and the only encounter action here is `withdraw`. Reaction/fights come in C-2; special-area crossings in C-3.

**Tech Stack:** TypeScript, Vitest. Pure engine package (`packages/engine`).

**Source of truth:** `docs/specs/design-spec.html` §7 (chambers, hazards, pickup), §8.1 (withdraw), §12 (scoring), Appendix D (constants).

---

## Pre-flight

- All work in `packages/engine`. Run `pnpm --filter @sorcerers-cave/engine test` and `… typecheck`. Commit after each green task.
- `noUncheckedIndexedAccess` is on — use `!` only where an index is provably valid.
- Existing pieces this builds on: `GameState` (with `phase`, `strangers`/`treasures`/`hazards` working-set arrays, `areas[i].contents/visited/flags`, `party[].treasure`), `decodeArea`, `rollDie`, `reduce`/`resolveArea`, `legalActions`, `makeState` test factory, `CREATURES`/`TREASURES`/`HAZARD_*` data.
- **Determinism:** every die roll threads `state.seed`. Never use `Math.random`.

## File Structure

```
packages/engine/src/
├── actions.ts        # MODIFY: add withdraw / takeTreasure / leaveTreasure / donePickup actions + new events
├── chamber.ts        # NEW: enterChamber (draw, classify, persist/reload) + phase transition
├── hazards.ts        # NEW: applyHazards (Earthquake, Medusa, Ghouls, Mutiny, Trap) in priority order
├── pickup.ts         # NEW: takeTreasure / leaveTreasure carry-limit logic
├── score.ts          # NEW: scoreGame (spec §12)
├── reduce.ts         # MODIFY: resolveArea calls enterChamber; dispatch pickup/encounter actions; trap-fall loop
├── selectors.ts      # MODIFY: legalActions for pickup + encounter phases
└── index.ts          # MODIFY: export chamber/hazards/pickup/score
```

---

## Task 1: Chamber draw & classification

**Files:**
- Create: `packages/engine/src/chamber.ts`
- Modify: `packages/engine/src/actions.ts` (add `drewChamber` event)
- Test: `packages/engine/src/chamber.test.ts`

- [ ] **Step 1: Add the `drewChamber` event to `actions.ts`** (replace the `GameEvent` union)

```ts
export type GameEvent =
  | { type: "moved"; area: number; level: number }
  | { type: "deadEnd"; dir: number }
  | { type: "blocked" }
  | { type: "drewChamber"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "enteredSpecial"; special: number }
  | { type: "gameOver"; gs: number };
```
> `enteredChamber` is removed — `drewChamber` carries the actual contents. (Update the reduce skeleton in Task 5.)

- [ ] **Step 2: Write the failing test `packages/engine/src/chamber.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { enterChamber } from "./chamber";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

function chamberAt(level: number) {
  // card 31 = NSEWC (a chamber). Put the party on it.
  return makeState({
    level,
    areas: [{ card: 31, coord: packCoord(level, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
  });
}

describe("enterChamber (spec §7.1)", () => {
  it("draws min(level,4) cards on first visit and classifies them", () => {
    // smallPack: a Dragon(110), Gold(201), Trap(301). On level 1 -> draw 1 (the Dragon).
    const s = chamberAt(1);
    s.smallPack = [110, 201, 301];
    s.smallIdx = 0;
    const events = enterChamber(s);
    expect(s.smallIdx).toBe(1);
    expect(s.strangers).toEqual([10]); // 110 - 100
    expect(s.treasures).toEqual([]);
    expect(s.hazards).toEqual([]);
    expect(s.areas[0]!.visited).toBe(true);
    expect(events).toContainEqual({ type: "drewChamber", strangers: [10], treasures: [], hazards: [] });
  });

  it("draws more cards on deeper levels and classifies each kind", () => {
    const s = chamberAt(3); // draw 3
    s.smallPack = [110, 201, 301, 202];
    s.smallIdx = 0;
    enterChamber(s);
    expect(s.smallIdx).toBe(3);
    expect(s.strangers).toEqual([10]); // Dragon
    expect(s.treasures).toEqual([1]); // Gold (201-200)
    expect(s.hazards).toEqual([1]); // Trap (301-300)
  });

  it("stops early when the small pack is exhausted", () => {
    const s = chamberAt(4); // would draw 4
    s.smallPack = [201];
    s.smallIdx = 0;
    enterChamber(s);
    expect(s.smallIdx).toBe(1);
    expect(s.treasures).toEqual([0]); // Silver
  });

  it("does not redraw on a revisit; reloads persisted contents", () => {
    const s = chamberAt(2);
    s.areas[0]!.visited = true;
    s.areas[0]!.contents = [110, 201]; // a Dragon + Gold left here earlier
    s.smallPack = [301, 301];
    s.smallIdx = 0;
    enterChamber(s);
    expect(s.smallIdx).toBe(0); // nothing drawn
    expect(s.strangers).toEqual([10]);
    expect(s.treasures).toEqual([1]);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./chamber` not found.

- [ ] **Step 4: Implement `packages/engine/src/chamber.ts`**

```ts
import { decodeArea } from "./decode";
import { SPECIAL_TOMB, SPECIAL_GREAT_HALL } from "./data/areaCards";
import type { GameState } from "./state";
import type { GameEvent } from "./actions";

const MAX_STRANGERS = 8;
const MAX_TREASURE = 8;
const MAX_HAZARDS = 4;

/** Classify a small-pack code into the chamber working set. */
function classify(state: GameState, code: number): void {
  if (code >= 300) {
    if (state.hazards.length < MAX_HAZARDS) state.hazards.push(code - 300);
  } else if (code >= 200) {
    if (state.treasures.length < MAX_TREASURE) state.treasures.push(code - 200);
  } else {
    if (state.strangers.length < MAX_STRANGERS) state.strangers.push(code - 100);
  }
}

/**
 * Populate the chamber working set for the party's current area (spec §7.1). Mutates `state`.
 * First visit: draw min(level,4) (+Tomb/Hall extras, cap 8) from the small pack.
 * Revisit: reload the area's persisted contents (100+cid / 200+tid).
 */
export function enterChamber(state: GameState): GameEvent[] {
  const area = state.areas[state.partyArea]!;
  const dec = decodeArea(area.card);
  state.strangers = [];
  state.treasures = [];
  state.hazards = [];

  if (area.visited) {
    for (const code of area.contents) classify(state, code);
  } else {
    area.visited = true;
    let draw = Math.min(state.level, 4);
    if (dec.special === SPECIAL_TOMB) draw += 1;
    if (dec.special === SPECIAL_GREAT_HALL) draw += 2;
    draw = Math.min(draw, 8);
    for (let i = 0; i < draw && state.smallIdx < state.smallPack.length; i++) {
      classify(state, state.smallPack[state.smallIdx++]!);
    }
  }

  return [{
    type: "drewChamber",
    strangers: [...state.strangers],
    treasures: [...state.treasures],
    hazards: [...state.hazards],
  }];
}
```

- [ ] **Step 5: Run to confirm pass + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/chamber.ts packages/engine/src/chamber.test.ts packages/engine/src/actions.ts
git commit -m "feat(engine): chamber draws by depth + classification (spec §7.1)"
```

---

## Task 2: Hazard resolution

**Files:**
- Create: `packages/engine/src/hazards.ts`
- Modify: `packages/engine/src/actions.ts` (add `hazardFired` event)
- Test: `packages/engine/src/hazards.test.ts`

Hazards resolve in the fixed order **Earthquake, Medusa, Ghouls, Mutiny, Trap** (spec §7.2). `applyHazards` mutates state and returns `{ events, fell }`; `fell` true means a Trap dropped the party (handled by the reduce loop in Task 5).

- [ ] **Step 1: Add the `hazardFired` event to `actions.ts`** (extend the `GameEvent` union from Task 1)

Add this member to the union:
```ts
  | { type: "hazardFired"; hazard: number }
```

- [ ] **Step 2: Write the failing test `packages/engine/src/hazards.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_MUTINY, HAZARD_TRAP } from "./data/hazards";

describe("applyHazards (spec §7.2)", () => {
  it("Earthquake collapses the previous area", () => {
    const s = makeState({
      areas: [
        { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [110], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 51), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 1, prev: 0,
      hazards: [HAZARD_EARTHQUAKE],
    });
    const { events } = applyHazards(s);
    expect(s.areas[0]!.flags & 4).toBe(4); // destroyed bit
    expect(s.areas[0]!.contents).toEqual([]);
    expect(events).toContainEqual({ type: "hazardFired", hazard: HAZARD_EARTHQUAKE });
  });

  it("Medusa turns members to stone on a roll of 1-2", () => {
    // seed chosen so the first roll is low; we assert at least the mechanism runs and status can become 2.
    const s = makeState({
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },
      ],
      hazards: [HAZARD_MEDUSA],
      seed: 3,
    });
    applyHazards(s);
    // Every living member was rolled; status is 0 (alive) or 2 (stone), never unchanged-undefined.
    for (const m of s.party) expect([0, 2]).toContain(m.status);
  });

  it("Mutiny turns allies into strangers", () => {
    const s = makeState({
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] }, // original Hero
        { creatureId: 10, status: 1, dragonKills: 0, treasure: [] }, // ally Dragon
      ],
      strangers: [],
      hazards: [HAZARD_MUTINY],
    });
    applyHazards(s);
    expect(s.party.map((m) => m.creatureId)).toEqual([0]); // ally removed
    expect(s.strangers).toContain(10); // joined the chamber's strangers
  });

  it("Trap drops the whole party one level (fell), negated by a Dwarf", () => {
    const withDwarf = makeState({
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [] }], // Dwarf guides past one trap
      hazards: [HAZARD_TRAP],
    });
    expect(applyHazards(withDwarf).fell).toBe(false);

    const noDwarf = makeState({
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
      hazards: [HAZARD_TRAP],
    });
    expect(applyHazards(noDwarf).fell).toBe(true);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./hazards` not found.

- [ ] **Step 4: Implement `packages/engine/src/hazards.ts`**

```ts
import { rollDie } from "./rng";
import { CREATURES, FLAG_GUIDES_PAST_TRAP } from "./data/creatures";
import { TREASURES } from "./treasures-import"; // see note below
import {
  HAZARD_MUTINY, HAZARD_TRAP, HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS,
} from "./data/hazards";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const AF_DESTROYED = 4;

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

/** Resolve every hazard in the working set, in priority order (spec §7.2). */
export function applyHazards(state: GameState): { events: GameEvent[]; fell: boolean } {
  const events: GameEvent[] = [];
  let fell = false;
  const order = [HAZARD_EARTHQUAKE, HAZARD_MEDUSA, HAZARD_GHOULS, HAZARD_MUTINY, HAZARD_TRAP];

  for (const hz of order) {
    if (!state.hazards.includes(hz)) continue;
    events.push({ type: "hazardFired", hazard: hz });
    switch (hz) {
      case HAZARD_EARTHQUAKE: {
        const prev = state.areas[state.prev];
        if (prev && state.prev !== state.partyArea) {
          prev.flags |= AF_DESTROYED;
          prev.contents = [];
        }
        break;
      }
      case HAZARD_MEDUSA: {
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const r = rollDie(state.seed);
          state.seed = r.seed;
          if (r.value <= 2) m.status = 2; // STONE
        }
        break;
      }
      case HAZARD_GHOULS: {
        for (const m of state.party) {
          if (m.status !== 0 && m.status !== 1) continue;
          const ours = rollDie(state.seed); state.seed = ours.seed;
          const theirs = rollDie(state.seed); state.seed = theirs.seed;
          const fs = CREATURES[m.creatureId]!.fs;
          if (ours.value + fs < theirs.value + 2) m.status = 3; // killed
        }
        break;
      }
      case HAZARD_MUTINY: {
        const allies = state.party.filter((m) => m.status === 1);
        const originals = state.party.filter((m) => m.status === 0);
        const desert = originals.length === 0 ? allies.slice(1) : allies; // one stays if all-ally
        for (const a of desert) state.strangers.push(a.creatureId);
        state.party = state.party.filter((m) => !desert.includes(m));
        break;
      }
      case HAZARD_TRAP: {
        const hasDwarf = living(state).some((m) => (CREATURES[m.creatureId]!.flags & FLAG_GUIDES_PAST_TRAP) !== 0);
        if (!hasDwarf) fell = true;
        break;
      }
    }
  }
  state.hazards = [];
  return { events, fell };
}
```
> **Import note:** `TREASURES` is not actually used in this file — delete that import line. (Kept the list short; the only data imports needed are `CREATURES` and `FLAG_GUIDES_PAST_TRAP` from `./data/creatures`.)

- [ ] **Step 5: Remove the stray import, run to confirm pass + typecheck**

Delete the `import { TREASURES } …` line, then run:
`pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/hazards.ts packages/engine/src/hazards.test.ts packages/engine/src/actions.ts
git commit -m "feat(engine): hazard resolution in priority order (spec §7.2)"
```

---

## Task 3: Treasure pickup (carry limits)

**Files:**
- Create: `packages/engine/src/pickup.ts`
- Test: `packages/engine/src/pickup.test.ts`

Pure helpers the reduce layer calls during the `pickup` phase. A member may hold heavy treasure (Silver/Gold/Gems = 25 kg, Chest = 100 kg) up to its carry capacity; artifacts (weight 0) are unlimited.

- [ ] **Step 1: Write the failing test `packages/engine/src/pickup.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { carriedWeight, canCarry, takeTreasure } from "./pickup";
import { makeState } from "./testkit";

describe("treasure carry limits (spec §7.3)", () => {
  it("sums heavy weight carried, ignoring weightless artifacts", () => {
    const member = { creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [0, 3] }; // Silver(25) + Magic Sword(0)
    expect(carriedWeight(member)).toBe(25);
  });

  it("canCarry respects the member's capacity", () => {
    const man = { creatureId: 5, status: 0 as const, dragonKills: 0, treasure: [] }; // Man carries 50
    expect(canCarry(man, 0)).toBe(true); // Silver 25 fits
    man.treasure = [0, 1]; // 50 kg used
    expect(canCarry(man, 2)).toBe(false); // no room for Gems
    expect(canCarry(man, 3)).toBe(true); // weightless artifact always fits
  });

  it("takeTreasure moves a chamber item to a member and removes it from the chamber", () => {
    const s = makeState({
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], // Giant carries 150
      treasures: [1, 2], // Gold, Gems
    });
    const ok = takeTreasure(s, 0, 0); // take treasures[0] (Gold) for member 0
    expect(ok).toBe(true);
    expect(s.party[0]!.treasure).toEqual([1]);
    expect(s.treasures).toEqual([2]);
  });

  it("takeTreasure refuses an over-weight assignment", () => {
    const s = makeState({
      party: [{ creatureId: 6, status: 0, dragonKills: 0, treasure: [0] }], // Woman carries 25, already holds Silver
      treasures: [1],
    });
    expect(takeTreasure(s, 0, 0)).toBe(false);
    expect(s.party[0]!.treasure).toEqual([0]);
    expect(s.treasures).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./pickup` not found.

- [ ] **Step 3: Implement `packages/engine/src/pickup.ts`**

```ts
import { CREATURES } from "./data/creatures";
import { TREASURES } from "./data/treasures";
import type { GameState, PartyMember } from "./state";

/** Total kg of heavy treasure a member is carrying (artifacts weigh 0). */
export function carriedWeight(member: PartyMember): number {
  return member.treasure.reduce((sum, tid) => sum + TREASURES[tid]!.weight, 0);
}

/** Can the member take treasure `tid` without exceeding its carry capacity? */
export function canCarry(member: PartyMember, tid: number): boolean {
  const capacity = CREATURES[member.creatureId]!.carry;
  return carriedWeight(member) + TREASURES[tid]!.weight <= capacity;
}

/** Assign chamber treasure index `ti` to party member index `mi`. Returns false if it won't fit. */
export function takeTreasure(state: GameState, ti: number, mi: number): boolean {
  const tid = state.treasures[ti];
  const member = state.party[mi];
  if (tid === undefined || member === undefined) return false;
  if (!canCarry(member, tid)) return false;
  member.treasure.push(tid);
  state.treasures.splice(ti, 1);
  return true;
}
```

- [ ] **Step 4: Run to confirm pass + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/pickup.ts packages/engine/src/pickup.test.ts
git commit -m "feat(engine): treasure pickup carry-limit helpers (spec §7.3)"
```

---

## Task 4: Scoring & game-over

**Files:**
- Create: `packages/engine/src/score.ts`
- Test: `packages/engine/src/score.test.ts`

- [ ] **Step 1: Write the failing test `packages/engine/src/score.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scoreGame } from "./score";
import { makeState } from "./testkit";
import { GS_DEAD, GS_ESCAPED } from "./state";

describe("scoreGame (spec §12)", () => {
  it("sums living members' points plus carried treasure", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [1] }, // Hero 10 + Gold 10
        { creatureId: 5, status: 1, dragonKills: 0, treasure: [] }, // ally Man 5
      ],
    });
    expect(scoreGame(s)).toBe(25);
  });

  it("doubles a dragon-slayer's creature points (not treasure)", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      party: [{ creatureId: 0, status: 0, dragonKills: 1, treasure: [1] }], // Hero 10*2 + Gold 10
    });
    expect(scoreGame(s)).toBe(30);
  });

  it("excludes stone/dead members, adds sorcerer bonus, subtracts 30 per curse", () => {
    const s = makeState({
      gs: GS_ESCAPED,
      sorcererKilled: true,
      curses: 1,
      party: [
        { creatureId: 0, status: 0, dragonKills: 0, treasure: [] }, // Hero 10
        { creatureId: 5, status: 2, dragonKills: 0, treasure: [2] }, // STONE -> excluded
      ],
    });
    expect(scoreGame(s)).toBe(10 + 30 - 30); // 10
  });

  it("a wiped party scores zero, clamped at 0", () => {
    const s = makeState({
      gs: GS_DEAD,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [1] }],
    });
    expect(scoreGame(s)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./score` not found.

- [ ] **Step 3: Implement `packages/engine/src/score.ts`**

```ts
import { CREATURES } from "./data/creatures";
import { TREASURES } from "./data/treasures";
import { GS_DEAD, type GameState } from "./state";

/** Final score (spec §12). A wiped party (GS_DEAD) scores 0; otherwise clamp at 0. */
export function scoreGame(state: GameState): number {
  if (state.gs === GS_DEAD) return 0;
  let score = 0;
  for (const m of state.party) {
    if (m.status !== 0 && m.status !== 1) continue; // not stone, not dead
    let pts = CREATURES[m.creatureId]!.points;
    if (m.dragonKills > 0) pts *= 2; // dragon-slayer doubling (creature points only)
    score += pts;
    for (const tid of m.treasure) score += TREASURES[tid]!.points;
  }
  if (state.sorcererKilled) score += 30;
  score -= 30 * state.curses;
  return Math.max(0, score);
}
```

- [ ] **Step 4: Run to confirm pass + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/score.ts packages/engine/src/score.test.ts
git commit -m "feat(engine): end-game scoring (spec §12)"
```

---

## Task 5: Wire chambers into the turn loop (reduce + phases + actions)

**Files:**
- Modify: `packages/engine/src/actions.ts` (add the new actions), `packages/engine/src/reduce.ts`, `packages/engine/src/selectors.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/reduce.test.ts` (extend)

- [ ] **Step 1: Add the chamber-interaction actions to `actions.ts`** (extend the `GameAction` union)

```ts
export type GameAction =
  | { type: "move"; dir: number }
  | { type: "quit" }
  | { type: "exitCave" }
  | { type: "withdraw" } // leave a chamber back to the previous area (strangers stay)
  | { type: "takeTreasure"; ti: number; mi: number } // assign chamber treasure ti to member mi
  | { type: "leaveTreasure" }; // finish pickup, leaving remaining loot in the area
```

- [ ] **Step 2: Replace `resolveArea` and add phase dispatch in `reduce.ts`**

Replace the entire contents of `packages/engine/src/reduce.ts` with:

```ts
import { GS_PLAYING, GS_QUIT, GS_ESCAPED, type GameState } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT } from "./data/areaCards";
import { enterChamber } from "./chamber";
import { applyHazards } from "./hazards";
import { takeTreasure } from "./pickup";
import { unpackCoord, packCoord } from "./coords";
import type { GameAction, GameEvent } from "./actions";

/** Persist the chamber working set back into the area, then return to exploring. */
function persistAndExplore(state: GameState): void {
  const area = state.areas[state.partyArea]!;
  area.contents = [
    ...state.strangers.map((id) => 100 + id),
    ...state.treasures.map((id) => 200 + id),
  ];
  state.phase = "explore";
}

/** Resolve the area just entered: special markers, then chamber draw + hazards + phase (spec §4/§7). */
function resolveArea(state: GameState): GameEvent[] {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];

  // Trap-fall loop: a Trap drops the party one level and re-resolves there (same turn, spec §4.1).
  for (;;) {
    const dec = decodeArea(state.areas[state.partyArea]!.card);
    if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) {
      events.push({ type: "enteredSpecial", special: dec.special }); // crossing logic in C-3
      state.phase = "explore";
      return events;
    }
    if (!dec.chamber) {
      state.phase = "explore";
      return events;
    }
    events.push(...enterChamber(state));
    const { events: hzEvents, fell } = applyHazards(state);
    events.push(...hzEvents);
    if (fell) {
      relocateDown(state);
      events.push({ type: "moved", area: state.partyArea, level: state.level });
      continue; // re-resolve the area below
    }
    if (state.strangers.length > 0) {
      state.phase = "encounter"; // C-1: only withdraw; reactions/fights in C-2
    } else if (state.treasures.length > 0) {
      state.phase = "pickup";
    } else {
      persistAndExplore(state);
    }
    return events;
  }
}

/** Move the whole party to the area directly below (same x,y), creating it if needed. */
function relocateDown(state: GameState): void {
  const { x, y, level } = unpackCoord(state.areas[state.partyArea]!.coord);
  const target = packCoord(level + 1, x, y);
  let idx = state.areas.findIndex((a) => a.coord === target);
  if (idx < 0) {
    // Reuse the large pack to materialise the area below (mirrors a stair-up so you can climb back).
    const card = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! | 32 : 31 | 32;
    state.areas.push({ card, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    idx = state.areas.length - 1;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = level + 1;
}

export function reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (state.level === 1 && dec.stairUp) {
        return { state: { ...state, gs: GS_ESCAPED, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_ESCAPED }] };
      }
      return { state, events: [{ type: "blocked" }] };
    }

    case "move": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const next = { ...res.state, turn: res.state.turn + 1 };
      return { state: next, events: resolveArea(next) };
    }

    case "withdraw": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      // Strangers stay; persist them and step back to the previous area.
      next.areas[next.partyArea]!.contents = [
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
      ];
      next.strangers = []; next.treasures = []; next.hazards = [];
      next.partyArea = next.prev;
      next.level = unpackCoord(next.areas[next.partyArea]!.coord).level;
      next.phase = "explore";
      return { state: next, events: [{ type: "moved", area: next.partyArea, level: next.level }] };
    }

    case "takeTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      takeTreasure(next, action.ti, action.mi);
      if (next.treasures.length === 0) persistAndExplore(next);
      return { state: next, events: [] };
    }

    case "leaveTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      persistAndExplore(next);
      return { state: next, events: [] };
    }
  }
}
```

- [ ] **Step 3: Update `legalActions` for the new phases in `selectors.ts`**

Replace the early `if (state.gs !== GS_PLAYING) return [];` block and the explore body with a phase switch. Replace the whole function body:

```ts
export function legalActions(state: GameState): GameAction[] {
  if (state.gs !== GS_PLAYING) return [];

  if (state.phase === "encounter") return [{ type: "withdraw" }, { type: "quit" }];
  if (state.phase === "pickup") {
    const actions: GameAction[] = [];
    for (let ti = 0; ti < state.treasures.length; ti++) {
      for (let mi = 0; mi < state.party.length; mi++) {
        if (state.party[mi]!.status === 0 || state.party[mi]!.status === 1) {
          actions.push({ type: "takeTreasure", ti, mi });
        }
      }
    }
    actions.push({ type: "leaveTreasure" });
    return actions;
  }
  if (state.phase !== "explore") return [];

  const dec = decodeArea(state.areas[state.partyArea]!.card);
  const actions: GameAction[] = [];
  if (dec.n) actions.push({ type: "move", dir: DIR_N });
  if (dec.e) actions.push({ type: "move", dir: DIR_E });
  if (dec.s) actions.push({ type: "move", dir: DIR_S });
  if (dec.w) actions.push({ type: "move", dir: DIR_W });
  if (dec.stairDown) actions.push({ type: "move", dir: DIR_DOWN });
  if (dec.stairUp) {
    if (state.level === 1) actions.push({ type: "exitCave" });
    else actions.push({ type: "move", dir: DIR_UP });
  }
  actions.push({ type: "quit" });
  return actions;
}
```

- [ ] **Step 4: Export the new modules from `index.ts`**

Add these lines:
```ts
export * from "./chamber";
export * from "./hazards";
export * from "./pickup";
export * from "./score";
```

- [ ] **Step 5: Extend `reduce.test.ts` for the chamber flow** (append)

```ts
import { legalActions } from "./selectors";

describe("reduce — chamber resolution (C-1)", () => {
  it("moving into a chamber with only treasure enters the pickup phase", () => {
    // Move South from the Gateway draws 31 (NSEWC chamber); the small pack yields a Gold.
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1]); // Gold
    expect(events).toContainEqual({ type: "drewChamber", strangers: [], treasures: [1], hazards: [] });
    expect(legalActions(state)).toContainEqual({ type: "takeTreasure", ti: 0, mi: 0 });
  });

  it("taking the last treasure returns to the explore phase and persists nothing", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [201], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.phase).toBe("explore");
    expect(state.party[0]!.treasure).toEqual([1]);
    expect(state.treasures).toEqual([]);
  });

  it("moving into a chamber with a stranger enters the encounter phase (withdraw only)", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 }); // a Dragon
    const { state } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.phase).toBe("encounter");
    expect(state.strangers).toEqual([10]);
    expect(legalActions(state)).toEqual([{ type: "withdraw" }, { type: "quit" }]);
  });

  it("withdraw steps back to the previous area and leaves the strangers behind", () => {
    const s = makeState({ largePack: [31], largeIdx: 0, smallPack: [110], smallIdx: 0 });
    const afterMove = reduce(s, { type: "move", dir: DIR_S }).state;
    const { state } = reduce(afterMove, { type: "withdraw" });
    expect(state.phase).toBe("explore");
    expect(state.partyArea).toBe(0); // back on the Gateway
    expect(state.areas[1]!.contents).toContain(110); // strangers persisted in the chamber
  });
});
```

- [ ] **Step 6: Run the full engine suite + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS — all prior tests plus the new chamber-flow tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/selectors.ts packages/engine/src/index.ts packages/engine/src/reduce.test.ts
git commit -m "feat(engine): wire chambers/hazards/pickup into the turn loop with phases (spec §4/§7)"
```

---

## Definition of Done (Milestone C-1)

- [ ] `pnpm --filter @sorcerers-cave/engine test` green; `typecheck` clean; `pnpm test` (all packages) green.
- [ ] Entering a chamber draws depth-appropriate cards, classifies them, and persists/reloads on revisit.
- [ ] Hazards resolve in order; a Trap drops the party a level (re-resolving below) unless a Dwarf guides past one.
- [ ] Treasure can be picked up within carry limits; the engine enters `pickup`/`encounter` phases and `legalActions` reflects them.
- [ ] `withdraw` leaves a stranger-occupied chamber, persisting its contents.
- [ ] `scoreGame` implements the §12 formula (dragon-slayer doubling, sorcerer +30, −30/curse, dead = 0).
- [ ] Combat (reactions, fights), real treasure-chest/eye-of-god effects, and special-area crossings remain for C-2/C-3 — `enteredSpecial` is still just a marker.

---

## Self-Review

**Spec coverage (§7, §8.1, §12):**
- §7.1 chamber draws (depth, Tomb/Hall extras, cap 8, early-stop, revisit reload) → Task 1. ✓
- §7.2 hazard order + Earthquake/Medusa/Ghouls/Mutiny/Trap, Dwarf-negates-trap, trap-fall relocation → Task 2 + Task 5 `relocateDown`. ✓
- §7.3 treasure pickup + carry limits → Task 3 + Task 5 pickup phase. ✓
- §8.1 withdraw → Task 5. (Test/Attack/reactions = C-2, explicitly deferred.) ✓
- §12 scoring → Task 4. ✓

**Deferred (named, not silently dropped):** stranger reaction rolls + fights (C-2); Treasure Chest open / Lost Ruby statue / Eye-of-God curse (C-2 §16); Viper Pit / Deep Pool crossings (C-3); Ghouls Talisman ward and heavy-treasure drop nuance (kept to the spec's implemented core).

**Placeholder scan:** none. The one inline note (delete the stray `TREASURES` import in Task 2) is an explicit cleanup step, not a vague TODO.

**Type consistency:** `GameState` fields (`phase`, `strangers`/`treasures`/`hazards`, `areas[].contents/flags`, `party[].treasure/status`) are used identically across `chamber.ts`, `hazards.ts`, `pickup.ts`, `score.ts`, `reduce.ts`, `selectors.ts`. New events (`drewChamber`, `hazardFired`) and actions (`withdraw`, `takeTreasure`, `leaveTreasure`) are declared in `actions.ts` (Tasks 1/2/5) before use. `takeTreasure(state, ti, mi)` signature matches between `pickup.ts` and the reduce dispatch. `AF_DESTROYED = 4` matches the `flags & 4` assertion in the Earthquake test.

**Determinism:** Medusa/Ghouls thread `state.seed` through `rollDie`; no `Math.random`/`Date.now`.

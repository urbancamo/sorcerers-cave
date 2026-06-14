# Milestone B — Engine: Exploration Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the pure, deterministic exploration core of the game engine — static data tables, deck building, card decoding, game-state setup with party selection, map movement, and a turn-dispatch skeleton that emits events.

**Architecture:** All work is in `packages/engine` as pure TypeScript with no I/O. State is a single serializable `GameState` object; every transition returns a new state via `structuredClone`. The RNG seed lives inside the state (Milestone A), so the whole engine is deterministic and unit-testable by seeded replay. Chamber draws, stranger encounters, fights, and hazards are **out of scope** here (Milestone C) — the turn dispatcher emits placeholder events at those boundaries.

**Tech Stack:** TypeScript, Vitest. Source-only package consumed by the web app and Convex.

**Source of truth:** `docs/specs/design-spec.html` §3 (data model), §4 (turn lifecycle), §5 (RNG), §6 (map/movement), Appendix A (61 cards), Appendix D (constants).

---

## Pre-flight

- Run all commands from the repo root: `/Users/msw/code/retro/sorcerers-cave`.
- The engine already has `nextSeed` and `rollDie` (`packages/engine/src/rng.ts`) and a barrel `src/index.ts`.
- `tsconfig.base.json` sets `noUncheckedIndexedAccess: true`, so indexed array access is `T | undefined`. Use the non-null assertion `!` only where an index is provably in range (the code below does this deliberately).
- Run a single package's tests with `pnpm --filter @sorcerers-cave/engine test`. Commit after each green task.

## File Structure (created/modified by this milestone)

```
packages/engine/src/
├── rng.ts              # MODIFY: add randBelow + shuffle
├── decode.ts           # NEW: bitfield card decoder (§3.1)
├── data/
│   ├── areaCards.ts    # NEW: 61 card values + special-type + gateway index (Appendix A)
│   ├── creatures.ts    # NEW: 14 creatures + flags + starting stock (§3.2)
│   ├── treasures.ts    # NEW: 15 treasures (§3.3)
│   ├── hazards.ts      # NEW: 5 hazard names (§3.4)
│   └── smallPack.ts    # NEW: 52-card template (§3.5)
├── decks.ts            # NEW: buildLargePack / buildSmallPack
├── state.ts            # NEW: GameState + member/area types + constants (§3.6)
├── coords.ts           # NEW: packCoord / unpackCoord / targetCoord (§3.6 coord scheme)
├── setup.ts            # NEW: validatePicks + newGame (§3.2 party select, setup)
├── map.ts              # NEW: tryMove and direction helpers (§6)
├── actions.ts          # NEW: GameAction + GameEvent unions
├── reduce.ts           # NEW: turn-dispatch skeleton (§4)
├── testkit.ts          # NEW: makeState() factory — test-only, NOT in the barrel
└── index.ts            # MODIFY: re-export public modules
```

---

## Task 1: RNG — `randBelow` + `shuffle`

**Files:**
- Modify: `packages/engine/src/rng.ts`
- Test: `packages/engine/src/rng.test.ts` (extend existing)

- [ ] **Step 1: Add failing tests to `packages/engine/src/rng.test.ts`** (append below the existing `describe`)

```ts
import { randBelow, shuffle } from "./rng";

describe("randBelow (spec §5)", () => {
  it("returns a value in [0, n)", () => {
    let s = 7;
    for (let i = 0; i < 500; i++) {
      const r = randBelow(s, 6);
      s = r.seed;
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
    }
  });
  it("returns 0 for n <= 0 without advancing the seed", () => {
    expect(randBelow(99, 0)).toEqual({ seed: 99, value: 0 });
  });
});

describe("shuffle (Fisher–Yates, spec §5)", () => {
  it("is a permutation (preserves the multiset)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { result } = shuffle(123, input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });
  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    shuffle(1, input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
  it("is deterministic for a given seed", () => {
    expect(shuffle(42, [1, 2, 3, 4, 5]).result).toEqual(shuffle(42, [1, 2, 3, 4, 5]).result);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `randBelow`/`shuffle` not exported.

- [ ] **Step 3: Append to `packages/engine/src/rng.ts`**

```ts
/** Uniform integer in [0, n). Returns the advanced seed (unchanged if n <= 0). */
export function randBelow(seed: number, n: number): { seed: number; value: number } {
  if (n <= 0) return { seed, value: 0 };
  const s = nextSeed(seed);
  const bits = Math.floor(s / 32768) % 65536; // upper bits 15..30
  return { seed: s, value: bits % n };
}

/** Fisher–Yates shuffle. Pure: returns a new array and the advanced seed. */
export function shuffle<T>(seed: number, arr: readonly T[]): { seed: number; result: T[] } {
  const result = arr.slice();
  let s = seed;
  for (let i = result.length - 1; i >= 1; i--) {
    const r = randBelow(s, i + 1);
    s = r.seed;
    const j = r.value;
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return { seed: s, result };
}
```

- [ ] **Step 4: Run to confirm pass + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/rng.ts packages/engine/src/rng.test.ts
git commit -m "feat(engine): randBelow + Fisher-Yates shuffle (spec §5)"
```

---

## Task 2: Static data tables (creatures, treasures, hazards, area cards)

**Files:**
- Create: `packages/engine/src/data/creatures.ts`, `treasures.ts`, `hazards.ts`, `areaCards.ts`
- Test: `packages/engine/src/data/data.test.ts`

- [ ] **Step 1: Create `packages/engine/src/data/creatures.ts`** (§3.2; flags bitmask; stock from §3.2)

```ts
export const FLAG_HUMAN = 1;
export const FLAG_CHARISMA = 2;
export const FLAG_BEFRIENDS_UNICORN = 4;
export const FLAG_GUIDES_PAST_TRAP = 8;
export const FLAG_INHUMAN = 16;

export interface Creature {
  id: number;
  name: string;
  fs: number; // fighting strength
  mp: number; // magical power
  carry: number; // kg capacity
  cost: number | null; // party-selection cost; null = not selectable
  points: number;
  flags: number;
  hostileMax: number | null; // reaction thresholds (cave strangers); null = n/a
  indiffMax: number | null;
  leaderPri: number;
}

// id order is normative (spec §3.2).
export const CREATURES: readonly Creature[] = [
  { id: 0, name: "Hero", fs: 5, mp: 0, carry: 75, cost: 6, points: 10, flags: FLAG_HUMAN | FLAG_CHARISMA, hostileMax: null, indiffMax: null, leaderPri: 7 },
  { id: 1, name: "W-Hero", fs: 4, mp: 0, carry: 50, cost: 5, points: 10, flags: FLAG_HUMAN | FLAG_CHARISMA | FLAG_BEFRIENDS_UNICORN, hostileMax: 3, indiffMax: 3, leaderPri: 7 },
  { id: 2, name: "Ogre", fs: 5, mp: 0, carry: 100, cost: 5, points: 5, flags: FLAG_INHUMAN, hostileMax: 4, indiffMax: 5, leaderPri: 3 },
  { id: 3, name: "Troll", fs: 4, mp: 0, carry: 75, cost: 4, points: 4, flags: FLAG_INHUMAN, hostileMax: 3, indiffMax: 4, leaderPri: 2 },
  { id: 4, name: "Priest", fs: 2, mp: 2, carry: 25, cost: 4, points: 8, flags: FLAG_HUMAN, hostileMax: null, indiffMax: null, leaderPri: 6 },
  { id: 5, name: "Man", fs: 3, mp: 0, carry: 50, cost: 3, points: 5, flags: FLAG_HUMAN, hostileMax: null, indiffMax: null, leaderPri: 5 },
  { id: 6, name: "Woman", fs: 2, mp: 0, carry: 25, cost: 2, points: 5, flags: FLAG_HUMAN | FLAG_BEFRIENDS_UNICORN, hostileMax: null, indiffMax: null, leaderPri: 5 },
  { id: 7, name: "Dwarf", fs: 1, mp: 0, carry: 25, cost: 1, points: 2, flags: FLAG_INHUMAN | FLAG_GUIDES_PAST_TRAP, hostileMax: null, indiffMax: null, leaderPri: 1 },
  { id: 8, name: "Wizard", fs: 2, mp: 5, carry: 0, cost: null, points: 15, flags: FLAG_HUMAN, hostileMax: 1, indiffMax: 5, leaderPri: 8 },
  { id: 9, name: "Spectre", fs: 0, mp: 5, carry: 0, cost: null, points: 0, flags: 0, hostileMax: 5, indiffMax: 6, leaderPri: 10 },
  { id: 10, name: "Dragon", fs: 6, mp: 0, carry: 0, cost: null, points: 0, flags: FLAG_INHUMAN, hostileMax: 6, indiffMax: 6, leaderPri: 9 },
  { id: 11, name: "Sorcerer", fs: 4, mp: 9, carry: 0, cost: null, points: 0, flags: 0, hostileMax: 6, indiffMax: 6, leaderPri: 11 },
  { id: 12, name: "Giant", fs: 7, mp: 0, carry: 150, cost: null, points: 7, flags: FLAG_INHUMAN, hostileMax: 3, indiffMax: 5, leaderPri: 4 },
  { id: 13, name: "Unicorn", fs: 0, mp: 4, carry: 0, cost: null, points: 4, flags: FLAG_BEFRIENDS_UNICORN, hostileMax: 0, indiffMax: 0, leaderPri: 0 },
];

// Selectable starters (ids 0-7) and their stock counts (spec §3.2).
export const STARTING_STOCK: Readonly<Record<number, number>> = {
  0: 1, 1: 1, 2: 3, 3: 3, 4: 3, 5: 6, 6: 3, 7: 3,
};
```

- [ ] **Step 2: Create `packages/engine/src/data/treasures.ts`** (§3.3)

```ts
export type TreasureKind = "heavy" | "artifact";

export interface Treasure {
  id: number;
  name: string;
  points: number;
  weight: number; // kg (0 for artifacts)
  kind: TreasureKind;
}

export const TREASURES: readonly Treasure[] = [
  { id: 0, name: "Silver", points: 5, weight: 25, kind: "heavy" },
  { id: 1, name: "Gold", points: 10, weight: 25, kind: "heavy" },
  { id: 2, name: "Gems", points: 20, weight: 25, kind: "heavy" },
  { id: 3, name: "Magic Sword", points: 15, weight: 0, kind: "artifact" },
  { id: 4, name: "Magic Carpet", points: 5, weight: 0, kind: "artifact" },
  { id: 5, name: "Lotus Dust", points: 5, weight: 0, kind: "artifact" },
  { id: 6, name: "Healing Balm", points: 5, weight: 0, kind: "artifact" },
  { id: 7, name: "Talisman", points: 10, weight: 0, kind: "artifact" },
  { id: 8, name: "Strength Potion", points: 5, weight: 0, kind: "artifact" },
  { id: 9, name: "Magic Staff", points: 15, weight: 0, kind: "artifact" },
  { id: 10, name: "The Ring", points: 30, weight: 0, kind: "artifact" },
  { id: 11, name: "Lost Ruby", points: 20, weight: 0, kind: "artifact" },
  { id: 12, name: "Charmed Flute", points: 10, weight: 0, kind: "artifact" },
  { id: 13, name: "Eye of God", points: 0, weight: 0, kind: "artifact" },
  { id: 14, name: "Treasure Chest", points: 0, weight: 100, kind: "heavy" },
];
```

- [ ] **Step 3: Create `packages/engine/src/data/hazards.ts`** (§3.4)

```ts
// Hazard ids 0-4 (spec §3.4). Resolution order/behaviour is Milestone C.
export const HAZARD_NAMES = ["Mutiny", "Trap", "Earthquake", "Medusa", "Ghouls"] as const;
export const HAZARD_MUTINY = 0;
export const HAZARD_TRAP = 1;
export const HAZARD_EARTHQUAKE = 2;
export const HAZARD_MEDUSA = 3;
export const HAZARD_GHOULS = 4;
```

- [ ] **Step 4: Create `packages/engine/src/data/areaCards.ts`** (Appendix A — 61 values in index order; index 21 is the Gateway)

```ts
export const SPECIAL_NONE = 0;
export const SPECIAL_GATEWAY = 1;
export const SPECIAL_DEEP_POOL = 2;
export const SPECIAL_VIPER_PIT = 3;
export const SPECIAL_TOMB = 4;
export const SPECIAL_GREAT_HALL = 5;

/** The Gateway sits at index 21; it is removed from the pack and placed as the start. */
export const GATEWAY_INDEX = 21;

// 61 encoded card values in index order (Appendix A).
export const AREA_CARDS: readonly number[] = [
  111, 23, 77, 23, 79, 543, 671, 287, 31, 15, // 0-9
  29, 23, 9, 7, 11, 415, 9, 43, 75, 9, // 10-19
  9, 175, 39, 71, 14, 31, 27, 29, 67, 30, // 20-29
  14, 5, 69, 31, 23, 29, 30, 47, 46, 11, // 30-39
  3, 74, 31, 3, 78, 27, 10, 76, 15, 7, // 40-49
  27, 45, 23, 13, 13, 12, 78, 10, 5, 12, // 50-59
  29, // 60
];
```

- [ ] **Step 5: Write `packages/engine/src/data/data.test.ts`** (asserts the Appendix D constants and key values)

```ts
import { describe, it, expect } from "vitest";
import { CREATURES, STARTING_STOCK, FLAG_CHARISMA, FLAG_GUIDES_PAST_TRAP } from "./creatures";
import { TREASURES } from "./treasures";
import { HAZARD_NAMES } from "./hazards";
import { AREA_CARDS, GATEWAY_INDEX } from "./areaCards";

describe("static data (spec §3, Appendix D)", () => {
  it("has 61 area cards and the Gateway (value 175) at index 21", () => {
    expect(AREA_CARDS).toHaveLength(61);
    expect(AREA_CARDS[GATEWAY_INDEX]).toBe(175);
  });
  it("has 14 creatures with normative key stats", () => {
    expect(CREATURES).toHaveLength(14);
    expect(CREATURES[0]).toMatchObject({ name: "Hero", fs: 5, cost: 6, points: 10 });
    expect(CREATURES[10]).toMatchObject({ name: "Dragon", fs: 6 });
    expect(CREATURES[0]!.flags & FLAG_CHARISMA).toBe(FLAG_CHARISMA);
    expect(CREATURES[7]!.flags & FLAG_GUIDES_PAST_TRAP).toBe(FLAG_GUIDES_PAST_TRAP);
  });
  it("offers 8 selectable starters with the right stock", () => {
    expect(Object.keys(STARTING_STOCK)).toHaveLength(8);
    const totalStarters = Object.values(STARTING_STOCK).reduce((a, b) => a + b, 0);
    expect(totalStarters).toBe(1 + 1 + 3 + 3 + 3 + 6 + 3 + 3); // 23
  });
  it("has 15 treasures and 5 hazards", () => {
    expect(TREASURES).toHaveLength(15);
    expect(TREASURES[14]).toMatchObject({ name: "Treasure Chest", weight: 100, kind: "heavy" });
    expect(HAZARD_NAMES).toHaveLength(5);
  });
});
```

- [ ] **Step 6: Run to confirm pass**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: PASS — all data assertions green.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/data
git commit -m "feat(engine): static data tables — creatures, treasures, hazards, area cards (spec §3)"
```

---

## Task 3: Small-pack template + deck builders

**Files:**
- Create: `packages/engine/src/data/smallPack.ts`, `packages/engine/src/decks.ts`
- Test: `packages/engine/src/decks.test.ts`

- [ ] **Step 1: Create `packages/engine/src/data/smallPack.ts`** (§3.5; encoding `100+cid` / `200+tid` / `300+hid`)

```ts
// The 52-card chamber deck template (spec §3.5), unshuffled.
export function smallPackTemplate(): number[] {
  const cards: number[] = [];
  const add = (code: number, n: number) => {
    for (let i = 0; i < n; i++) cards.push(code);
  };
  // Creatures (19): 100 + creatureId
  add(101, 1); // W-Hero
  add(102, 3); // Ogre
  add(103, 2); // Troll
  add(108, 3); // Wizard
  add(109, 3); // Spectre
  add(110, 3); // Dragon
  add(111, 1); // Sorcerer
  add(112, 2); // Giant
  add(113, 1); // Unicorn
  // Treasures (27): 200 + treasureId
  add(200, 6); // Silver
  add(201, 6); // Gold
  add(202, 3); // Gems
  for (let t = 3; t <= 14; t++) add(200 + t, 1); // 1 of each artifact (12)
  // Hazards (6): 300 + hazardId
  add(300, 1); // Mutiny
  add(301, 2); // Trap
  add(302, 1); // Earthquake
  add(303, 1); // Medusa
  add(304, 1); // Ghouls
  return cards;
}
```

- [ ] **Step 2: Create `packages/engine/src/decks.ts`**

```ts
import { shuffle } from "./rng";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { smallPackTemplate } from "./data/smallPack";

/** 60 shuffled area-card values (Gateway removed). Returns the advanced seed. */
export function buildLargePack(seed: number): { seed: number; pack: number[] } {
  const values = AREA_CARDS.filter((_, i) => i !== GATEWAY_INDEX);
  const { seed: nextSeed, result } = shuffle(seed, values);
  return { seed: nextSeed, pack: result };
}

/** 52 shuffled small-pack card codes. Returns the advanced seed. */
export function buildSmallPack(seed: number): { seed: number; pack: number[] } {
  const { seed: nextSeed, result } = shuffle(seed, smallPackTemplate());
  return { seed: nextSeed, pack: result };
}
```

- [ ] **Step 3: Write `packages/engine/src/decks.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildLargePack, buildSmallPack } from "./decks";
import { smallPackTemplate } from "./data/smallPack";

describe("deck builders", () => {
  it("smallPackTemplate has 52 cards (19 creatures, 27 treasures, 6 hazards)", () => {
    const t = smallPackTemplate();
    expect(t).toHaveLength(52);
    expect(t.filter((c) => c >= 100 && c < 200)).toHaveLength(19);
    expect(t.filter((c) => c >= 200 && c < 300)).toHaveLength(27);
    expect(t.filter((c) => c >= 300 && c < 400)).toHaveLength(6);
  });
  it("buildLargePack yields 60 cards with no Gateway and the original multiset", () => {
    const { pack } = buildLargePack(5);
    expect(pack).toHaveLength(60);
    expect(pack).not.toContain(175);
  });
  it("buildSmallPack yields 52 cards preserving the template multiset", () => {
    const { pack } = buildSmallPack(5);
    expect([...pack].sort((a, b) => a - b)).toEqual([...smallPackTemplate()].sort((a, b) => a - b));
  });
  it("is deterministic for a given seed", () => {
    expect(buildLargePack(9).pack).toEqual(buildLargePack(9).pack);
  });
});
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/data/smallPack.ts packages/engine/src/decks.ts packages/engine/src/decks.test.ts
git commit -m "feat(engine): small-pack template + shuffled deck builders (spec §3.5)"
```

---

## Task 4: Card decoder

**Files:**
- Create: `packages/engine/src/decode.ts`
- Test: `packages/engine/src/decode.test.ts`

- [ ] **Step 1: Write the failing test `packages/engine/src/decode.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { decodeArea } from "./decode";
import { SPECIAL_GATEWAY, SPECIAL_TOMB, SPECIAL_DEEP_POOL } from "./data/areaCards";

describe("decodeArea (spec §3.1 bitfield)", () => {
  it("decodes the Gateway (175 = NSEW + stairUp + special 1)", () => {
    expect(decodeArea(175)).toEqual({
      n: true, e: true, s: true, w: true,
      chamber: false, stairUp: true, stairDown: false, special: SPECIAL_GATEWAY,
    });
  });
  it("decodes the Tomb of Kings (543 = NSEW + chamber + special 4)", () => {
    const d = decodeArea(543);
    expect(d.chamber).toBe(true);
    expect(d.special).toBe(SPECIAL_TOMB);
  });
  it("decodes the Deep Pool (287 = NSEW + chamber + special 2)", () => {
    expect(decodeArea(287).special).toBe(SPECIAL_DEEP_POOL);
  });
  it("decodes a plain NE corridor (3)", () => {
    expect(decodeArea(3)).toMatchObject({ n: true, e: true, s: false, w: false, chamber: false, special: 0 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./decode` not found.

- [ ] **Step 3: Implement `packages/engine/src/decode.ts`**

```ts
export interface DecodedArea {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  chamber: boolean;
  stairUp: boolean;
  stairDown: boolean;
  special: number; // 0..5 (SPECIAL_* in data/areaCards)
}

/** Decode an area-card value into its exits, stairs, chamber flag and special type (spec §3.1). */
export function decodeArea(value: number): DecodedArea {
  return {
    n: (value & 1) !== 0,
    e: (value & 2) !== 0,
    s: (value & 4) !== 0,
    w: (value & 8) !== 0,
    chamber: (value & 16) !== 0,
    stairUp: (value & 32) !== 0,
    stairDown: (value & 64) !== 0,
    special: (value >> 7) & 7,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/decode.ts packages/engine/src/decode.test.ts
git commit -m "feat(engine): area-card bitfield decoder (spec §3.1)"
```

---

## Task 5: Game-state model + `newGame` (party selection & setup)

**Files:**
- Create: `packages/engine/src/state.ts`, `packages/engine/src/coords.ts`, `packages/engine/src/setup.ts`
- Test: `packages/engine/src/setup.test.ts`

- [ ] **Step 1: Create `packages/engine/src/state.ts`** (§3.6 model + Appendix D constants)

```ts
export const GS_PLAYING = 0;
export const GS_ESCAPED = 1;
export const GS_DEAD = 2;
export const GS_QUIT = 3;

export const PARTY_CAP = 12;
export const PARTY_BUDGET = 6;
export const GATEWAY_START_COORD = 15050; // level 1, x=50, y=50

// Member status: 0 original, 1 ally, 2 stone, 3 dead.
export type MemberStatus = 0 | 1 | 2 | 3;

export interface PartyMember {
  creatureId: number;
  status: MemberStatus;
  dragonKills: number;
  treasure: number[]; // treasure ids carried
}

export interface PlacedArea {
  card: number; // area-card value
  coord: number; // packed level*10000 + y*100 + x
  faceUp: boolean; // entered (true) vs dead-end face-down (false)
  visited: boolean; // chamber already drawn
  contents: number[]; // leftover 100+cid / 200+tid (Milestone C)
  flags: number; // AF bits (Milestone C)
  indiffCount: number; // AI permanent-indifference counter (Milestone C)
}

export interface GameState {
  gs: number; // GS_*
  turn: number;
  score: number;
  curses: number;
  sorcererKilled: boolean;
  areas: PlacedArea[];
  partyArea: number; // index into areas
  level: number;
  prev: number; // previous area index
  prev2: number; // area two moves back (earthquake)
  party: PartyMember[];
  largePack: number[];
  largeIdx: number;
  smallPack: number[];
  smallIdx: number;
  strangers: number[]; // chamber working set (Milestone C)
  treasures: number[];
  hazards: number[];
  seed: number; // LCG state (spec §5)
}
```

- [ ] **Step 2: Create `packages/engine/src/coords.ts`** (§3.6 coordinate scheme)

```ts
export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 3;
export const DIR_W = 4;
export const DIR_UP = 5;
export const DIR_DOWN = 6;

export function packCoord(level: number, x: number, y: number): number {
  return level * 10000 + y * 100 + x;
}

export function unpackCoord(coord: number): { level: number; x: number; y: number } {
  const level = Math.floor(coord / 10000);
  const rem = coord % 10000;
  return { level, x: rem % 100, y: Math.floor(rem / 100) };
}

/** Coordinate one step in `dir` from (level,x,y). N: y-1, S: y+1, E: x+1, W: x-1, Up/Down: level∓1. */
export function targetCoord(dir: number, level: number, x: number, y: number): number {
  switch (dir) {
    case DIR_N: return packCoord(level, x, y - 1);
    case DIR_E: return packCoord(level, x + 1, y);
    case DIR_S: return packCoord(level, x, y + 1);
    case DIR_W: return packCoord(level, x - 1, y);
    case DIR_UP: return packCoord(level - 1, x, y);
    case DIR_DOWN: return packCoord(level + 1, x, y);
    default: return packCoord(level, x, y);
  }
}
```

- [ ] **Step 3: Write the failing test `packages/engine/src/setup.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { newGame, validatePicks } from "./setup";
import { GATEWAY_START_COORD } from "./state";

describe("validatePicks (spec §3.2 — 6-point budget, stock limits)", () => {
  it("accepts a single Hero (cost 6)", () => {
    expect(validatePicks([0])).toBe(true);
  });
  it("accepts a Priest + Woman (cost 4 + 2 = 6)", () => {
    expect(validatePicks([4, 6])).toBe(true);
  });
  it("rejects exceeding the budget (two Priests = 8)", () => {
    expect(validatePicks([4, 4])).toBe(false);
  });
  it("rejects exceeding stock (two Heroes; only 1 in stock)", () => {
    expect(validatePicks([0, 0])).toBe(false);
  });
  it("rejects a non-selectable creature (Wizard id 8)", () => {
    expect(validatePicks([8])).toBe(false);
  });
  it("rejects an empty party", () => {
    expect(validatePicks([])).toBe(false);
  });
});

describe("newGame (spec §3 setup)", () => {
  it("places the Gateway and seats the chosen party", () => {
    const g = newGame(1, [4, 6]); // Priest + Woman
    expect(g.gs).toBe(0);
    expect(g.turn).toBe(1);
    expect(g.level).toBe(1);
    expect(g.partyArea).toBe(0);
    expect(g.areas).toHaveLength(1);
    expect(g.areas[0]).toMatchObject({ card: 175, coord: GATEWAY_START_COORD, faceUp: true, visited: false });
    expect(g.party.map((m) => m.creatureId)).toEqual([4, 6]);
    expect(g.party.every((m) => m.status === 0)).toBe(true);
  });
  it("builds a 60-card large pack and a 52-card small pack", () => {
    const g = newGame(1, [0]);
    expect(g.largePack).toHaveLength(60);
    expect(g.smallPack).toHaveLength(52);
    expect(g.largeIdx).toBe(0);
    expect(g.smallIdx).toBe(0);
  });
  it("throws on invalid picks", () => {
    expect(() => newGame(1, [0, 0])).toThrow();
  });
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./setup` not found.

- [ ] **Step 5: Implement `packages/engine/src/setup.ts`**

```ts
import { CREATURES, STARTING_STOCK } from "./data/creatures";
import { AREA_CARDS, GATEWAY_INDEX } from "./data/areaCards";
import { buildLargePack, buildSmallPack } from "./decks";
import {
  GS_PLAYING,
  GATEWAY_START_COORD,
  PARTY_BUDGET,
  type GameState,
  type PartyMember,
  type PlacedArea,
} from "./state";

/** True if `picks` is a legal starting party: selectable ids, total cost <= 6, within stock. */
export function validatePicks(picks: readonly number[]): boolean {
  if (picks.length === 0) return false;
  let total = 0;
  const counts = new Map<number, number>();
  for (const id of picks) {
    const c = CREATURES[id];
    if (!c || c.cost === null) return false; // not a selectable starter
    total += c.cost;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (total > PARTY_BUDGET) return false;
  for (const [id, n] of counts) {
    if (n > (STARTING_STOCK[id] ?? 0)) return false;
  }
  return true;
}

/** Create a fresh solitaire game: validate party, shuffle both decks, place the Gateway. */
export function newGame(seed: number, picks: readonly number[]): GameState {
  if (!validatePicks(picks)) throw new Error("Invalid party selection");

  const large = buildLargePack(seed);
  const small = buildSmallPack(large.seed);

  const gateway: PlacedArea = {
    card: AREA_CARDS[GATEWAY_INDEX]!, // 175
    coord: GATEWAY_START_COORD,
    faceUp: true,
    visited: false,
    contents: [],
    flags: 0,
    indiffCount: 0,
  };

  const party: PartyMember[] = picks.map((creatureId) => ({
    creatureId,
    status: 0,
    dragonKills: 0,
    treasure: [],
  }));

  return {
    gs: GS_PLAYING,
    turn: 1,
    score: 0,
    curses: 0,
    sorcererKilled: false,
    areas: [gateway],
    partyArea: 0,
    level: 1,
    prev: 0,
    prev2: 0,
    party,
    largePack: large.pack,
    largeIdx: 0,
    smallPack: small.pack,
    smallIdx: 0,
    strangers: [],
    treasures: [],
    hazards: [],
    seed: small.seed,
  };
}
```

- [ ] **Step 6: Run to confirm pass + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/state.ts packages/engine/src/coords.ts packages/engine/src/setup.ts packages/engine/src/setup.test.ts
git commit -m "feat(engine): GameState model + newGame with party selection (spec §3)"
```

---

## Task 6: Map movement — `tryMove`

**Files:**
- Create: `packages/engine/src/map.ts`, `packages/engine/src/testkit.ts`
- Test: `packages/engine/src/map.test.ts`

- [ ] **Step 1: Create the test-only state factory `packages/engine/src/testkit.ts`** (NOT exported from the barrel)

```ts
import type { GameState, PlacedArea } from "./state";
import { GATEWAY_START_COORD } from "./state";

/** Build a minimal GameState for deterministic tests. Override any field. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const gateway: PlacedArea = {
    card: 175,
    coord: GATEWAY_START_COORD,
    faceUp: true,
    visited: false,
    contents: [],
    flags: 0,
    indiffCount: 0,
  };
  return {
    gs: 0,
    turn: 1,
    score: 0,
    curses: 0,
    sorcererKilled: false,
    areas: [gateway],
    partyArea: 0,
    level: 1,
    prev: 0,
    prev2: 0,
    party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }],
    largePack: [],
    largeIdx: 0,
    smallPack: [],
    smallIdx: 0,
    strangers: [],
    treasures: [],
    hazards: [],
    seed: 1,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test `packages/engine/src/map.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { DIR_N, DIR_S, DIR_DOWN, packCoord } from "./coords";
import { makeState } from "./testkit";

// Gateway (175) has N,E,S,W exits and a stair-up. It starts at packCoord(1,50,50)=15050.

describe("tryMove (spec §6)", () => {
  it("returns false (no move, no dead-end) when the current card lacks that exit", () => {
    // Card value 3 = NE only. There is no South exit.
    const s = makeState({ areas: [{ card: 3, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }] });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(false);
  });

  it("draws and places a matching card face-up, then moves onto it", () => {
    // Move South from the Gateway; the drawn card (31 = NSEWC) has a North exit -> connects.
    const s = makeState({ largePack: [31], largeIdx: 0 });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    expect(r.state.areas).toHaveLength(2);
    expect(r.state.areas[1]).toMatchObject({ card: 31, coord: packCoord(1, 50, 51), faceUp: true });
    expect(r.state.partyArea).toBe(1);
    expect(r.state.largeIdx).toBe(1);
    expect(r.state.prev).toBe(0); // came from the Gateway
  });

  it("places a non-matching card face-down, prunes the exit, and reports a dead-end", () => {
    // Drawn card 12 = SW (no North exit) -> dead-end when moving South.
    const s = makeState({ largePack: [12], largeIdx: 0 });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(true);
    expect(r.state.areas[1]).toMatchObject({ card: 12, faceUp: false });
    // The Gateway's South exit bit (4) is now pruned.
    expect(decodeArea(r.state.areas[0]!.card).s).toBe(false);
    expect(r.state.partyArea).toBe(0); // party did not move
  });

  it("moves into an already-placed adjacent area without drawing", () => {
    // Two areas: Gateway at 15050, and a NSEWC chamber at 15051 (north exit matches).
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
        { card: 31, coord: packCoord(1, 50, 51), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      largePack: [],
    });
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(true);
    expect(r.state.partyArea).toBe(1);
    expect(r.state.largeIdx).toBe(0); // nothing drawn
  });

  it("descending creates the area below at the same x,y with a mirrored stair-up", () => {
    // Current card 71 = NESD (has a stair-down). Drawn card 7 = NES (no stairs).
    const s = makeState({
      areas: [{ card: 71, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [7],
      largeIdx: 0,
    });
    const r = tryMove(s, DIR_DOWN);
    expect(r.moved).toBe(true);
    expect(r.state.level).toBe(2);
    expect(r.state.areas[1]!.coord).toBe(packCoord(2, 50, 50));
    expect(decodeArea(r.state.areas[1]!.card).stairUp).toBe(true); // mirrored so you can climb back
  });

  it("suppresses a stair-up on a freshly drawn level-1 card", () => {
    // Card 39 = NESU: it has a South door (so it connects when we move North) AND a
    // stair-up (which must be suppressed because the destination is on level 1).
    const s = makeState({ largePack: [39], largeIdx: 0 });
    const r = tryMove(s, DIR_N); // target is level 1
    expect(r.moved).toBe(true);
    expect(decodeArea(r.state.areas[1]!.card).stairUp).toBe(false);
  });

  it("returns false when the large pack is exhausted", () => {
    const s = makeState({ largePack: [31], largeIdx: 1 }); // already past the end
    const r = tryMove(s, DIR_S);
    expect(r.moved).toBe(false);
    expect(r.deadEnd).toBe(false);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./map` not found.

- [ ] **Step 4: Implement `packages/engine/src/map.ts`**

```ts
import { decodeArea, type DecodedArea } from "./decode";
import {
  DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN,
  targetCoord, unpackCoord,
} from "./coords";
import type { GameState, PlacedArea } from "./state";

export interface MoveResult {
  state: GameState;
  moved: boolean;
  deadEnd: boolean;
}

const STAIR_UP_BIT = 32;

function hasExit(d: DecodedArea, dir: number): boolean {
  switch (dir) {
    case DIR_N: return d.n;
    case DIR_E: return d.e;
    case DIR_S: return d.s;
    case DIR_W: return d.w;
    case DIR_UP: return d.stairUp;
    case DIR_DOWN: return d.stairDown;
    default: return false;
  }
}

/** Does the destination card have the doorway facing back toward us? (lateral moves only) */
function hasReverseDoor(d: DecodedArea, dir: number): boolean {
  switch (dir) {
    case DIR_N: return d.s;
    case DIR_E: return d.w;
    case DIR_S: return d.n;
    case DIR_W: return d.e;
    default: return false;
  }
}

function pruneExit(card: number, dir: number): number {
  switch (dir) {
    case DIR_N: return card & ~1;
    case DIR_E: return card & ~2;
    case DIR_S: return card & ~4;
    case DIR_W: return card & ~8;
    default: return card;
  }
}

/**
 * Attempt to move the party one step in `dir` (spec §6.1). Pure: returns a new state.
 * - Existing destination: stairs always connect; lateral moves need a matching reverse doorway.
 * - No destination: draw the next large-pack card; place face-up (move) if it connects,
 *   else face-down (dead-end) and prune the exit on the current card.
 */
export function tryMove(state: GameState, dir: number): MoveResult {
  const current0 = state.areas[state.partyArea]!;
  const dec = decodeArea(current0.card);
  if (!hasExit(dec, dir)) return { state, moved: false, deadEnd: false };

  const next = structuredClone(state);
  const current = next.areas[next.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);
  const targetLevel = unpackCoord(target).level;

  const foundIdx = next.areas.findIndex((a) => a.coord === target);
  if (foundIdx >= 0) {
    const dest = next.areas[foundIdx]!;
    const connects = dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(dest.card), dir);
    if (connects) {
      dest.faceUp = true;
      next.prev2 = next.prev;
      next.prev = next.partyArea;
      next.partyArea = foundIdx;
      next.level = targetLevel;
      return { state: next, moved: true, deadEnd: false };
    }
    current.card = pruneExit(current.card, dir);
    return { state: next, moved: false, deadEnd: true };
  }

  // No existing area — draw a card.
  if (next.largeIdx >= next.largePack.length) return { state, moved: false, deadEnd: false };
  let drawn = next.largePack[next.largeIdx]!;
  next.largeIdx += 1;
  if (targetLevel === 1) drawn = drawn & ~STAIR_UP_BIT; // only the Gateway exits level 1
  const connects = dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(drawn), dir);

  if (connects) {
    if (dir === DIR_DOWN) drawn = drawn | STAIR_UP_BIT; // mirror a stair-up so you can climb back
    const placed: PlacedArea = { card: drawn, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 };
    next.areas.push(placed);
    next.prev2 = next.prev;
    next.prev = next.partyArea;
    next.partyArea = next.areas.length - 1;
    next.level = targetLevel;
    return { state: next, moved: true, deadEnd: false };
  }

  const placed: PlacedArea = { card: drawn, coord: target, faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 };
  next.areas.push(placed);
  current.card = pruneExit(current.card, dir);
  return { state: next, moved: false, deadEnd: true };
}
```

- [ ] **Step 5: Run to confirm pass + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS — all 7 map tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/map.ts packages/engine/src/testkit.ts packages/engine/src/map.test.ts
git commit -m "feat(engine): tryMove — draw/place, dead-end pruning, levels (spec §6)"
```

---

## Task 7: Turn-dispatch skeleton (`reduce`)

**Files:**
- Create: `packages/engine/src/actions.ts`, `packages/engine/src/reduce.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/reduce.test.ts`

- [ ] **Step 1: Create `packages/engine/src/actions.ts`**

```ts
// Player decisions. Multiplayer will later wrap these with a playerId.
export type GameAction =
  | { type: "move"; dir: number }
  | { type: "quit" }
  | { type: "exitCave" };

// What happened — the reducer is the only producer; the UI never infers game facts.
// Chamber draws / encounters / fights / hazards are emitted in Milestone C.
export type GameEvent =
  | { type: "moved"; area: number; level: number }
  | { type: "deadEnd"; dir: number }
  | { type: "blocked" } // no exit on the card, or the large pack is exhausted
  | { type: "enteredChamber"; area: number } // skeleton: the actual draw happens in Milestone C
  | { type: "enteredSpecial"; special: number } // Deep Pool / Viper Pit (Milestone C)
  | { type: "gameOver"; gs: number };
```

- [ ] **Step 2: Write the failing test `packages/engine/src/reduce.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { GS_QUIT, GS_ESCAPED } from "./state";
import { DIR_S, packCoord } from "./coords";
import { makeState } from "./testkit";

describe("reduce (spec §4 turn dispatch)", () => {
  it("quit ends the game and emits gameOver(QUIT)", () => {
    const { state, events } = reduce(makeState(), { type: "quit" });
    expect(state.gs).toBe(GS_QUIT);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_QUIT });
  });

  it("exitCave escapes when on level 1 with a stair-up (the Gateway)", () => {
    const { state, events } = reduce(makeState(), { type: "exitCave" });
    expect(state.gs).toBe(GS_ESCAPED);
    expect(events).toContainEqual({ type: "gameOver", gs: GS_ESCAPED });
  });

  it("exitCave is blocked when the current card has no stair-up", () => {
    // Card 31 = NSEWC, no stair-up.
    const s = makeState({ areas: [{ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "exitCave" });
    expect(state.gs).toBe(0);
    expect(events).toContainEqual({ type: "blocked" });
  });

  it("a successful move increments the turn and emits moved + enteredChamber", () => {
    // Draw 31 (NSEWC, a chamber) moving South from the Gateway.
    const s = makeState({ largePack: [31], largeIdx: 0, turn: 1 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.turn).toBe(2);
    expect(state.partyArea).toBe(1);
    expect(events).toContainEqual({ type: "moved", area: 1, level: 1 });
    expect(events).toContainEqual({ type: "enteredChamber", area: 1 });
  });

  it("a dead-end move does not advance the turn and emits deadEnd", () => {
    // Draw 12 (SW, no north door) moving South -> dead-end.
    const s = makeState({ largePack: [12], largeIdx: 0, turn: 1 });
    const { state, events } = reduce(s, { type: "move", dir: DIR_S });
    expect(state.turn).toBe(1);
    expect(events).toContainEqual({ type: "deadEnd", dir: DIR_S });
  });

  it("ignores actions once the game is over", () => {
    const over = makeState({ gs: GS_QUIT });
    const { state, events } = reduce(over, { type: "move", dir: DIR_S });
    expect(state).toBe(over);
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @sorcerers-cave/engine test`
Expected: FAIL — `./reduce` not found.

- [ ] **Step 4: Implement `packages/engine/src/reduce.ts`**

```ts
import { GS_PLAYING, GS_QUIT, GS_ESCAPED, type GameState } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT } from "./data/areaCards";
import type { GameAction, GameEvent } from "./actions";

/** Resolve the area the party just entered. Milestone B emits skeleton events only;
 *  chamber draws, special-area crossings and hazards arrive in Milestone C. */
function resolveArea(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];
  const dec = decodeArea(state.areas[state.partyArea]!.card);
  if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) {
    events.push({ type: "enteredSpecial", special: dec.special });
  } else if (dec.chamber) {
    events.push({ type: "enteredChamber", area: state.partyArea });
  }
  return { state, events };
}

/** Top-level turn dispatcher (spec §4). Pure: returns a new state and the events it produced. */
export function reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (state.level === 1 && dec.stairUp) {
        return { state: { ...state, gs: GS_ESCAPED }, events: [{ type: "gameOver", gs: GS_ESCAPED }] };
      }
      return { state, events: [{ type: "blocked" }] };
    }

    case "move": {
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const moved = { ...res.state, turn: res.state.turn + 1 };
      return resolveArea(moved);
    }
  }
}
```

- [ ] **Step 5: Update the barrel `packages/engine/src/index.ts`**

```ts
export * from "./rng";
export * from "./decode";
export * from "./coords";
export * from "./state";
export * from "./setup";
export * from "./map";
export * from "./actions";
export * from "./reduce";
export * from "./decks";
export * from "./data/creatures";
export * from "./data/treasures";
export * from "./data/hazards";
export * from "./data/areaCards";
export * from "./data/smallPack";
```

- [ ] **Step 6: Run the full engine suite + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine test && pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS — every engine test green, no type errors.
Note: `testkit.ts` is intentionally absent from the barrel (test-only).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/reduce.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): turn-dispatch reducer skeleton with events (spec §4)"
```

---

## Definition of Done (Milestone B)

- [ ] `pnpm --filter @sorcerers-cave/engine test` green; `typecheck` clean.
- [ ] `pnpm test` (turbo, all packages) still green.
- [ ] The engine can: build & shuffle both decks, decode any card, create a validated game with `newGame`, move the party around a procedurally-drawn map (with dead-ends, levels, and the level-1 ceiling), and dispatch `move`/`quit`/`exitCave` actions emitting events.
- [ ] No chamber draws, encounters, fights, or hazards yet (Milestone C) — `enteredChamber`/`enteredSpecial` are boundary markers.
- [ ] All new logic is pure and deterministic (seeded); `structuredClone` keeps transitions immutable.

---

## Self-Review

**Coverage vs. parent-plan Milestone B (B1–B5):**
- B1 static data tables + constant tests → Task 2 (+ Task 3 small pack). ✓
- B2 RNG with golden tests → done in Milestone A (`nextSeed`/`rollDie`); shuffle/`randBelow` added in Task 1. ✓
- B3 state model + newGame + party selection → Task 5. ✓
- B4 map/movement (decode, try_move, dead-end pruning, levels) → Tasks 4 + 6. ✓ Trap relocation is deferred with the rest of hazard handling to Milestone C and is called out in the reduce skeleton. ✓ (noted, not silently dropped)
- B5 turn loop / reduce dispatch skeleton emitting events → Task 7. ✓

**Placeholder scan:** none. Deferred items (chamber draws, hazards/trap-fall, special-area crossings, encounters/fights) are explicitly assigned to Milestone C and surfaced as boundary events, not vague TODOs.

**Type consistency:** `GameState` field names are identical across `state.ts`, `setup.ts`, `map.ts`, `reduce.ts`, and `testkit.ts`. `tryMove` returns `{ state, moved, deadEnd }` and `reduce` consumes exactly those. Direction constants `DIR_*` are defined once in `coords.ts` and imported everywhere. `SPECIAL_*` are defined once in `data/areaCards.ts`. `GameEvent` variants emitted by `reduce`/`resolveArea` (`moved`, `deadEnd`, `blocked`, `enteredChamber`, `enteredSpecial`, `gameOver`) all exist in the `actions.ts` union; no event is referenced that isn't declared, and no declared event goes unemitted.

**Determinism check:** every randomness source (`shuffle`, `randBelow`) threads `seed` explicitly and returns the advanced seed; `newGame` chains `large.seed → small.seed` and stores the final seed. No `Math.random`/`Date.now` anywhere in the engine.

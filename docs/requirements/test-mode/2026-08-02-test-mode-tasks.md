# Test Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tester script the next area drawn (a chosen special, from a chosen direction), a chamber's contents, or a forced friendly/indifferent/hostile reaction, gated by a magic-string URL parameter, then play the result out through the real solo game UI.

**Architecture:** Three new `GameAction`/`GameEvent` pairs (`testPlaceArea`, `testSetChamber`, `testForceReaction`, plus a `testClearOverrides` reset) arm single-slot override fields on `GameState`, consumed by the existing `tryMove`/`enterChamber`/`test`-reaction code paths the moment a matching draw/roll would otherwise happen — so a scripted scenario still runs through the same `reduce()` path, replay, and event log as any real game. A `testMode: true` flag (set once, at `newGame`, never toggled) gates all four actions with a `blocked` event on every other game — defense in depth against a hand-crafted Convex call. Access to *creating* a test game is gated separately, server-side in Convex, by comparing a client-supplied secret against a Convex environment variable that is never bundled to the client.

**Tech Stack:** TypeScript, the existing `packages/engine` pure-reducer package, Convex (mutations + `convex-test` for tests), React (`apps/web/src`), Vitest, Testing Library.

## Global Constraints

- Solo only this phase — no multiplayer changes. (Multiplayer already ignores these actions for free: `MpAction` includes all of `GameAction`, and every composed multiplayer `GameState` has `testMode` unset, so `reduce()`'s own gate rejects them automatically — verified in Task 2, no multiplayer code touched.)
- Every `packages/engine/src` change in this plan must be followed, in the SAME task's commit, by the matching `docs/specs/engine-spec.md` update (this repo's standing `CLAUDE.md` rule) — done as Task 6 once the engine behavior is final, covering Tasks 1–5 together.
- Test-mode games are always excluded from the `highScores` leaderboard (Task 9).
- The magic-string secret (`TEST_MODE_SECRET`) must never be read from an `import.meta.env.VITE_*` variable — those are bundled into the public client build. It is read only server-side, in a Convex mutation, from `process.env.TEST_MODE_SECRET`.
- Follow this repo's TDD convention throughout: write the failing test, watch it fail for the right reason, write the minimal implementation, watch it pass, commit.

---

## Task 1: Engine data model — `testMode`, canonical special cards, armed-override fields

**Files:**
- Modify: `packages/engine/src/data/areaCards.ts`
- Modify: `packages/engine/src/state.ts`
- Modify: `packages/engine/src/setup.ts:39-100` (`newGame`)
- Test: `packages/engine/src/test-mode.test.ts` (new)

**Interfaces:**
- Produces: `SPECIAL_CANONICAL_CARD: Readonly<Record<number, number>>` (exported from `data/areaCards.ts`, re-exported via `index.ts`'s existing `export * from "./data/areaCards"`) — maps a `SPECIAL_*` id to the one deck card value that special decodes to.
- Produces: `GameState.testMode?: true`, `GameState.testNextArea?: { dir: number; special: number }`, `GameState.testNextChamber?: { strangers: number[]; treasures: number[]; hazards: number[] }`, `GameState.testNextReaction?: "friendly" | "indifferent" | "hostile"`.
- Produces: `newGame(seed, picks, variants?, testMode?: boolean): GameState` — new 4th optional parameter, backward compatible with every existing 2- and 3-argument call site.

- [ ] **Step 1: Write the failing test — canonical card map is correct and complete**

Create `packages/engine/src/test-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  decodeArea, newGame,
  SPECIAL_CANONICAL_CARD, SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
} from "./index";

describe("SPECIAL_CANONICAL_CARD", () => {
  it("has exactly one entry per real special (2-11), each decoding back to that special", () => {
    const ids = [
      SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
      SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
    ];
    expect(Object.keys(SPECIAL_CANONICAL_CARD).map(Number).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    for (const id of ids) {
      expect(decodeArea(SPECIAL_CANONICAL_CARD[id]!).special).toBe(id);
    }
  });

  it("every canonical card has all four exits, so a test placement always connects on its own merits", () => {
    for (const card of Object.values(SPECIAL_CANONICAL_CARD)) {
      const d = decodeArea(card);
      expect(d.n && d.e && d.s && d.w).toBe(true);
    }
  });
});

describe("newGame testMode flag", () => {
  it("is absent by default (byte-identical to today)", () => {
    const s = newGame(1, [0]);
    expect(s.testMode).toBeUndefined();
    expect("testMode" in s).toBe(false);
  });

  it("is set to true (never false) when requested", () => {
    const s = newGame(1, [0], undefined, true);
    expect(s.testMode).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: FAIL — `SPECIAL_CANONICAL_CARD` is not exported, `newGame` only accepts 3 arguments.

- [ ] **Step 3: Add `SPECIAL_CANONICAL_CARD` to `data/areaCards.ts`**

Append to `packages/engine/src/data/areaCards.ts` (after the `EXT_AREA_CARDS` array):

```ts
// Test Mode (§Test Mode): the one deck card value each real special decodes to — verified against
// AREA_CARDS/EXT_AREA_CARDS by test-mode.test.ts. Every entry happens to be a full 4-exit chamber
// card already, so a test-mode placement (map.ts) needs no orientation trick to connect.
export const SPECIAL_CANONICAL_CARD: Readonly<Record<number, number>> = {
  [SPECIAL_DEEP_POOL]: 287,
  [SPECIAL_VIPER_PIT]: 415,
  [SPECIAL_TOMB]: 543,
  [SPECIAL_GREAT_HALL]: 671,
  [SPECIAL_CHASM]: 799,
  [SPECIAL_BELL_ROPE]: 927,
  [SPECIAL_LAIR]: 1055,
  [SPECIAL_WHIRLPOOL]: 1183,
  [SPECIAL_GALLERY]: 1311,
  [SPECIAL_WELL]: 1439,
};
```

- [ ] **Step 4: Add the four `GameState` fields**

In `packages/engine/src/state.ts`, add after the existing `thiefPickup?: boolean;` field (just before the closing `}` of `GameState`):

```ts
  // Test Mode (§Test Mode): set only by `newGame(..., testMode: true)`; never toggled mid-game.
  // Gates the four test-* actions (reduce.ts) — every other game rejects them with `blocked`.
  testMode?: true;
  // Armed by `testPlaceArea`; consumed by the next fresh-draw `move` in this exact direction
  // (map.ts's `tryMove`), which always connects regardless of the special's printed orientation.
  testNextArea?: { dir: number; special: number };
  // Armed by `testSetChamber`; consumed by the next chamber freshly entered by any means (an
  // ordinary move, the Magic Carpet, a trap fall, a Chasm descent — chamber.ts's `enterChamber`).
  // Replaces the normal smallPack draw; smallIdx is left untouched.
  testNextChamber?: { strangers: number[]; treasures: number[]; hazards: number[] };
  // Armed by `testForceReaction`; consumed by the next `test` (reaction) action in place of
  // reactionRoll's die.
  testNextReaction?: "friendly" | "indifferent" | "hostile";
```

- [ ] **Step 5: Extend `newGame`'s signature**

In `packages/engine/src/setup.ts`, change the function signature and return:

```ts
export function newGame(
  seed: number,
  picks: readonly number[],
  variants?: { extensionKit?: boolean },
  testMode?: boolean,
): GameState {
```

And change the final `return { ... }` block's last line from:

```ts
    ...(variants ? { variants } : {}),
  };
```

to:

```ts
    ...(variants ? { variants } : {}),
    ...(testMode ? { testMode: true as const } : {}),
  };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the full engine suite to confirm no regressions**

Run: `cd packages/engine && npx vitest run`
Expected: PASS, same count as before + 4

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/data/areaCards.ts packages/engine/src/state.ts packages/engine/src/setup.ts packages/engine/src/test-mode.test.ts
git commit -m "feat(engine): Test Mode data model — testMode flag, canonical special cards, armed overrides"
```

---

## Task 2: Engine actions — `testPlaceArea`, `testSetChamber`, `testForceReaction`, `testClearOverrides`

**Files:**
- Modify: `packages/engine/src/actions.ts`
- Modify: `packages/engine/src/reduce.ts` (new cases, inserted after the existing `case "enterCrypt":` block, i.e. immediately before the switch's closing `}`)
- Test: `packages/engine/src/test-mode.test.ts`

**Interfaces:**
- Consumes: `GameState.testMode`/`testNextArea`/`testNextChamber`/`testNextReaction` (Task 1).
- Produces: `GameAction` variants `{ type: "testPlaceArea"; dir: number; special: number }`, `{ type: "testSetChamber"; strangers: number[]; treasures: number[]; hazards: number[] }`, `{ type: "testForceReaction"; outcome: "friendly" | "indifferent" | "hostile" }`, `{ type: "testClearOverrides" }`.
- Produces: `GameEvent` variants `{ type: "testAreaQueued"; dir: number; special: number }`, `{ type: "testChamberQueued"; strangers: number[]; treasures: number[]; hazards: number[] }`, `{ type: "testReactionQueued"; outcome: "friendly" | "indifferent" | "hostile" }`, `{ type: "testOverridesCleared" }` — all four consumed by Task 7 (`eventNotices.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/test-mode.test.ts`:

```ts
import { reduce } from "./index";

describe("test-* action gating (SC-Test-1)", () => {
  it("rejects all four test-* actions with `blocked` on a non-test game", () => {
    const s = newGame(1, [0]);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testSetChamber", strangers: [10], treasures: [], hazards: [] }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testForceReaction", outcome: "friendly" }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testClearOverrides" }).events).toEqual([{ type: "blocked" }]);
  });

  it("testPlaceArea arms testNextArea and announces testAreaQueued on a test game", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL });
    expect(state.testNextArea).toEqual({ dir: 1, special: SPECIAL_WHIRLPOOL });
    expect(events).toEqual([{ type: "testAreaQueued", dir: 1, special: SPECIAL_WHIRLPOOL }]);
  });

  it("rejects an out-of-range special (SPECIAL_NONE/SPECIAL_GATEWAY) even on a test game", () => {
    const s = newGame(1, [0], undefined, true);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: 0 }).events).toEqual([{ type: "blocked" }]);
    expect(reduce(s, { type: "testPlaceArea", dir: 1, special: 1 }).events).toEqual([{ type: "blocked" }]);
  });

  it("testSetChamber arms testNextChamber and announces testChamberQueued", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testSetChamber", strangers: [10], treasures: [3], hazards: [] });
    expect(state.testNextChamber).toEqual({ strangers: [10], treasures: [3], hazards: [] });
    expect(events).toEqual([{ type: "testChamberQueued", strangers: [10], treasures: [3], hazards: [] }]);
  });

  it("testForceReaction arms testNextReaction and announces testReactionQueued", () => {
    const s = newGame(1, [0], undefined, true);
    const { state, events } = reduce(s, { type: "testForceReaction", outcome: "hostile" });
    expect(state.testNextReaction).toBe("hostile");
    expect(events).toEqual([{ type: "testReactionQueued", outcome: "hostile" }]);
  });

  it("testClearOverrides drops all three armed overrides at once", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).state;
    s = reduce(s, { type: "testSetChamber", strangers: [10], treasures: [], hazards: [] }).state;
    s = reduce(s, { type: "testForceReaction", outcome: "hostile" }).state;
    const { state, events } = reduce(s, { type: "testClearOverrides" });
    expect(state.testNextArea).toBeUndefined();
    expect(state.testNextChamber).toBeUndefined();
    expect(state.testNextReaction).toBeUndefined();
    expect(events).toEqual([{ type: "testOverridesCleared" }]);
  });

  it("queuing a second testPlaceArea replaces the first (single slot, not a queue)", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: 1, special: SPECIAL_WHIRLPOOL }).state;
    const { state } = reduce(s, { type: "testPlaceArea", dir: 2, special: SPECIAL_CHASM });
    expect(state.testNextArea).toEqual({ dir: 2, special: SPECIAL_CHASM });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: FAIL to compile — `GameAction`/`GameEvent` have no `testPlaceArea`/etc. members yet.

- [ ] **Step 3: Add the four `GameAction` variants**

In `packages/engine/src/actions.ts`, add to the end of the `GameAction` union (change the trailing `| { type: "jumpToIsland" };` to end with `;` after the new members):

```ts
  | { type: "jumpToIsland" }
  // Test Mode (§Test Mode): arm/clear the next draw or reaction override. Rejected with `blocked`
  // on any game whose `state.testMode` isn't true (reduce.ts) — never legal in a real game.
  | { type: "testPlaceArea"; dir: number; special: number }
  | { type: "testSetChamber"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "testForceReaction"; outcome: "friendly" | "indifferent" | "hostile" }
  | { type: "testClearOverrides" };
```

- [ ] **Step 4: Add the four `GameEvent` variants**

In `packages/engine/src/actions.ts`, add to the end of the `GameEvent` union (change the trailing `| { type: "islandJump"; special: number };` to end with `;` after the new members):

```ts
  | { type: "islandJump"; special: number }
  // Test Mode (§Test Mode): acknowledges one of the four test-* actions above. Purely
  // informational — the TestControlsPanel (apps/web) already shows the armed override directly.
  | { type: "testAreaQueued"; dir: number; special: number }
  | { type: "testChamberQueued"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "testReactionQueued"; outcome: "friendly" | "indifferent" | "hostile" }
  | { type: "testOverridesCleared" };
```

- [ ] **Step 5: Add the four `reduce.ts` cases**

In `packages/engine/src/reduce.ts`, insert immediately after the `case "enterCrypt":` block's closing `}` (i.e. as the last cases before the switch's own closing `}`):

```ts
    case "testPlaceArea": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      if (action.special < SPECIAL_DEEP_POOL || action.special > SPECIAL_WELL) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextArea = { dir: action.dir, special: action.special };
      return { state: next, events: [{ type: "testAreaQueued", dir: action.dir, special: action.special }] };
    }

    case "testSetChamber": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextChamber = { strangers: [...action.strangers], treasures: [...action.treasures], hazards: [...action.hazards] };
      return { state: next, events: [{ type: "testChamberQueued", strangers: [...action.strangers], treasures: [...action.treasures], hazards: [...action.hazards] }] };
    }

    case "testForceReaction": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.testNextReaction = action.outcome;
      return { state: next, events: [{ type: "testReactionQueued", outcome: action.outcome }] };
    }

    case "testClearOverrides": {
      if (!state.testMode) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      delete next.testNextArea;
      delete next.testNextChamber;
      delete next.testNextReaction;
      return { state: next, events: [{ type: "testOverridesCleared" }] };
    }
```

`SPECIAL_DEEP_POOL` and `SPECIAL_WELL` are already imported at the top of `reduce.ts` (line 4) — no new import needed for this step.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: PASS (11 tests total)

- [ ] **Step 7: Run the full engine suite**

Run: `cd packages/engine && npx vitest run`
Expected: PASS. If `multi.ts`/`multi-zombies.ts` fail to compile, re-read their switches over `action.type` — both are non-exhaustive fallthrough gates (verified during planning), so no change should be needed there; a compile error would mean that assumption needs re-checking.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/test-mode.test.ts
git commit -m "feat(engine): test-* actions — arm/clear the next area, chamber, and reaction overrides"
```

---

## Task 3: Engine — `testNextArea` consumed by `tryMove`, always connects

**Files:**
- Modify: `packages/engine/src/map.ts`
- Test: `packages/engine/src/test-mode.test.ts`

**Interfaces:**
- Consumes: `SPECIAL_CANONICAL_CARD` (Task 1), `GameState.testNextArea` (Task 1), `GameAction` `testPlaceArea` (Task 2, to arm the override in tests via `reduce`).
- Produces: `tryMove` now honors an armed `testNextArea` matching the move's direction on a fresh (undrawn) tile — no new exported symbols.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/test-mode.test.ts`:

```ts
import { tryMove } from "./index";
import { DIR_N, DIR_E } from "./index";

describe("testNextArea consumed by tryMove (SC-Test-2)", () => {
  it("places the canonical special card, connects regardless of orientation, and clears the override", () => {
    let s = newGame(1, [0], undefined, true); // Gateway has all 4 exits — every direction is open
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true);
    expect(r.deadEnd).toBe(false);
    const placed = r.state.areas[r.state.partyArea]!;
    expect(placed.card).toBe(SPECIAL_CANONICAL_CARD[SPECIAL_WHIRLPOOL]);
    expect(placed.faceUp).toBe(true);
    expect(r.state.testNextArea).toBeUndefined();
  });

  it("leaves the override armed when the party moves a DIFFERENT direction first", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const r = tryMove(s, DIR_E); // an ordinary draw — override is for North, not East
    expect(r.state.testNextArea).toEqual({ dir: DIR_N, special: SPECIAL_WHIRLPOOL });
    expect(decodeArea(r.state.areas[r.state.partyArea]!.card).special).not.toBe(SPECIAL_WHIRLPOOL);
  });

  it("does not consume the large pack (largeIdx unchanged) when placing from the override", () => {
    let s = newGame(1, [0], undefined, true);
    s = reduce(s, { type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL }).state;
    const before = s.largeIdx;
    const r = tryMove(s, DIR_N);
    expect(r.state.largeIdx).toBe(before);
  });

  it("ignores an armed testNextArea on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = newGame(1, [0]); // testMode absent — testNextArea can never be armed this way through
    s.testNextArea = { dir: DIR_N, special: SPECIAL_WHIRLPOOL }; // real play; set directly to prove map.ts doesn't just trust its presence
    const r = tryMove(s, DIR_N);
    expect(r.moved).toBe(true); // an ordinary draw still happens
    expect(decodeArea(r.state.areas[r.state.partyArea]!.card).special).not.toBe(SPECIAL_WHIRLPOOL);
    expect(r.state.testNextArea).toEqual({ dir: DIR_N, special: SPECIAL_WHIRLPOOL }); // left untouched, not silently consumed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: FAIL — the first three new tests fail (the override is armed but ignored by `tryMove`; the Whirlpool card is never placed). The fourth (non-test-game) test currently PASSES trivially since nothing honors `testNextArea` yet — watch it carefully in Step 4, since the naive fix (checking `testNextArea` alone, with no `testMode` guard) would make it start failing instead.

- [ ] **Step 3: Implement the override in `tryMove`**

In `packages/engine/src/map.ts`, add the import:

```ts
import { AF_DESTROYED, type GameState, type PlacedArea } from "./state";
import { SPECIAL_CANONICAL_CARD } from "./data/areaCards";
```

Replace the "No existing area — draw a card." block:

```ts
  // No existing area — draw a card.
  if (next.largeIdx >= next.largePack.length) return { state, moved: false, deadEnd: false };
  let drawn = next.largePack[next.largeIdx]!;
  next.largeIdx += 1;
```

with:

```ts
  // No existing area — draw a card. Test Mode (§Test Mode): an armed testNextArea for THIS exact
  // direction takes over the draw entirely — including bypassing the empty-pack early return, since
  // nothing is actually drawn from largePack. Consumed here, once, whether or not the placement
  // below ends up connecting (it always will — see the `connects` override two lines down). Checks
  // `testMode` explicitly rather than trusting testNextArea's mere presence — defense in depth
  // against a hand-crafted state, matching this codebase's existing style elsewhere (e.g. the
  // Precise Locations adjacency gate, enforced independently in both selectors.ts and reduce.ts).
  const override = next.testMode && next.testNextArea?.dir === dir ? next.testNextArea : undefined;
  let drawn: number;
  if (override) {
    drawn = SPECIAL_CANONICAL_CARD[override.special]!;
    delete next.testNextArea;
  } else {
    if (next.largeIdx >= next.largePack.length) return { state, moved: false, deadEnd: false };
    drawn = next.largePack[next.largeIdx]!;
    next.largeIdx += 1;
  }
```

Then change the `connects` line just below:

```ts
  const connects = dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(drawn), dir);
```

to:

```ts
  // Test Mode (§Test Mode): a scripted placement always connects, regardless of the special's
  // printed orientation — the whole point is guaranteeing the tester reaches the scenario asked
  // for. (In practice every SPECIAL_CANONICAL_CARD entry has all four exits anyway — see Task 1's
  // own test — so this only matters if that ever changes.)
  const connects = !!override || dir === DIR_UP || dir === DIR_DOWN || hasReverseDoor(decodeArea(drawn), dir);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: PASS (15 tests total)

- [ ] **Step 5: Run the full engine suite**

Run: `cd packages/engine && npx vitest run`
Expected: PASS, no regressions (this branch is unreachable from any existing test — `testNextArea` is never set outside test-mode games).

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/map.ts packages/engine/src/test-mode.test.ts
git commit -m "feat(engine): tryMove honors an armed testNextArea, always connecting"
```

---

## Task 4: Engine — `testNextChamber` consumed by `enterChamber`

**Files:**
- Modify: `packages/engine/src/chamber.ts:172-181`
- Test: `packages/engine/src/test-mode.test.ts`

**Interfaces:**
- Consumes: `GameState.testNextChamber` (Task 1), the existing private `classify(state, code, events)` helper (already in `chamber.ts`, unexported — this task calls it from within the same file, no new export needed).
- Produces: `enterChamber` now honors an armed `testNextChamber` on any FRESH (`!area.visited`) entry — no new exported symbols.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/test-mode.test.ts`:

```ts
import { enterChamber, SPECIAL_GALLERY } from "./index";

describe("testNextChamber consumed by enterChamber (SC-Test-3)", () => {
  it("replaces the normal draw with exactly the named strangers/treasures/hazards, leaving smallIdx untouched", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextChamber = { strangers: [10, 12], treasures: [3], hazards: [1] };
    const beforeSmallIdx = s.smallIdx;
    const area = s.areas[s.partyArea]!;
    area.visited = false;
    const events = enterChamber(s);
    expect(s.strangers).toEqual([10, 12]);
    expect(s.treasures).toEqual([3]);
    expect(s.hazards).toEqual([1]);
    expect(s.smallIdx).toBe(beforeSmallIdx);
    expect(s.testNextChamber).toBeUndefined();
    expect(events).toContainEqual({ type: "drewChamber", strangers: [10, 12], treasures: [3], hazards: [1] });
  });

  it("still petrifies an overridden creature drawn into a Gallery (classify() reused verbatim)", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextChamber = { strangers: [10], treasures: [], hazards: [] }; // a Dragon (not Spectre/Sorcerer-exempt)
    const area = s.areas[s.partyArea]!;
    area.card = SPECIAL_CANONICAL_CARD[SPECIAL_GALLERY]!;
    area.visited = false;
    enterChamber(s);
    expect(s.strangers).toEqual([]); // never joins strangers — arrives as a statue instead
    expect(s.statues).toEqual([10]);
  });

  it("does nothing when the area was already visited (a revisit reloads parked contents as normal)", () => {
    const s = newGame(1, [0], undefined, true);
    s.testNextChamber = { strangers: [10], treasures: [], hazards: [] };
    const area = s.areas[s.partyArea]!;
    area.visited = true; // already resolved once
    enterChamber(s);
    expect(s.strangers).toEqual([]); // the override is only for a FRESH draw — untouched here
    expect(s.testNextChamber).toEqual({ strangers: [10], treasures: [], hazards: [] }); // still armed
  });

  it("ignores an armed testNextChamber on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = newGame(1, [0]); // testMode absent — testNextChamber can never be armed this way through
    s.testNextChamber = { strangers: [10], treasures: [], hazards: [] }; // real play; set directly to prove chamber.ts doesn't just trust its presence
    const beforeSmallIdx = s.smallIdx;
    const area = s.areas[s.partyArea]!;
    area.visited = false;
    enterChamber(s);
    // Seed-independent check: the override path NEVER advances smallIdx (Task 4's own first test
    // asserts that), so an advance here proves the ordinary small-pack draw ran instead — regardless
    // of what that draw's first card actually was.
    expect(s.smallIdx).toBeGreaterThan(beforeSmallIdx);
    expect(s.testNextChamber).toEqual({ strangers: [10], treasures: [], hazards: [] }); // left untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: FAIL — the first two new tests fail (strangers/treasures/hazards stay empty; the normal, empty-small-pack-derived draw runs instead). The third (non-test-game) test currently PASSES trivially since nothing honors `testNextChamber` yet — watch it in Step 4, since the naive fix (checking `testNextChamber` alone, no `testMode` guard) would make it start failing instead.

- [ ] **Step 3: Implement the override in `enterChamber`**

In `packages/engine/src/chamber.ts`, replace:

```ts
  if (!area.visited) {
    area.visited = true;
    let draw = Math.min(state.level, 4);
    if (dec.special === SPECIAL_TOMB) draw += 1;
    if (dec.special === SPECIAL_GREAT_HALL) draw += 2;
    draw = Math.min(draw, 8);
    for (let i = 0; i < draw && state.smallIdx < state.smallPack.length; i++) {
      classify(state, state.smallPack[state.smallIdx++]!, events);
    }
  }
```

with:

```ts
  if (!area.visited) {
    area.visited = true;
    // Test Mode (§Test Mode): an armed testNextChamber replaces the normal small-pack draw outright
    // — smallIdx is untouched, so the shuffled deck stays intact for every other, non-overridden
    // chamber. Routed through the SAME classify() as a real draw, so Gallery petrification, the
    // Demon's relocate-to-`prev`, and the Crypt's park-on-draw all still apply to scripted content.
    // Checks `testMode` explicitly rather than trusting testNextChamber's mere presence — defense
    // in depth against a hand-crafted state (same reasoning as map.ts's testNextArea check).
    if (state.testMode && state.testNextChamber) {
      const { strangers, treasures, hazards } = state.testNextChamber;
      delete state.testNextChamber;
      const codes = [
        ...strangers.map((id) => 100 + id),
        ...treasures.map((id) => 200 + id),
        ...hazards.map((id) => 300 + id),
      ];
      for (const code of codes) classify(state, code, events);
    } else {
      let draw = Math.min(state.level, 4);
      if (dec.special === SPECIAL_TOMB) draw += 1;
      if (dec.special === SPECIAL_GREAT_HALL) draw += 2;
      draw = Math.min(draw, 8);
      for (let i = 0; i < draw && state.smallIdx < state.smallPack.length; i++) {
        classify(state, state.smallPack[state.smallIdx++]!, events);
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: PASS (19 tests total)

- [ ] **Step 5: Run the full engine suite**

Run: `cd packages/engine && npx vitest run`
Expected: PASS, no regressions (`testNextChamber` is always undefined outside test-mode games, so the `else` branch — today's exact code, unchanged — is all any existing test can ever reach).

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/chamber.ts packages/engine/src/test-mode.test.ts
git commit -m "feat(engine): enterChamber honors an armed testNextChamber on a fresh entry"
```

---

## Task 5: Engine — `testNextReaction` consumed by the `test` action

**Files:**
- Modify: `packages/engine/src/reaction.ts`
- Modify: `packages/engine/src/reduce.ts:947-954` (the top of `case "test":`)
- Test: `packages/engine/src/test-mode.test.ts`

**Interfaces:**
- Consumes: `GameState.testNextReaction` (Task 1), `findLeader` (already exported from `reaction.ts`).
- Produces: `forcedReactionRoll(state: GameState, outcome: Reaction): number` (new export from `reaction.ts`) — a representative d6 value for the given outcome, given the current `state.strangers`' leader.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/test-mode.test.ts`:

```ts
import { forcedReactionRoll } from "./index";

describe("testNextReaction consumed by the test action (SC-Test-4)", () => {
  const withEncounter = (): GameState => {
    const s = newGame(1, [0], undefined, true);
    s.phase = "encounter";
    s.strangers = [10]; // a Dragon — hostileMax/indiffMax give it a real 3-band split
    return s;
  };

  it("forces the exact declared outcome, does not touch state.seed, and clears the override", () => {
    const s = withEncounter();
    s.testNextReaction = "friendly";
    const before = s.seed;
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).toMatchObject({ type: "reaction", outcome: "friendly" });
    expect(state.seed).toBe(before);
    expect(state.testNextReaction).toBeUndefined();
  });

  it("forcedReactionRoll returns a value in the correct band for hostile/indifferent/friendly", () => {
    const s = withEncounter();
    const hostileRoll = forcedReactionRoll(s, "hostile");
    const indiffRoll = forcedReactionRoll(s, "indifferent");
    const friendlyRoll = forcedReactionRoll(s, "friendly");
    expect(hostileRoll).toBeGreaterThanOrEqual(1);
    expect(hostileRoll).toBeLessThanOrEqual(6);
    expect(indiffRoll).toBeGreaterThanOrEqual(1);
    expect(indiffRoll).toBeLessThanOrEqual(6);
    expect(friendlyRoll).toBeGreaterThanOrEqual(1);
    expect(friendlyRoll).toBeLessThanOrEqual(6);
  });

  it("falls back to an ordinary rolled reaction when no override is armed", () => {
    const s = withEncounter(); // testNextReaction absent
    const before = s.seed;
    const { state } = reduce(s, { type: "test" });
    expect(state.seed).not.toBe(before); // the die was genuinely rolled
  });

  it("ignores an armed testNextReaction on a non-test game (defense in depth against a hand-crafted state)", () => {
    const s = withEncounter();
    delete (s as { testMode?: true }).testMode; // real play can never reach `test` with testMode absent
    s.testNextReaction = "friendly"; // AND testNextReaction armed at once — set directly to prove reduce.ts doesn't just trust its presence
    const before = s.seed;
    const { state, events } = reduce(s, { type: "test" });
    expect(events[0]).not.toMatchObject({ outcome: "friendly" }); // the die was genuinely rolled instead
    expect(state.seed).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: FAIL to compile (`forcedReactionRoll` doesn't exist) and, once stubbed, the first test fails (the outcome comes from the real die roll, ignoring `testNextReaction`). The new non-test-game test currently PASSES trivially since nothing honors `testNextReaction` yet — watch it in Step 4, since the naive fix (checking `testNextReaction` alone, no `testMode` guard) would make it start failing instead.

- [ ] **Step 3: Add `forcedReactionRoll` to `reaction.ts`**

In `packages/engine/src/reaction.ts`, add after `reactionRoll`:

```ts
/**
 * Test Mode (§Test Mode): a representative d6 value that would have produced `outcome` for the
 * CURRENT leader — gives a forced reaction an honest-looking roll in the UI without consuming the
 * RNG. Picks the lowest value in the outcome's own band; clamped to 1-6 so an outcome that isn't
 * actually reachable for this particular leader (e.g. forcing "friendly" from an always-hostile
 * leader) still returns a sane display value rather than an out-of-range number.
 */
export function forcedReactionRoll(state: GameState, outcome: Reaction): number {
  const leaderId = state.strangers[findLeader(state.strangers)]!;
  const leader = CREATURES[leaderId]!;
  const hostileMax = leader.hostileMax ?? 0;
  const indiffMax = leader.indiffMax ?? 6;
  if (outcome === "hostile") return 1;
  if (outcome === "indifferent") return Math.min(6, hostileMax + 1);
  return Math.min(6, indiffMax + 1);
}
```

- [ ] **Step 4: Use it in `reduce.ts`'s `case "test":`**

In `packages/engine/src/reduce.ts`, replace:

```ts
    case "test": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if ((state.indiffStreak ?? 0) >= 3) return { state, events: [{ type: "blocked" }] }; // permanently indifferent
      const next = structuredClone(state);
      next.surpriseReady = false; // approaching to test forfeits the chance of a surprise attack (§Surprise)
      const roll = reactionRoll(next);
      next.seed = roll.seed;
      const events: GameEvent[] = [{ type: "reaction", outcome: roll.outcome, roll: roll.roll }];
```

with:

```ts
    case "test": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      if ((state.indiffStreak ?? 0) >= 3) return { state, events: [{ type: "blocked" }] }; // permanently indifferent
      const next = structuredClone(state);
      next.surpriseReady = false; // approaching to test forfeits the chance of a surprise attack (§Surprise)
      // Test Mode (§Test Mode): an armed testNextReaction replaces the die roll outright — the RNG
      // (state.seed) is never touched, so this doesn't perturb any later, non-overridden roll.
      // Checks `testMode` explicitly rather than trusting testNextReaction's mere presence —
      // defense in depth against a hand-crafted state (same reasoning as map.ts's testNextArea
      // check and chamber.ts's testNextChamber check).
      let outcome: ReturnType<typeof reactionRoll>["outcome"];
      let rollValue: number;
      if (next.testMode && next.testNextReaction) {
        outcome = next.testNextReaction;
        rollValue = forcedReactionRoll(next, outcome);
        delete next.testNextReaction;
      } else {
        const roll = reactionRoll(next);
        next.seed = roll.seed;
        outcome = roll.outcome;
        rollValue = roll.roll;
      }
      const events: GameEvent[] = [{ type: "reaction", outcome, roll: rollValue }];
```

Then add `forcedReactionRoll` to the existing `import { reactionRoll } from "./reaction";` line (line 12), making it `import { reactionRoll, forcedReactionRoll } from "./reaction";`.

The rest of `case "test":` (the `if (roll.outcome === "friendly")` branches and below) currently reads `roll.outcome` — update those references to plain `outcome` (the two occurrences of `roll.outcome` become `outcome` for the remainder of this case block; there is no other use of the local `roll` variable left after this change, since it's now scoped inside the `else` branch above).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/engine && npx vitest run src/test-mode.test.ts`
Expected: PASS (23 tests total)

- [ ] **Step 6: Run the full engine suite**

Run: `cd packages/engine && npx vitest run`
Expected: PASS, no regressions (`testNextReaction` is always undefined outside test-mode games, so the `else` branch — today's exact code — is all any existing test can ever reach).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/reaction.ts packages/engine/src/reduce.ts packages/engine/src/test-mode.test.ts
git commit -m "feat(engine): the test action honors an armed testNextReaction, skipping the die"
```

---

## Task 6: Engine spec sync — `docs/specs/engine-spec.md`

**Files:**
- Modify: `docs/specs/engine-spec.md`

**Interfaces:**
- Consumes: the final file:line locations and test names from Tasks 1-5 (all committed by this point).

- [ ] **Step 1: Add Part I requirement rows**

Find the end of the Part I requirements table (the last `SC-` row before Part II's narrative begins) and add:

```markdown
| SC-Test-1 | Test Mode: `testMode?: true` on `GameState`, set only by `newGame(..., testMode: true)`, never toggled mid-game. The four `test*` actions (`testPlaceArea`, `testSetChamber`, `testForceReaction`, `testClearOverrides`) are rejected with `blocked` on any game where it isn't true. | state.ts, setup.ts:39-49,75-100, reduce.ts (test-* cases) | test-mode.test.ts › rejects all four test-* actions with `blocked` on a non-test game |
| SC-Test-2 | `testPlaceArea{dir,special}` arms `testNextArea` (rejecting `special` outside `SPECIAL_DEEP_POOL..SPECIAL_WELL`); consumed by the next fresh-draw `move` in that exact direction (`tryMove`, map.ts), which places `SPECIAL_CANONICAL_CARD[special]` and always connects, bypassing the normal printed-orientation check. | map.ts, data/areaCards.ts (`SPECIAL_CANONICAL_CARD`), reduce.ts (`testPlaceArea` case) | test-mode.test.ts › testNextArea consumed by tryMove |
| SC-Test-3 | `testSetChamber{strangers,treasures,hazards}` arms `testNextChamber`; consumed by the next chamber freshly entered by any means, replacing the normal small-pack draw via the same `classify()` every real draw uses (so Gallery petrification/Demon relocation/Crypt parking still apply) — `smallIdx` is left untouched. | chamber.ts:172-196, reduce.ts (`testSetChamber` case) | test-mode.test.ts › testNextChamber consumed by enterChamber |
| SC-Test-4 | `testForceReaction{outcome}` arms `testNextReaction`; consumed by the next `test` action in place of `reactionRoll`'s die — `state.seed` is left untouched, and the displayed roll is a representative value for the outcome's band (`forcedReactionRoll`). | reaction.ts (`forcedReactionRoll`), reduce.ts (`case "test"`) | test-mode.test.ts › testNextReaction consumed by the test action |
| SC-Test-5 | `testClearOverrides` drops all three armed overrides (`testNextArea`/`testNextChamber`/`testNextReaction`) at once. Queuing a new override of the same kind replaces, rather than queues alongside, any prior one (single slot per kind). | reduce.ts (`testClearOverrides` case) | test-mode.test.ts › testClearOverrides drops all three armed overrides at once; › queuing a second testPlaceArea replaces the first |
```

- [ ] **Step 2: Add a Part II narrative subsection**

Find the end of Part II's narrative (before Appendix A begins) and add a new `## Test Mode` subsection:

```markdown
## Test Mode

A QA-only harness (§Test Mode; not a rulebook mechanic), gated end-to-end behind a `testMode: true`
flag set once at game creation. Four actions let a tester script the next area drawn (one of the ten
real specials, from a chosen direction), a chamber's contents (any mix of creatures, treasures, and
hazards), or the outcome of the next reaction test — each armed by its own action and consumed the
moment the corresponding real draw or roll would otherwise happen, so a scripted scenario still runs
through the exact same move/chamber/reaction machinery as an ordinary game (SC-Test-1 … SC-Test-5).
Every `test*` action is rejected outright on any game without the flag — there is no way to reach
this behaviour from a real game, by construction.
```

- [ ] **Step 3: Update Appendix A's `GameState` field table**

Find Appendix A's field-by-field `GameState` table and add four rows (after the last existing row):

```markdown
| `testMode?` | `true` | Test Mode: set once at `newGame`, never toggled. Gates the four `test*` actions. |
| `testNextArea?` | `{dir, special}` | Test Mode: armed next-area override, consumed by `tryMove`. |
| `testNextChamber?` | `{strangers, treasures, hazards}` | Test Mode: armed next-chamber override, consumed by `enterChamber`. |
| `testNextReaction?` | `"friendly"\|"indifferent"\|"hostile"` | Test Mode: armed reaction override, consumed by the `test` action. |
```

- [ ] **Step 4: Update the action/event catalog counts**

Find the count callouts for the action/event catalog (search for the existing counts, e.g. the pattern used for SC-4-41/SC-4-42 in earlier work — `N actions`/`M events`) and bump each by 4 (four new `GameAction` variants, four new `GameEvent` variants added in Task 2).

- [ ] **Step 5: Update the "N tests green" summary**

Find `Full engine suite: **N tests green**` near the end of Appendix C and bump `N` by 23 (the total added across `test-mode.test.ts` in Tasks 1-5), adding a clause: `; Test Mode (§Test Mode) — testMode gating, the three armed overrides (each independently defended against a hand-crafted, non-test state), and their consumption by tryMove/enterChamber/the test action — is pinned by test-mode.test.ts`.

- [ ] **Step 6: Verify the doc renders sensibly and commit**

```bash
git add docs/specs/engine-spec.md
git commit -m "docs(engine-spec): sync Test Mode (SC-Test-1..5)"
```

---

## Task 7: Web event narration — `eventNotices.ts` and `gameLog.ts`

**Files:**
- Modify: `apps/web/src/game/eventNotices.ts`
- Modify: `apps/web/src/game/gameLog.ts`

**Interfaces:**
- Consumes: the four new `GameEvent` variants from Task 2.

- [ ] **Step 1: Add the four cases to `eventNotices.ts`'s exhaustive switch**

`apps/web/src/game/eventNotices.ts` will fail to typecheck the moment Task 2 lands (its `assertNever` default case requires every `GameEvent` member to be handled). In the big silent-case list (the block of `case "moved": // ... case "trapAvoided": // ...` that `break`s with no notice), add:

```ts
      // Test Mode (§Test Mode): the TestControlsPanel already shows the armed override directly —
      // nothing to narrate here.
      case "testAreaQueued":
      case "testChamberQueued":
      case "testReactionQueued":
      case "testOverridesCleared":
        break;
```

- [ ] **Step 2: Run web typecheck to verify it now passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (this file was the one guaranteed to break without this step).

- [ ] **Step 3: Add readable cases to `gameLog.ts`'s `describeEvent`**

In `apps/web/src/game/gameLog.ts`'s `describeEvent` switch (around line 125), add before its `default:`:

```ts
    case "testAreaQueued": return `test mode: next area queued (special ${e.special}, dir ${dir(e.dir)})`;
    case "testChamberQueued": return `test mode: next chamber queued (S:${e.strangers.length} T:${e.treasures.length} H:${e.hazards.length})`;
    case "testReactionQueued": return `test mode: next reaction forced to ${e.outcome}`;
    case "testOverridesCleared": return "test mode: overrides cleared";
```

- [ ] **Step 4: Add short codes to `gameLog.ts`'s `eventCode`**

In `apps/web/src/game/gameLog.ts`'s `eventCode` switch (around line 427), add before its `default:`:

```ts
    case "testAreaQueued": return "TST A";
    case "testChamberQueued": return "TST C";
    case "testReactionQueued": return `TST R ${e.outcome.slice(0, 3).toUpperCase()}`;
    case "testOverridesCleared": return "TST X";
```

- [ ] **Step 5: Run the web test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS, no regressions (these are additive cases in already-non-exhaustive-by-design functions).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/game/eventNotices.ts apps/web/src/game/gameLog.ts
git commit -m "fix(web): narrate the four Test Mode events (required for eventNotices.ts's exhaustiveness check)"
```

---

## Task 8: Convex — `TEST_MODE_SECRET` and the `startTestGame` mutation

**Files:**
- Modify: `apps/web/convex/game.ts`
- Test: `apps/web/convex/game.test.ts`

**Interfaces:**
- Consumes: `newGame` (aliased `createGameState`, already imported in `game.ts`) with its new 4th `testMode` parameter (Task 1); `validatePicks` (already imported).
- Produces: `startTestGame` mutation, args `{ secret: string, seed: number, picks: number[], color?: PartyColor, variants?: {extensionKit?: boolean} }`, returning the new game's `Id<"games">` (same return shape as `newGame`).

- [ ] **Step 1: Write the failing tests**

`apps/web/convex/game.test.ts` currently starts with `import { convexTest } from "convex-test";` then `import { expect, test } from "vitest";`. Change the second line to:

```ts
import { expect, test, describe, beforeEach, afterEach } from "vitest";
```

Then append to the end of the file:

```ts
// ---------------------------------------------------------------------------
// Test Mode: startTestGame
// ---------------------------------------------------------------------------
describe("startTestGame", () => {
  const ORIGINAL_SECRET = process.env.TEST_MODE_SECRET;
  beforeEach(() => { process.env.TEST_MODE_SECRET = "correct-uuid"; });
  afterEach(() => { process.env.TEST_MODE_SECRET = ORIGINAL_SECRET; });

  test("creates a testMode:true game when the secret matches", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const id = await as.mutation(api.game.startTestGame, { secret: "correct-uuid", seed: 1, picks: [0] });
    const game = await as.query(api.game.get, { id });
    expect(game?.state.testMode).toBe(true);
  });

  test("rejects a wrong secret and creates no game", async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    await expect(as.mutation(api.game.startTestGame, { secret: "wrong", seed: 1, picks: [0] })).rejects.toThrow();
    const mine = await as.query(api.game.listMine, {});
    expect(mine).toHaveLength(0);
  });

  test("fails closed when TEST_MODE_SECRET is not configured", async () => {
    delete process.env.TEST_MODE_SECRET;
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    await expect(as.mutation(api.game.startTestGame, { secret: "anything", seed: 1, picks: [0] })).rejects.toThrow();
  });

  test("requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.game.startTestGame, { secret: "correct-uuid", seed: 1, picks: [0] })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run convex/game.test.ts`
Expected: FAIL — `api.game.startTestGame` doesn't exist.

- [ ] **Step 3: Extend `actionValidator` with the new action fields**

In `apps/web/convex/game.ts`, extend `actionValidator` (needed so `applyAction` accepts the four new action shapes end to end — exercised by Task 13's integration, but the validator itself belongs with the rest of this file's Convex surface):

```ts
const actionValidator = v.object({
  type: v.string(),
  dir: v.optional(v.number()),
  ti: v.optional(v.number()),
  mi: v.optional(v.number()),
  idx: v.optional(v.number()),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  artifact: v.optional(v.number()),
  target: v.optional(v.number()),
  borne: v.optional(v.boolean()), // setBorne: bear (wield/wear) vs stow a Sword/Staff/Ring

  // resolveRound: the player's pairing for one fight round (front/background/strangers per match).
  matches: v.optional(v.array(v.object({
    front: v.array(v.number()),
    backers: v.array(v.number()),
    strangers: v.array(v.number()),
  }))),

  // Test Mode (§Test Mode): testPlaceArea's special id, testSetChamber's three id lists, and
  // testForceReaction's outcome. reduce() enforces semantics (including the testMode gate) — this
  // validator only needs to admit the shape.
  special: v.optional(v.number()),
  strangers: v.optional(v.array(v.number())),
  treasures: v.optional(v.array(v.number())),
  hazards: v.optional(v.array(v.number())),
  outcome: v.optional(v.union(v.literal("friendly"), v.literal("indifferent"), v.literal("hostile"))),
});
```

- [ ] **Step 4: Add the `startTestGame` mutation**

In `apps/web/convex/game.ts`, add after the `newGame` mutation:

```ts
/**
 * Start a new TEST-MODE game (§Test Mode): identical to `newGame`, except the caller must supply
 * the magic-string secret (compared against the Convex-only `TEST_MODE_SECRET` env var — never a
 * `VITE_`-prefixed variable, so it is never bundled into the client) and the resulting game carries
 * `state.testMode: true`. Fails closed: an unconfigured secret rejects every attempt.
 */
export const startTestGame = mutation({
  args: { secret: v.string(), seed: v.number(), picks: v.array(v.number()), color: v.optional(colorValidator), variants: v.optional(variantsValidator) },
  handler: async (ctx, { secret, seed, picks, color, variants }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthenticated");
    const expected = process.env.TEST_MODE_SECRET;
    if (!expected || secret !== expected) throw new Error("Invalid test mode secret");
    if (!validatePicks(picks, variants)) throw new Error("Invalid party selection");
    const state = createGameState(seed, picks, variants, true);
    const now = Date.now();
    const code = await uniqueCode(ctx);
    return await ctx.db.insert("games", { ownerId, code, seed, picks, variants, state, status: "active", color, createdAt: now, updatedAt: now });
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx vitest run convex/game.test.ts`
Expected: PASS (4 new tests)

- [ ] **Step 6: Run the full web suite**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/web/convex/game.ts apps/web/convex/game.test.ts
git commit -m "feat(convex): startTestGame mutation, gated by TEST_MODE_SECRET"
```

---

## Task 9: Convex — exclude test-mode games from `highScores.save`

**Files:**
- Modify: `apps/web/convex/highScores.ts:32-37`
- Test: `apps/web/convex/highScores.test.ts`

**Interfaces:**
- Consumes: `GameState.testMode` (Task 1).

- [ ] **Step 1: Write the failing test**

Append to `apps/web/convex/highScores.test.ts`. The seeded game's `ownerId` MUST match the authenticated test user (`userId` from `asUser`) and `state.gs` must be `GS_ESCAPED` with `status: "finished"` — otherwise the mutation's EARLIER ownership/status guards would reject it first, and the test would pass for the wrong reason without ever reaching the new check:

```ts
test("save rejects a test-mode game", async () => {
  const t = convexTest(schema, modules);
  const { as, userId } = await asUser(t);
  const gameId = await t.run((ctx) => {
    const state = { gs: GS_ESCAPED, testMode: true, party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] };
    return ctx.db.insert("games", { ownerId: userId, state, status: "finished", createdAt: 0, updatedAt: 0 });
  });
  await expect(as.mutation(api.highScores.save, { gameId, name: "Tester" })).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run convex/highScores.test.ts`
Expected: FAIL — `save` currently succeeds for this game.

- [ ] **Step 3: Add the check**

In `apps/web/convex/highScores.ts`, in the `save` mutation, change:

```ts
    if (state.gs !== GS_ESCAPED) throw new Error("Only a party that escapes the cave can record a score");
```

to:

```ts
    if (state.gs !== GS_ESCAPED) throw new Error("Only a party that escapes the cave can record a score");
    if (state.testMode) throw new Error("Test-mode games cannot be recorded on the leaderboard"); // §Test Mode
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run convex/highScores.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full web suite and commit**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit
git add apps/web/convex/highScores.ts apps/web/convex/highScores.test.ts
git commit -m "fix(convex): exclude Test Mode games from the leaderboard"
```

---

## Task 10: Web — the `?test=` URL helper

**Files:**
- Create: `apps/web/src/game/testMode.ts`
- Test: `apps/web/src/game/testMode.test.ts`

**Interfaces:**
- Produces: `getTestSecret(): string | null` — reads `?test=` once, remembers it in `sessionStorage` under the key `scv-test-secret` for the rest of the browser session (so navigating within the SPA, or a reload after starting a game, doesn't lose it).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/game/testMode.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTestSecret } from "./testMode";

const setUrl = (search: string) => {
  window.history.replaceState({}, "", `/${search}`);
};

describe("getTestSecret", () => {
  beforeEach(() => { sessionStorage.clear(); setUrl(""); });
  afterEach(() => { sessionStorage.clear(); setUrl(""); });

  it("returns null when no ?test= param and nothing remembered", () => {
    expect(getTestSecret()).toBeNull();
  });

  it("reads ?test= from the URL and remembers it in sessionStorage", () => {
    setUrl("?test=abcd-1234");
    expect(getTestSecret()).toBe("abcd-1234");
    expect(sessionStorage.getItem("scv-test-secret")).toBe("abcd-1234");
  });

  it("falls back to the remembered value once the URL param is gone (e.g. after navigation)", () => {
    setUrl("?test=abcd-1234");
    getTestSecret(); // first call remembers it
    setUrl(""); // URL param gone
    expect(getTestSecret()).toBe("abcd-1234");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/game/testMode.test.ts`
Expected: FAIL — `./testMode` doesn't exist.

- [ ] **Step 3: Implement `testMode.ts`**

Create `apps/web/src/game/testMode.ts`:

```ts
const STORAGE_KEY = "scv-test-secret";

/**
 * The Test Mode magic-string secret (§Test Mode), read from the URL's `?test=` parameter and
 * remembered in sessionStorage so it survives an in-app navigation or reload without needing the
 * param on every request. Returns null when neither is present. This value is never validated
 * client-side — it is only ever compared server-side, in Convex's `startTestGame` mutation, against
 * an environment variable that is never bundled into this client build.
 */
export function getTestSecret(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("test");
  if (fromUrl) {
    sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/game/testMode.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/game/testMode.ts apps/web/src/game/testMode.test.ts
git commit -m "feat(web): ?test= URL-param helper for Test Mode"
```

---

## Task 11: Web — "Start Test Game" entry and save-score suppression

**Files:**
- Modify: `apps/web/src/game/SplashScreen.tsx`
- Modify: `apps/web/src/game/GameScreen.tsx`

**Interfaces:**
- Consumes: `getTestSecret` (Task 10), `startTestGame` Convex mutation (Task 8).
- Produces: `SplashScreen` gains an optional `onStartTestGame?: () => void` prop; `GameScreen` gains the wiring to reach `PartySelect` in "test game" mode and to call `startTestGame` instead of `newGame`.

- [ ] **Step 1: Add the prop and button to `SplashScreen.tsx`**

In `apps/web/src/game/SplashScreen.tsx`, add `onStartTestGame` to the props:

```ts
export function SplashScreen({
  onStartSolitaire,
  onStartTestGame,
  onResume,
  onReplay,
  onStartMultiplayer,
  onJoinMultiplayer,
}: {
  onStartSolitaire: () => void;
  /** Test Mode (§Test Mode) — present only when the page was opened with a ?test= param. */
  onStartTestGame?: () => void;
  onResume?: (code: string) => Promise<boolean>;
  onReplay?: (code: string) => Promise<string | null>;
  onStartMultiplayer?: () => void;
  onJoinMultiplayer?: () => void;
}) {
```

Add the button just below the existing `Start Solitaire Game` button:

```tsx
        <button className="scv-primary" onClick={onStartSolitaire}>Start Solitaire Game</button>
        {onStartTestGame && (
          <button className="scv-primary" data-testid="start-test-game" onClick={onStartTestGame}>
            Start Test Game
          </button>
        )}
```

- [ ] **Step 2: Wire it up in `GameScreen.tsx`**

In `apps/web/src/game/GameScreen.tsx`:

Add the import:

```ts
import { getTestSecret } from "./testMode";
```

Add the mutation on its own line immediately after the existing `const newGame = useMutation(api.game.newGame);`:

```ts
  const startTestGame = useMutation(api.game.startTestGame);
```

And add the new state, immediately after the existing `const [gameId, setGameId] = useState<Id<"games"> | null>(null);`:

```ts
  const [wantTestGame, setWantTestGame] = useState(false); // Test Mode: PartySelect confirms into startTestGame instead
  const testSecret = getTestSecret();
```

Update the `SplashScreen` render to pass the new prop:

```tsx
      <SplashScreen
        onStartSolitaire={() => setStarted(true)}
        onStartTestGame={testSecret ? () => { setWantTestGame(true); setStarted(true); } : undefined}
        onResume={handleResume}
        onReplay={handleReplay}
        onStartMultiplayer={MULTIPLAYER_ENABLED ? () => setMp({ view: "create" }) : undefined}
        onJoinMultiplayer={MULTIPLAYER_ENABLED ? () => setMp({ view: "join" }) : undefined}
      />
```

Update the `PartySelect` render's `onConfirm` to branch:

```tsx
      <PartySelect
        kitToggle
        onBack={() => { setStarted(false); setWantTestGame(false); }}
        onConfirm={async (picks, color, variants) => {
          const id = wantTestGame && testSecret
            ? await startTestGame({ secret: testSecret, seed: Date.now(), picks, color, variants })
            : await newGame({ seed: Date.now(), picks, color, variants });
          setGameId(id);
        }}
      />
```

Update `onSaveScore` on `GameOverScreen` to omit the prop for a test-mode game:

```tsx
        <GameOverScreen
          state={displayState}
          onNewGame={() => { clearRoll(); clearNotices(); setGameId(null); setStarted(false); setWantTestGame(false); }}
          onSaveScore={displayState.testMode ? undefined : (name) => saveScore({ gameId, name })}
          log={gameLog ?? null}
          code={code ?? gameLog?.game.code ?? null}
          onReplay={handleReplay}
        />
```

Also reset `wantTestGame` in `goHome`:

```ts
  const goHome = useCallback(() => {
    clearRoll(); clearNotices(); setSavedCode(null); setShowParty(false); setGameId(null); setStarted(false); setWantTestGame(false);
  }, [clearRoll, clearNotices]);
```

- [ ] **Step 2: Typecheck and run the web suite**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS (this task adds no new automated test on its own — it's UI wiring exercised end to end by Task 13's `TestControlsPanel` tests and by manual smoke-testing in Step 3).

- [ ] **Step 3: Manual smoke test**

Run `cd apps/web && npm run dev`, then (assuming `.env.local` has no `TEST_MODE_SECRET` set yet — this step is purely a UI-wiring check, not a security check):
1. Visit `http://localhost:5173/?test=whatever` — confirm "Start Test Game" appears on the splash screen alongside "Start Solitaire Game".
2. Visit `http://localhost:5173/` (no param) — confirm "Start Test Game" is absent.
3. Click "Start Test Game", pick a party, confirm the Convex call is `startTestGame` (Network tab) and that it fails with "Invalid test mode secret" (expected — the Convex env var isn't set yet; that's covered in Task 8's own tests).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/game/SplashScreen.tsx apps/web/src/game/GameScreen.tsx
git commit -m "feat(web): Start Test Game entry, wired to startTestGame; suppress save-score for test games"
```

---

## Task 12: Web — "TEST MODE" HUD badge

**Files:**
- Modify: `apps/web/src/view/CaveHud.tsx`
- Modify: `apps/web/src/view/CaveCanvas.tsx:76`
- Modify: `apps/web/src/view/cave.css`

**Interfaces:**
- Consumes: `GameState.testMode` (Task 1), already available as `state` on `CaveCanvas`'s existing props.

- [ ] **Step 1: Add the `testMode` prop and badge to `CaveHud.tsx`**

In `apps/web/src/view/CaveHud.tsx`, add `testMode` to the prop list:

```ts
export function CaveHud({ mountRef, onPartyClick, onSave, onLog, code, turnLabel, turnColor, curses, kitActive, testMode }: { mountRef: RefObject<HTMLDivElement | null>; onPartyClick?: () => void; onSave?: () => void; onLog?: () => void; code?: string; turnLabel?: string; turnColor?: string; curses?: number; kitActive?: boolean; testMode?: boolean }) {
```

Add the badge just before the existing `kitActive` chip:

```tsx
            {testMode && (
              <div className="chip scv-testchip" title="Test Mode — scripted scenario, never eligible for the leaderboard">
                <span className="v">TEST</span>
              </div>
            )}
            {kitActive && (
```

- [ ] **Step 2: Pass it from `CaveCanvas.tsx`**

In `apps/web/src/view/CaveCanvas.tsx:76`, change:

```tsx
  return <CaveHud mountRef={mountRef} onPartyClick={onPartyClick} onSave={onSave} onLog={onLog} code={code} turnLabel={turnLabel} turnColor={turnColor} curses={state.curses} kitActive={!!state.variants?.extensionKit} />;
```

to:

```tsx
  return <CaveHud mountRef={mountRef} onPartyClick={onPartyClick} onSave={onSave} onLog={onLog} code={code} turnLabel={turnLabel} turnColor={turnColor} curses={state.curses} kitActive={!!state.variants?.extensionKit} testMode={!!state.testMode} />;
```

- [ ] **Step 3: Add the CSS**

In `apps/web/src/view/cave.css`, add near the existing `.scv-extchip`/`.scv-cursechip` rules:

```css
.scv-testchip{align-items:center;justify-content:center;min-width:0;padding:6px 10px;border-color:#c0392b;}
.scv-testchip .v{color:#e74c3c;letter-spacing:.08em;font-weight:700;}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Manual visual check**

With the dev server running and a test game started (Task 11's smoke test, once `TEST_MODE_SECRET` is set locally — see Task 13's own manual check for the full end-to-end path), confirm a red "TEST" chip appears in the HUD stats row.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/view/CaveHud.tsx apps/web/src/view/CaveCanvas.tsx apps/web/src/view/cave.css
git commit -m "ui(web): red TEST MODE badge in the HUD for testMode games"
```

---

## Task 13: Web — `TestControlsPanel`

**Files:**
- Create: `apps/web/src/game/TestControlsPanel.tsx`
- Modify: `apps/web/src/game/GameScreen.tsx`
- Test: `apps/web/src/game/TestControlsPanel.test.tsx` (new)

**Interfaces:**
- Consumes: `GameState.testMode`/`testNextArea`/`testNextChamber`/`testNextReaction` (Task 1), the `testPlaceArea`/`testSetChamber`/`testForceReaction`/`testClearOverrides` `GameAction`s (Task 2), `ALL_CREATURES`/`ALL_TREASURES`/`ALL_HAZARD_NAMES`/`SPECIAL_*` constants (already exported from `@sorcerers-cave/engine`), `DIR_N`/`DIR_E`/`DIR_S`/`DIR_W` (already exported).
- Produces: `TestControlsPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void })` — a React component, rendered in `GameScreen.tsx` only when `state.testMode === true`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/game/TestControlsPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, SPECIAL_WHIRLPOOL, DIR_N, type GameState } from "@sorcerers-cave/engine";
import { TestControlsPanel } from "./TestControlsPanel";

const testState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0], undefined, true), ...over });

describe("TestControlsPanel", () => {
  it("renders nothing when state.testMode is not true", () => {
    render(<TestControlsPanel state={newGame(1, [0])} dispatch={() => {}} />);
    expect(screen.queryByTestId("test-controls")).toBeNull();
  });

  it("queues testPlaceArea with the chosen direction and special", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_WHIRLPOOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL });
  });

  it("shows the currently armed area override", () => {
    const s = testState({ testNextArea: { dir: DIR_N, special: SPECIAL_WHIRLPOOL } });
    render(<TestControlsPanel state={s} dispatch={() => {}} />);
    expect(screen.getByTestId("test-controls")).toHaveTextContent(/whirlpool/i);
  });

  it("adds a creature to the chamber picker and queues testSetChamber with it", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/add a creature/i), { target: { value: "10" } }); // Dragon
    fireEvent.click(screen.getByRole("button", { name: /queue next chamber/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testSetChamber", strangers: [10], treasures: [], hazards: [] });
  });

  it("queues testForceReaction with the clicked outcome", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /^hostile$/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceReaction", outcome: "hostile" });
    fireEvent.click(screen.getByRole("button", { name: /^friendly$/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceReaction", outcome: "friendly" });
  });

  it("dispatches testClearOverrides from the clear button", () => {
    const dispatch = vi.fn();
    const s = testState({ testNextReaction: "hostile" });
    render(<TestControlsPanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testClearOverrides" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/game/TestControlsPanel.test.tsx`
Expected: FAIL — `./TestControlsPanel` doesn't exist.

- [ ] **Step 3: Implement `TestControlsPanel.tsx`**

Create `apps/web/src/game/TestControlsPanel.tsx`:

```tsx
import { useState } from "react";
import {
  ALL_CREATURES, ALL_TREASURES, ALL_HAZARD_NAMES,
  SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT, SPECIAL_TOMB, SPECIAL_GREAT_HALL,
  SPECIAL_CHASM, SPECIAL_BELL_ROPE, SPECIAL_LAIR, SPECIAL_WHIRLPOOL, SPECIAL_GALLERY, SPECIAL_WELL,
  DIR_N, DIR_E, DIR_S, DIR_W,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";

const SPECIAL_OPTIONS = [
  { id: SPECIAL_DEEP_POOL, label: "Deep Pool" },
  { id: SPECIAL_VIPER_PIT, label: "Viper Pit" },
  { id: SPECIAL_TOMB, label: "Tomb of Kings" },
  { id: SPECIAL_GREAT_HALL, label: "Great Hall" },
  { id: SPECIAL_CHASM, label: "The Chasm" },
  { id: SPECIAL_BELL_ROPE, label: "The Bell Rope" },
  { id: SPECIAL_LAIR, label: "The Lair" },
  { id: SPECIAL_WHIRLPOOL, label: "The Whirlpool" },
  { id: SPECIAL_GALLERY, label: "The Gallery" },
  { id: SPECIAL_WELL, label: "The Well" },
];
const SPECIAL_LABEL = new Map(SPECIAL_OPTIONS.map((o) => [o.id, o.label]));

const DIR_OPTIONS = [
  { dir: DIR_N, label: "North" },
  { dir: DIR_E, label: "East" },
  { dir: DIR_S, label: "South" },
  { dir: DIR_W, label: "West" },
];
const DIR_LABEL = new Map(DIR_OPTIONS.map((o) => [o.dir, o.label]));

/** One removable-chip list (strangers, treasures, or hazards) backed by local component state. */
function EntityPicker({
  label, addLabel, options, ids, onChange,
}: {
  label: string; addLabel: string; options: { id: number; name: string }[]; ids: number[]; onChange: (ids: number[]) => void;
}) {
  return (
    <div className="scv-tc-row">
      <span className="scv-tc-row-nm">{label}</span>
      <select aria-label={addLabel} value="" onChange={(e) => { if (e.target.value !== "") onChange([...ids, Number(e.target.value)]); }}>
        <option value="">{addLabel}…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <span className="scv-tc-chips">
        {ids.map((id, i) => (
          <button key={i} type="button" className="scv-tc-chip" onClick={() => onChange(ids.filter((_, k) => k !== i))}>
            {options.find((o) => o.id === id)?.name ?? id} ×
          </button>
        ))}
      </span>
    </div>
  );
}

/** Test Mode's override controls (§Test Mode) — rendered only for a testMode:true game. Queues the
 *  next area/chamber/reaction override; the tester then plays it out with the ordinary game UI. */
export function TestControlsPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [dir, setDir] = useState(DIR_N);
  const [special, setSpecial] = useState(SPECIAL_WHIRLPOOL);
  const [strangers, setStrangers] = useState<number[]>([]);
  const [treasures, setTreasures] = useState<number[]>([]);
  const [hazards, setHazards] = useState<number[]>([]);
  if (!state.testMode) return null;

  return (
    <div className="scv-tc" data-testid="test-controls">
      <h3 className="scv-tc-hd">Test Mode</h3>

      <div className="scv-tc-section">
        <div className="scv-tc-row">
          <label>
            Next area — direction
            <select aria-label="Next area — direction" value={dir} onChange={(e) => setDir(Number(e.target.value))}>
              {DIR_OPTIONS.map((o) => <option key={o.dir} value={o.dir}>{o.label}</option>)}
            </select>
          </label>
          <label>
            Next area — special
            <select aria-label="Next area — special" value={special} onChange={(e) => setSpecial(Number(e.target.value))}>
              {SPECIAL_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => dispatch({ type: "testPlaceArea", dir, special })}>Queue next area</button>
        </div>
        {state.testNextArea && (
          <p className="scv-tc-armed">
            Armed: {SPECIAL_LABEL.get(state.testNextArea.special)} to the {DIR_LABEL.get(state.testNextArea.dir)}
          </p>
        )}
      </div>

      <div className="scv-tc-section">
        <EntityPicker
          label="Strangers" addLabel="Add a creature"
          options={ALL_CREATURES.map((c) => ({ id: c.id, name: c.name }))}
          ids={strangers} onChange={setStrangers}
        />
        <EntityPicker
          label="Treasures" addLabel="Add a treasure"
          options={ALL_TREASURES.map((t) => ({ id: t.id, name: t.name }))}
          ids={treasures} onChange={setTreasures}
        />
        <EntityPicker
          label="Hazards" addLabel="Add a hazard"
          options={ALL_HAZARD_NAMES.map((name, id) => ({ id, name }))}
          ids={hazards} onChange={setHazards}
        />
        <button type="button" onClick={() => dispatch({ type: "testSetChamber", strangers, treasures, hazards })}>
          Queue next chamber
        </button>
        {state.testNextChamber && (
          <p className="scv-tc-armed">
            Armed: {state.testNextChamber.strangers.length} strangers, {state.testNextChamber.treasures.length} treasures, {state.testNextChamber.hazards.length} hazards
          </p>
        )}
      </div>

      <div className="scv-tc-section">
        <span className="scv-tc-row-nm">Next reaction</span>
        {(["friendly", "indifferent", "hostile"] as const).map((outcome) => (
          <button key={outcome} type="button" onClick={() => dispatch({ type: "testForceReaction", outcome })}>
            {outcome}
          </button>
        ))}
        {state.testNextReaction && <p className="scv-tc-armed">Armed: {state.testNextReaction}</p>}
      </div>

      <button type="button" className="scv-tc-clear" onClick={() => dispatch({ type: "testClearOverrides" })}>
        Clear all overrides
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/game/TestControlsPanel.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire it into `GameScreen.tsx`**

In `apps/web/src/game/GameScreen.tsx`, add the import:

```ts
import { TestControlsPanel } from "./TestControlsPanel";
```

Add the panel to the live-game render, alongside `ExplorePanel`:

```tsx
      <ExplorePanel state={displayState} dispatch={dispatchWithRolls} />
      {displayState.testMode && <TestControlsPanel state={displayState} dispatch={dispatchWithRolls} />}
```

- [ ] **Step 6: Typecheck and run the full web suite**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 7: End-to-end manual smoke test**

1. `cd apps/web && npx convex env set TEST_MODE_SECRET local-test-uuid` (dev deployment only).
2. `npm run dev`, visit `http://localhost:5173/?test=local-test-uuid`.
3. Click "Start Test Game", pick a party (e.g. Hero), confirm — the game loads with a red "TEST" HUD badge and the Test Controls panel visible.
4. Set direction "North", special "The Whirlpool", click "Queue next area" — confirm "Armed: The Whirlpool to the North" appears.
5. Move north in the 3D view (or via the exit marker) — confirm the party lands on a Whirlpool tile (its own chamber draw, per Task 4, defaults to the normal small-pack draw since no `testSetChamber` was queued for it).
6. Start a fresh test game, queue "Add a creature" → Dragon → "Queue next chamber", then move into any unexplored tile — confirm the chamber's only stranger is the Dragon.
7. Confirm the game-over screen shows no "Save score" prompt.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/game/TestControlsPanel.tsx apps/web/src/game/TestControlsPanel.test.tsx apps/web/src/game/GameScreen.tsx
git commit -m "feat(web): TestControlsPanel — queue the next area/chamber/reaction override in-game"
```

---

## Final verification

- [ ] Run `cd packages/engine && npx vitest run` — full engine suite green.
- [ ] Run `cd apps/web && npx vitest run && npx tsc --noEmit` — full web suite green, typecheck clean.
- [ ] Re-read `docs/requirements/test-mode/2026-08-02-test-mode-plan.md` (the approved design) against the code — confirm every requirement in that document maps to a task above.
- [ ] Push the `test-mode` branch and open a PR for designer review (per this repo's own git-workflow conventions — do not push without being asked).

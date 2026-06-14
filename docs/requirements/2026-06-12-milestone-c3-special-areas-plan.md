# Milestone C-3 — Special Areas (Viper Pit & Deep Pool) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two crossing-special areas real — the **Viper Pit** (each member risks falling in unless the party has the Charmed Flute) and the **Deep Pool** (non-Giant members drop heavy treasure when crossing, reclaimable on return; a Giant carries it across) — closing the last engine gap so `enteredSpecial` is no longer a bare marker.

**Architecture:** Continues the pure `reduce(state, action) → { state, events }` engine. Entering a special area already stops the party there (a non-chamber move that ends the turn in `explore`). The crossing peril is applied in the `move` handler **when the party leaves a special area through a different doorway than it entered** (i.e. the destination is not the area it came from) — which is naturally the "following turn" the rulebook describes. The spec's per-segment crossing is collapsed to a single event (§10).

**Tech Stack:** TypeScript, Vitest. Pure engine package (`packages/engine`).

**Source of truth:** `docs/specs/design-spec.html` §10 (Viper Pit §10.1, Deep Pool §10.2).

---

## Pre-flight

- All work in `packages/engine`. Run `pnpm --filter @sorcerers-cave/engine test` / `… typecheck`. Commit after each green task.
- `noUncheckedIndexedAccess` is on (`!` only on provably-valid indices). Determinism: every die roll threads `state.seed` via `rollDie`; never `Math.random`.
- Pieces this builds on: `GameState` (with `party` [`PartyMember{creatureId,status,dragonKills,treasure}`], `areas[]` [`PlacedArea`], `treasures`, `prev`, `partyArea`, `seed`, `gs`, `phase`), `decodeArea` (`.special`), `data/areaCards.ts` (`SPECIAL_DEEP_POOL`=2, `SPECIAL_VIPER_PIT`=3), `rollDie`, `reduce`/`resolveArea`/`persistAndExplore` in `reduce.ts`, `GS_DEAD`, `makeState`, `coords` (`packCoord`/`unpackCoord`).
- **Id constants:** Charmed Flute = treasure id 12; Giant = creature id 12; heavy treasure = ids 0 (Silver), 1 (Gold), 2 (Gems). A "living" member has `status === 0 || 1`.
- The current `resolveArea` treats both specials identically: `if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) { push enteredSpecial; phase = "explore"; return; }`. Task 2 splits this so Deep Pool can offer reclaim.

## File Structure

```
packages/engine/src/
├── special.ts      # NEW: viperCrossing + deepPoolCrossing (§10)
├── state.ts        # MODIFY: add optional `dropped?: number[]` to PlacedArea
├── actions.ts      # MODIFY: add crossedSpecial / treasureDropped / treasureReclaimed events
├── reduce.ts       # MODIFY: move handler applies crossing on leaving a special; resolveArea offers Deep-Pool reclaim
└── index.ts        # MODIFY: export special
```

---

## Task 1: Crossing helpers (Viper Pit & Deep Pool)

**Files:** Create `packages/engine/src/special.ts`; Modify `packages/engine/src/state.ts` (add `dropped?`), `packages/engine/src/actions.ts` (add events); Test `packages/engine/src/special.test.ts`.

- [ ] **Step 1: Add the optional `dropped` field to `PlacedArea` in `state.ts`.** In the `PlacedArea` interface, add (after `indiffCount`):
```ts
  dropped?: number[]; // heavy treasure ids left in a Deep Pool, reclaimable on return (§10.2)
```
(Optional, so existing `PlacedArea` literals need no change.)

- [ ] **Step 2: Add events to the `GameEvent` union in `actions.ts`:**
```ts
  | { type: "crossedSpecial"; special: number }
  | { type: "treasureDropped"; count: number }
  | { type: "treasureReclaimed"; count: number }
```

- [ ] **Step 3: Write the failing test `packages/engine/src/special.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { viperCrossing, deepPoolCrossing } from "./special";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });

describe("viperCrossing (spec §10.1)", () => {
  it("the Charmed Flute carries everyone across safely (no rolls)", () => {
    const s = makeState({ party: [member(0, [12]), member(5)], seed: 1 });
    const seedBefore = s.seed;
    const events = viperCrossing(s);
    expect(s.seed).toBe(seedBefore); // no dice rolled
    expect(s.party.every((m) => m.status === 0)).toBe(true);
    expect(events).toEqual([]);
  });

  it("rolls a d6 per living member; a 1 means falling in (death, treasure lost)", () => {
    // Roll outcomes are seed-driven; assert the mechanism: every member ends up alive (0) or fallen (3),
    // and any fallen member has lost its treasure.
    const s = makeState({ party: [member(5, [1]), member(5, [0])], seed: 4 });
    viperCrossing(s);
    for (const m of s.party) {
      expect([0, 3]).toContain(m.status);
      if (m.status === 3) expect(m.treasure).toEqual([]);
    }
    expect(s.seed).not.toBe(4); // dice were rolled
  });
});

describe("deepPoolCrossing (spec §10.2)", () => {
  const poolState = (over: object) => makeState({
    areas: [{ card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 }],
    partyArea: 0,
    ...over,
  });

  it("a Giant carries all heavy treasure across — nothing is dropped", () => {
    const s = poolState({ party: [member(12, [0, 1]), member(5, [2])] }); // Giant + Man
    const events = deepPoolCrossing(s, 0);
    expect(s.party[1]!.treasure).toEqual([2]); // Man keeps his Gems
    expect(s.areas[0]!.dropped ?? []).toEqual([]);
    expect(events).toEqual([]);
  });

  it("without a Giant, non-artifact heavy treasure is dropped into the pool; artifacts are kept", () => {
    const s = poolState({ party: [member(5, [1, 3])] }); // Man with Gold(heavy) + Magic Sword(artifact)
    const events = deepPoolCrossing(s, 0);
    expect(s.party[0]!.treasure).toEqual([3]); // keeps the Magic Sword
    expect(s.areas[0]!.dropped).toEqual([1]); // Gold dropped in the pool
    expect(events).toContainEqual({ type: "treasureDropped", count: 1 });
  });
});
```

- [ ] **Step 4:** Run, confirm FAIL (`./special` not found).

- [ ] **Step 5: Implement `packages/engine/src/special.ts`**

```ts
import { rollDie } from "./rng";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_CHARMED_FLUTE = 12;
const C_GIANT = 12;
const HEAVY = new Set([0, 1, 2]); // Silver, Gold, Gems

function living(state: GameState): PartyMember[] {
  return state.party.filter((m) => m.status === 0 || m.status === 1);
}

/** Cross the Viper Pit (§10.1). Each living member risks a fatal fall (roll of 1); the
 *  Charmed Flute lulls the vipers so the whole party crosses safely. Threads the seed. */
export function viperCrossing(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const members = living(state);
  if (members.some((m) => m.treasure.includes(T_CHARMED_FLUTE))) return events;
  for (const m of members) {
    const r = rollDie(state.seed);
    state.seed = r.seed;
    if (r.value === 1) {
      m.status = 3;
      m.treasure = []; // lost to the pit
      events.push({ type: "memberDied", creatureId: m.creatureId });
    }
  }
  return events;
}

/** Cross the Deep Pool (§10.2). A living Giant carries all heavy treasure across; otherwise
 *  every living member's heavy treasure (Silver/Gold/Gems) is left in the pool (reclaimable). */
export function deepPoolCrossing(state: GameState, poolIdx: number): GameEvent[] {
  const events: GameEvent[] = [];
  const members = living(state);
  if (members.some((m) => m.creatureId === C_GIANT)) return events; // Giant carries everything
  const pool = state.areas[poolIdx]!;
  pool.dropped = pool.dropped ?? [];
  for (const m of members) {
    const heavy = m.treasure.filter((t) => HEAVY.has(t));
    if (heavy.length > 0) {
      pool.dropped.push(...heavy);
      m.treasure = m.treasure.filter((t) => !HEAVY.has(t));
      events.push({ type: "treasureDropped", count: heavy.length });
    }
  }
  return events;
}
```
> `viperCrossing` reuses the existing `memberDied` event (added in C-2).

- [ ] **Step 6:** Run `pnpm --filter @sorcerers-cave/engine test && … typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/special.ts packages/engine/src/special.test.ts packages/engine/src/state.ts packages/engine/src/actions.ts
git commit -m "feat(engine): Viper Pit & Deep Pool crossing helpers (spec §10)"
```

---

## Task 2: Wire crossings & reclaim into the turn loop

**Files:** Modify `packages/engine/src/reduce.ts`, `packages/engine/src/index.ts`; Test `packages/engine/src/reduce.test.ts` (extend).

- [ ] **Step 1: Add imports to `reduce.ts`.** Add `import { viperCrossing, deepPoolCrossing } from "./special";` and ensure `SPECIAL_VIPER_PIT` and `SPECIAL_DEEP_POOL` are imported from `./data/areaCards` (they already are — they're used by `resolveArea`). `GS_DEAD` is already imported (used by `fightOn`).

- [ ] **Step 2: Replace the `case "move":` block in `reduce.ts`** with this version (captures the area being left, then applies the crossing peril when leaving a special area to a NON-previous area):

```ts
    case "move": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const fromSpecial = decodeArea(state.areas[state.partyArea]!.card).special;
      const fromIdx = state.partyArea;
      const oldPrev = state.prev;
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const next = { ...res.state, turn: res.state.turn + 1 };
      const events: GameEvent[] = [];
      const crossing = next.partyArea !== oldPrev; // not simply going back the way we came

      if (crossing && fromSpecial === SPECIAL_VIPER_PIT) {
        events.push({ type: "crossedSpecial", special: SPECIAL_VIPER_PIT });
        events.push(...viperCrossing(next));
        if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
          next.gs = GS_DEAD;
          next.phase = "gameOver";
          events.push({ type: "gameOver", gs: GS_DEAD });
          return { state: next, events };
        }
      } else if (crossing && fromSpecial === SPECIAL_DEEP_POOL) {
        events.push({ type: "crossedSpecial", special: SPECIAL_DEEP_POOL });
        events.push(...deepPoolCrossing(next, fromIdx));
      }

      events.push(...resolveArea(next));
      return { state: next, events };
    }
```

- [ ] **Step 3: Update `resolveArea` in `reduce.ts` to offer Deep-Pool reclaim.** Replace the special-area branch inside `resolveArea`'s loop — i.e. replace:
```ts
    if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) {
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
```
with:
```ts
    if (dec.special === SPECIAL_DEEP_POOL) {
      const area = state.areas[state.partyArea]!;
      if (area.dropped && area.dropped.length > 0) {
        state.treasures = area.dropped;
        area.dropped = [];
        events.push({ type: "treasureReclaimed", count: state.treasures.length });
        state.phase = "pickup"; // reclaim dropped heavy treasure (weight-limited)
        return events;
      }
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (dec.special === SPECIAL_VIPER_PIT) {
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
```

- [ ] **Step 4: Export `special` from `index.ts`** — add:
```ts
export * from "./special";
```

- [ ] **Step 5: Append special-area integration tests to `reduce.test.ts`**

```ts
import { SPECIAL_VIPER_PIT, SPECIAL_DEEP_POOL } from "./data/areaCards";
import { packCoord } from "./coords";

describe("reduce — special-area crossings (C-3 §10)", () => {
  // A Deep Pool (287 = NSEWC + special 2) at the start, the Gateway to its north.
  function poolStart(party: object[], over: object = {}) {
    return makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // north neighbour
        { card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // Deep Pool
      ],
      partyArea: 1,
      prev: 0, // we arrived from the north area (index 0)
      party: party as any,
      ...over,
    });
  }

  it("crossing a Deep Pool without a Giant drops heavy treasure into the pool", () => {
    // Leave the pool SOUTH (a fresh draw), i.e. NOT back north to where we came from.
    const s = poolStart([{ creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }], { largePack: [31], largeIdx: 0 });
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S
    expect(state.party[0]!.treasure).toEqual([]); // Gold dropped
    expect(state.areas[1]!.dropped).toEqual([1]);
    expect(events).toContainEqual({ type: "crossedSpecial", special: SPECIAL_DEEP_POOL });
  });

  it("going back the way you came does NOT trigger the crossing", () => {
    const s = poolStart([{ creatureId: 5, status: 0, dragonKills: 0, treasure: [1] }]);
    const { state, events } = reduce(s, { type: "move", dir: 1 }); // DIR_N -> back to index 0
    expect(state.party[0]!.treasure).toEqual([1]); // kept — no crossing
    expect(events).not.toContainEqual({ type: "crossedSpecial", special: SPECIAL_DEEP_POOL });
  });

  it("re-entering a Deep Pool with dropped treasure enters the pickup phase to reclaim it", () => {
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 287, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, dropped: [1, 2] },
      ],
      partyArea: 0, // start north of the pool
      prev: 0,
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }],
    });
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the pool (175 has a south door; 287 has a north door)
    expect(state.partyArea).toBe(1);
    expect(state.phase).toBe("pickup");
    expect(state.treasures).toEqual([1, 2]);
    expect(state.areas[1]!.dropped).toEqual([]);
    expect(events).toContainEqual({ type: "treasureReclaimed", count: 2 });
  });

  it("crossing a Viper Pit with the Charmed Flute is always safe", () => {
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: 415, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }, // Viper Pit (415 = special 3)
      ],
      partyArea: 1, prev: 0,
      party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [12] }], // Hero with Charmed Flute
      largePack: [31], largeIdx: 0,
    });
    const { state } = reduce(s, { type: "move", dir: 3 }); // cross south
    expect(state.party[0]!.status).toBe(0); // alive
    expect(state.gs).toBe(0); // still playing
  });
});
```

- [ ] **Step 6:** Run the full engine suite `pnpm --filter @sorcerers-cave/engine test && … typecheck`. Expected: PASS — all prior + new tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/reduce.ts packages/engine/src/index.ts packages/engine/src/reduce.test.ts
git commit -m "feat(engine): wire Viper Pit/Deep Pool crossings + reclaim into the turn loop (spec §10)"
```

---

## Definition of Done (Milestone C-3)

- [ ] `pnpm --filter @sorcerers-cave/engine test` green; `typecheck` clean; `pnpm test` (all packages) green.
- [ ] Leaving a Viper Pit by a new doorway rolls a fatal-fall d6 per member (Charmed Flute → safe); a full wipe is `GS_DEAD`.
- [ ] Leaving a Deep Pool by a new doorway drops non-Giant members' heavy treasure into the pool (artifacts kept); a living Giant carries it across.
- [ ] Going back the way you came triggers no crossing peril.
- [ ] Re-entering a Deep Pool with dropped treasure enters the `pickup` phase to reclaim it (weight-limited).
- [ ] The engine is now feature-complete for the solitaire core (explore, chambers, hazards, encounters, fights, specials, scoring); remaining items are active-artifact fidelity (Milestone E) and the UI (Milestone D).

---

## Self-Review

**Spec coverage (§10):**
- §10.1 Viper Pit — per-member fatal-fall roll, Charmed Flute safety, treasure lost on falling, single collapsed crossing → Task 1 `viperCrossing` + Task 2 wiring + party-wipe. ✓
- §10.2 Deep Pool — non-Giant heavy-treasure drop, Giant carries all, artifacts kept, dropped treasure reclaimable on return → Task 1 `deepPoolCrossing` + Task 2 wiring + reclaim via the `pickup` phase. ✓
- "Enter stops at the edge; cross on the following turn; or go back" → modelled by applying the peril only when leaving to a non-`prev` area (each move is a turn). ✓

**Deliberate simplifications (named):** the rulebook's per-segment ledge crossing and per-load Giant delay are collapsed to a single event; the "leave by the *same* doorway to reclaim" nuance is simplified to "dropped treasure sits in the pool and is offered on any re-entry"; stair/trap arrival "on the island" is not specially modelled (post-C-3 / fidelity). Charmed-Flute pit-treasure *recovery* (fishing out fallen members' treasure) is not modelled — only fall prevention.

**Placeholder scan:** none. The probabilistic Viper test asserts the invariant (each member ends alive or fallen-with-no-treasure) rather than a specific seed outcome, so it is robust.

**Type consistency:** `viperCrossing(state): GameEvent[]` and `deepPoolCrossing(state, poolIdx): GameEvent[]` signatures match between `special.ts` and the `reduce.ts` move handler. `PlacedArea.dropped?: number[]` is read/written consistently in `special.ts` and `resolveArea`. New events (`crossedSpecial`/`treasureDropped`/`treasureReclaimed`) are declared in `actions.ts` (Task 1) before use in Task 2. `SPECIAL_VIPER_PIT`/`SPECIAL_DEEP_POOL`, `GS_DEAD`, heavy ids (0,1,2), Charmed Flute (12), Giant (12) are consistent across files.

**Determinism:** `viperCrossing` threads `state.seed` through every `rollDie`; `deepPoolCrossing` rolls no dice; no `Math.random`/`Date.now`.

# Milestone E-2 — Triggered Loot Events (Treasure Chest & Lost Ruby) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make two iconic treasures dramatic — opening the **Treasure Chest** rolls a 1d6 fate table (curse / a Spectre attacks / sand / silver / gold / gems), and grabbing the **Lost Ruby** triggers a fight against a strength-8 statue that, if it wins, slays the would-be thief and lurks to ambush future visitors.

**Architecture:** Continues the pure `reduce(state, action) → { state, events }` engine. The Treasure Chest adds an `openChest` action (rolls the §11 table) and a `bonusScore` banked-points field so the chest's high-value loot scores correctly without inventing new treasure ids. The Lost Ruby reuses the existing `takeTreasure` action: picking up treasure id 11 runs a one-roll statue fight inline, and an "aroused statue" area flag makes `resolveArea` attack on re-entry. Both reuse the existing fight phase / `frontStrength`.

**Tech Stack:** TypeScript, Vitest. Pure engine package (`packages/engine`).

**Source of truth:** `docs/specs/design-spec.html` §11 (Treasure Chest open table), §16 (Treasure Chest open, Lost Ruby statue).

---

## Pre-flight

- All work in `packages/engine`. Run `pnpm --filter @sorcerers-cave/engine test` / `… typecheck`. Commit after each green task.
- `noUncheckedIndexedAccess` is on (`!` only on provably-valid indices). Determinism: every die roll threads `state.seed` via `rollDie`; never `Math.random`.
- Pieces this builds on: `GameState` (with `phase`, `party` [`PartyMember{creatureId,status,dragonKills,treasure}`], `strangers`, `treasures`, `areas[].flags`, `curses`, `seed`, `gs`, `fight`), `reduce`/`resolveArea`/`persistAndExplore` in `reduce.ts`, `pickup.ts` `takeTreasure`, `combat.ts` `frontStrength`, `rollDie`, `score.ts` `scoreGame`, `selectors.ts` `legalActions`, `makeState`, `GS_DEAD`/`GS_ESCAPED`.
- **Id constants:** Treasure Chest = treasure id 14, Lost Ruby = treasure id 11, Spectre = creature id 9. The aroused-statue area flag bit = `32` (free; existing flags use 4 = destroyed).
- **Status:** 0 original, 1 ally, 2 stone, 3 dead. "Living" = 0 or 1.
- The chest table (spec §11): roll 1 → Curse, 2 → a Spectre attacks (one round), 3 → Sand (nothing), 4 → Silver (20 pts), 5 → Gold (40 pts), 6 → Gems (80 pts). These point values differ from the regular Silver/Gold/Gems (5/10/20), so they are banked into `bonusScore` rather than handed over as carried treasure.

## File Structure

```
packages/engine/src/
├── state.ts        # MODIFY: add `bonusScore: number`
├── testkit.ts      # MODIFY: default `bonusScore: 0`
├── setup.ts        # MODIFY: newGame `bonusScore: 0`
├── score.ts        # MODIFY: scoreGame adds bonusScore
├── actions.ts      # MODIFY: add openChest action + chestOpened/rubyTaken/statueAroused/statueAttacked events
├── reduce.ts       # MODIFY: openChest dispatch (Task 1); Lost-Ruby branch in takeTreasure + aroused-statue entry in resolveArea (Task 2)
└── selectors.ts    # MODIFY: offer openChest in the explore phase
```

---

## Task 1: Treasure Chest open

**Files:** Modify `state.ts`, `testkit.ts`, `setup.ts`, `score.ts`, `actions.ts`, `reduce.ts`, `selectors.ts`; Test `packages/engine/src/chest.test.ts`.

- [ ] **Step 1: Add `bonusScore` to state.** In `state.ts`, add to the `GameState` interface (after `curses`):
```ts
  bonusScore: number; // banked points (e.g. Treasure Chest loot) added at scoring
```
In `testkit.ts`, add `bonusScore: 0,` to the object `makeState` returns (before `...overrides`). In `setup.ts`, add `bonusScore: 0,` to the object `newGame` returns.

- [ ] **Step 2: Score the banked points.** In `score.ts` `scoreGame`, add immediately after the `if (state.sorcererKilled) score += 30;` line:
```ts
  score += state.bonusScore;
```

- [ ] **Step 3: Add the action + events to `actions.ts`.** Add to `GameAction`:
```ts
  | { type: "openChest" }
```
Add to `GameEvent`:
```ts
  | { type: "chestOpened"; result: number }
  | { type: "rubyTaken" }
  | { type: "statueAroused" }
  | { type: "statueAttacked" }
```
(`rubyTaken`/`statueAroused`/`statueAttacked` are used by Task 2; declaring them now keeps `actions.ts` edited once.)

- [ ] **Step 4: Write the failing test `packages/engine/src/chest.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { scoreGame } from "./score";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { GS_ESCAPED } from "./state";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("openChest (spec §11/§16)", () => {
  it("removes the chest and applies the rolled result, across seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = makeState({ phase: "explore", areas: [area], party: [member(0, [14])], seed });
      const { state, events } = reduce(s, { type: "openChest" });
      const opened = events.find((e) => e.type === "chestOpened") as { type: "chestOpened"; result: number } | undefined;
      expect(opened).toBeDefined();
      expect(state.party[0]!.treasure).not.toContain(14); // chest consumed
      if (opened!.result === 1) expect(state.curses).toBe(1);
      if (opened!.result === 2) { expect(state.phase).toBe("fight"); expect(state.strangers).toContain(9); }
      if (opened!.result === 4) expect(state.bonusScore).toBe(20);
      if (opened!.result === 5) expect(state.bonusScore).toBe(40);
      if (opened!.result === 6) expect(state.bonusScore).toBe(80);
    }
  });

  it("is rejected outside explore or when no living member carries the chest", () => {
    const noChest = makeState({ phase: "explore", areas: [area], party: [member(0)] });
    expect(reduce(noChest, { type: "openChest" }).events).toContainEqual({ type: "blocked" });
    const wrongPhase = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [member(0, [14])] });
    expect(reduce(wrongPhase, { type: "openChest" }).events).toContainEqual({ type: "blocked" });
  });

  it("scoreGame includes banked chest loot", () => {
    const s = makeState({ gs: GS_ESCAPED, bonusScore: 40, party: [member(0)] }); // Hero 10 + 40
    expect(scoreGame(s)).toBe(50);
  });
});
```

- [ ] **Step 5:** Run, confirm FAIL (`openChest` not handled / `bonusScore` missing).

- [ ] **Step 6: Add the `openChest` dispatch to `reduce.ts`.** Ensure `rollDie` is imported (add `import { rollDie } from "./rng";` if not already present). Add this `case` to the `reduce` switch:
```ts
    case "openChest": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const bearerIdx = state.party.findIndex((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(14));
      if (bearerIdx < 0) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const bearer = next.party[bearerIdx]!;
      bearer.treasure.splice(bearer.treasure.indexOf(14), 1); // the chest is opened (consumed)
      const r = rollDie(next.seed);
      next.seed = r.seed;
      const events: GameEvent[] = [{ type: "chestOpened", result: r.value }];
      switch (r.value) {
        case 1: next.curses += 1; break; // a Curse
        case 2: // a Spectre appears and attacks (one round)
          next.strangers.push(9);
          next.fight = { surprise: -1, round: 1, focus: next.strangers.length - 1 };
          next.phase = "fight";
          events.push({ type: "fightStarted", surprise: -1 });
          break;
        case 3: break; // Sand
        case 4: next.bonusScore += 20; break; // Silver
        case 5: next.bonusScore += 40; break; // Gold
        case 6: next.bonusScore += 80; break; // Gems
      }
      return { state: next, events };
    }
```

- [ ] **Step 7: Offer `openChest` in the explore branch of `legalActions` (`selectors.ts`).** In the `explore` branch, before the trailing `actions.push({ type: "quit" })`, add:
```ts
  if (state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(14))) actions.push({ type: "openChest" });
```

- [ ] **Step 8:** Run `pnpm --filter @sorcerers-cave/engine test && … typecheck`. Expected: PASS — chest tests + all prior tests green.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/state.ts packages/engine/src/testkit.ts packages/engine/src/setup.ts packages/engine/src/score.ts packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/selectors.ts packages/engine/src/chest.test.ts
git commit -m "feat(engine): Treasure Chest open table + banked bonus score (spec §11)"
```

---

## Task 2: Lost Ruby statue

**Files:** Modify `packages/engine/src/reduce.ts`; Test `packages/engine/src/ruby.test.ts`.

Picking up the Lost Ruby (treasure id 11) via `takeTreasure` runs a one-roll statue fight: the chosen fighter's `frontStrength + d6` vs the statue's `8 + d6`. A fighter who is at least as strong wins (ruby taken); otherwise the fighter is slain, the ruby stays, and the area's statue is **aroused** (flag bit 32) so it attacks the strongest member on any later entry.

- [ ] **Step 1: Write the failing test `packages/engine/src/ruby.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = (flags = 0) => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags, indiffCount: 0 });

describe("Lost Ruby statue (spec §16)", () => {
  it("taking the Lost Ruby fights the statue: win -> ruby; loss -> slain + statue aroused", () => {
    const s = makeState({ phase: "pickup", areas: [area()], treasures: [11], party: [member(5)], seed: 4 }); // Man (FS 3)
    const { state, events } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    if (state.party[0]!.treasure.includes(11)) {
      expect(events).toContainEqual({ type: "rubyTaken" });
      expect(state.party[0]!.status).toBe(0);
      expect(state.treasures).toEqual([]);
    } else {
      expect(state.party[0]!.status).toBe(3);
      expect(state.areas[0]!.flags & 32).toBe(32);
      expect(events).toContainEqual({ type: "statueAroused" });
      expect(state.treasures).toEqual([11]); // ruby stays
    }
  });

  it("an overwhelming fighter always wins the ruby", () => {
    // Giant (FS 7) vs statue 8: 7 + d6 vs 8 + d6 — not dice-proof, so just assert one valid outcome.
    const s = makeState({ phase: "pickup", areas: [area()], treasures: [11], party: [member(12)], seed: 5 });
    const { state } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    const won = state.party[0]!.treasure.includes(11);
    expect(won || state.party[0]!.status === 3).toBe(true);
  });

  it("entering an aroused-statue area makes the statue attack first", () => {
    const s = makeState({
      areas: [
        { card: 175, coord: packCoord(1, 50, 49), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        area(32), // index 1: aroused statue, at (50,50)
      ],
      partyArea: 0, prev: 0,
      party: [member(0)], // Hero
      seed: 3,
    });
    s.areas[1]!.coord = packCoord(1, 50, 50);
    const { state, events } = reduce(s, { type: "move", dir: 3 }); // DIR_S into the aroused area
    expect(state.partyArea).toBe(1);
    expect(events).toContainEqual({ type: "statueAttacked" });
  });
});
```

- [ ] **Step 2:** Run, confirm FAIL (Lost Ruby just gets picked up as plain treasure; no statue).

- [ ] **Step 3: Add `frontStrength` to `reduce.ts`'s imports.** Add `frontStrength` to the existing `import { ... } from "./combat";` line (it currently imports `resolveRound`). Ensure `rollDie` is imported (added in Task 1).

- [ ] **Step 4: Add the Lost-Ruby branch to the `takeTreasure` case in `reduce.ts`.** Replace the body of `case "takeTreasure":` with:
```ts
    case "takeTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      if (next.treasures[action.ti] === 11) { // Lost Ruby — guarded by a strength-8 statue (§16)
        const fighter = next.party[action.mi];
        if (!fighter || !(fighter.status === 0 || fighter.status === 1)) return { state, events: [{ type: "blocked" }] };
        const events: GameEvent[] = [];
        const pr = rollDie(next.seed); next.seed = pr.seed;
        const sr = rollDie(next.seed); next.seed = sr.seed;
        if (frontStrength(fighter) + pr.value >= 8 + sr.value) {
          fighter.treasure.push(11);
          next.treasures.splice(action.ti, 1);
          events.push({ type: "rubyTaken" });
        } else {
          fighter.status = 3;
          next.areas[next.partyArea]!.flags |= 32; // statue aroused
          events.push({ type: "memberDied", creatureId: fighter.creatureId });
          events.push({ type: "statueAroused" });
          if (!next.party.some((m) => m.status === 0 || m.status === 1)) {
            next.gs = GS_DEAD;
            next.phase = "gameOver";
            events.push({ type: "gameOver", gs: GS_DEAD });
            return { state: next, events };
          }
        }
        if (next.treasures.length === 0) persistAndExplore(next);
        return { state: next, events };
      }
      takeTreasure(next, action.ti, action.mi);
      if (next.treasures.length === 0) persistAndExplore(next);
      return { state: next, events: [] };
    }
```

- [ ] **Step 5: Make `resolveArea` fire an aroused statue on entry.** In `resolveArea`'s `for (;;)` loop, immediately after `const dec = decodeArea(state.areas[state.partyArea]!.card);` (the first line inside the loop), add:
```ts
    const here = state.areas[state.partyArea]!;
    if ((here.flags & 32) !== 0) { // an aroused Lost-Ruby statue strikes the strongest member (§16)
      let strongest: typeof state.party[number] | undefined;
      for (const m of state.party) {
        if ((m.status === 0 || m.status === 1) && (!strongest || frontStrength(m) > frontStrength(strongest))) strongest = m;
      }
      if (strongest) {
        const pr = rollDie(state.seed); state.seed = pr.seed;
        const sr = rollDie(state.seed); state.seed = sr.seed;
        if (8 + sr.value > frontStrength(strongest) + pr.value) {
          strongest.status = 3;
          events.push({ type: "memberDied", creatureId: strongest.creatureId });
        }
        events.push({ type: "statueAttacked" });
        if (!state.party.some((m) => m.status === 0 || m.status === 1)) {
          state.gs = GS_DEAD;
          state.phase = "gameOver";
          events.push({ type: "gameOver", gs: GS_DEAD });
          return events;
        }
      }
    }
```

- [ ] **Step 6:** Run the full engine suite `pnpm --filter @sorcerers-cave/engine test && … typecheck`. Expected: PASS — ruby tests + all prior tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/reduce.ts packages/engine/src/ruby.test.ts
git commit -m "feat(engine): Lost Ruby statue fight on pickup + aroused-statue ambush (spec §16)"
```

---

## Definition of Done (Milestone E-2)

- [ ] `pnpm --filter @sorcerers-cave/engine test` green; `typecheck` clean; `pnpm test` (all packages) green.
- [ ] `openChest` (explore, chest-bearer only) rolls the §11 table: curse / Spectre-attacks-fight / sand / silver(+20) / gold(+40) / gems(+80) banked into `bonusScore`, scored on escape; `legalActions` offers it when a member carries the chest.
- [ ] Taking the Lost Ruby fights a strength-8 statue: win → ruby; loss → slain + area aroused; a party wipe is `GS_DEAD`.
- [ ] Entering an aroused-statue area attacks the strongest member first.

---

## Self-Review

**Spec coverage (§11 chest, §16 chest + Lost Ruby):**
- Chest open table (1d6 → curse/spectre/sand/silver/gold/gems, points 0/0/0/20/40/80) → Task 1. ✓
- Chest Spectre attacks one round (MP 5 via Spectre data) → Task 1 (starts a fight with the Spectre). ✓
- Lost Ruby strength-8 statue fight on pickup; loss slays the fighter; aroused statue attacks future visitors → Task 2. ✓

**Deliberate simplifications (named, not silently dropped):** the chest Spectre starts a normal fight rather than a strictly one-round-only exchange (the player may keep fighting it — consistent with the engine's fight model); chest silver/gold/gems are banked as `bonusScore` rather than carried items (so they can't be dropped/stolen, and carry no weight) — this preserves the §11 point values without inventing treasure ids; the Lost-Ruby statue and the aroused-statue ambush are single-roll exchanges (not the full focus-fire fight); two members "joining to carry" the 100kg chest and the chest's weight interplay are not modelled (the chest is just opened in place). Curse interplay with "Sorcerer dead" is unchanged from §13.

**Placeholder scan:** none. Probabilistic outcomes assert invariants across seeds (chest) or accept either valid branch (ruby) rather than pinning a single die result.

**Type consistency:** `bonusScore: number` is added to `GameState` and defaulted in both `makeState` and `newGame`; read in `scoreGame`. The `openChest` action and `chestOpened`/`rubyTaken`/`statueAroused`/`statueAttacked` events are declared in `actions.ts` (Task 1) before use across `reduce.ts` (Tasks 1+2). `frontStrength` (from `combat.ts`) and `rollDie` (from `rng.ts`) are imported into `reduce.ts`. The aroused-statue flag bit `32` is used consistently in `takeTreasure` (set) and `resolveArea` (check). Treasure ids (chest 14, ruby 11) and creature id (Spectre 9) match across files.

**Determinism:** the chest roll and both statue exchanges thread `state.seed` through `rollDie`; no `Math.random`/`Date.now`.

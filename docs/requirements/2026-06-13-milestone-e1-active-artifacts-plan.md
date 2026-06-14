# Milestone E-1 — Active Artifacts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four player-activated artifacts — **Strength Potion** (+2 in a fight), **Healing Balm** (revive a downed member), **Magic Staff** reanimation (un-stone a member), and **Lotus Dust** (put a stranger to sleep) — behind a single `useArtifact` action that `legalActions` surfaces, so the UI can show "use item" controls.

**Architecture:** Continues the pure `reduce(state, action) → { state, events }` engine. A new `useArtifact` action is validated per artifact (which `phase` it's usable in, which creature may bear it, what it targets), consumes the artifact from the bearer (except the permanent Magic Staff), and applies its effect. `legalActions` enumerates the currently-usable artifact actions per phase. The Strength Potion's +2 lasts a fight via a `PartyMember.potionActive` flag cleared when combat ends.

**Tech Stack:** TypeScript, Vitest. Pure engine package (`packages/engine`).

**Source of truth:** `docs/specs/design-spec.html` §11 (artifact status), §16 (implementation sketches: Lotus Dust, Healing Balm, Strength Potion §9.3, Magic Staff reanimation).

---

## Pre-flight

- All work in `packages/engine`. Run `pnpm --filter @sorcerers-cave/engine test` / `… typecheck`. Commit after each green task.
- `noUncheckedIndexedAccess` is on (`!` only on provably-valid indices). Determinism: no `Math.random`/`Date.now` (these artifacts roll no dice).
- Pieces this builds on: `GameState` (with `phase` [`explore`/`encounter`/`fight`/`pickup`/`gameOver`], `party` [`PartyMember{creatureId,status,dragonKills,treasure}`], `strangers`, `treasures`, `areas[].contents`, `fight`), `reduce`/`persistAndExplore` in `reduce.ts`, `combat.ts` `frontStrength`, `legalActions` in `selectors.ts`, `makeState`.
- **Id constants:** treasures — Lotus Dust 5, Healing Balm 6, Strength Potion 8, Magic Staff 9. Creatures — Hero 0, W-Hero 1, Priest 4, Man 5, Woman 6, Wizard 8.
- **Status:** 0 original, 1 ally, 2 stone, 3 dead. "Living" = 0 or 1.
- **Stranger model:** `state.strangers` is an array of creature ids; "asleep" = removed from `strangers` and persisted into the area's `contents` (`100+id`).

## File Structure

```
packages/engine/src/
├── state.ts        # MODIFY: add optional `potionActive?: boolean` to PartyMember
├── actions.ts      # MODIFY: add `useArtifact` action + `artifactUsed` event
├── combat.ts       # MODIFY: frontStrength adds +2 when potionActive
├── reduce.ts       # MODIFY: `useArtifact` dispatch (4 effects) + clear potionActive when a fight ends
└── selectors.ts    # MODIFY: legalActions enumerates usable artifacts per phase
```

---

## Task 1: The `useArtifact` action and the four effects

**Files:** Modify `state.ts` (add `potionActive?`), `actions.ts` (action + event), `combat.ts` (frontStrength boost), `reduce.ts` (dispatch + fight-end cleanup); Test `packages/engine/src/artifacts.test.ts`.

- [ ] **Step 1: Add `potionActive?: boolean` to `PartyMember` in `state.ts`** (after `treasure`):
```ts
  potionActive?: boolean; // Strength Potion drunk this fight (+2 frontStrength until it ends)
```

- [ ] **Step 2: Add the action + event to `actions.ts`.** Add to the `GameAction` union:
```ts
  | { type: "useArtifact"; artifact: number; target?: number }
```
Add to the `GameEvent` union:
```ts
  | { type: "artifactUsed"; artifact: number }
```

- [ ] **Step 3: Make `frontStrength` honour the potion in `combat.ts`.** In `frontStrength`, change the return so the potion adds +2. Replace the function body's final return path — specifically, after the Magic Sword bonus block and before `return s;`, add:
```ts
  if (member.potionActive) s += 2; // Strength Potion, for the duration of the fight (§9.3/§16)
```
(so the function reads: `let s = c.fs + member.dragonKills; <sword bonus block>; if (member.potionActive) s += 2; return s;`)

- [ ] **Step 4: Write the failing test `packages/engine/src/artifacts.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { frontStrength } from "./combat";
import { makeState } from "./testkit";
import { packCoord } from "./coords";

const member = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

describe("useArtifact — Strength Potion (§9.3)", () => {
  it("boosts a Man/Woman/Hero by +2 for the fight and is consumed", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [member(0, [8])] });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 8, target: 0 });
    expect(state.party[0]!.potionActive).toBe(true);
    expect(state.party[0]!.treasure).toEqual([]); // consumed
    expect(frontStrength(state.party[0]!)).toBe(7); // Hero 5 + 2
    expect(events).toContainEqual({ type: "artifactUsed", artifact: 8 });
  });
  it("is rejected outside a fight", () => {
    const s = makeState({ phase: "explore", party: [member(0, [8])] });
    expect(reduce(s, { type: "useArtifact", artifact: 8, target: 0 }).events).toContainEqual({ type: "blocked" });
  });
});

describe("useArtifact — Healing Balm (§16)", () => {
  it("a Woman/Priest/Wizard revives a dead member and consumes the balm", () => {
    const s = makeState({ phase: "explore", areas: [area], party: [member(4, [6]), member(5, [], 3)] }); // Priest with balm + dead Man
    const { state } = reduce(s, { type: "useArtifact", artifact: 6, target: 1 });
    expect(state.party[1]!.status).toBe(0); // revived
    expect(state.party[0]!.treasure).toEqual([]); // consumed
  });
  it("is rejected when the bearer is not a Woman/Priest/Wizard", () => {
    const s = makeState({ phase: "explore", areas: [area], party: [member(0, [6]), member(5, [], 3)] }); // Hero holds balm
    expect(reduce(s, { type: "useArtifact", artifact: 6, target: 1 }).events).toContainEqual({ type: "blocked" });
  });
});

describe("useArtifact — Magic Staff reanimation (§16)", () => {
  it("a Wizard restores a stoned member and the staff is NOT consumed", () => {
    const s = makeState({ phase: "explore", areas: [area], party: [member(8, [9]), member(5, [], 2)] }); // Wizard with staff + stoned Man
    const { state } = reduce(s, { type: "useArtifact", artifact: 9, target: 1 });
    expect(state.party[1]!.status).toBe(0); // un-stoned
    expect(state.party[0]!.treasure).toEqual([9]); // staff kept (permanent)
  });
});

describe("useArtifact — Lotus Dust (§16)", () => {
  it("sleeps a stranger (out of the encounter, persisted to the area) and is consumed", () => {
    const s = makeState({ phase: "encounter", areas: [area], strangers: [10, 3], party: [member(5, [5])] });
    const { state } = reduce(s, { type: "useArtifact", artifact: 5, target: 0 });
    expect(state.strangers).toEqual([3]); // Dragon removed
    expect(state.areas[0]!.contents).toContain(110); // Dragon asleep in the area
    expect(state.party[0]!.treasure).toEqual([]); // consumed
  });
});
```

- [ ] **Step 5:** Run, confirm FAIL (`useArtifact` not handled).

- [ ] **Step 6: Add the `useArtifact` dispatch + fight-end cleanup to `reduce.ts`.** Add this helper near `persistAndExplore`:
```ts
/** First living member who may bear+use `artifact` now (some artifacts need a specific creature). */
function findBearer(state: GameState, artifact: number): number {
  return state.party.findIndex((m) => {
    if (!(m.status === 0 || m.status === 1) || !m.treasure.includes(artifact)) return false;
    if (artifact === 6) return m.creatureId === 6 || m.creatureId === 4 || m.creatureId === 8; // Balm: Woman/Priest/Wizard
    if (artifact === 9) return m.creatureId === 8; // Staff reanimation: Wizard
    return true;
  });
}
```
Add this `case` to the `reduce` switch:
```ts
    case "useArtifact": {
      const bearerIdx = findBearer(state, action.artifact);
      if (bearerIdx < 0) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const bearer = next.party[bearerIdx]!;
      const consume = () => {
        const i = bearer.treasure.indexOf(action.artifact);
        if (i >= 0) bearer.treasure.splice(i, 1);
      };
      const ok: { state: GameState; events: GameEvent[] } = { state: next, events: [{ type: "artifactUsed", artifact: action.artifact }] };

      switch (action.artifact) {
        case 8: { // Strength Potion — fight only, target a living Man/Woman/Hero
          if (next.phase !== "fight" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const tm = next.party[action.target];
          const boostable = tm && (tm.status === 0 || tm.status === 1) && [0, 1, 5, 6].includes(tm.creatureId);
          if (!boostable) return { state, events: [{ type: "blocked" }] };
          tm.potionActive = true;
          consume();
          return ok;
        }
        case 6: { // Healing Balm — explore only, target a dead member
          if (next.phase !== "explore" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const dm = next.party[action.target];
          if (!dm || dm.status !== 3) return { state, events: [{ type: "blocked" }] };
          dm.status = 0;
          consume();
          return ok;
        }
        case 9: { // Magic Staff reanimation — explore only, target a stoned member; NOT consumed
          if (next.phase !== "explore" || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          const sm = next.party[action.target];
          if (!sm || sm.status !== 2) return { state, events: [{ type: "blocked" }] };
          sm.status = 0;
          return ok;
        }
        case 5: { // Lotus Dust — encounter or fight, target a stranger (put to sleep)
          if ((next.phase !== "encounter" && next.phase !== "fight") || action.target === undefined) return { state, events: [{ type: "blocked" }] };
          if (action.target < 0 || action.target >= next.strangers.length) return { state, events: [{ type: "blocked" }] };
          const sid = next.strangers[action.target]!;
          next.areas[next.partyArea]!.contents.push(100 + sid);
          next.strangers.splice(action.target, 1);
          consume();
          if (next.strangers.length === 0) { // no one left to face
            next.fight = null;
            if (next.treasures.length > 0) next.phase = "pickup";
            else persistAndExplore(next);
          }
          return ok;
        }
        default:
          return { state, events: [{ type: "blocked" }] };
      }
    }
```
- [ ] **Step 7: Clear `potionActive` whenever a fight ends.** In `reduce.ts`, in the `fightOn` case both terminal branches (party-wipe → GS_DEAD, and strangers-wiped → fightWon) and in the `retreat` case, after setting `next.fight = null`, add:
```ts
      next.party.forEach((m) => { m.potionActive = false; });
```
(Three edit sites: the two `next.fight = null` lines in `fightOn`, and the one in `retreat`.)

- [ ] **Step 8:** Run `pnpm --filter @sorcerers-cave/engine test && … typecheck`. Expected: PASS — the artifact tests and all prior tests green.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/state.ts packages/engine/src/actions.ts packages/engine/src/combat.ts packages/engine/src/reduce.ts packages/engine/src/artifacts.test.ts
git commit -m "feat(engine): active artifacts — potion/balm/staff/lotus via useArtifact (spec §16)"
```

---

## Task 2: Surface usable artifacts in `legalActions`

**Files:** Modify `packages/engine/src/selectors.ts`; Test `packages/engine/src/selectors.test.ts` (extend).

So the UI can render "use item" controls, `legalActions` must include a `useArtifact` entry for each currently-valid (artifact, target) combination.

- [ ] **Step 1: Add an artifact-options helper + calls in `selectors.ts`.** Add this helper above `legalActions` (it reads the same `GameState`/`GameAction` already imported; ensure `CREATURES` is not needed — creature-id checks use literals):
```ts
function living(state: GameState) {
  return state.party.map((m, idx) => ({ m, idx })).filter(({ m }) => m.status === 0 || m.status === 1);
}

/** `useArtifact` actions available in the given phase (so the UI can show "use item" controls). */
function artifactActions(state: GameState): GameAction[] {
  const has = (artifact: number, ok: (creatureId: number) => boolean) =>
    living(state).some(({ m }) => m.treasure.includes(artifact) && ok(m.creatureId));
  const actions: GameAction[] = [];

  if (state.phase === "fight") {
    if (has(8, () => true)) { // Strength Potion -> each boostable living member
      living(state).forEach(({ m, idx }) => {
        if ([0, 1, 5, 6].includes(m.creatureId)) actions.push({ type: "useArtifact", artifact: 8, target: idx });
      });
    }
  }
  if (state.phase === "fight" || state.phase === "encounter") {
    if (has(5, () => true)) { // Lotus Dust -> each stranger
      for (let i = 0; i < state.strangers.length; i++) actions.push({ type: "useArtifact", artifact: 5, target: i });
    }
  }
  if (state.phase === "explore") {
    if (has(6, (id) => id === 6 || id === 4 || id === 8)) { // Healing Balm -> each dead member
      state.party.forEach((m, idx) => { if (m.status === 3) actions.push({ type: "useArtifact", artifact: 6, target: idx }); });
    }
    if (has(9, (id) => id === 8)) { // Magic Staff -> each stoned member
      state.party.forEach((m, idx) => { if (m.status === 2) actions.push({ type: "useArtifact", artifact: 9, target: idx }); });
    }
  }
  return actions;
}
```

- [ ] **Step 2: Call `artifactActions` from each relevant `legalActions` phase branch.** In `legalActions`, append `...artifactActions(state)` to the action list returned for the `explore`, `encounter`, and `fight` branches (before the trailing `quit`). Concretely, in each of those three branches build the array, then `actions.push(...artifactActions(state))` just before `actions.push({ type: "quit" })` (and `return actions`). For the explore branch (which currently builds `actions` then pushes quit), insert the spread before the quit push.

- [ ] **Step 3: Append tests to `selectors.test.ts`**

```ts
import { packCoord } from "./coords";

describe("legalActions — usable artifacts (E-1)", () => {
  const M = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status: status as 0 | 1 | 2 | 3, dragonKills: 0, treasure });
  const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };

  it("offers Strength Potion on a boostable member during a fight", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [10], party: [M(0, [8])] });
    expect(legalActions(s)).toContainEqual({ type: "useArtifact", artifact: 8, target: 0 });
  });

  it("offers Lotus Dust per stranger in an encounter", () => {
    const s = makeState({ phase: "encounter", areas: [A], strangers: [10, 3], party: [M(5, [5])] });
    const acts = legalActions(s);
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 5, target: 0 });
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 5, target: 1 });
  });

  it("offers Healing Balm (Priest) and Magic Staff (Wizard) on downed members while exploring", () => {
    const s = makeState({ phase: "explore", areas: [A], party: [M(4, [6]), M(8, [9]), M(5, [], 3), M(2, [], 2)] });
    const acts = legalActions(s);
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 6, target: 2 }); // revive the dead Man
    expect(acts).toContainEqual({ type: "useArtifact", artifact: 9, target: 3 }); // un-stone the Ogre
  });

  it("does not offer artifacts that no living bearer holds", () => {
    const s = makeState({ phase: "explore", areas: [A], party: [M(0)] });
    expect(legalActions(s).some((a) => a.type === "useArtifact")).toBe(false);
  });
});
```

- [ ] **Step 4:** Run the full engine suite `pnpm --filter @sorcerers-cave/engine test && … typecheck`. Expected: PASS — all prior + new tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/selectors.ts packages/engine/src/selectors.test.ts
git commit -m "feat(engine): surface usable artifacts in legalActions (E-1)"
```

---

## Definition of Done (Milestone E-1)

- [ ] `pnpm --filter @sorcerers-cave/engine test` green; `typecheck` clean; `pnpm test` (all packages) green.
- [ ] `useArtifact` applies each of the four artifacts in its valid phase with correct bearer/target rules, consuming all but the permanent Magic Staff, and is rejected (`blocked`) otherwise.
- [ ] Strength Potion grants +2 `frontStrength` to a Man/Woman/Hero for the duration of the fight, cleared when combat ends.
- [ ] `legalActions` enumerates the usable `useArtifact` actions per phase so the UI can render "use item" controls.

---

## Self-Review

**Spec coverage (§16 active artifacts):**
- Strength Potion (+2 Man/Woman/Hero, one use, in a fight) → Task 1 (effect, frontStrength, cleanup). ✓
- Healing Balm (Woman/Priest/Wizard revives a downed member, one use, fight-free turn) → Task 1. ✓
- Magic Staff reanimation (Wizard un-stones a member, permanent) → Task 1. ✓
- Lotus Dust (sleep a stranger; one use) → Task 1. ✓
- Surfacing for the UI → Task 2. ✓

**Deliberate simplifications (named, not silently dropped):** Healing Balm revives any chosen dead member to status `original` (the spec's "the last creature just killed, restoring its prior status" is approximated — we don't track prior ally/original or a per-turn last-kill). Lotus Dust's "asleep for 2 of the player's turns, then wakes" is collapsed to "set aside in the area (persisted), out of this encounter" (the same simplification the engine uses for the Charmed Flute viper case); it does not interact with Medusa here. Strength Potion applies +2 to the targeted creature regardless of whether other creatures are eligible (validated to Man/Woman/Hero at use). These remain refinement points for a later pass.

**Placeholder scan:** none. No probabilistic tests (these artifacts roll no dice).

**Type consistency:** the `useArtifact` action `{artifact, target?}` and `artifactUsed` event are declared in `actions.ts` (Task 1) before use in `reduce.ts`/`selectors.ts`. `PartyMember.potionActive?` is set in `reduce.ts`, read in `combat.ts` (`frontStrength`) and cleared in `reduce.ts` fight-end sites. `findBearer`/`artifactActions` operate on the same `GameState`/`GameAction` types. Treasure ids (5/6/8/9) and creature ids (0/1/4/5/6/8) are consistent between `reduce.ts` and `selectors.ts`.

**Determinism:** no randomness in any of the four effects; no `Math.random`/`Date.now`.

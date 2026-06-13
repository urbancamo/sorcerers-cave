# Milestone E-4 — Movement & Utility Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two movement/utility artifacts in the pure engine — the Magic Carpet (teleport) and the Charmed Flute (dragon-sleep + secret-door discovery).

**Architecture:** Both are `useArtifact` actions. The Magic Carpet adds a `carpetMove` helper in `reduce.ts` (a door-ignoring teleport) and a `useArtifact` case 4 that teleports then calls the existing `resolveArea`. The Charmed Flute adds a `useArtifact` case 12 with two branches: dragon-sleep (mirrors the Lotus-Dust pattern) when no `dir` is given, and secret-door reveal (sets a stair bit on the current card) when `dir` is UP/DOWN. `selectors.ts` surfaces all three so the interactive contract stays complete.

**Tech Stack:** TypeScript, Vitest, the existing deterministic reducer engine (`packages/engine`).

---

## Design decisions (read before implementing)

1. **Card bit layout** (from `decode.ts`): N=1, E=2, S=4, W=8, chamber=16, **stairUp=32**, **stairDown=64**, special=bits 7–9. Directions (`coords.ts`): `DIR_N=1, DIR_E=2, DIR_S=3, DIR_W=4, DIR_UP=5, DIR_DOWN=6`. `targetCoord(dir,level,x,y)` and `packCoord/unpackCoord` already exist.

2. **Magic Carpet (treasure id 4)** — commanded by a Priest (creatureId 4) or Wizard (id 8). Teleports the party one step N/E/S/W or one level up/down, **ignoring doors/exits**, landing on the adjacent area (drawing+placing a new face-up card if that coordinate is unexplored). "Good only once" → **consumed** on use. Explore phase only ("cannot be used to retreat"). "Will not take you out of the cave" → **UP is blocked on level 1**. After landing, the normal `resolveArea` runs (chamber draw / hazards / encounter). Landing on the Viper Pit or Deep Pool is just *entering* a special (resolveArea treats specials as entered, not crossed), so the party arrives safely — no code needed, matches "ends up on the island".
   - **Deferred (documented):** the rule "if the party encounters strangers it may not withdraw" after a carpet landing is NOT enforced (would need a transient no-withdraw flag); the player may still withdraw. Minor nuance.

3. **Charmed Flute (treasure id 12)** — played by a Hero (0), Priest (4), Man (5), Woman (6), or Wizard (8). **Not consumed.** Two abilities:
   - **Lull Dragons** (encounter or fight phase): all Dragons (creature id 10) are put to sleep — removed from `strangers` and pushed into the area's `contents` as `100+10` (they persist, asleep, like a Lotus-Dust sleep but the Flute is reusable). Requires at least one Dragon present (else `blocked`). If `strangers` becomes empty, resolve like the other sleep paths (clear `fight`, clear `potionActive`, go to pickup if treasures else `persistAndExplore`).
     - **Deferred (documented):** Vipers are a special-area *crossing* (viperCrossing in `special.ts`), not creatures in `strangers`, so flute-lulling of vipers is not implemented. "Sleeping creatures protected by a curse" is not applicable in our model — a lulled Dragon leaves the encounter and is never slain while asleep.
   - **Reveal a secret door** (explore phase only — "a creature involved in a fight cannot use the flute to find a secret door to retreat by"): when an adjacent-level area exists with a matching reverse stair (the area directly **below** has `stairUp`, or the area directly **above** has `stairDown`) and the current card lacks the corresponding stair bit, the Flute reveals it by **setting the stair bit on the current card** (`|64` for DOWN, `|32` for UP). The player then uses a normal `move`. Requires the target area to already be played (matches "as long as the stairway it leads to is visible among the area cards that have been played").

4. **No new player actions** beyond `useArtifact` — the action type gains an optional `dir?: number` field (used by the Carpet and the Flute secret-door). `selectors.ts` surfaces every legal `useArtifact` so `reduce` and `legalActions` stay consistent.

---

## File structure

- **Modify** `packages/engine/src/actions.ts` — add `dir?: number` to the `useArtifact` action; add 3 events.
- **Modify** `packages/engine/src/reduce.ts` — extend `findBearer` (ids 4, 12); add `carpetMove` helper; add `useArtifact` cases 4 and 12; add `DIR_UP/DIR_DOWN/targetCoord` imports.
- **Modify** `packages/engine/src/selectors.ts` — surface Carpet, Flute-sleep, Flute-secret-door actions; add `unpackCoord/packCoord` imports.
- **Create** `packages/engine/src/carpet.test.ts` — Magic Carpet tests.
- **Create** `packages/engine/src/flute.test.ts` — Charmed Flute tests (sleep + secret door).

---

### Task 1: Magic Carpet — teleport

**Files:**
- Modify: `packages/engine/src/actions.ts`
- Modify: `packages/engine/src/reduce.ts`
- Modify: `packages/engine/src/selectors.ts`
- Create: `packages/engine/src/carpet.test.ts`

- [ ] **Step 1: Add the `dir?` action field and the `carpetUsed` event**

In `packages/engine/src/actions.ts`:

Change the `useArtifact` action line:

```typescript
  | { type: "useArtifact"; artifact: number; target?: number }
```

to:

```typescript
  | { type: "useArtifact"; artifact: number; target?: number; dir?: number }
```

Add to the `GameEvent` union (after the last member, fixing the trailing `;`):

```typescript
  | { type: "carpetUsed"; dir: number };
```

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/src/carpet.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord, DIR_E, DIR_UP } from "./coords";

const wizardWithCarpet = () => ({ creatureId: 8, status: 0 as const, dragonKills: 0, treasure: [4] });

// A plain N+E+S+W corridor (no chamber) so resolveArea just returns to explore.
const CORRIDOR = 15;

describe("Magic Carpet (treasure id 4, § Magic Carpet)", () => {
  it("teleports to an existing adjacent area ignoring doors, and is consumed", () => {
    const s = makeState({
      party: [wizardWithCarpet()],
      areas: [
        { card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: CORRIDOR, coord: packCoord(1, 51, 50), faceUp: false, visited: false, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
      level: 1,
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(state.partyArea).toBe(1); // moved east despite no door requirement
    expect(state.party[0]!.treasure).toEqual([]); // carpet consumed
    expect(events).toContainEqual({ type: "carpetUsed", dir: DIR_E });
  });

  it("places a new area card when teleporting to unexplored space", () => {
    const s = makeState({
      party: [wizardWithCarpet()],
      areas: [{ card: CORRIDOR, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
      largePack: [CORRIDOR],
      largeIdx: 0,
      partyArea: 0,
      level: 1,
    });
    const { state } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(state.areas.length).toBe(2);
    expect(state.partyArea).toBe(1);
    expect(state.areas[1]!.faceUp).toBe(true);
  });

  it("will not carry the party out of the cave (UP blocked on level 1)", () => {
    const s = makeState({ party: [wizardWithCarpet()], level: 1 });
    const { events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_UP });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("cannot be used to retreat (blocked outside explore)", () => {
    const s = makeState({ party: [wizardWithCarpet()], phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [5] });
    const { events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("only a Priest or Wizard may command it", () => {
    const s = makeState({ party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [4] }] }); // Hero
    const { events } = reduce(s, { type: "useArtifact", artifact: 4, dir: DIR_E });
    expect(events).toEqual([{ type: "blocked" }]); // no valid bearer
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test carpet`
Expected: FAIL (no carpet handling; `dir` unsupported).

- [ ] **Step 4: Implement the Carpet in `reduce.ts`**

Add `DIR_UP, DIR_DOWN, targetCoord` to the existing `coords` import:

```typescript
import { unpackCoord, packCoord, targetCoord, DIR_UP, DIR_DOWN } from "./coords";
```

Extend `findBearer` — add these lines before its final `return true;`:

```typescript
    if (artifact === 4) return m.creatureId === 4 || m.creatureId === 8; // Magic Carpet: Priest/Wizard
    if (artifact === 12) return m.creatureId === 0 || m.creatureId === 4 || m.creatureId === 5 || m.creatureId === 6 || m.creatureId === 8; // Charmed Flute: Hero/Priest/Man/Woman/Wizard
```

Add the `carpetMove` helper (place it after `relocateDown`):

```typescript
/** Teleport the party one step in `dir`, ignoring doors; place a new face-up card if the target is unexplored. */
function carpetMove(state: GameState, dir: number): void {
  const current = state.areas[state.partyArea]!;
  const { level, x, y } = unpackCoord(current.coord);
  const target = targetCoord(dir, level, x, y);
  const targetLevel = unpackCoord(target).level;
  let idx = state.areas.findIndex((a) => a.coord === target);
  if (idx < 0) {
    let drawn = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! : 31;
    if (dir === DIR_DOWN) drawn |= 32; // mirror a stair-up so the party can climb back
    if (dir === DIR_UP) drawn |= 64; // mirror a stair-down so the party can descend back
    if (targetLevel === 1) drawn &= ~32; // only the Gateway exits level 1
    state.areas.push({ card: drawn, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    idx = state.areas.length - 1;
  } else {
    state.areas[idx]!.faceUp = true;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = targetLevel;
}
```

In the `useArtifact` switch, add a `case 4` (before `default:`):

```typescript
        case 4: { // Magic Carpet — explore only; teleport ignoring doors, then resolve the new area
          if (next.phase !== "explore" || action.dir === undefined) return { state, events: [{ type: "blocked" }] };
          const d = action.dir;
          const valid = d === 1 || d === 2 || d === 3 || d === 4 || d === DIR_DOWN || (d === DIR_UP && next.level > 1);
          if (!valid) return { state, events: [{ type: "blocked" }] }; // won't take you out of the cave
          consume();
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 4 }, { type: "carpetUsed", dir: d }];
          carpetMove(next, d);
          events.push(...resolveArea(next));
          return { state: next, events };
        }
```

(Direction values 1–4 are N/E/S/W from `coords.ts`; written as literals here to avoid importing the lateral DIR constants.)

- [ ] **Step 5: Surface the Carpet in `selectors.ts`**

In `artifactActions`, inside the `if (state.phase === "explore")` block (after the Magic Staff entry), add:

```typescript
    if (has(4, (id) => id === 4 || id === 8)) { // Magic Carpet -> teleport in each available direction
      for (const dir of [DIR_N, DIR_E, DIR_S, DIR_W, DIR_DOWN]) actions.push({ type: "useArtifact", artifact: 4, dir });
      if (state.level > 1) actions.push({ type: "useArtifact", artifact: 4, dir: DIR_UP });
    }
```

(`DIR_N…DIR_DOWN` are already imported in `selectors.ts`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test carpet`
Expected: PASS.

- [ ] **Step 7: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/selectors.ts packages/engine/src/carpet.test.ts
git commit -m "feat(engine): Magic Carpet teleport, commanded by Priest/Wizard (§ Magic Carpet)"
```

---

### Task 2: Charmed Flute — lull Dragons to sleep

**Files:**
- Modify: `packages/engine/src/actions.ts` (add `dragonsLulled` event)
- Modify: `packages/engine/src/reduce.ts` (`useArtifact` case 12, sleep branch)
- Modify: `packages/engine/src/selectors.ts` (surface flute-sleep)
- Create: `packages/engine/src/flute.test.ts`

`findBearer` already handles id 12 (added in Task 1).

- [ ] **Step 1: Add the `dragonsLulled` event**

In `actions.ts`, add to the `GameEvent` union:

```typescript
  | { type: "dragonsLulled"; count: number };
```

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/src/flute.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";

const heroWithFlute = () => ({ creatureId: 0, status: 0 as const, dragonKills: 0, treasure: [12] });

describe("Charmed Flute — lull Dragons (§ Charmed Flute)", () => {
  it("puts a Dragon to sleep in an encounter, keeping the Flute", () => {
    const s = makeState({
      phase: "encounter",
      party: [heroWithFlute()],
      strangers: [10, 5], // Dragon + Man
      areas: [{ card: 31, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(state.strangers).toEqual([5]); // Dragon removed
    expect(state.areas[state.partyArea]!.contents).toContain(110); // asleep in the area (100 + 10)
    expect(state.party[0]!.treasure).toEqual([12]); // NOT consumed
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
    expect(state.phase).toBe("encounter"); // strangers remain -> stay to deal with them
  });

  it("resolves the encounter when the Dragon was the only stranger", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      party: [heroWithFlute()],
      strangers: [10],
      areas: [{ card: 31, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(state.strangers).toEqual([]);
    expect(state.fight).toBeNull();
    expect(state.phase).toBe("explore");
    expect(events).toContainEqual({ type: "dragonsLulled", count: 1 });
  });

  it("is blocked when no Dragon is present", () => {
    const s = makeState({ phase: "encounter", party: [heroWithFlute()], strangers: [5] });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("is blocked for a creature that cannot play it", () => {
    const s = makeState({ phase: "encounter", party: [{ creatureId: 2, status: 0, dragonKills: 0, treasure: [12] }], strangers: [10] }); // Ogre
    const { events } = reduce(s, { type: "useArtifact", artifact: 12 });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test flute`
Expected: FAIL (no case 12).

- [ ] **Step 4: Implement the sleep branch in `reduce.ts`**

In the `useArtifact` switch, add a `case 12` (before `default:`). For this task implement ONLY the sleep branch (the `dir` secret-door branch is added in Task 3 — leave a clear spot for it):

```typescript
        case 12: { // Charmed Flute — lull Dragons (encounter/fight). Secret-door branch (with dir) added in Task 3.
          if (next.phase !== "encounter" && next.phase !== "fight") return { state, events: [{ type: "blocked" }] };
          if (!next.strangers.includes(10)) return { state, events: [{ type: "blocked" }] };
          let count = 0;
          for (let i = next.strangers.length - 1; i >= 0; i--) {
            if (next.strangers[i] === 10) { next.areas[next.partyArea]!.contents.push(110); next.strangers.splice(i, 1); count += 1; }
          }
          const events: GameEvent[] = [{ type: "artifactUsed", artifact: 12 }, { type: "dragonsLulled", count }];
          if (next.strangers.length === 0) { // nothing left to face
            next.fight = null;
            next.party.forEach((m) => { m.potionActive = false; });
            if (next.treasures.length > 0) next.phase = "pickup";
            else persistAndExplore(next);
          }
          return { state: next, events };
        }
```

- [ ] **Step 5: Surface flute-sleep in `selectors.ts`**

In `artifactActions`, inside the `if (state.phase === "fight" || state.phase === "encounter")` block (after the Lotus Dust entry), add:

```typescript
    if (state.strangers.includes(10) && has(12, (id) => id === 0 || id === 4 || id === 5 || id === 6 || id === 8)) {
      actions.push({ type: "useArtifact", artifact: 12 }); // Charmed Flute -> lull Dragons to sleep
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test flute`
Expected: PASS.

- [ ] **Step 7: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/selectors.ts packages/engine/src/flute.test.ts
git commit -m "feat(engine): Charmed Flute lulls Dragons to sleep (§ Charmed Flute)"
```

---

### Task 3: Charmed Flute — reveal secret doors

**Files:**
- Modify: `packages/engine/src/actions.ts` (add `secretDoorRevealed` event)
- Modify: `packages/engine/src/reduce.ts` (`useArtifact` case 12, add the `dir` branch)
- Modify: `packages/engine/src/selectors.ts` (surface flute-secret-door; add `unpackCoord/packCoord` imports)
- Modify: `packages/engine/src/flute.test.ts` (add cases)

- [ ] **Step 1: Add the `secretDoorRevealed` event**

In `actions.ts`, add to the `GameEvent` union:

```typescript
  | { type: "secretDoorRevealed"; dir: number };
```

- [ ] **Step 2: Write the failing tests**

Add to `flute.test.ts`:

```typescript
import { decodeArea } from "./decode";
import { packCoord, DIR_DOWN } from "./coords";

const priestWithFlute = () => ({ creatureId: 4, status: 0 as const, dragonKills: 0, treasure: [12] });
const PLAIN = 15; // N+E+S+W, no stairs
const STAIR_UP_CARD = 15 | 32; // a card showing a stair UP (bit 32)

describe("Charmed Flute — reveal secret doors (§ Secret Doors)", () => {
  it("reveals a concealed stair DOWN when the area below shows a matching stair up", () => {
    const s = makeState({
      phase: "explore",
      party: [priestWithFlute()],
      level: 1,
      partyArea: 0,
      areas: [
        { card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: STAIR_UP_CARD, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { state, events } = reduce(s, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(decodeArea(state.areas[0]!.card).stairDown).toBe(true); // secret door revealed
    expect(state.party[0]!.treasure).toEqual([12]); // NOT consumed
    expect(events).toContainEqual({ type: "secretDoorRevealed", dir: DIR_DOWN });
  });

  it("is blocked when no played area below has a matching stair", () => {
    const s = makeState({
      phase: "explore",
      party: [priestWithFlute()],
      level: 1,
      partyArea: 0,
      areas: [{ card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(events).toEqual([{ type: "blocked" }]);
  });

  it("cannot reveal a secret door during a fight", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      party: [priestWithFlute()],
      level: 1,
      partyArea: 0,
      strangers: [5],
      areas: [
        { card: PLAIN, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
        { card: STAIR_UP_CARD, coord: packCoord(2, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
    });
    const { events } = reduce(s, { type: "useArtifact", artifact: 12, dir: DIR_DOWN });
    expect(events).toEqual([{ type: "blocked" }]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test flute`
Expected: FAIL (the `dir` branch is not yet handled — case 12 ignores `dir` and tries to lull dragons, hitting "no dragon → blocked" but the secret-door assertions fail).

- [ ] **Step 4: Add the secret-door branch to `case 12` in `reduce.ts`**

At the TOP of `case 12` (before the existing sleep code), insert the `dir` branch:

```typescript
        case 12: { // Charmed Flute — secret door (explore, with dir) or lull Dragons (encounter/fight)
          if (action.dir !== undefined) { // reveal a concealed stairway (not while fighting)
            if (next.phase !== "explore" || (action.dir !== DIR_UP && action.dir !== DIR_DOWN)) return { state, events: [{ type: "blocked" }] };
            const cur = next.areas[next.partyArea]!;
            const { level, x, y } = unpackCoord(cur.coord);
            const dec = decodeArea(cur.card);
            if (action.dir === DIR_DOWN) {
              if (dec.stairDown) return { state, events: [{ type: "blocked" }] }; // already a visible stair
              const below = next.areas.find((a) => a.coord === packCoord(level + 1, x, y));
              if (!below || !decodeArea(below.card).stairUp) return { state, events: [{ type: "blocked" }] };
              cur.card |= 64; // reveal stair DOWN
            } else {
              if (dec.stairUp) return { state, events: [{ type: "blocked" }] };
              const above = next.areas.find((a) => a.coord === packCoord(level - 1, x, y));
              if (!above || !decodeArea(above.card).stairDown) return { state, events: [{ type: "blocked" }] };
              cur.card |= 32; // reveal stair UP
            }
            return { state: next, events: [{ type: "artifactUsed", artifact: 12 }, { type: "secretDoorRevealed", dir: action.dir }] };
          }
          // ...existing sleep branch from Task 2 follows unchanged...
```

(`decodeArea` is already imported in `reduce.ts`; `DIR_UP`, `DIR_DOWN`, `unpackCoord`, `packCoord` are imported as of Task 1.)

- [ ] **Step 5: Surface flute-secret-door in `selectors.ts`**

Add `unpackCoord, packCoord` to the `coords` import in `selectors.ts`:

```typescript
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, unpackCoord, packCoord } from "./coords";
```

In `artifactActions`, inside the `if (state.phase === "explore")` block (after the Magic Carpet entry), add:

```typescript
    if (has(12, (id) => id === 0 || id === 4 || id === 5 || id === 6 || id === 8)) { // Charmed Flute -> reveal a secret door
      const cur = state.areas[state.partyArea]!;
      const { level, x, y } = unpackCoord(cur.coord);
      const dec = decodeArea(cur.card);
      const below = state.areas.find((a) => a.coord === packCoord(level + 1, x, y));
      if (!dec.stairDown && below && decodeArea(below.card).stairUp) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_DOWN });
      const above = state.areas.find((a) => a.coord === packCoord(level - 1, x, y));
      if (!dec.stairUp && above && decodeArea(above.card).stairDown) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_UP });
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test flute`
Expected: PASS.

- [ ] **Step 7: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/selectors.ts packages/engine/src/flute.test.ts
git commit -m "feat(engine): Charmed Flute reveals concealed stairways (§ Secret Doors)"
```

---

## Definition of Done

- [ ] `useArtifact` action carries an optional `dir`; 3 events added (`carpetUsed`, `dragonsLulled`, `secretDoorRevealed`).
- [ ] Magic Carpet: a Priest/Wizard teleports the party one step (door-ignoring) or one level, drawing a new card if unexplored; consumed; UP blocked on level 1; explore-only; `resolveArea` runs on arrival.
- [ ] Charmed Flute lull: a Hero/Priest/Man/Woman/Wizard sleeps all Dragons in an encounter/fight (kept, reusable); resolves the area if no strangers remain.
- [ ] Charmed Flute secret door: reveals a concealed stair (sets the stair bit) when the adjacent-level area has the reverse stair and the current card lacks it; explore-only; never during a fight.
- [ ] `legalActions` surfaces all three (consistent with `reduce`); full engine suite green; typecheck clean across all packages; determinism preserved (no `Math.random`/`Date.now`).
- [ ] Deferred nuances (carpet no-withdraw; flute viper-lulling) are documented in code comments.

# Fight Overhaul — Phase 3 (Treasure, retreat & legacy cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish §FIGHTS fidelity — hand-to-hand fighters drop heavy treasure onto the area for the
duration (reclaimed on a win, left behind on retreat, including artefacts on the slain) — then retire the
now-unused legacy auto-combat path (`combat.ts resolveRound`, the `fightOn` and `focusTarget` actions).

**Architecture:** Two engine behaviours added to the Phase-1 planned resolver: (1) in `resolvePlannedRound`
each front member's heavy treasure (Silver/Gold/Gems/Chest) moves to `area.contents` before the round
resolves; (2) `finalizeRound` reclaims that floor treasure into the pickup on a win, and the `retreat`
case additionally leaves perished members' carried treasure behind. Then the legacy auto resolver and its
actions are deleted (the UI has used `resolveRound` since Phase 2); the exported strength helpers
(`frontStrength`/`casterMP`/`partyRollBonus`/`isCaster`) stay.

**Tech Stack:** TypeScript engine, Vitest. Engine consumed from TS source.

**Design spec:** `docs/superpowers/specs/2026-06-18-fight-overhaul-design.md` (§"Heavy treasure on
fighting", §"Between rounds", phasing). Rules: `docs/specs/sorcerers-cave-rules.md` §387, §405, §422, §426.

---

## Conventions for every task

- Engine tests: `pnpm --filter @sorcerers-cave/engine exec vitest run <file>`.
- Typecheck: `pnpm -r typecheck`. Branch `fight-phase3`; merge in the final task. Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File structure

- **Modify** `packages/engine/src/combatPlan.ts` — drop front members' heavy treasure to the floor; export `autoPlan` is **not** needed (full removal of the legacy path).
- **Modify** `packages/engine/src/reduce.ts` — `finalizeRound` reclaims floor treasure on a win; `retreat` leaves perished members' treasure; remove the `fightOn` / `focusTarget` cases.
- **Modify** `packages/engine/src/selectors.ts` — drop the `fightOn` / `focusTarget` offerings from the fight branch.
- **Modify** `packages/engine/src/actions.ts` — remove the `fightOn` / `focusTarget` actions.
- **Modify** `packages/engine/src/combat.ts` — delete the legacy `resolveRound` + its private helpers.
- **Modify** `packages/engine/src/multi.ts` — `turnEnds` no longer references `fightOn`.
- **Modify** `apps/web/src/game/EncounterPanel.tsx` — remove the dead `fightOn` / `focusTarget` labels.
- **Delete** `packages/engine/src/combat-round.test.ts` (tested the deleted resolver; coverage moves to `combatPlan.test.ts`).
- **Modify** `packages/engine/src/combatPlan.test.ts`, `reduce.test.ts`, `multi.test.ts`, `wards.test.ts` — new behaviour tests + convert `fightOn` usages to `resolveRound`.

---

### Task 1: Hand-to-hand fighters drop heavy treasure to the floor

**Files:** Modify `packages/engine/src/combatPlan.ts` and `packages/engine/src/combatPlan.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/src/combatPlan.test.ts`:

```ts
describe("resolvePlannedRound — heavy treasure (§387)", () => {
  it("a front fighter drops heavy treasure onto the area floor; artefacts are kept", () => {
    const s = clone(fightS({
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [1, 7] }], // Giant carrying Gold + Talisman
      strangers: [3], seed: 5,
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    }));
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(s.party[0]!.treasure).toEqual([7]);             // Talisman (artefact) kept
    expect(s.areas[0]!.contents).toContain(200 + 1);       // Gold dropped to the floor
  });

  it("a background caster keeps its heavy treasure (it is not fighting hand-to-hand)", () => {
    const s = clone(fightS({
      party: [
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [] },      // Man (front)
        { creatureId: 4, status: 0, dragonKills: 0, treasure: [1] },     // Priest (background) carrying Gold
      ],
      strangers: [3], seed: 5,
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    }));
    resolvePlannedRound(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] });
    expect(s.party[1]!.treasure).toEqual([1]);             // Priest kept its Gold (background)
    expect(s.areas[0]!.contents).not.toContain(200 + 1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts` → FAIL (no drop yet).

- [ ] **Step 3: Implement the drop in `resolvePlannedRound`**

Add the `TREASURES` import at the top of `combatPlan.ts`:

```ts
import { TREASURES } from "./data/treasures";
```

Then, immediately after the working-copy line `const matches = plan.matches.map(...)` (step 1 of the
function), insert:

```ts
  // §387: members fighting hand-to-hand drop heavy treasure onto the area floor for the duration — kept
  // off them so it is not lost if they fall (reclaimed into the pickup on a win, left behind on retreat).
  const area = state.areas[state.partyArea]!;
  for (const mt of matches) {
    for (const i of mt.front) {
      const m = state.party[i]!;
      const heavy = m.treasure.filter((t) => TREASURES[t]!.kind === "heavy");
      if (heavy.length) {
        area.contents.push(...heavy.map((t) => 200 + t));
        m.treasure = m.treasure.filter((t) => TREASURES[t]!.kind !== "heavy");
      }
    }
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b fight-phase3
git add packages/engine/src/combatPlan.ts packages/engine/src/combatPlan.test.ts
git commit -m "Fight: hand-to-hand fighters drop heavy treasure to the floor (§387)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reclaim dropped treasure on a win

When the fight is won, treasure on the floor (what was dropped to fight) joins the pickup, so the party
can take it back. On a wipe it stays on the floor; on retreat (Task 3) it is left behind.

**Files:** Modify `packages/engine/src/reduce.ts` and `packages/engine/src/reduce.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe` in `packages/engine/src/reduce.test.ts`:

```ts
  it("resolveRound: winning reclaims floor-dropped treasure into the pickup", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, seed: 5,
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [1] }], strangers: [7], // Giant w/ Gold vs Dwarf
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(state.phase).toBe("pickup");          // there is treasure to reclaim → pickup, not straight to explore
    expect(state.treasures).toContain(1);        // the dropped Gold is reclaimable
    expect(state.areas[0]!.contents).not.toContain(200 + 1);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run reduce.test.ts` → FAIL (phase is `explore`, Gold
left on the floor).

- [ ] **Step 3: Reclaim in `finalizeRound`**

In `reduce.ts`, replace the win branch of `finalizeRound`:

```ts
  } else if (state.strangers.length === 0) {
    // The party won: reclaim treasure dropped onto the floor to fight so it joins the pickup (§387).
    const area = state.areas[state.partyArea]!;
    const reclaimed = area.contents.filter((c) => c >= 200 && c < 300).map((c) => c - 200);
    if (reclaimed.length) {
      state.treasures.push(...reclaimed);
      area.contents = area.contents.filter((c) => c < 200 || c >= 300);
    }
    state.fight = null;
    state.party.forEach((m) => { m.potionActive = false; });
    events.push({ type: "fightWon" });
    if (state.treasures.length > 0) state.phase = "pickup";
    else persistAndExplore(state);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run reduce.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/reduce.ts packages/engine/src/reduce.test.ts
git commit -m "Fight: a won round reclaims floor-dropped treasure into the pickup (§387)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Retreat leaves perished members' treasure behind

The `retreat` case already parks the chamber working set and leaves the dropped floor treasure behind.
Add §426's other clause: artefacts carried by **perished** members are left in the area; the living keep
theirs.

**Files:** Modify `packages/engine/src/reduce.ts` and `packages/engine/src/reduce.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe` in `reduce.test.ts`:

```ts
  it("retreat leaves a slain member's treasure behind; the living keep theirs (§426)", () => {
    // A 2-tile map so there is somewhere to retreat to (north).
    const A = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 };
    const s = makeState({
      phase: "fight", fight: { surprise: 0, round: 2, focus: 0 }, partyArea: 0, level: 1,
      party: [
        { creatureId: 0, status: 3, dragonKills: 0, treasure: [3] }, // a slain Hero carrying the Magic Sword
        { creatureId: 5, status: 0, dragonKills: 0, treasure: [7] }, // a living Man carrying the Talisman
      ],
      strangers: [3], areas: [A], largePack: [1], largeIdx: 0, seed: 1, // card 1 (a tunnel) drawn north
    });
    const { state } = reduce(s, { type: "retreat", dir: DIR_N });
    expect(state.areas[0]!.contents).toContain(200 + 3); // the slain Hero's Magic Sword is left behind
    expect(state.party[0]!.treasure).toEqual([]);        // ...and removed from the corpse
    expect(state.party[1]!.treasure).toEqual([7]);       // the living Man keeps his Talisman
  });
```

> If `DIR_N` / `packCoord` aren't already imported in `reduce.test.ts`, add them to the existing
> `./coords` import (the file already imports from `./coords`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run reduce.test.ts` → FAIL (the Sword isn't dropped).

- [ ] **Step 3: Drop the perished members' treasure in the retreat success branch**

In `reduce.ts`, right after the existing `fled.contents = [ ... ]` block (and before
`res.state.strangers = []; ...`), insert:

```ts
      // §426: artefacts carried by creatures who have perished are left behind in the area; the living
      // retreat with theirs. (Heavy treasure dropped to fight is already on the floor — it stays too.)
      res.state.party.forEach((m) => {
        if (m.status === 3 && m.treasure.length) {
          fled.contents.push(...m.treasure.map((t) => 200 + t));
          m.treasure = [];
        }
      });
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run reduce.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/reduce.ts packages/engine/src/reduce.test.ts
git commit -m "Fight: retreat leaves a slain member's treasure behind (§426)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Delete the legacy auto resolver

The UI has used `resolveRound` (planned) since Phase 2; the `fightOn` auto path is dead in the app. Remove
the duplicate resolver and its actions. The exported strength helpers stay (used by `combatPlan.ts` and
`selectors.ts`).

- [ ] **Step 1: Remove the actions** — in `packages/engine/src/actions.ts`, delete these two lines from `GameAction`:

```ts
  | { type: "focusTarget"; idx: number }
  | { type: "fightOn" }
```

- [ ] **Step 2: Remove the reducer cases** — in `packages/engine/src/reduce.ts`, delete the entire
  `case "fightOn": { ... }` and `case "focusTarget": { ... }` blocks, and drop `resolveRound` from the
  combat import (keep `frontStrength`):

```ts
import { frontStrength } from "./combat";
```

- [ ] **Step 3: Remove the selector offerings** — in `packages/engine/src/selectors.ts`, in the `fight`
  branch, delete the `fightOn` action that seeds the list and the `focusTarget` loop. The branch should
  offer only retreat directions (when allowed) and `...artifactActions(state)`, plus the existing pending
  casualty early-return. Concretely, replace the start of the fight branch:

```ts
    // A pending casualty must be decided before anything else.
    const pending = state.fight?.casualtyQueue?.[0];
    if (pending) return pending.map((idx) => ({ type: "chooseCasualty", idx }));
    const actions: GameAction[] = [];
    // Retreat is allowed only after at least one round, and never back up a trap (§Retreat).
    if (!state.fellThroughTrap && state.fight && state.fight.round > 1 && !state.fight.retreatBlocked) {
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (dec.n) actions.push({ type: "retreat", dir: DIR_N });
      if (dec.e) actions.push({ type: "retreat", dir: DIR_E });
      if (dec.s) actions.push({ type: "retreat", dir: DIR_S });
      if (dec.w) actions.push({ type: "retreat", dir: DIR_W });
      if (dec.stairDown) actions.push({ type: "retreat", dir: DIR_DOWN });
      if (dec.stairUp && state.level > 1) actions.push({ type: "retreat", dir: DIR_UP });
    }
    actions.push(...artifactActions(state));
    return actions;
```

(Remove the now-unused `focusTarget`/`fightOn` lines and the `strongestStranger`-style focus default if any.)

- [ ] **Step 4: Delete the legacy resolver** — in `packages/engine/src/combat.ts`, delete the
  `export function resolveRound(...)` (the whole function) and the private helpers it alone used:
  `livingParty`, and the `C_SPECTRE` / `C_DRAGON` / `C_SORCERER` consts. Keep `isCaster`, `holds`,
  `frontStrength`, `casterMP`, `partyRollBonus`, and the `T_*` consts.

- [ ] **Step 5: Clean `turnEnds`** — in `packages/engine/src/multi.ts`, drop the `fightOn` disjunct and its
  mention in the comment:

```ts
    return action.type === "resolveRound" || action.type === "chooseCasualty";
```

- [ ] **Step 6: Remove dead UI labels** — in `apps/web/src/game/EncounterPanel.tsx`, delete the
  `case "fightOn":` and `case "focusTarget":` lines in `label()` (the panel no longer handles fights).

- [ ] **Step 7: Typecheck to surface every remaining reference**

Run: `pnpm -r typecheck`. Fix any error it reports (these are the exact remaining `fightOn`/`focusTarget`
/`resolveRound`-import references). Expected to be only the test files handled in Task 5.

- [ ] **Step 8: Commit** (tests are converted in Task 5, so this commit may leave tests red — that's fine on the branch)

```bash
git add packages/engine/src/actions.ts packages/engine/src/reduce.ts packages/engine/src/selectors.ts packages/engine/src/combat.ts packages/engine/src/multi.ts apps/web/src/game/EncounterPanel.tsx
git commit -m "Fight: delete the legacy auto resolver and the fightOn/focusTarget actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Migrate the tests off the legacy path

`fightOn` appears in `reduce.test.ts` (7), `multi.test.ts` (6), and `wards.test.ts`; `combat-round.test.ts`
tests the deleted resolver directly.

- [ ] **Step 1: Delete `combat-round.test.ts`**

```bash
git rm packages/engine/src/combat-round.test.ts
```

Its rule coverage now lives in `combatPlan.test.ts` — except the Sorcerer's magic reduction, migrated next.

- [ ] **Step 2: Preserve the Sorcerer-MP coverage** — append to `combatPlan.test.ts`:

```ts
describe("resolvePlannedRound — Sorcerer magic (card)", () => {
  it("the Eye of God reduces the Sorcerer's strength by only 2, never to zero", () => {
    const base = clone(fightS({ party: [member(0)], strangers: [11], seed: 5 })); // Hero vs Sorcerer (FS 4 + MP 9 = 13)
    const r = rolls(resolvePlannedRound(base, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r[0]!.enemyTotal - r[0]!.enemyRoll).toBe(13);
    const eye = clone(fightS({ party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [13] }], strangers: [11], seed: 5 }));
    const r2 = rolls(resolvePlannedRound(eye, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r2[0]!.enemyTotal - r2[0]!.enemyRoll).toBe(11); // 13 − 2
  });
});
```

- [ ] **Step 3: Convert `fightOn` usages to `resolveRound`**

For each `{ type: "fightOn" }` in `reduce.test.ts`, `multi.test.ts`, and `wards.test.ts`, replace it with a
planned round that engages the test's strangers. The pattern (read each test's `party`/`strangers` and
write the matching plan):

```ts
// one fighter (party[0]) vs the only stranger:
{ type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] }

// a caster (party[0]) vs a Spectre (the only stranger):
{ type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] }

// two members vs one stranger (2-v-1):
{ type: "resolveRound", matches: [{ front: [0, 1], backers: [], strangers: [0] }] }
```

For a multi-round test that calls `fightOn` in a loop, send the same `resolveRound` plan each iteration
(the strangers list shrinks as they die; rebuild the plan from the current `strangers` if the loop runs
until the fight ends — engage `strangers[0]` with the surviving front members). Delete any assertion that
checked `focusTarget` behaviour (focus no longer exists). Remove any `import { resolveRound } from
"./combat"` left in tests (the function is gone).

- [ ] **Step 4: Run the full engine suite + typecheck**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run` → PASS.
Run: `pnpm -r typecheck` → all "Done".

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src
git commit -m "Fight: migrate tests off the legacy fightOn path (planned resolveRound)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verify, build, codegen, merge

- [ ] **Step 1:** `pnpm --filter @sorcerers-cave/engine exec vitest run` → PASS.
- [ ] **Step 2:** `cd apps/web && pnpm exec vitest run` → PASS.
- [ ] **Step 3:** `pnpm -r typecheck` → PASS. `cd apps/web && pnpm build` → succeeds.
- [ ] **Step 4:** `cd apps/web && npx convex codegen` → re-publishes the engine to dev.
- [ ] **Step 5: Manual QA** (solo): pick a party carrying Gold; fight hand-to-hand → the Gold appears on the
  chamber floor; win → it is in the pickup; in a separate fight, retreat → it (and a slain member's
  artefact) stays behind. Confirm the fight surface still resolves rounds (the UI was already on
  `resolveRound`; nothing about it changes).
- [ ] **Step 6: Merge**

```bash
git checkout main && git merge --ff-only fight-phase3 && git branch -d fight-phase3
```

- [ ] **Step 7: Report** — full §FIGHTS fidelity reached; the legacy auto resolver is gone; the only fight
  resolver is the player-driven `resolvePlannedRound`.

---

## Self-review checklist (run before starting)

- **Spec coverage:** heavy-treasure drop on fighting (§387), reclaim-on-win, retreat leaves dropped +
  perished treasure (§426), blocked-retreat re-fight (§422, already present), legacy removal — all tasked. ✔
- **Kept vs deleted:** `frontStrength`/`casterMP`/`partyRollBonus`/`isCaster` and the `T_*` consts stay
  (used by `combatPlan`/`selectors`); only the auto `resolveRound` + its private `livingParty`/`C_*` and
  the `fightOn`/`focusTarget` actions go. ✔
- **Reclaim safety:** at fight time `area.contents` holds only this fight's drops (a fresh chamber clears
  contents on entry; a revisit loads them into `treasures`), so folding `200+` codes back on a win is
  correct. ✔
- **Heavy = kind "heavy"** (Silver 0 / Gold 1 / Gems 2 / Chest 14), matching `TREASURES[t].kind` as used
  by the Ghoul drop in `hazards.ts`. ✔
- **Test churn is intentional:** removing a public action invalidates its tests; Task 5 converts them to
  the planned action and deletes the resolver's own unit-test file (coverage moved to `combatPlan.test.ts`). ✔

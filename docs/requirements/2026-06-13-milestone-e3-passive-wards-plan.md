# Milestone E-3 — Passive Wards & Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four passive, auto-applied artifact/creature effects in the pure engine — the Talisman ward, the Eye of God, The Ring's deep-level invincibility, and the Unicorn's loyalty to a Woman.

**Architecture:** A new `effects.ts` module centralises the passive-effect predicates (`eyeActive`, `talismanWardsSpectres`, `ringInvincible`, `hasWoman`) and the stranger-sweep helpers (`wardOffSpectres`, `annihilateWithEye`, `reconcileUnicorns`). `combat.ts` consults these predicates at its strength and death sites; `reduce.ts` (`resolveArea`, `takeTreasure`, `test`, `fightOn`) consults them at chamber-entry, ruby-pickup, befriend, and post-combat. All effects are passive (no new player actions), so `selectors.ts` is untouched.

**Tech Stack:** TypeScript, Vitest, the existing deterministic reducer engine (`packages/engine`).

---

## Design decisions (read before implementing)

These resolve ambiguities in the 1978 rules against this edition's actual data. They are intentional and must be honoured:

1. **No Zombies or Ghouls in this edition.** `CREATURES` (ids 0–13) contains no Zombie or Ghoul. Therefore:
   - The Talisman's "wards off Zombies and Ghouls; on the 4th level or deeper also Spectres" reduces, here, to **warding off Spectres (creature id 9) on level ≥ 4 only**.
   - The Eye of God's "annihilates Spectres and Zombies" reduces to **annihilating Spectres (id 9)**.
2. **Warding = removal.** A warded Spectre is driven off: removed from `state.strangers` at chamber entry (emit `wardedOff`). Spectres are worth 0 points, so removal has no scoring impact. The chest-spring Spectre (E-2 `openChest` result 2) is a *surprise* that bypasses the displayed Talisman — it is **not** warded (documented exception, no code needed).
3. **Eye annihilation is permanent and immediate** at chamber entry (emit `annihilated`), distinct from warding.
4. **Eye "renders all magic powerless in the area"** while any *living* member holds it: party caster MP → 0, enemy MP → 0, the Magic Sword/Staff bonuses → 0, and The Ring's roll-bonus **and** its invincibility are disabled. The already-consumed Strength Potion buff is left intact (consumable, not a held artefact). Priests/Wizards keep their fighting strength (FS is unaffected). The Eye does not nullify itself.
5. **Eye stills the Lost-Ruby statue:** while the Eye is held, an aroused statue cannot attack (emit `statuePowerless`) and the Lost Ruby is taken without a fight.
6. **Eye curse-if-dropped is OUT OF SCOPE** (single-party game, no party-splitting; the bearer-death edge is deferred). Document only.
7. **Unicorn (creature id 13) joins only with a Woman.** A "Woman" = a living party member carrying `FLAG_BEFRIENDS_UNICORN` that is not itself a Unicorn (i.e. Woman id 6 or W-Hero id 1). On a friendly reaction: non-Unicorn strangers join as today; a Unicorn joins **only if** a Woman is present, otherwise it stays behind guarding the area (emit `unicornGuards`, mark the area permanently indifferent, party moves on leaving any treasure guarded). A Unicorn ally departs (emit `unicornDeparted`) if the party ever loses its last Woman — reconciled after combat (`fightOn`). Loss of a Woman at the rarer death sites (statue, viper) is a documented limitation, not handled.

---

## File structure

- **Create** `packages/engine/src/effects.ts` — passive-effect predicates + stranger-sweep/reconcile helpers.
- **Create** `packages/engine/src/effects.test.ts` — predicate unit tests.
- **Create** `packages/engine/src/wards.test.ts` — Talisman ward + Eye annihilation/statue/magic + Ring invincibility + Unicorn integration tests.
- **Modify** `packages/engine/src/actions.ts` — add six passive-effect events.
- **Modify** `packages/engine/src/combat.ts` — Eye magic nullification (`frontStrength`, `casterMP`, `partyRollBonus`, enemy MP) and Ring invincibility at the two death sites.
- **Modify** `packages/engine/src/reduce.ts` — call ward/annihilate at chamber entry, Eye-stills-statue in `resolveArea` + `takeTreasure`, Unicorn-with-Woman in `test`, reconcile in `fightOn`.

---

### Task 1: `effects.ts` predicates and sweep helpers

**Files:**
- Create: `packages/engine/src/effects.ts`
- Create: `packages/engine/src/effects.test.ts`
- Modify: `packages/engine/src/actions.ts` (add events used by the helpers)

- [ ] **Step 1: Add the six passive-effect events to `actions.ts`**

In `packages/engine/src/actions.ts`, append these to the `GameEvent` union (after the `statueAttacked` line, before the closing `;`):

```typescript
  | { type: "wardedOff"; creatureId: number }
  | { type: "annihilated"; creatureId: number }
  | { type: "statuePowerless" }
  | { type: "deathPrevented"; creatureId: number }
  | { type: "unicornGuards"; creatureId: number }
  | { type: "unicornDeparted"; creatureId: number };
```

(Change the previous last member's trailing `;` to nothing and put the `;` on the new last line.)

- [ ] **Step 2: Write the failing predicate tests**

Create `packages/engine/src/effects.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { eyeActive, talismanWardsSpectres, ringInvincible, hasWoman, wardOffSpectres, annihilateWithEye, reconcileUnicorns } from "./effects";
import { makeState } from "./testkit";

const member = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status, dragonKills: 0, treasure });

describe("passive-effect predicates", () => {
  it("eyeActive is true only when a living member holds the Eye (id 13)", () => {
    expect(eyeActive(makeState({ party: [member(0, [13])] }))).toBe(true);
    expect(eyeActive(makeState({ party: [member(0, [13], 3)] }))).toBe(false); // dead bearer
    expect(eyeActive(makeState({ party: [member(0, [])] }))).toBe(false);
  });

  it("talismanWardsSpectres requires the Talisman (id 7) AND level >= 4", () => {
    expect(talismanWardsSpectres(makeState({ party: [member(0, [7])], level: 4 }))).toBe(true);
    expect(talismanWardsSpectres(makeState({ party: [member(0, [7])], level: 3 }))).toBe(false);
    expect(talismanWardsSpectres(makeState({ party: [member(0, [])], level: 4 }))).toBe(false);
  });

  it("ringInvincible requires the Ring (id 10), level >= 4, and no active Eye", () => {
    const s = makeState({ party: [member(0, [10])], level: 4 });
    expect(ringInvincible(s.party[0]!, s)).toBe(true);
    const lowLevel = makeState({ party: [member(0, [10])], level: 3 });
    expect(ringInvincible(lowLevel.party[0]!, lowLevel)).toBe(false);
    const withEye = makeState({ party: [member(0, [10]), member(5, [13])], level: 4 });
    expect(ringInvincible(withEye.party[0]!, withEye)).toBe(false); // Eye negates the Ring
  });

  it("hasWoman is true for a living Woman (id 6) or W-Hero (id 1), but not the Unicorn itself", () => {
    expect(hasWoman(makeState({ party: [member(0), member(6)] }))).toBe(true);
    expect(hasWoman(makeState({ party: [member(0), member(1)] }))).toBe(true);
    expect(hasWoman(makeState({ party: [member(0), member(6, [], 3)] }))).toBe(false); // dead
    expect(hasWoman(makeState({ party: [member(13)] }))).toBe(false); // a Unicorn is not a Woman
  });
});

describe("stranger-sweep helpers", () => {
  it("wardOffSpectres removes Spectres (id 9) only when the Talisman wards at level >= 4", () => {
    const s = makeState({ party: [member(0, [7])], level: 4, strangers: [9, 5, 9] });
    const events = wardOffSpectres(s);
    expect(s.strangers).toEqual([5]);
    expect(events).toEqual([{ type: "wardedOff", creatureId: 9 }, { type: "wardedOff", creatureId: 9 }]);
    const low = makeState({ party: [member(0, [7])], level: 3, strangers: [9, 5] });
    expect(wardOffSpectres(low)).toEqual([]);
    expect(low.strangers).toEqual([9, 5]);
  });

  it("annihilateWithEye destroys Spectres (id 9) when the Eye is held", () => {
    const s = makeState({ party: [member(0, [13])], strangers: [9, 8, 9] });
    const events = annihilateWithEye(s);
    expect(s.strangers).toEqual([8]);
    expect(events).toEqual([{ type: "annihilated", creatureId: 9 }, { type: "annihilated", creatureId: 9 }]);
    const noEye = makeState({ party: [member(0)], strangers: [9] });
    expect(annihilateWithEye(noEye)).toEqual([]);
    expect(noEye.strangers).toEqual([9]);
  });

  it("reconcileUnicorns removes Unicorn allies when no Woman remains", () => {
    const s = makeState({ party: [member(0), member(13, [], 1)] }); // Hero + Unicorn ally, no Woman
    const events = reconcileUnicorns(s);
    expect(s.party.map((m) => m.creatureId)).toEqual([0]);
    expect(events).toEqual([{ type: "unicornDeparted", creatureId: 13 }]);
    const withWoman = makeState({ party: [member(6), member(13, [], 1)] });
    expect(reconcileUnicorns(withWoman)).toEqual([]);
    expect(withWoman.party.map((m) => m.creatureId)).toEqual([6, 13]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test effects`
Expected: FAIL (`effects.ts` does not exist).

- [ ] **Step 4: Create `effects.ts`**

Create `packages/engine/src/effects.ts`:

```typescript
import { CREATURES, FLAG_BEFRIENDS_UNICORN } from "./data/creatures";
import type { GameState, PartyMember } from "./state";
import type { GameEvent } from "./actions";

const T_TALISMAN = 7;
const T_THE_RING = 10;
const T_EYE_OF_GOD = 13;
const C_SPECTRE = 9;
const C_UNICORN = 13;

function living(m: PartyMember): boolean {
  return m.status === 0 || m.status === 1;
}

function partyHolds(state: GameState, treasureId: number): boolean {
  return state.party.some((m) => living(m) && m.treasure.includes(treasureId));
}

/** The Eye of God is held by a living member: nullifies magic & artefacts, annihilates Spectres, stills the statue. */
export function eyeActive(state: GameState): boolean {
  return partyHolds(state, T_EYE_OF_GOD);
}

/** The Talisman wards off Spectres on the 4th level or deeper (this edition's deck has no Zombies/Ghouls). */
export function talismanWardsSpectres(state: GameState): boolean {
  return state.level >= 4 && partyHolds(state, T_TALISMAN);
}

/** The Ring makes its bearer immune to killing die-rolls on the 4th level or deeper (negated by an active Eye). */
export function ringInvincible(member: PartyMember, state: GameState): boolean {
  return state.level >= 4 && member.treasure.includes(T_THE_RING) && !eyeActive(state);
}

/** A living Woman (id 6) or W-Hero (id 1) is in the party — required to win and keep a Unicorn's loyalty. */
export function hasWoman(state: GameState): boolean {
  return state.party.some(
    (m) => living(m) && m.creatureId !== C_UNICORN && (CREATURES[m.creatureId]!.flags & FLAG_BEFRIENDS_UNICORN) !== 0,
  );
}

/** Drive off every Spectre in the current encounter when the Talisman wards (level >= 4). Mutates `strangers`. */
export function wardOffSpectres(state: GameState): GameEvent[] {
  if (!talismanWardsSpectres(state)) return [];
  const events: GameEvent[] = [];
  for (let i = state.strangers.length - 1; i >= 0; i--) {
    if (state.strangers[i] === C_SPECTRE) {
      state.strangers.splice(i, 1);
      events.push({ type: "wardedOff", creatureId: C_SPECTRE });
    }
  }
  return events;
}

/** Permanently destroy every Spectre in the current encounter when the Eye is held. Mutates `strangers`. */
export function annihilateWithEye(state: GameState): GameEvent[] {
  if (!eyeActive(state)) return [];
  const events: GameEvent[] = [];
  for (let i = state.strangers.length - 1; i >= 0; i--) {
    if (state.strangers[i] === C_SPECTRE) {
      state.strangers.splice(i, 1);
      events.push({ type: "annihilated", creatureId: C_SPECTRE });
    }
  }
  return events;
}

/** A Unicorn stays allied only while a Woman lives; otherwise it departs. Mutates `party`. */
export function reconcileUnicorns(state: GameState): GameEvent[] {
  if (hasWoman(state)) return [];
  const events: GameEvent[] = [];
  for (let i = state.party.length - 1; i >= 0; i--) {
    const m = state.party[i]!;
    if (m.creatureId === C_UNICORN && living(m)) {
      state.party.splice(i, 1);
      events.push({ type: "unicornDeparted", creatureId: C_UNICORN });
    }
  }
  return events;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test effects`
Expected: PASS (all predicate + sweep tests green).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @sorcerers-cave/engine typecheck`
Expected: clean.

```bash
git add packages/engine/src/effects.ts packages/engine/src/effects.test.ts packages/engine/src/actions.ts
git commit -m "feat(engine): passive-effect predicates + stranger-sweep helpers (effects.ts)"
```

---

### Task 2: Talisman ward at chamber entry

**Files:**
- Modify: `packages/engine/src/reduce.ts` (import + call in `resolveArea`)
- Test: `packages/engine/src/wards.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/wards.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reduce } from "./reduce";
import { makeState } from "./testkit";

const member = (creatureId: number, treasure: number[] = [], status = 0) => ({ creatureId, status, dragonKills: 0, treasure });

describe("Talisman ward (Spectres, level >= 4)", () => {
  it("drives off a Spectre drawn into the chamber when held at level >= 4", () => {
    // resolveArea runs wardOffSpectres after the chamber draw. We stub the draw by pre-seeding
    // a chamber whose enterChamber yields a Spectre, but the simplest deterministic check is to call
    // the sweep through a move into a freshly drawn chamber. Here we assert via wardOffSpectres' effect
    // surfaced by a direct encounter: place the party in an area, push a Spectre, and re-resolve.
    const s = makeState({
      party: [member(0, [7])], // Hero with Talisman
      level: 4,
      strangers: [9],
      phase: "encounter",
    });
    // Withdraw then re-enter is heavy; instead assert the ward helper is wired by checking that a
    // Spectre present at level >= 4 with a Talisman cannot start a hostile fight via `test` resolving
    // to nothing to fight. (Integration of the resolveArea call is covered by the reduce path test below.)
    expect(s.strangers).toEqual([9]); // precondition
  });
});
```

NOTE TO IMPLEMENTER: the stub above is a placeholder to make the file compile. Replace it with the real integration test in Step 4 once you can see how `resolveArea` is reached. The authoritative behaviour (`wardOffSpectres` mutating `strangers` + emitting `wardedOff`) is already unit-tested in `effects.test.ts`; this task's job is to **wire the call into `resolveArea`** and prove it fires on chamber entry. Write a test that drives a real `move` into a chamber that draws a Spectre by constructing `largePack`/`smallPack` so the draw is deterministic — mirror the construction used in `chamber.test.ts`. If deterministic chamber construction is impractical here, instead test `resolveArea` indirectly: export nothing new, but assert that after the wiring, a state with a Talisman at level 4 and a Spectre in `strangers`, run through the existing post-draw code path, ends with the Spectre removed and a `wardedOff` event. Keep the test deterministic (seeded), real, and behaviour-asserting.

- [ ] **Step 2: Run the test (it should pass trivially as written, then you will strengthen it)**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: PASS (placeholder). You will replace it with the real assertion in Step 4.

- [ ] **Step 3: Wire `wardOffSpectres` into `resolveArea`**

In `packages/engine/src/reduce.ts`:

Add to the imports near the top (after the `combat` import line):

```typescript
import { wardOffSpectres, annihilateWithEye, eyeActive, reconcileUnicorns, hasWoman } from "./effects";
```

(Import all the symbols now so later tasks need no further import edits. Unused-import lint is not enforced here; `tsc` does not error on unused imports with the current config — verify with typecheck.)

In `resolveArea`, find the chamber-draw line:

```typescript
    events.push(...enterChamber(state));
```

Immediately **after** it, insert:

```typescript
    events.push(...annihilateWithEye(state)); // the Eye destroys Spectres on sight (§ Eye of God)
    events.push(...wardOffSpectres(state)); // the Talisman drives off Spectres on level >= 4 (§ Talisman)
```

(Both sweeps run before the `applyHazards`/phase decision below, so a chamber containing only warded/annihilated Spectres resolves straight to pickup/explore.)

- [ ] **Step 4: Replace the placeholder test with a real chamber-entry integration test**

Replace the body of `wards.test.ts`'s first `it` with a deterministic `move` that draws a Spectre into the chamber and asserts it is warded off. Construct `largePack`/`smallPack`, `areas`, and `seed` following the pattern in `chamber.test.ts` so `enterChamber` deterministically yields a Spectre (id 9). After the `move`, assert:
- `result.state.strangers` does **not** contain 9,
- `result.events` contains `{ type: "wardedOff", creatureId: 9 }`,
- and a control run at `level: 3` (Talisman present) leaves the Spectre in `strangers` and starts an encounter.

If you cannot force a Spectre draw deterministically, document why in your report and instead assert the wiring by constructing the post-draw state directly and re-running `resolveArea` via a `move` whose target chamber you have pre-populated. The test MUST assert real warding behaviour, not a tautology.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/reduce.ts packages/engine/src/wards.test.ts
git commit -m "feat(engine): Talisman wards off Spectres on level 4+ at chamber entry (§ Talisman)"
```

---

### Task 3: Eye of God — annihilation, stilled statue, safe Ruby

**Files:**
- Modify: `packages/engine/src/reduce.ts` (`resolveArea` statue branch; `takeTreasure` ruby branch)
- Test: `packages/engine/src/wards.test.ts` (add cases)

The annihilation call was already wired in Task 2 Step 3. This task adds the statue-stilling and safe-Ruby behaviour.

- [ ] **Step 1: Write the failing tests**

Add to `wards.test.ts`:

```typescript
describe("Eye of God stills the Lost-Ruby statue (§ Eye of God)", () => {
  it("an aroused statue cannot attack while the Eye is held", () => {
    const s = makeState({
      party: [member(0, [13])], // Hero holding the Eye
      level: 1,
      partyArea: 0,
      areas: [{ card: 175, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [], flags: 32, indiffCount: 0 }],
    });
    // Re-enter the aroused area via withdraw is heavy; assert via a move that re-resolves the area.
    // Simplest: call reduce on a no-op that triggers resolveArea is not available, so drive a `move`
    // back-and-forth. If impractical, construct a two-area map and move into the flagged area.
    // The authoritative assertion: with the Eye held, entering a flags&32 area emits statuePowerless
    // and kills no one.
    expect(s.areas[0]!.flags & 32).toBe(32); // precondition
  });

  it("the Lost Ruby is taken without a fight while the Eye is held", () => {
    const s = makeState({
      party: [member(0, [13])], // weak Hero, but the Eye stills the statue
      phase: "pickup",
      treasures: [11],
      seed: 1,
    });
    const { state, events } = reduce(s, { type: "takeTreasure", ti: 0, mi: 0 });
    expect(state.party[0]!.treasure).toContain(11);
    expect(state.party[0]!.status).toBe(0); // alive
    expect(state.treasures).toEqual([]);
    expect(events).toContainEqual({ type: "rubyTaken" });
    expect(events).toContainEqual({ type: "statuePowerless" });
  });
});
```

NOTE TO IMPLEMENTER: the first `it` (aroused-statue entry) needs `resolveArea` to run over a `flags & 32` area while the Eye is held. Build a real two-area map and `move` the party into the flagged area (or use the existing flagged-area construction from `ruby.test.ts`'s aroused-entry test as a template, adding the Eye to the party). Assert: a `statuePowerless` event fires and the party member is **not** killed. Replace the placeholder assertion with this real test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: the Ruby test FAILS (statue currently fights regardless of the Eye); the placeholder passes.

- [ ] **Step 3: Still the aroused statue in `resolveArea`**

In `reduce.ts` `resolveArea`, the aroused-statue block currently begins:

```typescript
    if ((here.flags & 32) !== 0) { // an aroused Lost-Ruby statue strikes the strongest member (§16)
```

Wrap the attack so the Eye stills it. Change the block to:

```typescript
    if ((here.flags & 32) !== 0) { // an aroused Lost-Ruby statue strikes the strongest member (§16)
      if (eyeActive(state)) {
        events.push({ type: "statuePowerless" }); // the Eye renders the statue powerless to attack
      } else {
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
    }
```

- [ ] **Step 4: Take the Ruby safely in `takeTreasure`**

In `reduce.ts` `takeTreasure`, the Lost-Ruby branch begins:

```typescript
      if (next.treasures[action.ti] === 11) { // Lost Ruby — guarded by a strength-8 statue (§16)
        const fighter = next.party[action.mi];
        if (!fighter || !(fighter.status === 0 || fighter.status === 1)) return { state, events: [{ type: "blocked" }] };
        const events: GameEvent[] = [];
```

Immediately after the `const events: GameEvent[] = [];` line, insert the Eye short-circuit:

```typescript
        if (eyeActive(next)) { // the Eye stills the statue: take the Ruby with no fight
          fighter.treasure.push(11);
          next.treasures.splice(action.ti, 1);
          events.push({ type: "rubyTaken" }, { type: "statuePowerless" });
          if (next.treasures.length === 0) persistAndExplore(next);
          return { state: next, events };
        }
```

- [ ] **Step 5: Replace the placeholder statue-entry test with a real one and run**

Implement the real aroused-statue-entry test per the Step 1 note. Then:

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/reduce.ts packages/engine/src/wards.test.ts
git commit -m "feat(engine): Eye of God annihilates Spectres and stills the Lost-Ruby statue (§ Eye of God)"
```

---

### Task 4: Eye of God — magic & artefact nullification in combat

**Files:**
- Modify: `packages/engine/src/combat.ts`
- Test: `packages/engine/src/wards.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests**

Add to `wards.test.ts`:

```typescript
import { frontStrength, casterMP, partyRollBonus } from "./combat";

describe("Eye of God nullifies magic & artefacts (§ Eye of God)", () => {
  it("zeroes caster MP for every member while the Eye is held", () => {
    const s = makeState({ party: [member(8, [13])] }); // Wizard (MP 5) holding the Eye
    expect(casterMP(s.party[0]!)).toBe(5); // no state -> unaffected
    expect(casterMP(s.party[0]!, s)).toBe(0); // Eye active -> magic powerless
  });

  it("suppresses the Magic Sword bonus while the Eye is held", () => {
    const s = makeState({ party: [member(0, [3, 13])] }); // Hero with Magic Sword + Eye
    expect(frontStrength(s.party[0]!)).toBe(7); // FS 5 + sword 2 (no state)
    expect(frontStrength(s.party[0]!, s)).toBe(5); // sword powerless under the Eye
  });

  it("disables The Ring's roll bonus while the Eye is held", () => {
    const ring = makeState({ party: [member(0, [10])] });
    expect(partyRollBonus(ring)).toBe(1); // Ring +1
    const ringAndEye = makeState({ party: [member(0, [10, 13])] });
    expect(partyRollBonus(ringAndEye)).toBe(0); // Ring powerless under the Eye
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: FAIL (`frontStrength`/`casterMP` don't accept `state`; `partyRollBonus` ignores the Eye).

- [ ] **Step 3: Update `combat.ts`**

In `packages/engine/src/combat.ts`:

Add the import (after the existing imports):

```typescript
import { eyeActive, ringInvincible } from "./effects";
```

Change `frontStrength` to accept optional state and drop artefact bonuses when the Eye is active:

```typescript
/** Front-line fighting strength: FS + dragon-kills + Magic Sword bonus (spec §9.3). The Eye nullifies artefacts. */
export function frontStrength(member: PartyMember, state?: GameState): number {
  const c = CREATURES[member.creatureId]!;
  let s = c.fs + member.dragonKills;
  const artefactsPowerless = state ? eyeActive(state) : false;
  if (!artefactsPowerless && holds(member, T_MAGIC_SWORD)) {
    if (member.creatureId === 0 || member.creatureId === 1) s += 2; // Hero / W-Hero
    else if (member.creatureId === 5 || member.creatureId === 6) s += 1; // Man / Woman
  }
  if (member.potionActive) s += 2; // Strength Potion (consumable; not nullified by the Eye)
  return s;
}
```

Change `casterMP` to accept optional state and return 0 when the Eye is active:

```typescript
/** Background magical power a caster contributes: MP + Magic Staff bonus (spec §9.3). The Eye zeroes all magic. */
export function casterMP(member: PartyMember, state?: GameState): number {
  if (state && eyeActive(state)) return 0; // the Eye renders all magic powerless (§ Eye of God)
  const c = CREATURES[member.creatureId]!;
  let mp = c.mp;
  if (holds(member, T_MAGIC_STAFF)) {
    if (member.creatureId === 4) mp += 1; // Priest
    else if (member.creatureId === 8) mp += 2; // Wizard
  }
  return mp;
}
```

Change `partyRollBonus` so the Eye disables the Ring bonus:

```typescript
/** Bonus added to every PARTY die roll this fight: +1 if any living member holds The Ring (Eye negates it), minus curses. */
export function partyRollBonus(state: GameState): number {
  const ring = !eyeActive(state) && state.party.some((m) => (m.status === 0 || m.status === 1) && holds(m, T_THE_RING));
  return (ring ? 1 : 0) - state.curses;
}
```

In `resolveRound`, thread `state` into the internal strength calls and zero enemy MP under the Eye. Add this near the top of `resolveRound` (after `const events: GameEvent[] = [];`):

```typescript
  const enemyMP = (sid: number): number => (eyeActive(state) ? 0 : CREATURES[sid]!.mp);
```

Then update the following call sites inside `resolveRound`:
- `const partyHasMP = party.some((m) => casterMP(m) > 0);` → `casterMP(m, state) > 0`
- the Spectre `frontStrength(m) > frontStrength(strongest)` comparison → `frontStrength(m, state) > frontStrength(strongest, state)`
- `const casterMPTotal = casters.reduce((sum, m) => sum + casterMP(m), 0);` → `casterMP(m, state)`
- the unmatched-strength reduce: `+ CREATURES[state.strangers[i]!]!.fs + CREATURES[state.strangers[i]!]!.mp` → `+ CREATURES[state.strangers[i]!]!.fs + enemyMP(state.strangers[i]!)`
- `let partyStr = group.reduce((sum, m) => sum + frontStrength(m), 0);` → `frontStrength(m, state)`
- `let enemyStr = CREATURES[sid]!.fs + CREATURES[sid]!.mp;` → `CREATURES[sid]!.fs + enemyMP(sid)`
- the weakest-selection `frontStrength(m) < frontStrength(weakest)` → `frontStrength(m, state) < frontStrength(weakest, state)`

(Leave the `reduce.ts` statue/ruby `frontStrength(...)` calls unchanged — under the Eye the statue never rolls, so they are moot.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green (existing combat tests still pass — they call the helpers without `state`, so behaviour is unchanged).

```bash
git add packages/engine/src/combat.ts packages/engine/src/wards.test.ts
git commit -m "feat(engine): Eye of God renders magic & artefacts powerless in combat (§ Eye of God)"
```

---

### Task 5: The Ring — level-4 invincibility

**Files:**
- Modify: `packages/engine/src/combat.ts` (the two death sites in `resolveRound`)
- Test: `packages/engine/src/wards.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests**

Add to `wards.test.ts`:

```typescript
import { resolveRound } from "./combat";

describe("The Ring — level-4 invincibility (§ The Ring)", () => {
  it("ignores a killing combat roll for the Ring bearer at level >= 4", () => {
    // A lone Dwarf (FS 1) carrying the Ring faces a Dragon (FS 6): normally the Dwarf dies.
    // At level 4 the killing roll is ignored.
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      level: 4,
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [10] }], // Dwarf + Ring
      strangers: [10], // Dragon
      seed: 3,
    });
    const events = resolveRound(s);
    expect(s.party[0]!.status).not.toBe(3); // Ring bearer survives
    expect(events).toContainEqual({ type: "deathPrevented", creatureId: 7 });
  });

  it("does NOT protect the Ring bearer below level 4", () => {
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      level: 3,
      party: [{ creatureId: 7, status: 0, dragonKills: 0, treasure: [10] }],
      strangers: [10],
      seed: 3,
    });
    resolveRound(s);
    expect(s.party[0]!.status).toBe(3); // dies normally at level 3
  });
});
```

NOTE TO IMPLEMENTER: verify at `seed: 3` the Dragon actually out-rolls the Dwarf (so the death branch is exercised). If that seed ties or the Dwarf wins, pick a seed where `enemyTotal > partyTotal` deterministically (try small seeds and read the outcome). The test must exercise the real death-prevention path.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: FAIL (`deathPrevented` never emitted; bearer dies).

- [ ] **Step 3: Add invincibility at the two death sites in `resolveRound`**

`ringInvincible` is already imported (Task 4). Update both death sites:

**Spectre auto-slay** — change:

```typescript
    if (strongest) {
      strongest.status = 3;
      events.push({ type: "spectreSlew", creatureId: strongest.creatureId });
    }
```

to:

```typescript
    if (strongest) {
      if (ringInvincible(strongest, state)) {
        events.push({ type: "deathPrevented", creatureId: strongest.creatureId });
      } else {
        strongest.status = 3;
        events.push({ type: "spectreSlew", creatureId: strongest.creatureId });
      }
    }
```

**Combat-round loss** — change:

```typescript
      let weakest: PartyMember | undefined;
      for (const m of group) if (!weakest || frontStrength(m, state) < frontStrength(weakest, state)) weakest = m;
      if (weakest) { weakest.status = 3; events.push({ type: "memberDied", creatureId: weakest.creatureId }); }
```

to:

```typescript
      let weakest: PartyMember | undefined;
      for (const m of group) if (!weakest || frontStrength(m, state) < frontStrength(weakest, state)) weakest = m;
      if (weakest) {
        if (ringInvincible(weakest, state)) {
          events.push({ type: "deathPrevented", creatureId: weakest.creatureId });
        } else {
          weakest.status = 3;
          events.push({ type: "memberDied", creatureId: weakest.creatureId });
        }
      }
```

(The `frontStrength(m, state)` calls reflect Task 4's edits; if Task 4's exact wording differs, keep the `state` argument.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/combat.ts packages/engine/src/wards.test.ts
git commit -m "feat(engine): The Ring makes its bearer invincible on level 4+ (§ The Ring)"
```

---

### Task 6: Unicorn — loyalty to a Woman

**Files:**
- Modify: `packages/engine/src/reduce.ts` (`test` friendly branch; `fightOn` reconcile)
- Test: `packages/engine/src/wards.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests**

Add to `wards.test.ts`:

```typescript
describe("Unicorn loyalty to a Woman (§ Unicorn)", () => {
  // The Unicorn (id 13) leads with hostileMax/indiffMax 0 -> a friendly reaction is certain when it leads.
  function unicornEncounter(party: ReturnType<typeof member>[]) {
    return makeState({
      phase: "encounter",
      party,
      strangers: [13], // lone Unicorn
      treasures: [1], // Gold it may guard
      seed: 2,
      areas: [{ card: 175, coord: makeState().areas[0]!.coord, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }],
    });
  }

  it("a Unicorn joins the party when a Woman is present", () => {
    const { state, events } = reduce(unicornEncounter([member(6)]), { type: "test" }); // party has a Woman
    expect(events).toContainEqual({ type: "reaction", outcome: "friendly" });
    expect(state.party.map((m) => m.creatureId)).toContain(13); // Unicorn joined
    expect(state.strangers).toEqual([]);
  });

  it("a Womanless party leaves the Unicorn guarding the area", () => {
    const { state, events } = reduce(unicornEncounter([member(0)]), { type: "test" }); // Hero only, no Woman
    expect(events).toContainEqual({ type: "reaction", outcome: "friendly" });
    expect(events).toContainEqual({ type: "unicornGuards", creatureId: 13 });
    expect(state.party.map((m) => m.creatureId)).not.toContain(13); // did NOT join
    expect(state.phase).toBe("explore"); // party moves on
    expect(state.areas[state.partyArea]!.indiffCount).toBe(3); // permanently indifferent
  });

  it("a Unicorn ally departs after combat once the last Woman is gone", () => {
    // Woman + Unicorn ally vs a Dragon that kills the Woman -> the Unicorn departs.
    const s = makeState({
      phase: "fight",
      fight: { surprise: 0, round: 1, focus: 0 },
      level: 1,
      party: [
        { creatureId: 6, status: 0, dragonKills: 0, treasure: [] }, // Woman
        { creatureId: 13, status: 1, dragonKills: 0, treasure: [] }, // Unicorn ally
      ],
      strangers: [10], // Dragon
      seed: 3,
    });
    const { events } = reduce(s, { type: "fightOn" });
    // If the Woman dies this round, the Unicorn must depart.
    const womanDied = events.some((e) => e.type === "memberDied" && e.creatureId === 6);
    if (womanDied) {
      expect(events).toContainEqual({ type: "unicornDeparted", creatureId: 13 });
    }
  });
});
```

NOTE TO IMPLEMENTER: for the third test, choose a `seed`/setup where the Woman deterministically dies (Dragon FS 6 vs Woman FS 2). If at the chosen seed the Woman survives, the `if (womanDied)` guard makes the test vacuous — strengthen it by picking a seed where she dies, so `unicornDeparted` is actually asserted. Read the actual outcome and pin it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: the "guarding" and "departs" tests FAIL (currently the Unicorn joins regardless, and never departs).

- [ ] **Step 3: Rewrite the `test` friendly branch in `reduce.ts`**

`hasWoman` is already imported (Task 2). Replace the friendly branch:

```typescript
      if (roll.outcome === "friendly") {
        const room = PARTY_CAP - next.party.length;
        const joining = next.strangers.slice(0, Math.max(0, room));
        for (const id of joining) next.party.push({ creatureId: id, status: 1, dragonKills: 0, treasure: [] });
        next.strangers = [];
        events.push({ type: "strangersJoined", count: joining.length });
        if (next.treasures.length > 0) next.phase = "pickup";
        else persistAndExplore(next);
      } else if (roll.outcome === "indifferent") {
```

with:

```typescript
      if (roll.outcome === "friendly") {
        const womanPresent = hasWoman(next);
        const room = PARTY_CAP - next.party.length;
        // A Womanless Unicorn (id 13) will not join — it stays behind guarding the area.
        const joinPool = next.strangers.filter((id) => !(id === 13 && !womanPresent));
        const guardPool = next.strangers.filter((id) => id === 13 && !womanPresent);
        const joining = joinPool.slice(0, Math.max(0, room));
        for (const id of joining) next.party.push({ creatureId: id, status: 1, dragonKills: 0, treasure: [] });
        events.push({ type: "strangersJoined", count: joining.length });
        if (guardPool.length > 0) {
          next.strangers = guardPool;
          for (const id of guardPool) events.push({ type: "unicornGuards", creatureId: id });
          next.areas[next.partyArea]!.indiffCount = 3; // cannot be approached further; it guards any treasure
          persistAndExplore(next); // the party moves on, leaving the Unicorn (and guarded treasure) behind
        } else {
          next.strangers = [];
          if (next.treasures.length > 0) next.phase = "pickup";
          else persistAndExplore(next);
        }
      } else if (roll.outcome === "indifferent") {
```

- [ ] **Step 4: Reconcile Unicorn loyalty after combat in `fightOn`**

In `reduce.ts` `fightOn`, after the `resolveRound` line:

```typescript
      const next = structuredClone(state);
      const events = resolveRound(next);
```

insert:

```typescript
      events.push(...reconcileUnicorns(next)); // a Unicorn departs if the last Woman fell this round (§ Unicorn)
```

(`reconcileUnicorns` is already imported. It runs before the party-alive / strangers-cleared checks, which is correct: a departed Unicorn should not count toward survivors.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine test wards`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck + commit**

Run: `pnpm --filter @sorcerers-cave/engine test` then `… typecheck`
Expected: all green.

```bash
git add packages/engine/src/reduce.ts packages/engine/src/wards.test.ts
git commit -m "feat(engine): Unicorn joins/stays loyal only with a Woman present (§ Unicorn)"
```

---

## Definition of Done

- [ ] `effects.ts` exports `eyeActive`, `talismanWardsSpectres`, `ringInvincible`, `hasWoman`, `wardOffSpectres`, `annihilateWithEye`, `reconcileUnicorns`, all unit-tested.
- [ ] Talisman drives off Spectres at level ≥ 4 at chamber entry.
- [ ] Eye of God: annihilates Spectres, stills the aroused statue and lets the Ruby be taken safely, and nullifies party + enemy magic / Magic Sword / Magic Staff / Ring bonus in combat.
- [ ] The Ring ignores killing rolls for its bearer at level ≥ 4 (negated by the Eye).
- [ ] Unicorn joins only with a Woman; otherwise guards the area; departs if the last Woman is later lost (in combat).
- [ ] Full engine suite green; typecheck clean across all packages; determinism preserved (no `Math.random`/`Date.now`).
- [ ] Each effect's design decision (especially the Zombie/Ghoul absence) is reflected in code comments.

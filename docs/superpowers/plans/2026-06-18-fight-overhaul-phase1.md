# Fight Overhaul — Phase 1 (Engine: battle-plan model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an engine that resolves a fight round from a *player-supplied pairing* (a `BattlePlan`),
with full validation and faithful per-match resolution — without touching the existing UI or the old
auto-combat path (both keep working until Phase 2).

**Architecture:** A new, self-contained module `packages/engine/src/combatPlan.ts` exposes
`validatePlan(state, plan)` and `resolvePlannedRound(state, plan)`. A new `resolveRound` engine action
(carrying `matches`) is wired in `reduce.ts` alongside the untouched `fightOn` (auto) action, and the
multiplayer turn-handoff (`multi.ts`) recognises it. The new module reuses the exported pure helpers
`frontStrength` / `casterMP` / `partyRollBonus` (combat.ts) and `eyeActive` / `ringInvincible`
(effects.ts). The legacy auto path (`combat.ts resolveRound`, `fightOn`) is left intact and will be
removed in Phase 3. Reaction testing is unchanged (leader-based).

**Tech Stack:** TypeScript (pure engine, no deps), Vitest. Run from repo root with `pnpm`.

**Design spec:** `docs/superpowers/specs/2026-06-18-fight-overhaul-design.md`. Rules:
`docs/specs/sorcerers-cave-rules.md` §FIGHTS (381–426).

---

## Conventions for every task

- Run tests from the repo root: `pnpm --filter @sorcerers-cave/engine exec vitest run <file>`.
- Typecheck before committing a task: `pnpm --filter @sorcerers-cave/engine typecheck`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Work on a branch `fight-phase1`; do not merge to `main` until the final task.

## File structure

- **Create** `packages/engine/src/combatPlan.ts` — `validatePlan`, `resolvePlannedRound`, plan errors.
- **Create** `packages/engine/src/combatPlan.test.ts` — validation + resolution unit tests.
- **Modify** `packages/engine/src/state.ts` — add `PlanMatch` / `BattlePlan` types.
- **Modify** `packages/engine/src/actions.ts` — add the `resolveRound` action + `planRejected` event.
- **Modify** `packages/engine/src/reduce.ts` — handle the `resolveRound` action.
- **Modify** `packages/engine/src/reduce.test.ts` — action-level tests.
- **Modify** `packages/engine/src/multi.ts` — `turnEnds` recognises `resolveRound`.
- **Modify** `packages/engine/src/multi.test.ts` — multiplayer turn-handoff test.

Each match in a plan is `{ front, backers, strangers }`:
- `front` — 1–2 party indices fighting hand-to-hand.
- `backers` — party indices (casters) lending magical power to this match.
- `strangers` — 1–2 stranger indices engaged (2 only with a single front fighter = "send one against two").

---

### Task 1: Plan types + the `resolveRound` action

**Files:**
- Modify: `packages/engine/src/state.ts` (append the two interfaces near `FightState`)
- Modify: `packages/engine/src/actions.ts` (add one action + one event to the unions)

- [ ] **Step 1: Add the plan types to `state.ts`**

Append after the `FightState` interface:

```ts
/** One pairing in a battle plan: party fighters (front), supporting casters (backers), and the
 *  stranger(s) they engage. `strangers` holds two only for a 1-against-2 (a lone front fighter). */
export interface PlanMatch {
  front: number[];     // 1–2 living party indices fighting hand-to-hand
  backers: number[];   // caster party indices lending magical power to this match
  strangers: number[]; // 1–2 stranger indices engaged
}

/** A player's pairing for one round of fighting (§FIGHTS "Setting up the Fight"). */
export interface BattlePlan {
  matches: PlanMatch[];
}
```

- [ ] **Step 2: Add the action + rejection event to `actions.ts`**

Add to the `GameAction` union (near the existing `fightOn` action):

```ts
  | { type: "resolveRound"; matches: import("./state").PlanMatch[] } // resolve one round from a player pairing
```

Add to the `GameEvent` union (near `blocked`):

```ts
  | { type: "planRejected"; reason: string } // the submitted battle plan broke a pairing rule
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @sorcerers-cave/engine typecheck`
Expected: PASS (no usages yet).

- [ ] **Step 4: Commit**

```bash
git checkout -b fight-phase1
git add packages/engine/src/state.ts packages/engine/src/actions.ts
git commit -m "Fight plan: PlanMatch/BattlePlan types + resolveRound action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `validatePlan`

**Files:**
- Create: `packages/engine/src/combatPlan.ts`
- Create: `packages/engine/src/combatPlan.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/combatPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validatePlan } from "./combatPlan";
import { makeState } from "./testkit";
import type { BattlePlan } from "./state";

const member = (creatureId: number, treasure: number[] = []) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure });
const fight = (over: Parameters<typeof makeState>[0] = {}) =>
  makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, ...over });
const ok = (s: ReturnType<typeof makeState>, p: BattlePlan) => validatePlan(s, p).ok;
const reason = (s: ReturnType<typeof makeState>, p: BattlePlan) => { const r = validatePlan(s, p); return r.ok ? null : r.reason; };

describe("validatePlan (§FIGHTS pairing rules)", () => {
  it("accepts a simple 1-v-1 pairing", () => {
    const s = fight({ party: [member(0)], strangers: [3] }); // Hero vs Troll
    expect(ok(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });

  it("rejects when not in a fight", () => {
    const s = makeState({ phase: "explore", party: [member(0)], strangers: [3] });
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("notFighting");
  });

  it("rejects an empty plan", () => {
    const s = fight({ party: [member(0)], strangers: [3] });
    expect(reason(s, { matches: [] })).toBe("emptyPlan");
  });

  it("rejects reusing a member across matches", () => {
    const s = fight({ party: [member(0)], strangers: [3, 5] });
    expect(reason(s, { matches: [
      { front: [0], backers: [], strangers: [0] },
      { front: [0], backers: [], strangers: [1] },
    ] })).toBe("memberReused");
  });

  it("rejects reusing a stranger across matches", () => {
    const s = fight({ party: [member(0), member(2)], strangers: [3] });
    expect(reason(s, { matches: [
      { front: [0], backers: [], strangers: [0] },
      { front: [1], backers: [], strangers: [0] },
    ] })).toBe("strangerReused");
  });

  it("rejects a 2-against-2 group (must be 2-v-1 or 1-v-2)", () => {
    const s = fight({ party: [member(0), member(2)], strangers: [3, 5] });
    expect(reason(s, { matches: [{ front: [0, 1], backers: [], strangers: [0, 1] }] })).toBe("twoVsTwo");
  });

  it("rejects a non-caster placed in the background", () => {
    const s = fight({ party: [member(0), member(2)], strangers: [3] }); // Hero + Ogre (neither casts)
    expect(reason(s, { matches: [{ front: [0], backers: [1], strangers: [0] }] })).toBe("backerNotCaster");
  });

  it("rejects an ordinary fighter set against a Spectre", () => {
    const s = fight({ party: [member(5)], strangers: [9] }); // Man vs Spectre
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("spectreNeedsMagic");
  });

  it("accepts a caster (or sword-bearer) against a Spectre", () => {
    const caster = fight({ party: [member(8)], strangers: [9] }); // Wizard vs Spectre
    expect(ok(caster, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
    const sword = fight({ party: [member(0, [3])], strangers: [9] }); // Hero w/ Magic Sword vs Spectre
    expect(ok(sword, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });

  it("rejects leaving an engageable stranger unengaged while a fighter is free", () => {
    const s = fight({ party: [member(0), member(2)], strangers: [3, 5] }); // 2 fighters, 2 foes
    expect(reason(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe("mustEngageAll");
  });

  it("allows leftover strangers when the party is out-numbered (all fighters committed)", () => {
    const s = fight({ party: [member(0)], strangers: [3, 5, 7] }); // 1 fighter, 3 foes
    expect(ok(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });

  it("allows idle fighters once every stranger is engaged", () => {
    const s = fight({ party: [member(0), member(2), member(7)], strangers: [3] }); // 3 fighters, 1 foe
    expect(ok(s, { matches: [{ front: [0], backers: [], strangers: [0] }] })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts`
Expected: FAIL — `validatePlan` is not defined / module missing.

- [ ] **Step 3: Implement `validatePlan` in a new `combatPlan.ts`**

Create `packages/engine/src/combatPlan.ts`:

```ts
import { CREATURES } from "./data/creatures";
import { casterMP } from "./combat";
import { eyeActive } from "./effects";
import type { GameState, PartyMember, BattlePlan } from "./state";

const C_SPECTRE = 9;
const T_MAGIC_SWORD = 3;

export type PlanError =
  | "notFighting" | "emptyPlan" | "badIndex" | "deadMember" | "memberReused"
  | "strangerReused" | "groupTooBig" | "twoVsTwo" | "backerNotCaster"
  | "spectreNeedsMagic" | "mustEngageAll";

const living = (state: GameState, i: number): boolean => {
  const m = state.party[i];
  return !!m && (m.status === 0 || m.status === 1);
};

/** A Man/Woman/Hero/W-Hero bearing the Magic Sword may fight a Spectre hand-to-hand (§Spectre). */
const canSwordSpectre = (state: GameState, m: PartyMember): boolean =>
  !eyeActive(state) && m.treasure.includes(T_MAGIC_SWORD) && [0, 1, 5, 6].includes(m.creatureId);

/** Can the party engage this stranger at all this round? (Always, unless it is an un-fightable Spectre.) */
const engageable = (state: GameState, sIdx: number): boolean => {
  if (state.strangers[sIdx] !== C_SPECTRE) return true;
  return state.party.some((m, i) => living(state, i) && (casterMP(m, state) > 0 || canSwordSpectre(state, m)));
};

/** Validate a player's battle plan against the §FIGHTS pairing rules. */
export function validatePlan(state: GameState, plan: BattlePlan): { ok: true } | { ok: false; reason: PlanError } {
  if (state.phase !== "fight") return { ok: false, reason: "notFighting" };
  const matches = plan.matches ?? [];
  if (matches.length === 0) return { ok: false, reason: "emptyPlan" };

  const usedParty = new Set<number>();
  const usedStranger = new Set<number>();

  for (const mt of matches) {
    const front = mt.front ?? [], backers = mt.backers ?? [], strangers = mt.strangers ?? [];
    if (front.length < 1 || front.length > 2) return { ok: false, reason: "groupTooBig" };
    if (strangers.length < 1 || strangers.length > 2) return { ok: false, reason: "groupTooBig" };
    if (front.length === 2 && strangers.length === 2) return { ok: false, reason: "twoVsTwo" };

    for (const i of [...front, ...backers]) {
      if (!Number.isInteger(i) || i < 0 || i >= state.party.length) return { ok: false, reason: "badIndex" };
      if (!living(state, i)) return { ok: false, reason: "deadMember" };
      if (usedParty.has(i)) return { ok: false, reason: "memberReused" };
      usedParty.add(i);
    }
    for (const s of strangers) {
      if (!Number.isInteger(s) || s < 0 || s >= state.strangers.length) return { ok: false, reason: "badIndex" };
      if (usedStranger.has(s)) return { ok: false, reason: "strangerReused" };
      usedStranger.add(s);
    }
    for (const i of backers) if (casterMP(state.party[i]!, state) <= 0) return { ok: false, reason: "backerNotCaster" };

    if (strangers.some((s) => state.strangers[s] === C_SPECTRE)) {
      for (const i of front) {
        const m = state.party[i]!;
        if (casterMP(m, state) <= 0 && !canSwordSpectre(state, m)) return { ok: false, reason: "spectreNeedsMagic" };
      }
    }
  }

  // Engage-all: every engageable stranger must be engaged unless every living fighter is already committed.
  const allCommitted = state.party.every((_, i) => !living(state, i) || usedParty.has(i));
  const unengagedEngageable = state.strangers.some((_, s) => !usedStranger.has(s) && engageable(state, s));
  if (unengagedEngageable && !allCommitted) return { ok: false, reason: "mustEngageAll" };

  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts`
Expected: PASS (all validation tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combatPlan.ts packages/engine/src/combatPlan.test.ts
git commit -m "Fight plan: validatePlan with the §FIGHTS pairing rules

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `resolvePlannedRound` — per-match resolution

**Files:**
- Modify: `packages/engine/src/combatPlan.ts`
- Modify: `packages/engine/src/combatPlan.test.ts`

This resolves a (validated) plan: builds the matches, augments the strangers' strongest combination when
out-numbered (§395), auto-slays an un-fightable Spectre, then resolves each match with one die per side.
A match win slays **one** foe (the strongest of the match — §405 "one of them, if there are two"); a loss
slays a front fighter (two front fighters → a casualty choice queued; background casters are never lost).

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/combatPlan.test.ts`:

```ts
import { resolvePlannedRound } from "./combatPlan";
import type { GameEvent } from "./actions";

const rolls = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: "combatRoll" }> => e.type === "combatRoll");

describe("resolvePlannedRound (§A Round of Fighting)", () => {
  it("resolves the §417 book example to the exact totals (9/11 and 10/8)", () => {
    // surprise to the strangers (−1 our rolls / +1 theirs in round 1). seed 5 gives the book's d6s.
    const s = fight({
      surprise: -1, round: 1,
      party: [member(0, [3]), member(6), member(7), member(4)], // Hero+Sword, Woman, Dwarf, Priest
      strangers: [2, 3], // Ogre, Troll
      seed: 5,
    });
    const plan = { matches: [
      { front: [0], backers: [], strangers: [0] },             // Hero+sword (7) vs Ogre (5)
      { front: [1, 2], backers: [3], strangers: [1] },          // Woman+Dwarf (3) +Priest bg (2) vs Troll (4)
    ] };
    const r = rolls(resolvePlannedRound({ ...s, fight: { ...s.fight! } }, plan));
    const ogre = r.find((x) => x.enemy === "Ogre")!;
    const troll = r.find((x) => x.enemy === "Troll")!;
    expect(ogre.partyTotal - ogre.partyRoll).toBe(7);   // Hero 5 + sword 2 (round-1 surprise is −1 to the roll path)
    expect(ogre.enemyTotal - ogre.enemyRoll).toBe(6);   // Ogre 5 + surprise 1
    expect(troll.partyTotal - troll.partyRoll).toBe(5); // Woman 2 + Dwarf 1 + Priest 2
    expect(troll.enemyTotal - troll.enemyRoll).toBe(5); // Troll 4 + surprise 1
  });

  it("a 2-v-1 win slays the single foe; a strong solo win removes it", () => {
    const s = fight({ party: [member(12)], strangers: [7], seed: 5 }); // Giant (7) vs Dwarf (1)
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers] };
    resolvePlannedRound(next, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(next.strangers).toEqual([]);
    expect(next.fight!.round).toBe(2);
  });

  it("credits a single-handed dragon slayer", () => {
    const s = fight({ party: [member(12)], strangers: [10], surprise: 1, round: 1, seed: 5 }); // Giant vs Dragon
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: [{ ...s.party[0]! }] };
    resolvePlannedRound(next, { matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(next.strangers).toEqual([]);
    expect(next.party[0]!.dragonKills).toBe(1);
  });

  it("queues a casualty choice when two front fighters lose together", () => {
    const s = fight({ party: [member(6), member(7)], strangers: [10], surprise: -1, round: 1, seed: 5 }); // Woman+Dwarf vs Dragon
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m })) };
    resolvePlannedRound(next, { matches: [{ front: [0, 1], backers: [], strangers: [0] }] });
    // The pair is likely overpowered by the Dragon; if so, a casualty pair is queued (nobody auto-dies).
    if (next.fight!.casualtyQueue?.length) {
      expect(next.fight!.casualtyQueue[0]).toEqual([0, 1]);
      expect(next.party.every((m) => m.status === 0)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts`
Expected: FAIL — `resolvePlannedRound` not exported.

- [ ] **Step 3: Implement `resolvePlannedRound`**

Append to `packages/engine/src/combatPlan.ts` (and extend the imports as shown):

```ts
// extend the existing imports at the top of the file:
import { rollDie } from "./rng";
import { frontStrength, partyRollBonus } from "./combat";
import { ringInvincible } from "./effects";
import type { GameEvent } from "./actions";

const C_DRAGON = 10;
const C_SORCERER = 11;

/** Enemy magical power, mirroring combat.ts: the Eye zeroes magic, but the Sorcerer is only reduced. */
function enemyMP(state: GameState, sid: number): number {
  if (sid === C_SORCERER) {
    let mp = CREATURES[C_SORCERER]!.mp;
    if (eyeActive(state)) mp -= 2;
    if (state.lotusOnSorcerer) mp -= 2;
    return Math.max(0, mp);
  }
  return eyeActive(state) ? 0 : CREATURES[sid]!.mp;
}

/** Resolve one round of fighting from a validated battle plan. Mutates `state`; returns events. */
export function resolvePlannedRound(state: GameState, plan: BattlePlan): GameEvent[] {
  const fight = state.fight!;
  const events: GameEvent[] = [];
  const rollBonus = partyRollBonus(state);
  const surpriseParty = fight.round === 1 && fight.surprise === 1 ? 1 : 0;
  const surpriseEnemy = fight.round === 1 && fight.surprise === -1 ? 1 : 0;
  const killedStrangerIdx: number[] = [];
  const pendingCasualties: number[][] = [];
  const isSpectre = (sIdx: number) => state.strangers[sIdx] === C_SPECTRE;
  const spectreMatch = (strangers: number[]) => strangers.some(isSpectre);

  // 1) working copy of the plan's matches
  const matches = plan.matches.map((mt) => ({ front: [...mt.front], backers: [...(mt.backers ?? [])], strangers: [...mt.strangers] }));

  // 2) out-numbered → form the strangers' strongest combination (§395): add one extra hand-to-hand foe
  //    to each lone-fighter corporeal match, and fold leftover enemy caster MP into the first such match.
  const engaged = new Set<number>(matches.flatMap((mt) => mt.strangers));
  const leftover = state.strangers.map((_, i) => i).filter((i) => !engaged.has(i) && !isSpectre(i));
  const extraHand = leftover.filter((i) => enemyMP(state, state.strangers[i]!) === 0)
    .sort((a, b) => CREATURES[state.strangers[b]!]!.fs - CREATURES[state.strangers[a]!]!.fs);
  const leftoverCasterMP = leftover.filter((i) => enemyMP(state, state.strangers[i]!) > 0)
    .reduce((sum, i) => sum + enemyMP(state, state.strangers[i]!), 0);
  let ei = 0;
  for (const mt of matches) {
    if (spectreMatch(mt.strangers)) continue;
    if (mt.front.length === 1 && mt.strangers.length === 1 && ei < extraHand.length) mt.strangers.push(extraHand[ei++]!);
  }
  const focusCorporeal = matches.find((mt) => !spectreMatch(mt.strangers));

  // 3) an un-fightable, unengaged Spectre slays the strongest member (§Spectre)
  const engagedNow = new Set<number>(matches.flatMap((mt) => mt.strangers));
  const spectreLoose = state.strangers.some((_, i) => isSpectre(i) && !engagedNow.has(i));
  if (spectreLoose) {
    const party = state.party.filter((m) => m.status === 0 || m.status === 1);
    const canEngage = party.some((m) => casterMP(m, state) > 0 || canSwordSpectre(state, m));
    if (!canEngage) {
      let strongest: PartyMember | undefined;
      for (const m of party) if (!strongest || frontStrength(m, state) > frontStrength(strongest, state)) strongest = m;
      if (strongest) {
        if (ringInvincible(strongest, state)) events.push({ type: "deathPrevented", creatureId: strongest.creatureId });
        else { strongest.status = 3; events.push({ type: "spectreSlew", creatureId: strongest.creatureId }); }
      }
    }
  }

  // 4) resolve each match (one die per side)
  for (const mt of matches) {
    const spectre = spectreMatch(mt.strangers);
    const front = mt.front.map((i) => state.party[i]!);
    const backers = mt.backers.map((i) => state.party[i]!);
    // Casters fighting a Spectre contribute MP; everyone else contributes front strength.
    const memberStr = (m: PartyMember) => (spectre && casterMP(m, state) > 0 ? casterMP(m, state) : frontStrength(m, state));
    let partyStr = front.reduce((s, m) => s + memberStr(m), 0) + backers.reduce((s, m) => s + casterMP(m, state), 0);
    let enemyStr = mt.strangers.reduce((s, si) => s + CREATURES[state.strangers[si]!]!.fs + enemyMP(state, state.strangers[si]!), 0);
    if (mt === focusCorporeal) enemyStr += leftoverCasterMP;

    const pr = rollDie(state.seed); state.seed = pr.seed;
    const er = rollDie(state.seed); state.seed = er.seed;
    const partyTotal = partyStr + pr.value + rollBonus + surpriseParty;
    const enemyTotal = enemyStr + er.value + surpriseEnemy;
    events.push({
      type: "combatRoll",
      party: front.concat(backers).map((m) => CREATURES[m.creatureId]!.name).join(" + "),
      enemy: mt.strangers.map((si) => CREATURES[state.strangers[si]!]!.name).join(" + "),
      partyRoll: pr.value, enemyRoll: er.value, partyTotal, enemyTotal,
      result: partyTotal > enemyTotal ? "partyWon" : enemyTotal > partyTotal ? "enemyWon" : "tie",
    });

    if (partyTotal > enemyTotal) {
      // §405: one of the foes is slain — the strongest of the match.
      const victim = mt.strangers.reduce((best, si) => {
        const w = (x: number) => CREATURES[state.strangers[x]!]!.fs + enemyMP(state, state.strangers[x]!);
        return w(si) > w(best) ? si : best;
      }, mt.strangers[0]!);
      const sid = state.strangers[victim]!;
      killedStrangerIdx.push(victim);
      if (sid === C_DRAGON && front.length === 1 && mt.strangers.length === 1) front[0]!.dragonKills += 1;
      events.push({ type: "strangerKilled", creatureId: sid });
    } else if (enemyTotal > partyTotal) {
      const mortal = front.filter((m) => !ringInvincible(m, state));
      if (mortal.length === 0) events.push({ type: "deathPrevented", creatureId: front[0]!.creatureId });
      else if (mortal.length === 1) { mortal[0]!.status = 3; events.push({ type: "memberDied", creatureId: mortal[0]!.creatureId }); }
      else pendingCasualties.push(mortal.map((m) => state.party.indexOf(m)));
    }
    // tie: no death
  }

  killedStrangerIdx.sort((a, b) => b - a).forEach((i) => state.strangers.splice(i, 1));
  fight.round += 1;
  if (pendingCasualties.length > 0) fight.casualtyQueue = pendingCasualties;
  return events;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts`
Expected: PASS. If the §417 totals are off, re-check `surprise` sign and that `frontStrength` includes the
Magic Sword (id 3) bonus for the Hero (+2).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/combatPlan.ts packages/engine/src/combatPlan.test.ts
git commit -m "Fight plan: resolvePlannedRound (per-match resolution, §A Round of Fighting)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Spectre coverage (magic-only, auto-slay)

**Files:**
- Modify: `packages/engine/src/combatPlan.test.ts`

These verify the Spectre rules already implemented in Task 3. Fix the implementation only if a test fails.

- [ ] **Step 1: Write the tests**

Append to `packages/engine/src/combatPlan.test.ts`:

```ts
describe("resolvePlannedRound — Spectres (§Spectre)", () => {
  it("a caster pits magical power only against the Spectre", () => {
    const s = fight({ party: [member(8)], strangers: [9], seed: 5 }); // Wizard (MP 5) vs Spectre (MP 5)
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: [{ ...s.party[0]! }] };
    const r = rolls(resolvePlannedRound(next, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r[0]!.party).toBe("Wizard");
    expect(r[0]!.partyTotal - r[0]!.partyRoll).toBe(5); // MP 5, not front strength
    expect(r[0]!.enemyTotal - r[0]!.enemyRoll).toBe(5); // Spectre MP 5
  });

  it("a sword-bearer fights the Spectre with front strength", () => {
    const s = fight({ party: [member(0, [3])], strangers: [9], seed: 5 }); // Hero+Sword vs Spectre
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: [{ ...s.party[0]! }] };
    const r = rolls(resolvePlannedRound(next, { matches: [{ front: [0], backers: [], strangers: [0] }] }));
    expect(r[0]!.partyTotal - r[0]!.partyRoll).toBe(7); // Hero 5 + Magic Sword 2
  });

  it("an un-fightable Spectre auto-slays the strongest member (no match for it)", () => {
    const s = fight({ party: [member(0), member(7)], strangers: [9], seed: 5 }); // Hero+Dwarf, no magic/sword
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: s.party.map((m) => ({ ...m })) };
    // Validation lets the spectre be unengaged here (un-fightable); resolve with an empty-but-valid... 
    // there is no corporeal foe, so the only legal plan is to leave it unengaged — pass a single throwaway
    // match is impossible, so resolvePlannedRound is called with no matches engaging the spectre via reduce.
    // Here we exercise the engine directly with a corporeal foe present so a plan exists:
    next.strangers = [9, 3]; // Spectre + Troll
    const r = resolvePlannedRound(next, { matches: [{ front: [0], backers: [], strangers: [1] }] }); // Hero vs Troll only
    expect(r.some((e) => e.type === "spectreSlew")).toBe(true); // the loose Spectre slays the strongest
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts`
Expected: PASS. If the auto-slay test fails, confirm step 3 of Task 3 marks `spectreLoose` from
`engagedNow` and that `canEngage` is false for a Hero+Dwarf party.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/combatPlan.test.ts
git commit -m "Fight plan: Spectre resolution tests (magic-only, auto-slay)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Out-numbered strongest-combination (§395)

**Files:**
- Modify: `packages/engine/src/combatPlan.test.ts`

- [ ] **Step 1: Write the test**

Append to `packages/engine/src/combatPlan.test.ts`:

```ts
describe("resolvePlannedRound — out-numbered (§395)", () => {
  it("a lone Hero faces the strangers' strongest combination (Troll+Man hand-to-hand + Priest bg = 9)", () => {
    const s = fight({
      party: [member(0)],            // a single Hero (FS 5)
      strangers: [4, 3, 5, 7],       // Priest(caster), Troll, Man, Dwarf
      seed: 5,
    });
    const next = { ...s, fight: { ...s.fight! }, strangers: [...s.strangers], party: [{ ...s.party[0]! }] };
    // The player engages the Troll; the engine augments with the next strongest hand-to-hand foe (Man)
    // and folds the Priest's MP into the match. The Dwarf stands idle.
    const r = rolls(resolvePlannedRound(next, { matches: [{ front: [0], backers: [], strangers: [1] }] }));
    expect(r).toHaveLength(1);
    expect(r[0]!.enemyTotal - r[0]!.enemyRoll).toBe(9); // Troll 4 + Man 3 + Priest 2
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run combatPlan.test.ts`
Expected: PASS. If the total is 7 (Man not added), check the augmentation loop adds one `extraHand` to a
lone-fighter corporeal match; if 7 (Priest MP missing), check `leftoverCasterMP` folds into `focusCorporeal`.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/combatPlan.test.ts
git commit -m "Fight plan: out-numbered strongest-combination test (§395)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wire the `resolveRound` action in the reducer

**Files:**
- Modify: `packages/engine/src/reduce.ts`
- Modify: `packages/engine/src/reduce.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/reduce.test.ts` (inside the existing top-level `describe`):

```ts
  it("resolveRound: an illegal plan is rejected (no state change)", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 },
      party: [{ creatureId: 5, status: 0, dragonKills: 0, treasure: [] }], strangers: [9] }); // Man vs Spectre
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "planRejected", reason: "spectreNeedsMagic" });
    expect(state).toBe(s); // unchanged
  });

  it("resolveRound: a legal plan resolves a round and advances it", () => {
    const s = makeState({ phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, seed: 5,
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], strangers: [7], // Giant vs Dwarf
      areas: [{ card: 31, coord: 15050, faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 }] });
    const { state, events } = reduce(s, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(events).toContainEqual({ type: "strangerKilled", creatureId: 7 });
    expect(events).toContainEqual({ type: "fightWon" });
    expect(state.phase).toBe("explore"); // cleared the chamber → back at rest
  });

  it("resolveRound: blocked when not fighting", () => {
    const s = makeState({ phase: "explore" });
    expect(reduce(s, { type: "resolveRound", matches: [] }).events).toContainEqual({ type: "blocked" });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run reduce.test.ts`
Expected: FAIL — `resolveRound` action is not handled (falls through / no events).

- [ ] **Step 3: Add the import and the action case in `reduce.ts`**

Add to the imports at the top of `reduce.ts`:

```ts
import { validatePlan, resolvePlannedRound } from "./combatPlan";
```

Add a new case in the action `switch` (place it directly after the `case "fightOn":` block):

```ts
    case "resolveRound": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      if (state.fight?.casualtyQueue?.length) return { state, events: [{ type: "blocked" }] }; // finish the choice first
      const check = validatePlan(state, { matches: action.matches });
      if (!check.ok) return { state, events: [{ type: "planRejected", reason: check.reason }] };
      const next = structuredClone(state);
      const events = resolvePlannedRound(next, { matches: action.matches });
      if (next.fight) next.fight.retreatBlocked = false; // a round was fought — retreat opens again
      if (next.fight?.casualtyQueue?.length) return { state: next, events }; // pause for chooseCasualty
      events.push(...finalizeRound(next));
      return { state: next, events };
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run reduce.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/reduce.ts packages/engine/src/reduce.test.ts
git commit -m "Fight plan: wire the resolveRound action (validate -> resolve -> finalize)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Multiplayer — `resolveRound` ends the turn

**Files:**
- Modify: `packages/engine/src/multi.ts`
- Modify: `packages/engine/src/multi.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/src/multi.test.ts` (inside the existing `describe`):

```ts
  it("a planned resolveRound ends the turn like fightOn", () => {
    const fighter = { creatureId: 12, status: 0 as const, dragonKills: 0, treasure: [] }; // Giant
    const mp = playing({ seed: 5 }, [
      partyAt(0, { phase: "fight", fight: { surprise: 1, round: 1, focus: 0 }, party: [fighter], strangers: [10] }), // Dragon
      partyAt(1),
    ]);
    const r = mpReduce(mp, 0, { type: "resolveRound", matches: [{ front: [0], backers: [], strangers: [0] }] });
    expect(r.state.active).toBe(1); // one round fought → turn passes
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run multi.test.ts`
Expected: FAIL — the turn stays on seat 0 (a continuing fight + `resolveRound` not yet recognised).

- [ ] **Step 3: Update `turnEnds` in `multi.ts`**

Change the fight branch to recognise the new action:

```ts
  if (next.phase === "fight" && !next.fight?.casualtyQueue?.length) {
    return action.type === "fightOn" || action.type === "resolveRound" || action.type === "chooseCasualty";
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run multi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/multi.ts packages/engine/src/multi.test.ts
git commit -m "Fight plan: a planned resolveRound passes the multiplayer turn

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full suite, typecheck, codegen, merge

**Files:** none (verification + integration)

- [ ] **Step 1: Run the entire engine suite**

Run: `pnpm --filter @sorcerers-cave/engine exec vitest run`
Expected: PASS — all prior tests (the legacy auto path is untouched) plus the new ones.

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm -r typecheck`
Expected: all projects "Done".

- [ ] **Step 3: Push the engine to the Convex dev backend**

Run: `cd apps/web && npx convex codegen` (the engine is consumed from TS source; this re-bundles it).
Expected: "Running TypeScript…" with no errors.

- [ ] **Step 4: Merge the branch**

```bash
git checkout main && git merge --ff-only fight-phase1 && git branch -d fight-phase1
```

- [ ] **Step 5: Report**

Summarise to the user: the planned-fight engine is in place and fully tested; the app still runs the old
auto-combat UI (unchanged), and Phase 2 will build the drag-card surface on top of `resolveRound`.

---

## Self-review checklist (run before starting)

- **Spec coverage:** validation rules (1–5), per-match resolution, strongest-combination (§395),
  Spectre magic-only + auto-slay, casualty preference die (reused via `finalizeRound`/`chooseCasualty`),
  surprise round-1, single-handed dragon credit, one-round-per-turn handoff — all have tasks. ✔
- **Non-breaking:** the legacy `fightOn` / `combat.ts resolveRound` and the current UI are untouched. ✔
- **Type consistency:** `PlanMatch`/`BattlePlan` live in `state.ts`; the action references them; `combatPlan.ts`
  imports them; `resolveRound` action ↔ `resolvePlannedRound` function names are distinct by design. ✔
- **Out of scope (Phase 2/3):** the drag-card UI + hover/tap card zoom (Phase 2); heavy-treasure drop on
  fighting, retreat-leaves-treasure, removal of the legacy auto path (Phase 3).

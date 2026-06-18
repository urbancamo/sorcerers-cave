# Fight Overhaul — Design Spec

> Created: 2026-06-18
> Status: Draft for review
> Source rules: `docs/specs/sorcerers-cave-rules.md` § FIGHTS (lines 381–426), § A Round of Fighting, § Retreat

## Goal

Replace the auto-resolving combat engine with a faithful, **player-driven fight** that mirrors the
tabletop: the strangers are laid out in a line, the player pairs their own creatures against them by
**dragging cards**, decides who fights hand-to-hand vs. who supports from the background with magical
power, drops heavy treasure to fight, then rolls the round. Combat keeps running round-by-round (each
round ends the turn) until one side is wiped/asleep or the party retreats.

**Out of scope / unchanged:** Reaction testing stays **leader-based** (one roll via the highest-priority
leader — this matches the printed rules, §345). Party-vs-party fights remain future work.

## Decisions (confirmed)

| Topic | Decision |
|---|---|
| Reaction model | **Keep leader-based** (no change to `reaction.ts`) |
| Pairing UI | **Drag cards** — drag party fighters onto stranger cards |
| Control depth | **Full manual** — player sets front-line vs background per caster, forms every 2-v-1 / 1-v-2 group, confirms before rolling |
| Outnumbered enemy grouping | **Auto strongest-combination** — when the party can't engage every stranger, the engine forms the strangers' strongest combination against the available fighter (per the book example §395) |
| Between-rounds re-pairing | **Free re-pair every round** — no locked matches; the player rebuilds the pairing each round. Reinforced by one-round-per-turn (rounds are separated by other parties' turns) |
| Turn structure | **One round per turn** — already shipped: a resolved fight round ends the seat's turn; the battle resumes on its next turn |
| Delivery | **Phased** — one design doc, then a phased implementation plan |

## Gap analysis (current `combat.ts` vs. the rules)

The current `resolveRound` does everything automatically and must be reworked:

1. **Pairing is automatic** (focus-fire, auto-gang ≤2, casters auto-assigned to the focus group). Rules
   require the *player* to pair off (§389): send 2-against-1 if the party is larger, 1-against-2 if the
   strangers are larger, and "fight the strongest" when not all can be engaged.
2. **Caster placement is automatic.** Rules (§391): each priest/wizard may *either* fight hand-to-hand
   (full strength = FS+MP) *or* stay in the background adding MP to one chosen match; any number may
   stack their MP on a single enemy.
3. **No heavy-treasure drop.** Rules (§387): hand-to-hand fighters drop heavy treasure onto the area for
   the duration (kept off so it is not lost on death); artefacts are retained; retreat leaves it behind.
4. **No between-rounds re-pairing.** Rules (§419) let the player shift forces between rounds; we go
   further and let the player re-pair freely each round (chosen over hard-locking — see decisions).
5. **Retreat partial.** Directional retreat + dead-end re-fight exist; need to confirm "leave dropped
   treasure (and artefacts on the slain) behind" (§426) and the blocked→re-fight-same-turn rule (§422).

Already correct and kept: surprise (+1 round 1), the casualty preference die (4–6 = you get your
choice, §417), tie = no death, the Spectre magic-only rules, single-handed dragon-slayer credit.

## Engine model

### Fight state

```ts
fight: {
  surprise: number;            // +1 party / -1 strangers, applied round 1 only
  round: number;
  retreatBlocked?: boolean;    // a dead-end retreat forces another round this turn
  casualtyQueue?: number[][];  // unchanged: 2-loser matches awaiting the player's choice
  // No carried-over pairing: the player re-pairs freely each round (each round is its own turn).
}

interface Match {
  strangers: number[];   // 1–2 stranger indices engaged in this match
  front: number[];       // 1–2 party indices fighting hand-to-hand
  backers: number[];     // party indices (priests/wizards) lending MP to THIS match only
}
```

The full per-round pairing is a `BattlePlan = { matches: Match[] }`. It is built on the client and
submitted as **one action** (server stays authoritative; the optimistic mirror resolves the same way).

### Actions

- `resolveRound({ matches })` — commit the plan and resolve one round. Engine **validates** then rolls.
- `retreat({ dir })` — unchanged in spirit; now also leaves dropped treasure behind.
- `chooseCasualty({ idx })` — unchanged (2-loser preference die).
- Pairing itself is **client UI state** (drag/drop); nothing is sent until the player rolls or retreats.
  (Rationale: avoids per-drag round-trips, keeps multiplayer to one authoritative mutation per round.)

### Plan validation (rejected with a typed reason → UI inline error)

1. Each stranger and each party member appears in **at most one** match (front XOR backer).
2. `front.length` ∈ {1,2}; a single fighter may face at most 2 strangers (`strangers.length` ≤ 2 only
   when `front.length` === 1) — encodes "send two against one" / "send one against two" (§389).
3. **Backers must be casters** (MP > 0) and may stack without limit on one match (§391).
4. **Engage-all rule:** if the party can engage every stranger (enough fighters for ≥1 match each, or
   1-v-2 coverage), it must; leftover strangers are allowed only when the party is too small ("fight the
   strongest", §389). When out-numbered, the engine auto-forms the strangers' **strongest combination**
   against the engaged fighter (§395) rather than leaving extras idle.
5. A Spectre's match must contain only its valid engagers (caster MP, or a Magic-Sword-bearing
   Man/Woman/Hero) — reuses the rule already implemented in `combat.ts`.

The player re-pairs freely each round (no carried-over locking) — natural now that each round is a
separate turn.

### Round resolution (per match, §405)

```
partyStrength = Σ frontStrength(front) + Σ casterMP(backers)
enemyStrength = Σ (stranger FS + stranger MP)   // strangers use ring/staff/sword to best advantage
partyTotal = partyStrength + d6 + ringBonus − curses + (round 1 && party surprise ? 1 : 0)
enemyTotal = enemyStrength + d6 + (round 1 && stranger surprise ? 1 : 0)
higher wins; loser slain (background casters are NOT vulnerable); tie = no death
```

- On a **2-fighter loss**, push to `casualtyQueue`; the player picks via the existing preference die.
- On a **win**, remove the stranger(s); credit a single-handed dragon-slayer.
- After all matches: `round++`; if `casualtyQueue` is non-empty the round pauses for the choice
  (existing flow). Surviving fighters return to the tray for fresh re-pairing next round.

### Heavy treasure on fighting (§387, §426)

- When a member is committed to a **front** role, any heavy treasure (Silver/Gold/Gems/Chest) they carry
  is moved to the **area floor** at resolve time (so it is safe if they die). Artefacts stay carried.
- Win → the dropped treasure is part of the ensuing **pickup** phase (re-claimable, reusing the
  drop-during-pickup fix already shipped).
- **Retreat** → all treasure dropped in the area (including artefacts on slain carriers) is left behind.

### Between rounds (§419)

- The player **re-pairs freely** at the start of each round — all fighters return to the tray and the
  whole plan is rebuilt. (We chose this over hard-locking surviving hand-to-hand pairs; with one round
  per turn, the player is already setting up afresh on each of their turns, so free re-pairing is the
  natural, lower-friction model.)
- Surviving strangers and party members carry over (in the engine state); only the *pairing* is rebuilt.

## UI interaction (drag-card fight surface)

A new full-screen fight layer (replacing the bottom action bar while `phase === "fight"`). Stranger
cards sit in a line at the top; the party tray sits below; the player drags party cards onto a stranger
to form a match, drops a second party card on the same foe for 2-v-1, drags a fighter onto two adjacent
strangers for 1-v-2, and drops a priest/wizard onto a match's **background slot** to lend MP.

```
┌─ FIGHT · Round 1 · (strangers surprised you: −1 this round) ──────────────┐
│  STRANGERS                                                                 │
│    ┌─────────┐        ┌─────────┐                                          │
│    │ Ogre  5 │        │ Troll 4 │                                          │
│    └────┬────┘        └────┬────┘                                          │
│   match │ A          match │ B                                             │
│    front│                  │ front: Woman(2) · Dwarf(1)                    │
│    Hero+Sword (7)          │ background: Priest (+2)                       │
│                                                                            │
│  YOUR PARTY  (drag onto a foe · drag onto a match's ✦ for background)      │
│    ┌────────┐  (all assigned)                                              │
│                                                                            │
│  ⚠ Heavy treasure dropped to fight: Gold (Hero) — left behind if you retreat│
│                                                                            │
│  [ Roll the round ]    [ Retreat ▾ N E S W ↑ ↓ ]    [ Reset pairing ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Drag affordances:** party card → stranger = front; party card → match ✦ slot = background (casters
  only); invalid drops snap back with a reason toast. Live strength totals per match update as you drag.
- **Validation feedback:** "Roll" is disabled until the plan is legal; the unmet rule is shown inline
  (e.g. "A Spectre can only be fought with magic or the Magic Sword").
- **Resolution:** on Roll, the existing per-match dice overlay (`DiceRoll`) plays for each match in turn;
  2-loser matches then prompt the casualty choice.
- **Between rounds:** every fighter returns to the tray; the player rebuilds the pairing each round.
- **Accessibility fallback:** every drag has a keyboard/tap equivalent (select fighter → select target),
  so the surface is usable without a pointer. (Tap-to-assign was the runner-up UI; we get it for free as
  the a11y path.)

## Multiplayer

- The plan is the acting seat's private client state; only `resolveRound`/`retreat` hit Convex, so the
  turn-gating and authority model are unchanged. Spectators see the resolved dice, not the in-progress
  pairing. Dropped heavy treasure uses the shared area floor (consistent with existing drop semantics).

## Phasing

**Phase 1 — Engine: battle-plan model + round resolution.** New `Match`/`BattlePlan` types,
`resolveRound({matches})` with full validation (incl. auto strongest-combination for out-numbered
fighters), player-driven per-match resolution, casualty preference die retained. Headless tests only.
Reaction unchanged. *Deliverable: the engine resolves any legal player pairing; comprehensive vitest
coverage of pairing rules.*

**Phase 2 — UI: drag-card fight surface.** New fight layer, drag/drop pairing, background slots, live
totals, validation gating, dice overlay per match, keyboard/tap fallback; wired in solo + multiplayer.
*Deliverable: fully playable manual fights in the browser.*

**Phase 3 — Treasure & retreat fidelity.** Heavy-treasure auto-drop on front assignment; left-behind on
retreat (incl. artefacts on the slain); blocked-retreat → re-fight same turn. (Outnumbered
strongest-combination grouping lands in Phase 1 with the engine; free re-pairing needs no extra work.)
*Deliverable: full §FIGHTS fidelity.*

## Testing strategy

- **Engine (vitest):** plan validation (each constraint above, with rejection reasons); the book worked
  example (§417: hero+sword/woman/dwarf/priest vs ogre+troll → exact totals 9/11 and 10/8); 2-v-1 and
  1-v-2 resolution; background MP stacking; auto strongest-combination when out-numbered; Spectre constraints;
  treasure drop on front assignment and left-behind on retreat; surprise round-1 only.
- **Frontend (vitest + RTL):** plan builder reducer (assign/unassign/background/reset), validation
  gating of the Roll button, dice overlay sequencing, keyboard/tap fallback parity with drag.
- **Manual:** solo and multiplayer full fights end-to-end, including retreat and wipe paths.

## Resolved decisions (were open questions)

1. **Enemy grouping when outnumbered → auto strongest-combination.** When the party can't engage every
   stranger, the engine forms the strangers' strongest combination against the engaged fighter (§395),
   rather than leaving extras idle.
2. **Between-rounds pairing → free re-pair every round.** No hard-locking of surviving hand-to-hand
   pairs; the player rebuilds the plan each round. This is reinforced by one-round-per-turn (already
   shipped): rounds are separated by other parties' turns, so re-setup each turn is the natural model.

# Technical Specification — Combat Revision

`DATE: 03-OCT-2026`
`STATUS: DRAFT FOR REVIEW — no code has been changed`
`IMPLEMENTS: [2026-09-03-combat-revision.md](2026-09-03-combat-revision.md)`
`RULES SOURCES: [fighting-a-match.md](../../rules/fighting-a-match.md), [each-round-is-fought.md](../../rules/each-round-is-fought.md), [strangers-default-loadout.md](../../rules/strangers-default-loadout.md), [Expanded Consolidated Rules PV2026.md](../../rules/Expanded%20Consolidated%20Rules%20PV2026.md) (§FIGHTS, §Fights between Exploring Parties, ARTEFACTS – WHO CAN USE?)`

---

## Open questions — register

**Everything below is open as of 03-OCT-2026.** There are **43** items: 16 rules questions for Peter (Q-R), 6 default-loadout questions and 3 data discrepancies (Q-L, D), 5 technical questions (Q-T), and 13 product/requirement decisions (G). **★ = blocks the start of M1** (§10). Each item is a short summary; the reasoning, evidence and file references are
in the cited section. When an item is answered, record the answer in that section and mark it here.

### A. Rules — for Peter (detail: §9.1)

- ★ **Q-R1** — *Triggering a Fight* has no defining document. Who attacks in round 1 for each trigger (hostile reaction, party Attack, pacified-chamber Attack, Demon ambush, retreat bounce-back)? Does the role strictly alternate every round?
  - **Proposed default:** Strangers attack on hostile/Demon; party on Attack; strict alternation
  - **Blocks:** M1

- **Q-R2** — Scroll: is "destroy" usable in any round the party attacks, with the two surprise variants only before round 1?
  - **Proposed default:** Yes
  - **Blocks:** M2

- ★ **Q-R3** — "Front line of any match does not exceed two": per side, with 2v2 still banned? May unengaged creatures of the larger side join an already-engaged match?
  - **Proposed default:** Per side; 2v2 banned; joining allowed
  - **Blocks:** M1

- ★ **Q-R4** — When and how do magic users commit to the background, for **both** sides? Any number per match? May a lone caster stay back?
  - **Proposed default:** Larger side in step (d), smaller with its front line; a lone caster fights
  - **Blocks:** M1

- ★ **Q-R5** — Stranger casualty: the winning player nominates and on 4–6 the **other** dies — is the nominated creature the one **spared**? Whose Ring adds the +1?
  - **Proposed default:** Nominated = spared; losing side's Ring
  - **Blocks:** M1

- **Q-R6** — Must the Ring-bearer be among the fighters for the side to get +1, or is any living holder enough?
  - **Proposed default:** Any living holder (today)
  - **Blocks:** M2

- ★ **Q-R7** — *(Partly answered by the default loadout.)* When is the loadout re-run — only at fight start, or also after a bearer dies, when deserters join, or a Demon arrives later? May strangers pick up artefacts dropped mid-fight?
  - **Proposed default:** Start, and at the next deployment after a bearer dies; no mid-fight pickup
  - **Blocks:** M1

- **Q-R8** — Does a bonus follow the card text (Sword: Man/Woman/Hero only) rather than the *who can use* table? Is the Dwarf-**ally** Ring blank a typo (the card allows a Dwarf)?
  - **Proposed default:** Card text; typo
  - **Blocks:** M1

- **Q-R9** — Where do Spectre/Demon sit in the new flow, and when does "strongest creature is slain" occur? Can a Spectre be a stranger attacker's paired creature?
  - **Proposed default:** Resolved at step (e) before matches; engageable only by magic/Sword/Axe/Shield
  - **Blocks:** M2

- **Q-R10** — In a round where the strangers attack, may the player use consumables (Strength Potion, Lotus Dust, Holy Water) or only deploy?
  - **Proposed default:** Only deploy
  - **Blocks:** M2

- **Q-R11** — Hidden Cards variant: may strategies see face-down player cards?
  - **Proposed default:** No
  - **Blocks:** M2

- **Q-R12** — Do casters count toward the defender's minimum deployment?
  - **Proposed default:** Yes
  - **Blocks:** M1

- **Q-R13** — Multiplayer vs strangers: with several parties or a union, who attacks/defends and in what order?
  - **Proposed default:** One party at a time
  - **Blocks:** M7

- **Q-R14** — *Ending a Fight* has **no document**: end conditions (incl. "put to sleep"), retreat procedure/timing, engaged creatures, loot. Are *Wrap Up the Round* and *Ending a Fight* round/fight-level rather than per-match?
  - **Proposed default:** Today's behaviour (§4.2.0)
  - **Blocks:** M2

- **Q-R15** — Scope and timing of *Stranger Fight Preparations*: loadout only, or also an initial stance? Once before round 1, or again for reinforcements?
  - **Proposed default:** Loadout only; once, and again after a bearer dies or strangers are added
  - **Blocks:** M1

- **Q-R16** — *(New.)* The loadout document defines how strangers are **equipped**. Is there a matching default **pairing** procedure for the strangers' `deploy` / `engage` / `redeploy` / background decisions, or should one be derived from the objective in G1?
  - **Proposed default:** Derive from the G1 objective until one is supplied
  - **Blocks:** M2


### B. Default loadout and data — for Peter (detail: §9.1a)

- **Q-L1** — The Sword/Axe lists rank the Thief above the Woman, but a Thief gains **nothing** from either; the engine makes a Thief-borne **Shield** inert. Intended?
  - **Proposed default:** Keep the lists, skip an artefact whose bearer gains nothing
  - **Blocks:** M0

- **Q-L2** — The Staff list prefers Sorcerer/Apprentice/Witch, but the engine only boosts Priest (+1) and Wizard (+2). Does the Staff bonus apply to the whole Priest class, and at what values?
  - **Proposed default:** Confirm with Peter
  - **Blocks:** M0

- **Q-L3** — Define "weapon" (Axe "with no weapon", Shield "with a weapon", Ring's "weapon artefacts already borne"): Sword only, or Sword and Axe? Is the Staff one?
  - **Proposed default:** Sword or Axe
  - **Blocks:** M0

- **Q-L4** — Ring "adjusted strength": fighting strength only, or FS + MAG including the Staff bonus?
  - **Proposed default:** FS + MAG (Q-R6 decides whether the bearer must fight)
  - **Blocks:** M0

- **Q-L5** — "Eye present in the area": the engine only honours an Eye **held by the party**. Should an Eye on the chamber floor also count, for both sides?
  - **Proposed default:** Yes
  - **Blocks:** M0

- **Q-L6** — Confirm the loadout trigger (see Q-R7) and the wording "creature in the party" in Step 5 (the *stranger* party?).
  - **Proposed default:** Confirm
  - **Blocks:** M0

- **D1** — Data: rules say **Hero STR 6**; the engine has Hero fs **5**. Which is right?
  - **Proposed default:** Peter to decide
  - **Blocks:** M0

- **D2** — Data: rules say **Spectre STR 4 (MAG 4)**; the engine has fs 0, mp **5**. Which is right?
  - **Proposed default:** Peter to decide
  - **Blocks:** M0

- **D3** — Data: the Staff card says +2 for Priest **or** Wizard; the engine gives the Priest +1. Deliberate house rule?
  - **Proposed default:** Peter to decide
  - **Blocks:** M0


### C. Technical — for engineering (detail: §9.2)

- **Q-T1** — Is `combatRevision` a per-game flag that defaults off (this spec's assumption), or do we migrate everything and retire the old engine?
  - **Proposed default:** Per-game flag; flip the default later
  - **Blocks:** M1

- **Q-T2** — Neural network: hosting, auth, latency SLA, cost ceiling — and may we send full state or only the human-visible view?
  - **Proposed default:** Human-visible view only
  - **Blocks:** M6

- **Q-T3** — What CPU budget can the `expert` strategy use inside a Convex mutation? (Measure against current limits.)
  - **Proposed default:** Measure first
  - **Blocks:** M5

- **Q-T4** — Should PvP migrate onto the new round engine, or stay on `multi-fight.ts`?
  - **Proposed default:** Migrate in M7
  - **Blocks:** M7

- **Q-T5** — May we add a property-testing dependency (`fast-check`)?
  - **Proposed default:** Yes
  - **Blocks:** M1


### D. Product and requirement decisions (detail: §9.3)

- **G1** — Define "maximum effect" and what the difficulty levels mean.
  - **Proposed default:** §5.4 objective and levels
  - **Blocks:** M2

- **G2** — The neural-network contract: model, inputs, SLA, hosting, cost, fallback, privacy, versioning, ownership.
  - **Proposed default:** Draft in §5.6
  - **Blocks:** M6

- **G3** — What may a strategy see (hidden cards, other parties' secrets)?
  - **Proposed default:** Human-visible only
  - **Blocks:** M2

- **G4** — Backwards compatibility for in-flight games, saved codes, replays and golden snapshots.
  - **Proposed default:** Per-game flag (Q-T1)
  - **Blocks:** M1

- **G5** — Multiplayer scope: PvE only, or PvP too? Do 45-second windows apply to stranger decisions?
  - **Proposed default:** PvE first; no windows
  - **Blocks:** M7

- **G6** — UX for *defending* and for step (d): wireframes, mobile, accessibility.
  - **Proposed default:** Draft in §7.1
  - **Blocks:** M4

- **G7** — Should leaderboards be segmented by difficulty level (as they are by kit)?
  - **Proposed default:** Yes
  - **Blocks:** M5

- **G8** — How are stranger decisions logged and shown in replay, and how does a bug report show "why"?
  - **Proposed default:** §5.2 logged actions + `why` trace
  - **Blocks:** M3

- **G9** — Test Mode support: force a level, script a stranger formation.
  - **Proposed default:** Add controls
  - **Blocks:** M3

- **G10** — Success metrics: win-rate bands per level, decision latency, fallback rate.
  - **Proposed default:** Set after the bench (§8)
  - **Blocks:** M5

- **G11** — Ship R5 (UI legality) first on the current engine, as M4a?
  - **Proposed default:** Yes
  - **Blocks:** M4a

- **G12** — One rules authority: how Peter's documents trace to the engine spec.
  - **Proposed default:** Appendix A
  - **Blocks:** M0

- **G13** — *Triggering a Fight* and *Ending a Fight* have no rules documents; overview and Peter's step names differ.
  - **Proposed default:** §4.2.0 mapping
  - **Blocks:** M0


---

## 0. Summary

Peter's two rules documents describe combat as a **round-by-round engagement protocol**: the attacker and
defender *alternate each round*; the defender deploys a front line; the attacker pairs against it; the larger
side then redeploys within limits; matches that are unresolved **persist** into the next round; and
strangers use artefacts "to best advantage".

The current implementation is a different shape. The *player* supplies a complete pairing every round,
strangers are an undifferentiated list of creature ids with no equipment and no decisions, nothing persists
between rounds, and the stranger side is never an attacker. Implementing the revision therefore means:

1. a **new round engine** (phases a–f) with persistent engagements and alternating roles,
2. **stranger inventories** (so strangers can bear artefacts),
3. a **pluggable decision layer** for everything the stranger side must decide, with stranger decisions
   recorded as ordinary logged actions (so replay never calls a strategy),
4. an **engine-owned legality layer** that both the UI and the strategies use, so an illegal formation
   cannot be built, and
5. a **strategy test harness** that can evaluate strategies exhaustively.

All of it ships behind a per-game rules flag (`variants.combatRevision`) so in-flight games, saved codes,
replays and golden snapshots keep their current behaviour.

The engine phases follow the **Combat Round Overview** in the high-level spec one-to-one (§4.2.0). Two of its
steps — *Triggering a Fight* and *Ending a Fight* — are not defined by any rules document yet (Q-R1, Q-R14).

The questions that block the start of M1 are marked **★** in the register above; everything else is tracked there too.

---

## 1. Current state (what the code does today)

### 1.1 Engine — solitaire and multiplayer-vs-strangers (`packages/engine/src`)

| Aspect | Today | Where |
|---|---|---|
| Strangers | `state.strangers: number[]` — creature ids only. No equipment, no per-stranger state. Chamber draw is capped at `MAX_STRANGERS = 8`. | `state.ts`, `chamber.ts:6` |
| Who pairs | The **player** sends `resolveRound { matches: PlanMatch[] }` every round: per match `front[1–2]`, `backers[]`, `strangers[1–2]`. | `actions.ts:20`, `combatPlan.ts` |
| Stranger "strategy" | None. When the party runs out of free fighters the engine auto-attaches the strongest leftover strangers onto lone fighters ("strongest combination", §395) and folds leftover enemy casters' MP into the first non-Spectre match. | `previewPlan`, SC-9.1-10/11 |
| Roles | No attacker/defender concept. Round 1's `surprise` (+1 party, −1 strangers) is the only trace of who initiated. | `FightState` |
| Persistence | None. A `BattlePlan` is rebuilt every round. There is no "engaged" state. | `state.ts:104-123` |
| Strength | `frontStrength`, `casterMP`, `enemyMP`, `partyRollBonus` — party and stranger arithmetic live in **different** functions (`combat.ts` vs `combatPlan.ts`). Artefact bonuses are possession-based for the party and absent for strangers. | `combat.ts`, `combatPlan.ts:previewPlan` |
| Casualties | One loser → dies. Two front-line losers → `casualtyQueue`; player names a preference; d6 4–6 grants it. Stranger casualties: strongest foe in the match dies, automatically. | SC-9.5-3/4/5, SC-9.3-10 |
| Scroll | One variant only (destroy every non-magical stranger), offered in `encounter` **and** `fight` in any round, then curses. | `reduce.ts:1447` |
| Immaterial foes | Spectre/Demon rules are spread through validation, preview and resolution (`MAGIC_ONLY_IDS`, `magicOnlyBypass`, forced-Spectre round). | `combatPlan.ts` |
| Retreat | Legal only in `fight`, round > 1, not after a trap fall; dead end sets `retreatBlocked`. | SC-9.5-6/7 |

Fight starts: hostile reaction / hostile-on-sight → `startFight(state, -1)`; Demon ambush → `-1`; Attack with a
fresh entry → `+1`; Attack on a pacified chamber → `0` (`reduce.ts:147-164, 1113, 1129, 1134`).

### 1.2 Engine — player-versus-player (`multi-fight.ts`, ~750 lines)

PvP is a **separate implementation** that already models the shape Peter describes: `declarePvp →
setDefenderLine → setAttackerEngage → setDefenderCasters → resolveRoundPvp`, with `PvpEngagement
{ attackers, defenders }`, `PvpBacker`, an alternating round owner, 45-second reaction windows, and
per-side dice substreams. It reuses solo arithmetic (`frontStrength`, `casterMP`) but not the solo pairing.
**Peter's rules are, in effect, the PvP protocol generalised to stranger parties.**

### 1.3 Server (`apps/web/convex`)

- `game.applyAction` is a Convex **mutation**: auth → `reduce(state, action)` → patch `games.state` →
  append `{seq, action, events}` to `gameEvents`. `multiplayer.ts` has its own equivalent; multiplayer
  fights against strangers go through the same pure `reduce` via `compose(mp, party)` (`multi.ts:516`).
- **Replay** is `replay(seed, picks, actions, variants, testMode)` — a pure fold of the logged actions through
  `reduce`. A game's correctness on replay depends on `reduce` being deterministic given the log.
- The action argument validator is **hand-maintained and duplicated** in `game.ts:14` and `multiplayer.ts:~20`
  (a past regression is recorded at `game.test.ts:515`). Any new action or field must be added to both.
- `variants` is a typed object on the `games` row (`schema.ts`), threaded through `newGame`, `startTestGame`,
  `replay`, `replayByCode`, `highScores.log` and the web `ReplayBundle`.

### 1.4 Front end (`apps/web/src/game`)

- `FightSurface.tsx` (355 lines) builds a `PlanDraft` (`fightPlan.ts`, 60 lines) by tap/drag; it calls
  `validatePlan` and `previewPlan` **after** every placement and shows a reason string. Illegal drafts can be
  built (`place` allows a backer with no front fighter; the plan is merely flagged).
- Rule knowledge leaks into the UI: `REASON` strings, `MAGIC_ONLY` ids (`C_SPECTRE`, `C_DEMON`), the
  forced-Spectre derivation and the doomed-member calculation are all re-derived in the component.
- `PvpFightSurface.tsx` (493 lines) is a second, structurally different fight UI.

### 1.5 Gap analysis — Peter's steps against today

| Peter | Rule | Today | Gap |
|---|---|---|---|
| (a) | Scroll: attacker only, not under the Eye; 3 variants (destroy non-magical / double surprise / add surprise); then cursed | One variant; any round; no attacker check | Variants 2 and 3 missing; "attacking only" not enforced; Eye check not seen in the Scroll path (to verify) |
| (b) | Defender deploys ≥ as many unengaged creatures as the attacker has unengaged; may hold surplus back | No defender step | New phase and new decision |
| (c) | Attacker pairs its unengaged creatures one-to-one against the defender's unengaged front line | Player pairs freely; strangers never pair | Strangers cannot attack; pairing is not "against a deployed line" |
| (d) | Larger party redeploys unengaged + background creatures; engaged creatures fixed; number of matches fixed; ≤ 2 front-line per match | Gang-up is automatic and only when the party is out of fighters | The larger side's redeployment is a real decision (and a strategy hook for strangers) |
| (e) | Fight each match (Step i–iv) | Implemented, but strength arithmetic is split | Unify; add stranger artefacts, Shield match-scoping, Ring and surprise `{0,1,2}` |
| (f) | Dissolve dead matches; background → unengaged; engaged front line stays; alternate turn | No persistence; no alternation | New state and new flow |
| Step ii-iv | Stalemate (both zero) / tie / win; tie and stalemate are **unresolved** | `tie` → nothing happens (no persistence) | Persist unresolved matches |
| Casualty | Stranger casualty choice passes to the **winning player**; d6 4–6 → the **other** creature dies | Strongest foe dies automatically | New stranger-casualty rule (see Q-R5) |
| Overview: *Triggering a Fight* | A named step; no rules document defines it | Five `startFight` call sites choose only a surprise value (+1 / 0 / −1) | No explicit attacker/defender, no trigger kinds (Q-R1) |
| Overview: *Stranger Fight Preparations (stranger party only)* | Artefact allocation per `strangers-default-loadout.md`; possibly more | Nothing — strangers carry nothing | New phase before round 1 (§4.2.0, §4.4.1); scope to confirm (Q-R15) |
| Overview: *Ending a Fight* | Referenced by Peter's step (f) ("See: Ending a Fight") but **no document exists** | Rules scattered in SC-9.5 (retreat, loot, wipe-out) and `finalizeRound` | A defined end-of-fight procedure is missing (Q-R14) |

---

## 2. Goals and non-goals

| Req | Goal | Delivered by |
|---|---|---|
| R1 | Pair strangers for maximum effect | §5 strategies; §5.4 baseline objective |
| R2 | Strangers use artefacts | §4.4 stranger inventory; §4.3 effective-strength engine |
| R3 | Player must match strangers as best they can | §4.2 round engine; §4.5 legality layer (mandatory deployment) |
| R4 | Pluggable pairing strategies | §5.1 interface; §5.5 registry/levels; §5.6 external strategy |
| R5 | UI guarantees a legal formation | §4.5 legality layer; §7 front end |
| Testing | Exhaustive strategy evaluation at scale | §8 |

**Non-goals (this spec):** changing the reaction/encounter rules; Hidden Cards and Zombies variants (flagged in §9);
the content of the neural network itself (only its integration contract); re-theming the fight UI beyond what the
new phases require.

---

## 3. Design principles

1. **One implementation.** Solo, multiplayer-vs-strangers and (later) PvP run on the same round engine. No new
   rule is written twice.
2. **Pure and deterministic.** `reduce` stays synchronous and replayable. Anything non-deterministic or remote
   (a neural network) happens **outside** `reduce` and enters as a logged action.
3. **Stranger decisions are first-class actions.** They are validated by the engine exactly like player
   actions, written to `gameEvents`, and shown in replays. A strategy is therefore never needed to replay a game.
4. **Legality is single-sourced.** The engine exposes the legal moves; the UI and every strategy consume them.
   Nothing re-derives a rule.
5. **Versioned rules.** `variants.combatRevision` selects the new engine per game. Old games are untouched.
6. **Strategies see what a human would see** (all cards face-up unless a Hidden Cards variant is active).

---

## 4. Engine design

New module tree under `packages/engine/src/combat/` (the legacy `combatPlan.ts` / `combat.ts` stay for
`combatRevision: false` and are later thinned to adapters over the new strength module).

```
combat/
  model.ts        Combatant, Match, Formation, FightV2, StrangerInstance, decisions
  artefacts.ts    data-driven "who can bear / what it does" table (Peter's matrix)
  strength.ts     Step i–iv: effectiveStrength, sideTotal, result, outcome
  legality.ts     legal moves + formation validation (single source for UI and strategies)
  round.ts        the a–f phase machine (pure transitions + events)
  casualty.ts     party and stranger casualty rules
  strategy/       interface, registry, built-ins (novice / standard / expert), evaluator
  index.ts
```

### 4.1 Domain model

```ts
export type Side = "party" | "strangers";

/** A creature in the fight, addressable independently of its array position. */
export interface CombatantRef { side: Side; idx: number }          // idx into state.party / state.strangerSet

export interface StrangerInstance {
  creatureId: number;
  carrying: number[];            // treasure ids this stranger holds (artefacts it may bear)
  borne: number[];               // subset currently borne ("to best advantage")
}

/** One engagement. Each side has 1–2 front-line creatures and any number of background casters. */
export interface Match {
  id: number;                    // stable across rounds so logs/UI can follow a match
  front: { party: number[]; strangers: number[] };
  back:  { party: number[]; strangers: number[] };   // casters lending MAG; reset each round (Step f)
}

export interface FightV2 {
  trigger: FightTrigger;         // how the fight began — fixes the first attacker and the surprise bonus (Q-R1)
  stage: "prep" | "rounds" | "ended";   // Stranger Fight Preparations → rounds → Ending a Fight
  round: number;
  attacker: Side;                // alternates each round (Q-R1)
  firstRoundSurprise: { party: 0 | 1 | 2; strangers: 0 | 1 | 2 };   // Scroll can raise it (Q-R2)
  matches: Match[];              // persisted engagements (unresolved matches carry over)
  deployed: { party: number[]; strangers: number[] };   // unengaged creatures already in the front line this round
  pending: PendingDecision | null;                      // who must decide what next (drives UI and drivers)
  scrollUsedHere: boolean;       // "cannot be used twice in one area"
  casualtyQueue?: CasualtyChoice[];
  retreatBlocked?: boolean;
}

export type PendingDecision =
  | { by: Side; kind: "scroll" }                 // attacker only
  | { by: Side; kind: "deploy"; min: number }    // defender, step (b)
  | { by: Side; kind: "engage" }                 // attacker, step (c)
  | { by: Side; kind: "redeploy" }               // larger side, step (d)
  | { by: Side; kind: "casualty"; pair: CombatantRef[] };
```

`engaged` is derived (a creature is engaged iff it is in the front line of a match), never stored.

**State change.** `state.strangers: number[]` becomes `state.strangerSet: StrangerInstance[]` when
`combatRevision` is on. Everything that reads `state.strangers` (reaction, hazards, Mutiny deserters,
Scroll, Holy Water, Lotus Dust, Gallery statues, projection/rendering) must go through a small accessor
(`strangerIds(state)`) during the transition. This is the largest blast radius in the change; see §10 risks.

### 4.2 Round engine (Peter's steps a–f)

#### 4.2.0 Fight lifecycle — the Combat Round Overview

The phases below are the **Combat Round Overview** of the high-level spec, named identically so the document and
the code can be read side by side.

| Overview step | Peter's source | Engine phase | Decided by | Notes |
|---|---|---|---|---|
| Triggering a Fight | *none* | `trigger` | engine | Sets `trigger`, the first attacker and the surprise bonus (below) |
| Stranger Fight Preparations (stranger party only) | `strangers-default-loadout.md` | `prep` | strangers' `assignArtefacts` | Once, before round 1; runs `defaultLoadout` (§4.4.1) |
| The Scroll Option | Each Round, step a | `round.a` | attacker | |
| Defender Prepares Their Defense | step b | `round.b` | defender | |
| Attacker Creates Engagements (Matches) | step c | `round.c` | attacker | |
| Deployment is Finalised | step d | `round.d` | larger party | |
| Calculate Effective Strength per Creature | Fighting a Match, step i | `match.i` | engine | `strength.effectiveStrength` |
| Calculate Total Effective Strength Per Side | step ii | `match.ii` | engine | `strength.sideTotal` |
| Roll Dice & Determine Results | step iii | `match.iii` | engine | one d6 per side; surprise {0,1,2}, Ring {0,1} |
| Match is Resolved | step iv | `match.iv` | engine | stalemate / tie → unresolved; win → resolved or casualty pair |
| Wrap Up the Round | Each Round, step f | `round.f` | engine | |
| Ending a Fight | referenced by step f; **no document** | `end` | engine | Q-R14 |

The overview lists *Wrap Up the Round* and *Ending a Fight* under "Each Match in the Round is Fought". I have treated
them as **round-level and fight-level** steps, as in Peter's step (f); please confirm (Q-R14).

**Triggering a Fight.** Today five `startFight` call sites choose only a surprise value (Demon ambush `-1`,
strangers' surprise `-1` ×2, party Attack `+1`/`0`). The revision makes the trigger explicit:

```ts
export type FightTrigger =
  | { kind: "partyAttack";        attacker: "party";     surprise: 0 | 1 | 2 }   // fresh doorway/carpet entry → 1; pacified chamber → 0
  | { kind: "strangersAttack";    attacker: "strangers"; surprise: 1 }           // hostile reaction / hostile-on-sight
  | { kind: "demonAmbush";        attacker: "strangers"; surprise: 1 }           // kit
  | { kind: "retreatBounceBack";  attacker: "strangers"; surprise: 0 };          // dead-end retreat — fight another round (Q-R1)
```

The `surprise` value is the *first-round* bonus for the **attacking** side; Scroll variants can raise it (Q-R2).

**Ending a Fight (provisional).** Until Peter supplies the missing rules, `end` reproduces today's behaviour so
nothing regresses: the fight ends when one side has no creature able to fight (party wiped → `gameOver`; strangers
cleared → `fightWon`, floor treasure reclaimed, fallen creatures' carried items swept into the pickup — SC-9.5-9/11),
or when the party retreats successfully (strangers and floor treasure left behind, area becomes hostile — SC-9.5-6/7/8).
Strangers never retreat.

Each step is a pure function `(state, decision) → { state, events }`; `round.ts` owns the sequencing and sets
`fight.pending` to say who acts next.

| Step | Phase | Who decides | Engine action | Notes |
|---|---|---|---|---|
| a | Scroll option | Attacker (if able and no Eye and not yet used here) | `useScroll { variant }` or `skipScroll` | Variants per Peter; cursed afterwards; strangers cannot read it |
| b | Defender deploys | Defender | `deploy { creatures[] }` | Must deploy ≥ the attacker's unengaged count (or all it has); may hold surplus back |
| c | Attacker engages | Attacker | `engage { pairs[] }` | One-to-one against the defender's *unengaged front line* until all engaged or none possible |
| d | Finalise deployment | The **larger** party | `redeploy { placements[] }` | Engaged creatures fixed; unengaged and background may move; match count fixed; ≤ 2 per side per match; 2v2 banned (Q-R3) |
| e | Fight | — (engine) | automatic | Per match: Steps i–iv; unresolved → persists; casualties queued |
| f | Wrap up | — (engine) | automatic | Dissolve matches with an empty front line; background → unengaged; flip `attacker`; open retreat for the party |

Action names here are the engine vocabulary; the Convex validators change accordingly (§6).

**Alternation in solitaire.** A "round" ends a turn (Peter / consolidated rules). Round *n* odd/even determines
who attacks. Rounds where the *strangers* attack have the player as **defender**: the player's decisions are
`deploy` (b) and, if the party is the larger side, `redeploy` (d). Rounds where the party attacks have the
**strangers** deploy first and the player `engage`s (c). This is the first time the stranger side makes a
decision in solitaire.

**Strength (Step i–iv)** is computed by `strength.ts` for *both* sides with the same code:

```ts
effectiveStrength(c: Combatant, ctx: MatchContext): number   // positional + artefact + immaterial effects
sideTotal(match, side, ctx): number                          // TES
result(match, side, roll): number                            // TES + d6 + surprise{0,1,2} + ring{0,1}
outcome(a, b): "stalemate" | "tie" | { winner: Side }        // stalemate: both zero; tie: equal non-zero
```

`ctx` carries the Eye, curses, level (Ring invincibility), the Shield's match-scoped nullification, and the
immaterial-creature rules. The artefact effects are **data**, not code branches (§4.3).

**Outcome handling:**
- `stalemate` / `tie` → match **unresolved** and persists (a Shield-vs-Spectre standoff is a stalemate, as today).
- `win`, loser front line = 1 → that creature dies; match **resolved**.
- `win`, loser front line = 2 → casualty pair queued; match **unresolved** (§4.6).

### 4.3 Artefact effects as data

`artefacts.ts` encodes Peter's *WHO CAN USE?* matrix and each card's effect once:

```ts
interface ArtefactRule {
  treasureId: number;
  canBear(creatureId: number, role: "ally" | "stranger"): boolean;       // the matrix (incl. house-rule note #3)
  effect(creatureId: number, ctx: MatchContext): Effect[];               // strength +n, die +n, nullify MAG, enables-fight-Spectre/Demon, …
  nullifiedByEye: boolean;
}
```

Matrix as parsed from the rules document (stranger columns are new engine behaviour):

| Artefact | Human ally | Priest-class ally | Inhuman ally | Dwarf ally | Human stranger | Priest-class stranger | Inhuman stranger | Dwarf stranger |
|---|---|---|---|---|---|---|---|---|
| Magic Staff | – | yes (#1) | – | – | – | yes | – | – |
| Magic Sword | yes | yes | – | – | yes | yes | – | – |
| The Ring | yes | yes | – | – | yes | yes | – | yes |
| Magic Axe | yes | yes | – | yes (#2) | yes | yes | – | yes (#2) |
| Magic Shield | yes | – | – | – | yes | – | – | – |

(Consumables — Strength Potion, Lotus Dust, Holy Water, Scroll, Talisman, Flute, Carpet — remain party-only; strangers use none.)

*Able to bear* is not the same as *gets a bonus*: e.g. the Sword's strength bonus applies only to Man/Woman/Hero
(+1/+2), so a Priest-class stranger bearing it gains nothing from it (Q-R8). The rule table must carry both.

This replaces the possession-based, party-only logic in `frontStrength` / `casterMP` / `previewPlan`, including
the duplicated "modifier chip" arithmetic in `previewPlan`.

### 4.4 Stranger artefacts

- **Pool.** Artefacts available to strangers at fight start = artefacts in the chamber's guarded treasure
  (`state.treasures`) plus anything carried by Mutiny deserters (they already drop loot into `treasures`).
  Q-R7 asks Peter to confirm, and whether dropped party artefacts become available mid-fight.
- **Assignment.** The `assignArtefacts` hook (§5.1) decides who bears what, validated against
  `ArtefactRule.canBear`. The default implementation is Peter's procedure, §4.4.1. It runs once at fight start
  (re-run policy: Q-R7). The party cannot redistribute during a fight today (`PartyPanel` note), so the same
  asymmetry is kept unless Peter says otherwise.
- **Death.** A dying bearer drops its artefacts to the floor (`state.treasures`), same as party corpses
  (`sweepFallen`). Scroll-destroyed strangers also drop what they carry (Peter's note); an invulnerable
  Ring-bearer who is defeated on level ≥ 4 **disappears with the Ring** and leaves other items.
- **Display.** Cards on the fight surface show a stranger's borne artefacts exactly as the party's do
  (`FightCard`'s relic corner already supports it).

#### 4.4.1 Default loadout (`strangers-default-loadout.md`)

Run in the **Stranger Fight Preparations** phase (§4.2.0), this is a pure function `defaultLoadout(strangers, present, ctx, rng) → ArtefactAssignment`, implemented as **data plus a
tiny interpreter** (the preference lists are tables, not code), so Peter can change an order without touching logic.

- **Eye present → skip.** No artefacts are allocated; everything stays on the floor. ("Present" is not what the
  engine tests today — see Q-L5.)
- **Strictly sequential**, each step seeing the earlier steps' results:

| Step | Artefact | Preference order (first eligible wins) |
|---|---|---|
| 1 | Magic Sword | Hero, Woman-Hero, Man, Thief, Woman |
| 2 | Magic Axe | Dwarf; then **with no weapon**: Hero, Woman-Hero, Man, Thief, Woman |
| 3 | Magic Staff | Sorcerer, Apprentice, Wizard, Witch, Priest, Scholar |
| 4 | Magic Shield | **with a weapon**: Hero, Woman-Hero, Man, Thief, Woman; then without: the same five |
| 5 | The Ring | Highest *adjusted strength* (strength after the weapon artefacts already borne) among those able to bear it; ties by Sorcerer, Apprentice, Wizard, Hero, Witch, Woman-Hero, Priest, Man, Scholar, Thief, Woman, Dwarf |

- **Ties.** Equal eligibility → random choice; equal type and equal eligibility → random choice. The randomness comes
  from the decision's `rngSeed` substream (§5.1) — never the game seed — and the chosen assignment is written to
  the log as a `strangersAssignArtefacts` action, so replay reproduces it without re-rolling.
- **Unbearable → floor.** An artefact nobody can bear stays in `state.treasures`.
- **Allocated → carried.** An allocated artefact moves from the floor into that stranger's `carrying`/`borne`.
- **One creature may bear several artefacts** (e.g. Hero with Sword, Shield and Ring); the Axe/Sword "only one used
  per fight" rule is applied by `strength`, not by the loadout.
- **Terms needing a definition:** "weapon" (Sword only? Sword and Axe?) and "adjusted strength" (does it include
  MAG and the Staff bonus?) — Q-L3, Q-L4.

Test vectors for this procedure are in Appendix C.

### 4.5 Legality layer (R3, R5)

`legality.ts` is the **only** place formation rules live. It is used by the engine to validate, by strategies to
enumerate, and by the UI to constrain.

```ts
legalDeployments(state, side): { min: number; candidates: CombatantRef[] }          // step b
legalEngagements(state, side): { open: CombatantRef[]; targets: CombatantRef[] }    // step c
legalPlacements(state, side, draft, creature): Placement[]                          // step d, per creature
validateFormation(state, side, draft): { ok: true } | { ok: false; reasons: Reason[] }
completeFormation(state, side, draft): Formation   // fills the mandatory remainder deterministically
mandatory(state, side): Obligation[]               // e.g. "must deploy 3", "must engage the Ogre"
```

Properties (all property-tested, §8):
- **Closure:** `legalPlacements` never returns a placement after which `validateFormation` could fail
  *unless* the draft is still incomplete; `completeFormation(draft)` always yields a valid formation.
- **Totality:** if any legal formation exists, `completeFormation` returns one; if none exists the engine reports
  the forced outcome (the Spectre/Demon "strongest creature is slain" rule becomes an explicit obligation).
- The existing rules (backer must be a caster by creature type, a backer needs a front fighter, 2v2 banned,
  Spectre/Demon need magic or Sword/Axe/Shield, must-engage-all) are re-expressed here and the legacy
  `validatePlan` becomes a thin adapter for `combatRevision: false`.

### 4.6 Casualties (new)

- **Party loses a 1-creature front line:** that creature dies (unchanged).
- **Party loses a 2-creature front line:** the party nominates one; d6 (+1 if the losing party has the Ring,
  7 counts as 6): 4–6 → the nominated creature dies; 1–3 → the other (unchanged, SC-9.5-5).
- **Strangers lose a 2-creature front line:** the choice passes to the **winning player**; d6 4–6 → the
  **other** (not nominated) stranger dies. *As written this reads inverted relative to the party rule;
  Q-R5 asks for the intended meaning before it is coded.*
- The small card of the dead remains in the area (Healing Balm window — existing `diedTurn/diedArea`).
- A dead Sorcerer, Dragon and so on keep their existing hooks (`sorcererSlain`, `dragonSlain`).

---

## 5. Pluggable stranger strategies (R1, R4)

### 5.1 Interface

Strategies decide only what a human opponent would decide. There is **no casualty hook** (the winning player
chooses stranger casualties) and **no Scroll hook** (strangers cannot read it).

```ts
export interface StrangerStrategy {
  readonly id: string;                 // "novice" | "standard" | "expert" | "nn-v1" | …
  readonly level: StrangerLevel;
  readonly kind: "builtin" | "external";

  assignArtefacts(ctx: StrategyContext): ArtefactAssignment | Promise<ArtefactAssignment>;   // default = §4.4.1
  deploy(ctx: DeployContext): DeployDecision | Promise<DeployDecision>;       // step b (strangers defending)
  engage(ctx: EngageContext): EngageDecision | Promise<EngageDecision>;       // step c (strangers attacking)
  redeploy(ctx: RedeployContext): RedeployDecision | Promise<RedeployDecision>; // step d (strangers the larger side)
}

interface StrategyContext {
  view: FightView;           // read-only projection: both sides' creatures, borne artefacts, matches, round, level, Eye, curses
  legal: LegalMoves;         // from legality.ts — the ONLY source of what is allowed
  evaluate: Evaluator;       // exact expected-outcome helpers (§5.3)
  budget: { maxNodes: number; deadlineMs?: number };
  rngSeed: number;           // a per-decision substream; strategies never touch the game seed
}
```

`Decision` objects are plain, serialisable data (they become logged actions — §5.2).

### 5.2 Where strategies run, and how decisions are logged

```
player action ──► reduce()  ──► state awaits a stranger decision (fight.pending.by === "strangers")
                                   │
        built-in strategy ─────────┤  driver loop (server): decision = strategy.x(ctx)
        external (NN) strategy ────┘  → validated by the engine → applied as a logged action
```

- **Stranger decisions are actions:** `strangersDeploy`, `strangersEngage`, `strangersRedeploy`,
  `strangersAssignArtefacts`, each carrying `{ strategyId, strategyVersion, decision }`. They go through
  `reduce` and are appended to `gameEvents` like any player action.
- **Replay is strategy-free.** `replay()` just folds the logged actions; it never instantiates a strategy.
  This is what makes an external, non-deterministic strategy safe.
- **Never trust a strategy.** The engine validates every decision with `validateFormation`. An illegal or
  late decision is replaced by the `standard` built-in's decision and the substitution is logged
  (`strategyFallback { reason }`).
- **Client cannot forge them.** Stranger actions are accepted only through *internal* Convex functions; the
  public `applyAction` validator rejects them (otherwise a player could choose their own opponent's moves).
- **Built-ins run in-line.** Built-in strategies are synchronous and pure; the driver loop runs inside the same
  mutation that applied the player's action, so a player action and the stranger replies commit atomically.

### 5.3 Exact evaluation

A match outcome depends only on two d6 and known totals, so a match can be evaluated **exactly** (36 outcomes):

```ts
evaluate.matchOutcomes(match): { pWin: { party: number; strangers: number }; pTie: number; pStalemate: number }
evaluate.expectedLoss(match, side, valueOf): number    // casualty probability × value, incl. the 2-front-line casualty die
evaluate.formation(formation, valueOf): { expectedDiff: number; breakdown: PerMatch[] }
```

`valueOf(creature)` is pluggable (default: victory points; alternatives: strength, replacement cost).

### 5.4 Built-in levels and the baseline objective

"Maximum effect" is undefined in the requirement (gap G1). Proposed definition, to be confirmed:

> **Objective (one round):** maximise `E[party value lost] − E[stranger value lost]`, ties broken by total
> effective strength, subject to the legality layer.

| Level | Behaviour | Intent |
|---|---|---|
| `novice` | Legal but deliberately naive: runs only part of the default loadout (e.g. skips the Shield and Ring), pairs by simple strength ranking, never uses the Shield against casters | Easier game for new players |
| `standard` | The **default loadout** (§4.4.1) plus greedy pairing on the objective; handles Spectre/Demon/Shield/Staff correctly; O(n²) | Default; also the universal fallback |
| `expert` | Optimises the artefact assignment too (it must beat the default loadout in the bench), then exhaustive or branch-and-bound over formations using `evaluate`, with a node budget and the `standard` answer as the incumbent; one-round lookahead for persistence | Hard mode; must fit within the budget below |

`expert` must be **budgeted**: Convex mutations have bounded execution time and read/write limits (the
project's `convex/_generated/ai/guidelines.md` documents the transaction limits; the CPU budget must be verified
against current limits before sizing the search). If the budget is exhausted it returns the best incumbent —
never an error.

### 5.5 Registry and difficulty

- `StrangerStrategy` instances register in `strategy/registry.ts` by id.
- The level is chosen at game creation and stored in `variants.strangerLevel` (immutable for the game,
  like `extensionKit`). Leaderboards are segmented by level (G7).
- Test Mode gains a "force strategy / script stranger formation" control (G9).

### 5.6 External (neural-network) strategy

A Convex **action** (actions may `fetch`; mutations may not) orchestrates it:

1. Client calls a public action (e.g. `game.applyActionAsync`), which loads the state via a query.
2. For each stranger decision needed it builds a **minimised view** (only what a human sees) and `fetch`es the
   model endpoint, with a timeout and bounded retries.
3. It then calls an **internal mutation** (`ctx.runMutation(internal.game.applyStrangerDecision, …)`) with the
   player's action and the decisions, which reduces and logs them atomically.
4. On timeout, error or an illegal answer it uses the `standard` built-in and logs `strategyFallback`.

Contract items still needed (G2): endpoint and auth (secret via `convex env`), request/response schema
(versioned), latency SLA and timeout, cost ceiling, where training data comes from (the harness in §8 can
generate it), and whether the model may see anything beyond the human-visible view.

---

## 6. Server design (`apps/web/convex`)

| Change | Detail |
|---|---|
| Variants | Add `combatRevision?: boolean` and `strangerLevel?: "novice"\|"standard"\|"expert"\|"nn"` to the `variants` object in `schema.ts`; thread through `newGame`, `startTestGame`, `replay`/`replayByCode`, `highScores.log`, `ReplayBundle`, and `MpGameState.variants`. The engine's `replay(seed, picks, actions, variants, testMode)` variants parameter gains the same keys. |
| Action validators | Add the new actions to **both** `game.ts` and `multiplayer.ts` validators. **Improvement I9:** define the action schema once (in the engine) and derive both validators so they cannot drift. |
| Stranger actions | Registered only for internal functions; rejected by the public `applyAction`. |
| Driver | `applyAction` / multiplayer equivalent call the built-in driver loop after reducing; external levels use the action path in §5.6. |
| Log | `gameEvents` already stores `action: v.any()`; stranger decisions fit without a schema change. Add `strategyId`/`strategyVersion` fields inside the action payload. Old logs remain valid. |
| Saved games | A `combatRevision: false` game keeps `strangers: number[]` and the old engine. Enabling the flag on an existing game is **not** supported (a fight cannot change rules mid-game); only new games opt in. |
| Document size | Stranger instances and persisted matches add a few hundred bytes to `state`; far below the 1 MB document limit. |

---

## 7. Front-end design (R5)

### 7.1 Step-wise fight surface

`FightSurface` becomes a thin renderer over `fight.pending`:

| Pending | Player sees | Interaction |
|---|---|---|
| `scroll` (party attacking) | Scroll prompt with the three variants and the curse warning | Confirm-gated (existing `ConfirmButton`) |
| `deploy` (party defending) | "The strangers attack — choose your front line" with the **minimum** shown ("deploy at least 3") | Pick creatures; Done enabled only when legal |
| `engage` (party attacking) | Strangers' deployed line; pick a party creature then a target | Targets limited to `legalEngagements` |
| `redeploy` (party larger) | Remaining free creatures and background; slot hints | Drop targets limited to `legalPlacements` |
| strangers deciding | A short, skippable narration of the strangers' choice ("The Ogre squares up to your Wizard — the Shield cancels its magic"), from the decision's `why` trace | Read-only |
| `casualty` | Existing casualty prompt; for stranger casualties, a nomination prompt (Q-R5) | As today |

### 7.2 Making illegal formations unrepresentable

- `place` / `unplace` in `fightPlan.ts` are replaced by `useFormation(state, side)` which wraps
  `legalPlacements` / `completeFormation`. A creature's illegal drop targets are **disabled**, not rejected
  after the fact; a caster cannot be dropped behind an empty front line; "Done" is enabled only when
  `validateFormation` is ok.
- `REASON`, the Spectre/Demon constants and the forced-round derivations are deleted from the component; the
  engine returns obligations and plain-language reasons.
- **Improvements:** a *Suggest* button that fills the formation from the `standard` strategy (the same
  code the strangers use — a free hint system for new players); per-match win odds from `evaluate`
  (exact, no simulation); "mandatory" markers on creatures that must deploy.

### 7.3 Everything else the surface touches

Celebrations (`dragonSlain`, `sorcererSlain`) are unchanged. Stranger relics render with the existing
`FightCard` relic corner. The roster and `PartyPanel` need no change except that **stranger** artefacts are
now visible on the fight surface. `PvpFightSurface` follows in M7.

---

## 8. Testing and strategy evaluation at scale

### 8.1 Layers

| Layer | What | Tooling |
|---|---|---|
| Unit | `strength`, `artefacts`, `round` phases, `casualty`, `legality` against **worked examples from Peter's documents** (the Hero-vs-Priest/Troll/Man/Dwarf example, the Ogre/Troll example in the consolidated rules) | vitest |
| Property | For random scenarios: every legal-move enumeration yields formations `validateFormation` accepts; `completeFormation` always valid; engine never panics on any strategy output; round conservation (nobody both dies and survives); alternation invariant | vitest + a property library (propose `fast-check`; none is installed today) |
| Golden | New narrative goldens for `combatRevision: true` fixtures; **existing goldens must not change** with the flag off (this is the safety net, as the solo/kit/multi golden firewalls already work) | existing snapshot tests |
| Strategy bench | §8.2 | new CLI |

### 8.2 Strategy bench harness (`packages/engine/src/combat/strategy/bench`)

**Goal:** confirm and compare strategies *exhaustively*, as the requirement asks.

- **Scenario space.** A scenario is `(party multiset + artefacts, stranger multiset + artefacts, level, surprise,
  who attacks)`. Enumerate by **canonical multisets** (creatures of the same type are interchangeable up to
  artefact placement), which cuts the space by orders of magnitude. Sizes are bounded by `MAX_STRANGERS = 8` and
  a configurable party cap; the exhaustive sweep targets small fights (≤ 4 per side) and *samples* above that.
  (Estimated counts must be measured — they are not asserted here.)
- **Exact round evaluation.** Because a match is two d6, the bench scores a strategy's formation with
  `evaluate.formation` (no dice, no variance) — so strategies can be ranked on millions of scenarios cheaply.
- **Full-fight arena.** For multi-round behaviour (persistence, alternation), seeded Monte Carlo plays fights to
  the end: `strategyA` (strangers) against a fixed set of **reference party policies** (greedy, cautious,
  magic-heavy, random-legal). Metrics: stranger win rate, mean party losses, mean rounds, artefact-use rate,
  and the regret against `expert`.
- **Legality sweep.** Every strategy decision across the whole space is run through `validateFormation`;
  a single illegal output fails the bench.
- **Reproducibility.** Each run is `(strategyId, version, scenario set hash, seed)` → a JSON report; reports
  are diffable for regression gating.
- **Budgets.** `expert` is measured for time and node use per decision; the external strategy is excluded
  from exhaustive runs (replaced by a recorded-decision replay).
- **CLI.** `pnpm --filter @sorcerers-cave/engine bench:strategies --levels standard,expert --max-side 4 --seed 1`.
  A small subset runs in CI; the full sweep runs nightly.
- **Difficulty calibration.** The bench provides the evidence for what `novice`/`standard`/`expert` mean
  (target win-rate bands), which the requirement leaves undefined (G1, G10).

---

## 9. Questions, gaps and improvements

### 9.1 Questions for Peter (rules)

- **Q-R1** — *Triggering a Fight* is a named step in the overview but neither document defines it. Who attacks in round 1 for each start — hostile reaction (strangers, surprise), party Attack, pacified-chamber Attack, Demon ambush, retreat bounce-back (§4.2.0) — and does the role strictly alternate every round in solitaire, including when the party would rather keep attacking?
  - **Proposed default:** Strangers attack on hostile/Demon; party on Attack; strict alternation

- **Q-R2** — Scroll (your own note): is the "destroy" variant usable in *any* round the party attacks, with the two surprise variants only before round 1?
  - **Proposed default:** Destroy: any attacking round; surprise variants: round 1 only

- **Q-R3** — "Front line of any match does not exceed two" — per side, with 2v2 still forbidden (as in `validatePlan` today)? Can unengaged creatures of the larger side join an *already engaged* match as the second front-liner?
  - **Proposed default:** Per side; 2v2 banned; joining allowed

- **Q-R4** — When do magic users commit to the background for each side? Step (b)/(c) mention only front-line deployment; the PvP flow has a separate "defender casters" step. Can any number of casters back one match, and may a lone caster stay in the background?
  - **Proposed default:** Casters placed in step (d) for the larger side and with the front line for the smaller; lone caster must fight

- **Q-R5** — Stranger casualty: the winning player nominates and on 4–6 the **other** dies — is the nominated creature the one **spared**? Whose Ring adds the +1?
  - **Proposed default:** Nominated = spared; losing side's Ring adds +1

- **Q-R6** — Ring bonus: must the bearer be among the *fighters* (front/background) for the side to get +1, or is any living holder enough (today's behaviour)?
  - **Proposed default:** Any living holder (current behaviour)

- **Q-R7** — *Partly answered:* the default loadout says the pool is the artefacts **present** and leftovers stay on the floor. Still open: is it (re)run only at fight start, or also when a bearer dies, when Mutiny deserters join, or when strangers arrive later (a Demon)? May strangers pick up artefacts dropped mid-fight?
  - **Proposed default:** Run at fight start and again at the next deployment after a bearer dies; no mid-fight pickup

- **Q-R8** — The *WHO CAN USE?* table says who may bear; the cards say who gains a bonus (Sword: Man/Woman/Hero only). Confirm bonuses follow the card text, so a Priest-class stranger with the Sword gains nothing. Also an anomaly: the Ring card says a DWARF may wear it, and the table allows a Dwarf **stranger** but not a Dwarf **ally** — typo or intended?
  - **Proposed default:** Bonus per card text; treat the Dwarf-ally Ring blank as a typo unless told otherwise

- **Q-R9** — Where do Spectre/Demon sit in the new flow (they cannot be fought hand-to-hand)? When does "the strongest creature is automatically slain" occur — before step (e)? Can a Spectre be a stranger *attacker's* paired creature?
  - **Proposed default:** Resolved at step (e) before matches; Spectre/Demon are "engageable only by magic/Sword/Axe/Shield"

- **Q-R10** — During a round where the strangers attack, may the player use artefacts (Strength Potion, Lotus Dust, Holy Water) or only deploy?
  - **Proposed default:** Only deploy; consumables on the player's own attacking round

- **Q-R11** — Hidden Cards variant: may strategies see face-down player cards?
  - **Proposed default:** No (human-visible only)

- **Q-R12** — "Defender must attempt to deploy at least as many creatures": do casters count as deployable fighters?
  - **Proposed default:** Yes — a caster may fight hand-to-hand

- **Q-R13** — Multiplayer: when several parties or a union face strangers, who is attacker/defender and in what order do they act?
  - **Proposed default:** One party at a time, as today

- **Q-R14** — *Ending a Fight* is referenced by Peter's step (f) and the overview, but **no document defines it**: end conditions (including "put to sleep", e.g. Flute-lulled Dragons), the retreat procedure and timing, what happens to engaged creatures and loot. Also confirm that *Wrap Up the Round* and *Ending a Fight* are round/fight-level, not per-match.
  - **Proposed default:** Today's behaviour (§4.2.0) until a document arrives

- **Q-R15** — Scope and timing of *Stranger Fight Preparations (stranger party only)*: is it only the artefact loadout, or also an initial stance (who starts in the background)? Does it run once before round 1 only, or again for reinforcements (Mutiny deserters, a Demon arriving later)?
  - **Proposed default:** Loadout only; once before round 1, and again at the next deployment after a bearer dies or strangers are added

- **Q-R16** — *(New.)* The loadout document defines how strangers are **equipped**; is there a matching default **pairing** procedure for `deploy` / `engage` / `redeploy` / background, or should one be derived from the G1 objective?
  - **Proposed default:** Derive from the G1 objective until supplied


### 9.1a Questions and discrepancies raised by the default loadout

Checked against the consolidated rules and the engine (`combat.ts`, `effects.ts`, `data/creatures.ts`):

- **Q-L1** — **Thief.** The Sword and Axe lists put the Thief above the Woman, but only Man/Woman/Hero (and Dwarf for the Axe) gain a strength bonus — a Thief gains **nothing**. For the **Shield** the engine only lets Man/Woman/Hero/W-Hero use it (`SHIELD_WARD_ELIGIBLE`), so a Thief-borne Shield is **inert**.
  - **Question / proposed default:** Intended (ordering by "able to bear")? Or should lists follow *who gains*, and should the Thief be dropped from the Shield list? Default: keep the lists as written, but skip an artefact for a bearer who gains nothing from it.

- **Q-L2** — **Staff.** The list prefers Sorcerer, Apprentice, Wizard, Witch, Priest, Scholar. The engine only adds the Staff bonus for Priest (+1) and Wizard (+2); the card says "+2 for a Priest or Wizard". So Sorcerer/Apprentice/Witch/Scholar gain nothing today, while the list ranks them above the Wizard. (The Apprentice "uses artefacts as a Wizard", `usesArtifactsAs`, but `casterMP` does not apply it.)
  - **Question / proposed default:** Does the Staff bonus apply to the whole Priest class? At what values (card +2 vs engine Priest +1)?

- **Q-L3** — **"Weapon".** Used in the Axe ("with no weapon") and Shield ("with a weapon") lists and in Step 5 ("weapon artefacts already borne").
  - **Question / proposed default:** Sword only, or Sword and Axe (the card says only one may be used per fight)? Is the Staff a weapon for Step 5? Default: weapon = Sword or Axe.

- **Q-L4** — **Ring "adjusted strength".** Step 5 allocates to the highest adjusted strength.
  - **Question / proposed default:** Fighting strength only, or total (FS + MAG), including the Staff bonus? And must the Ring-bearer actually be a fighter (this is Q-R6; if yes, the strategy must guarantee the bearer is engaged).

- **Q-L5** — **"Eye present in the area".** The engine's `eyeActive` is true only when a *living party member holds* the Eye. An Eye lying in the chamber has no effect today. The card says artefacts are powerless "when this gem is in the same area".
  - **Question / proposed default:** Should `eyePresent` = held by the party **or** on the floor in the area (affecting both sides' artefacts)? Default: yes.

- **Q-L6** — **When it runs.** The document defines the allocation, not the trigger (see Q-R7). It also says "creature in the party" in Step 5 (presumably the *stranger* party).
  - **Question / proposed default:** Confirm the trigger and the wording.

- **D1** — **Data:** the rules list **Hero STR 6**; the engine has Hero fs **5** (cost 6). Hero strength decides the Ring allocation and every worked example.
  - **Question / proposed default:** Which is correct?

- **D2** — **Data:** the rules list **Spectre STR 4 (MAG 4)**; the engine has fs 0, mp **5**.
  - **Question / proposed default:** Which is correct?

- **D3** — **Data:** the Staff card says +2 for Priest **or** Wizard; the engine gives the Priest +1 (`combat.ts`, SC-9.3-4).
  - **Question / proposed default:** Is Priest +1 a deliberate house rule?


All other creature strengths I compared (Apprentice, Demon, Dragon, Dwarf, Giant, Lion, Man, Ogre, Priest, Scholar,
Sorcerer, Thief, Troll, Unicorn, Witch, Wizard, Wolf, Woman, Woman-Hero) agree between the rules text and the engine.

### 9.2 Technical questions

- **Q-T1** — Is `combatRevision` a per-game variant that defaults off, or do we intend to migrate everything and retire the old engine? (This spec assumes per-game, with a later flip of the default.)

- **Q-T2** — Hosting, auth, latency SLA and cost ceiling for the neural network; may we send full state or only the human-visible view?

- **Q-T3** — What CPU budget can `expert` use inside a mutation? (Needs a measurement against current Convex limits.)

- **Q-T4** — Should PvP migrate onto the new engine (M7), or stay on `multi-fight.ts`?

- **Q-T5** — May we add a property-testing dependency (`fast-check`)?


### 9.3 Gaps in the high-level specification

- **G1** — "Maximum effect" and the difficulty levels are undefined. §5.4 proposes an objective and level behaviours; they need a product decision.

- **G2** — The neural-network strategy has no contract: model, inputs, SLA, hosting, cost, fallback, privacy, versioning, ownership.

- **G3** — No statement on **information available to strategies** (hidden cards, other parties' secrets).

- **G4** — **Backwards compatibility** is unaddressed: in-flight games, saved codes, replays and golden snapshots all depend on the old rules.

- **G5** — Multiplayer scope is unclear: PvE only, or PvP too? Timers (45 s windows) vs stranger decisions?

- **G6** — The UX for *defending* and for step (d) is new and needs wireframes (including mobile and accessibility).

- **G7** — Difficulty changes outcomes, so **leaderboards must be segmented by level** (they are already segmented by kit).

- **G8** — Logging and replay for stranger decisions, and how a bug report surfaces "why the strangers did that".

- **G9** — Test Mode support (force a level, script a stranger formation) for QA.

- **G10** — Success metrics: target win-rate bands per level, decision latency, fallback rate.

- **G11** — Ordering: R5 (UI legality) is independent of R1–R4 and could ship first on the current engine.

- **G12** — Rules authority: Peter's documents vs the engine spec — the new rows must be traceable to his steps (Appendix A).

- **G13** — Two steps of the new overview have **no rules document**: *Triggering a Fight* and *Ending a Fight*. The overview's step names and Peter's step names also differ ("Match is Resolved" vs Step iv); §4.2.0 maps them.


### 9.4 Proposed improvements

| ID | Improvement |
|---|---|
| **I1** | Engine-owned `legalMoves` / `completeFormation`, consumed by UI and strategies (§4.5). |
| **I2** | A *Suggest formation* hint for players, using the `standard` strategy (§7.2). |
| **I3** | Exact win-probability display per match from the evaluator. |
| **I4** | Every strategy decision carries a short `why` trace — drives the narration, bug reports and the bench. |
| **I5** | Strategy id/version/seed recorded in every logged stranger action. |
| **I6** | Difficulty-aware leaderboards. |
| **I7** | Bench in CI plus a strategy regression ladder (a new strategy must not lose to its predecessor). |
| **I8** | Delete the rule constants duplicated in `FightSurface`; one source in the engine. |
| **I9** | Define the action schema **once** and derive the two Convex validators from it. |
| **I10** | Unify PvP and PvE on the round engine; retire `multi-fight.ts` pairing code. |
| **I11** | Remove dead state (`FightState.focus`, `strongestStranger`) if confirmed unused after the rewrite. |
| **I12** | Quick win now: ship the `legalPlacements` UI guard for the **current** `BattlePlan` model (R5) before the engine work. |

---

## 10. Delivery plan, risks and spec maintenance

### 10.1 Milestones

| M | Deliverable | Exit criterion |
|---|---|---|
| **M0** | Rules sign-off (Q-R1–R15, Q-L1–L6) including the missing *Triggering* and *Ending a Fight* definitions (G13), reconcile the data discrepancies D1–D3, decisions on G1/G2/Q-T1, fixtures from Peter's worked examples and the loadout vectors (Appendix C) | Written answers; fixtures committed; rules and engine data agree |
| **M1** | `model`, `artefacts`, `strength`, `legality` behind `combatRevision` (no flow change); unit + property tests | All existing tests and goldens unchanged; new suites green |
| **M2** | `round` engine, stranger inventory, persistent matches, new actions, `standard` strategy; driveable from a CLI | A full fight plays to the end headlessly with the flag on; new goldens |
| **M3** | Server wiring: variants, validators, internal stranger actions, in-line driver, log/replay | Replay of a flag-on game reproduces exactly; public API cannot forge stranger actions |
| **M4** | Step-wise `FightSurface` + `useFormation` (R5), narration, Suggest, odds | No illegal formation can be built; UI tests; manual playthrough |
| **M5** | `novice`/`expert`, bench harness, calibration report | Bands agreed (G10); legality sweep clean |
| **M6** | External strategy: Convex action, recording, fallback, secrets | NN decisions logged and replayable offline; fallback rate measured |
| **M7** | PvP alignment (Q-T4), default flip (Q-T1), docs | Decision-dependent |
| **M4a (optional, earlier)** | I12: `legalPlacements` guard on the current plan model | R5 delivered without engine change |

### 10.2 Risks

| Risk | Mitigation |
|---|---|
| Rules ambiguity (Q-R, Q-L) produces rework | M0 gate; fixtures encode answers |
| Rules text and engine data disagree (D1–D3, Eye semantics) so tests and strategies encode the wrong numbers | Reconcile in M0 before any strategy is calibrated |
| `strangers: number[]` → instances touches reactions, hazards, Scroll, Holy Water, statues, rendering | Accessor `strangerIds(state)` first; flag-gated; golden firewalls |
| Persistent engagements break saved games | Per-game flag; no mid-game switching |
| `expert` exceeds Convex execution limits | Node/time budget with the `standard` incumbent; measure first (Q-T3) |
| External strategy latency or outage | Timeout + fallback + recorded decisions (§5.6) |
| Hand-maintained validators drift again | Single schema (I9); regression test |
| Two fight UIs diverge | M7 alignment; shared `useFormation` |

### 10.3 Spec maintenance (CLAUDE.md)

Every engine change in M1–M3 updates `docs/specs/engine-spec.md` in the same change. The new requirement
rows are `SC-CMB-*` and **supersede** the corresponding rows when `combatRevision` is on:
SC-9.1-* (pairing and legality), SC-9.2-* (surprise), SC-9.3-* (strength, ring, curses, match resolution),
SC-9.4-* (Spectre/Demon/Dragon/Sorcerer/Eye), SC-9.5-* (casualties, retreat, flow). The legacy rows stay,
marked *applies when `combatRevision` is off*.

---

## Appendix A — Traceability: Peter's steps to the design

| Peter | Rule | Design element | Test |
|---|---|---|---|
| Fighting a Match, Step i.1 | Magic users in background | `strength.effectiveStrength` positional effect | worked example "Hero vs Priest/Troll/Man/Dwarf" (= 9) |
| Step i.2 | Eye, Axe, Shield, Staff, Sword, Talisman, Ring | `artefacts.ts` rules + `MatchContext` | per-artefact table tests, incl. Eye nullification |
| Step i.3 | Spectre, Demon | `strength` immaterial rules; `legality` engageability | forced-slay and Shield-standoff cases |
| Step ii | Total effective strength | `sideTotal` | sum properties |
| Step iii | Result = TES + d6 + surprise{0,1,2} + ring{0,1} | `result` | exact `evaluate` vs enumeration |
| Step iv | Stalemate / tie / win; ties unresolved | `outcome`; persistence in `round` | persistence tests |
| Step iv (casualty) | 1 front → dies; 2 front → nomination + d6 | `casualty.ts` | party and stranger variants (Q-R5) |
| Each Round, Step a | Scroll | `round` phase a; `artefacts` Scroll rule | attacker-only, Eye, three variants |
| Step b | Defender deploys | `legalDeployments`; `deploy` action | minimum-deploy property |
| Step c | Attacker engages | `legalEngagements`; `engage` action | one-to-one property |
| Step d | Finalise deployment | `legalPlacements`; `redeploy` action | match-count and ≤2 properties |
| Step e | Fight each match | `round` phase e | goldens |
| Step f | Wrap up; alternate | `round` phase f; `fight.attacker` flip | alternation invariant |
| Overview | Triggering a Fight | `FightTrigger`; `trigger` phase | every start path sets attacker and surprise |
| Overview / `strangers-default-loadout.md` | Stranger Fight Preparations | `prep` phase; `defaultLoadout` | Appendix C vectors V1–V10 |
| Overview (referenced by step f) | Ending a Fight | `end` phase (provisional = SC-9.5-6…11) | wipe-out, clear-out, retreat, dead-end bounce-back |

## Appendix B — Worked example (strangers attack, round 2)

State: round 1 was the party's (Ogre-vs-Hero match unresolved after a tie). Round 2: **attacker = strangers**.

1. *(a)* Strangers cannot read the Scroll — skipped.
2. *(b)* The player is the **defender**: the strangers have 2 unengaged creatures (Troll, Priest); the party has
   3 unengaged (Woman, Dwarf, Wizard). The player must deploy **≥ 2**; deploys Woman and Dwarf (Wizard held back).
3. *(c)* The strangers' `engage` decision (strategy `standard`) pairs Troll → Woman and Priest → Dwarf (the Priest
   bears the Magic Staff: MAG 2 + 1). Two new matches are created; Ogre-vs-Hero persists.
4. *(d)* The larger side (the party, 3 vs 2) may redeploy its unengaged creatures — the Wizard may join the
   Woman as a second front-liner (2v1, legal) or sit in the background behind the Dwarf.
5. *(e)* Three matches are fought. Totals use the **same** `effectiveStrength` for both sides; the stranger-borne
   Staff is applied. Results: one win, one tie (persists), one loss.
6. *(f)* The dead match is dissolved; backgrounds become unengaged; **attacker flips to the party**.

All three stranger decisions (`assignArtefacts` at fight start, `engage` here) appear in the log as actions
tagged with `strategyId`, and replay reproduces the round without running a strategy.

## Appendix C — Test vectors for the default loadout

`defaultLoadout` is deterministic except for the random tie-break; every vector below avoids ties unless stated.
Strengths in V1/V4 are the engine's (D1/D2 would not change these outcomes).

| # | Strangers | Artefacts present | Eye | Expected allocation |
|---|---|---|---|---|
| V1 | Hero, Man, Dwarf | Sword, Axe, Shield, Ring | no | Sword → Hero · Axe → Dwarf (first preference) · Shield → Hero (has a weapon) · Ring → Hero (adjusted 5+2 = 7 beats Dwarf 1+3 = 4, Man 3) |
| V2 | Hero, Man | Sword, Ring | **yes** | Nothing allocated; both stay on the floor |
| V3 | Man, Woman, Thief | Sword | no | Sword → Man (3rd) before Thief (4th) and Woman (5th) |
| V4 | Wizard, Sorcerer, Priest | Staff, Ring | no | Staff → Sorcerer (1st) · Ring → Sorcerer (highest adjusted strength) |
| V5 | Hero, Man | Sword, Axe | no | Sword → Hero · Axe → Man ("Hero with no weapon" is ineligible: Hero already bears the Sword) |
| V6 | Man, Woman | Shield | no | No weapon borne, so the "without" half applies: Man (8th) before Woman (10th) → Man |
| V7 | Ogre, Troll | Sword, Ring | no | Both are inhuman and cannot bear either; both stay on the floor |
| V8 | Man, Man | Sword | no | Exactly one Man bears it, chosen by the decision substream; for a fixed seed the result is repeatable, and across seeds both outcomes occur |
| V9 | Hero | Sword, Axe, Shield, Ring | no | Sword → Hero · Axe: "Hero with no weapon" fails, nobody else → stays on the floor · Shield → Hero · Ring → Hero |
| V10 | Thief, Woman | Sword | no | Sword → **Thief** (4th) before Woman (5th) — as written. The Thief gains no strength from it while the Woman would gain +1 (Q-L1) |

V5 and V9 depend on the meaning of "weapon" (Q-L3) and V10 on the Thief ordering (Q-L1); all vectors are written to the
document **as it reads today** and must be revisited with Peter's answers.

# Pluggable Stranger Combat — Requirements and Staged Plan

`DATE: 11-OCT-2026`
`STATUS: DRAFT FOR REVIEW — an investigation turned into a plan; nothing here is built. REVISED 11-OCT-2026 for [Peter's response of 10-OCT](2026-10-10-peters-response-to-review-of-reformulated-rules.md): C1 and C3 are now ruled, C2 is settled for the lab, and §5.9 and D7 are new`
`RELATED: [technical spec](2026-10-03-combat-revision-technical-spec.md) §5 (the original strategy design), §4.5 legality, §5.3 exact evaluation, §10 milestones · [NN requirements](2026-10-04-nn-stranger-pairing-requirements.md) · [Monte Carlo spec](2026-10-06-monte-carlo-pairing-spec.md) · [review of Peter's responses](2026-10-09-review-of-peters-responses-and-reformulated-rules.md) and its [§8](2026-10-09-review-of-peters-responses-and-reformulated-rules.md#8-peters-response-of-10-oct-2026-and-how-it-is-applied) · [Peter's response](2026-10-10-peters-response-to-review-of-reformulated-rules.md) · [pairing-lab](../../../packages/pairing-lab/README.md)`

## 0. Summary

We want several interchangeable implementations of what the strangers *decide* in a fight (and, separately, of how a
round is *resolved*), selectable per game, without any of them being able to break replay, the server's authority, or
the rules.

The 03-OCT technical spec already designs this (a `StrangerStrategy` interface, a registry, decisions logged as ordinary
actions, a fallback to a built-in). **None of that is built.** This document does three things the earlier spec does
not:

1. It records what the engine *actually* contains today (§2), which is narrower than the spec assumed: under the current
   rules the **only** true stranger decision is the artefact loadout.
2. It separates two things that are easy to run together — a **combat engine** (the rules of a round) and a **stranger
   strategy** (the choices the strangers make within it) — and says which this plan makes pluggable and when (§3).
3. It sets out a staged plan whose first stage can ship **now, with no behaviour change**, and which proves the plumbing
   (registry, logging, forgery guard, fallback) on the one decision that exists (§6).

Where Peter's reformulated rules (08-OCT) and the code disagree, §7 lists each conflict and who has to rule.

## 1. Scope

**In scope.** Fights between a party and strangers, solo and multiplayer-vs-strangers (both reach the same `reduce`).
Strategy selection, the decision interface, decision logging and replay, server gating, the bench/lab integration, and a
path to external (neural-network or Monte Carlo) strategies.

**Out of scope.**
- Player-versus-player fights (`multi-fight.ts`): both sides are humans.
- Changing any rule. Where this plan needs a rule decision it is raised as a question (§9), not assumed.
- Training the neural network or tuning the Monte Carlo search (their own documents).
- Reaction and approach behaviour (whether strangers turn hostile): that is the reaction roll, not combat.

## 2. Current state (verified 11-OCT-2026 against `main` at `f55f310`)

| Concern | Where it lives today | Stranger decision? | Notes |
|---|---|---|---|
| **Pairing (who fights whom)** | Supplied entirely by the **player**: `BattlePlan { matches: { front, backers, strangers }[] }`, validated by `validatePlan`, resolved by `resolvePlannedRound` (`combatPlan.ts`) | No | The strangers never choose; they are an undifferentiated list of creature ids plus gear. |
| **Gang-up and caster backing** | Inside `previewPlan` (`combatPlan.ts`): when the party is out of fighters, leftover foes attach to lone fighters strongest-first, and leftover casters lend magic | **No — a rule.** | The rulebook says the party faces "the strongest combination they can form". It is deterministic, not a choice, so it should **not** become a plug-in point. It is replaced, not extended, by the revision engine. |
| **Loadout (who bears which artefact)** | `defaultLoadout` (`loadout.ts`, a pure function of strangers, gear, floor, Eye and a tie-break `pick`), applied by `equipStrangers` (`strangerEquip.ts`) at fight start **and after every round** | **Yes — the only one.** | Already isolated behind a pure function. Consumes the game RNG only to break a genuine tie. |
| **Casualty (which creature falls)** | **Stranger** side: automatic — the strongest foe of a lost match is slain (`resolvePlannedRound`). **Party** side: when two members lose a match together the player nominates one and a die decides (`casualtyQueue`) | Not today | Peter's Fight Plan now lists "Choosing the Casualty" (§7, C3). |
| **Stranger strength maths** | `strangerFS` / `strangerMP` / `enemyMP` / `enemyRollBonus` (`combatPlan.ts`), through the capability table | n/a | Used by the resolver **and** by the fight screen, so a change here changes the UI too. |
| **Lab** | `packages/pairing-lab`: `simulate(scenario, rules, partyStyle, strangerStyle, seed)`; styles `GRD`, `CAU`, `MAG`, `RLG`; hooks `deploy`, `engage`, `redeploy`, plus `round1Engage`; seeded and deterministic | Yes (for the *new* protocol) | A separate implementation of the rules. Parity-tested against the engine **only** on strength arithmetic (`parity.test.ts`), so the two can drift on everything else. |
| **Server entry** | Solo: `convex/game.ts` `applyAction` — one `reduce` per call, logging `{ action, events }`. Multiplayer: `mpReduce` composes a party view and calls `reduce` (`multi.ts`), reached through the multiplayer `act` | n/a | The public `applyAction` validator is permissive: any `type` string reaches `reduce`. |
| **Replay** | `replay(seed, picks, actions, variants, testMode)` folds the logged actions through `reduce` | n/a | Anything a strategy decides must therefore be an action in the log, or be derivable from state. |

**What this means.** Under today's rules a "pluggable stranger strategy" has exactly one decision to plug into. The
interface in the 03-OCT spec (`deploy`, `engage`, `redeploy`) describes decisions that exist only in the **revised**
round engine (Peter's steps a–f), which is not built (technical spec milestones M1–M3).

## 3. Two independent axes of "pluggable"

| Axis | Question it answers | Selected by | Today | Needed |
|---|---|---|---|---|
| **A. Combat engine** | How is a round structured and resolved? What decisions does it ask for? | `variants.combatRevision` (per game, immutable — the same pattern as `trapRules`, `sorcererTeleport`) | One implementation (the player-plan model) | A second (the revised round engine); both selectable |
| **B. Stranger strategy** | Given a decision the engine asks, what do the strangers choose? | `variants.strangerLevel` (per game, immutable) | None (loadout is hard-wired) | A registry of strategies |

Axis B depends on axis A for every hook except the loadout. The plan therefore builds axis B's plumbing first on the
loadout (§6, stages 1–3), and adds the pairing hooks when the revised engine exists (stage 4). Treating the two as one
"make combat pluggable" task is what makes it look larger than it is.

## 4. Requirements

Each requirement is testable. `P` numbers are stable.

| # | Requirement |
|---|---|
| P1 | **No behaviour change by default.** With no strategy configured, every existing golden, conformance vector and recorded replay is byte-identical. |
| P2 | **Per-game, immutable selection.** The strategy id (and version) is stamped into `variants` at game creation and recorded in the game's log header. It never changes mid-game. |
| P3 | **One interface, no concrete imports.** The engine reaches a strategy only through the registry; no engine module imports a concrete strategy. |
| P4 | **Human-visible view only.** A strategy receives a read-only projection of what a human opponent could see. It cannot read the pack contents or future dice. |
| P5 | **The engine's legality layer is the sole authority.** Every decision is validated by the engine. An illegal, late or failed decision is replaced by the `standard` strategy's decision and the substitution is logged (`strategyFallback { reason }`). A strategy is never trusted. |
| P6 | **Decisions are logged actions.** A stranger decision is plain serialisable data, applied through `reduce` as an action and appended to the game log like a player action. `replay()` folds them and **never instantiates a strategy**. |
| P7 | **A client cannot forge a stranger action.** Rejected on the public solo path and on the multiplayer path; verified by test on both. |
| P8 | **Strategies never touch the game seed.** A strategy that needs randomness receives a per-decision substream derived deterministically from the game seed and the decision's position. |
| P9 | **Built-ins are deterministic and pure.** The same view and context always give the same decision. |
| P10 | **Budgeted.** A strategy is given a node and/or time budget. Exhausting it returns the best answer found so far, never an error. |
| P11 | **External strategies are asynchronous and resumable.** A strategy that cannot answer inside a Convex mutation (a model call, a long search) does not block it: the fight holds a *pending decision* that a later call resolves; timeout falls back per P5. |
| P12 | **Solo and multiplayer-vs-strangers behave identically** for the same state and strategy. PvP is untouched. |
| P13 | **Test Mode can pin the stranger side.** A tester can force a strategy for a game or script a specific stranger decision. |
| P14 | **The lab runs any registered strategy** as the stranger side through an adapter, and the rules arithmetic lives in one place (§5.7). |
| P15 | **Observable.** A fight records which strategy played, per-decision latency, and the number of fallbacks. |

## 5. Design

### 5.1 Layers

```
 player action ──► reduce() ──► engine (axis A: legacy plan model │ revised round engine)
                                    │  asks for a stranger decision  →  fight.pending = { by: "strangers", kind }
                                    ▼
                         driver (engine helper, runs inside the same mutation)
                                    │  strategy = registry.get(variants.strangerLevel)
                                    ▼
                         StrangerStrategy (axis B)  →  Decision (plain data)
                                    │
                  validated by the legality layer ── illegal? ──► standard's decision + strategyFallback
                                    ▼
                  applied as a logged action:  strangers<Kind>{ strategyId, strategyVersion, decision }
```

The driver is an **engine** helper, not Convex code, so the solo and multiplayer entry points share it and cannot
diverge. Convex only supplies the loop's I/O (writing each action to the log).

### 5.2 The interface, by stage

Hooks are added as the engine gains the decisions they answer. A strategy implements the hooks that exist at its
`level` and inherits the rest from `standard`.

```ts
export interface StrangerStrategy {
  readonly id: string;               // "standard" | "novice" | "expert" | "nn-v1" | …
  readonly version: number;          // bumped on any behaviour change; written to every logged decision
  readonly kind: "builtin" | "external";

  // Stage 1 — exists today (legacy engine):
  assignArtefacts(ctx: LoadoutContext): LoadoutDecision | Promise<LoadoutDecision>;

  // Stage 4 — revised round engine only:
  deploy?(ctx: DeployContext): DeployDecision | Promise<DeployDecision>;          // defender, step (c)
  engage?(ctx: EngageContext): EngageDecision | Promise<EngageDecision>;          // attacker, step (d)
  redeploy?(ctx: RedeployContext): RedeployDecision | Promise<RedeployDecision>;  // surplus, step (e)
  chooseCasualty?(ctx: CasualtyContext): CasualtyDecision | Promise<CasualtyDecision>; // NOMINATES a creature only; the die rule is the engine's (Q7, §7 C3)
}

interface BaseContext {
  view: FightView;                   // read-only; both sides' creatures, borne artefacts, matches, round, level, Eye, curses
  legal: LegalMoves;                 // from the engine's legality layer — the ONLY source of what is allowed
  evaluate: Evaluator;               // exact expected-outcome helpers (technical spec §5.3)
  budget: { maxNodes: number; deadlineMs?: number };
  rngSeed: number;                   // per-decision substream (P8)
}
```

Decisions are plain, serialisable, versioned data. They are the payload of the logged actions in §5.3.

**Eligibility.** Peter's definition 9 makes a Spectre under the Talisman, a sleeper, and "creatures that will not fight"
neither engaged nor unengaged. The `view` must expose *eligible* creatures only, computed by the engine, so a strategy
cannot pair an ineligible one. (How the Unicorn is treated is an open rule point — §7, C4.)

### 5.3 Decisions as logged actions; replay

- New actions, accepted by `reduce` only while a matching decision is pending: `strangersAssignArtefacts`, and (stage 4)
  `strangersDeploy`, `strangersEngage`, `strangersRedeploy`, `strangersChooseCasualty`. Each carries
  `{ strategyId, strategyVersion, decision }`.
- They go through `reduce` and into the same `gameEvents` log as player actions (`{ action, events }`), so `replay()`
  needs no change beyond knowing the new action types.
- **Why always log, even for deterministic built-ins.** Re-deriving a built-in's decision on replay would tie every
  recorded game to the exact code of that strategy; any later improvement would silently change old games. Logging makes
  a recorded game immune to strategy changes and makes external strategies safe.
- **Legacy games are untouched.** When `variants.strangerLevel` is absent the loadout is derived exactly as today
  (not logged), preserving P1.

### 5.4 The driver and the fallback

```ts
// engine, pure, no I/O. Returns every action it applied, in order, so the caller can log each.
function driveStrangers(state, strategy, ids): { state; applied: { action; events }[] }
```

Loop while the fight is waiting on the strangers: build the context, call the strategy (inside the budget), validate,
fall back to `standard` on any failure, apply the action through `reduce`, repeat. Built-in strategies are synchronous,
so a player's action and the strangers' replies commit **atomically** in one mutation.

### 5.5 Gating: solo and multiplayer

- The solo `applyAction` validator is permissive (any `type` string reaches `reduce`). Add an explicit **rejection of
  every `strangers*` action** on the public path, and the same on the multiplayer `act` path.
- Defence in depth in the engine: `reduce` accepts a stranger action **only when** `fight.pending.by === "strangers"`
  and the kind matches. For built-ins the pending state never survives the mutation, so it cannot be forged at all; for
  asynchronous strategies (P11) the pending state does persist, which is exactly why the public rejection is required.
- Multiplayer: stranger actions are system actions with no seat. They bypass the turn gate but apply only to the party
  whose fight is pending. `mpReduce` needs a variant of its action union for them.
- Tests: a forged `strangers*` action is rejected through `applyAction` and through the multiplayer `act`, in every phase.

### 5.6 Registry, selection, difficulty, leaderboards

- `strategy/registry.ts` maps an id to a `StrangerStrategy`. `standard` is always present and is the universal fallback.
- Selection follows the project's existing variant pattern: **server-stamped from an environment variable first**
  (like `TRAP_RULES_ENABLED`), so it can be tried in a deployment without a player-facing choice; a player-chosen level
  can follow once the levels are calibrated.
- **Leaderboards.** The earlier spec (G7) segments scores by level. The board already has eight tables
  (mode × kit × Sibyl). A third level multiplies that to twenty-four. **Recommendation:** only `standard` is ranked;
  games on any other strategy record the id on the row for information and are not listed (the same treatment as
  `forcedRedraw`, and as Test Mode games, which cannot be recorded). See §9, D2.

### 5.7 External and time-budgeted strategies

- Peter favours a Monte Carlo search whose budget **grows with the human's thinking time**. A Convex mutation cannot
  wait, so this needs the asynchronous path: a public action loads state, asks the strategy (which may `fetch` a model
  endpoint), and commits through an internal mutation. The fight holds `fight.pending` meanwhile (P11).
- Whether strangers can usefully think *while the human thinks* depends on the round: a defender-side deploy comes
  before the human's reply, so there is nothing to wait for; an attacker-side pairing comes after the human's deploy, so
  it can start the moment that deploy is committed. Only the second gains from a longer clock. This should be confirmed
  with Peter before any UI promises it (§9, D4).
- A fixed budget (the earlier spec's ~400 ms) is the stage-1 default and fits inside a mutation.
- The model must see only the human-visible view (P4). Endpoint, secret handling, schema versioning, timeout and cost
  ceiling are the open "contract items" in the technical spec §5.6.

### 5.8 One source of rules for the lab and the engine

Today the lab re-implements the rules (parity-tested on strength only). Two consequences: strategies tuned in the lab
may not behave the same in the game, and every rule change must be made twice. The plan:
- Stage 3 adds a lab **adapter** that runs any registered engine strategy as the stranger side of a lab scenario, so the
  lab becomes the bench for real strategies.
- Stage 4 (the revised round engine) is built so the lab can **import it** and delete its copy of the round logic,
  keeping only scenario generation and statistics.

### 5.9 What Peter's 10-OCT answers add to the contract

These are rules the revised engine's **legality layer** must encode, so that every strategy (built-in or external) is checked
against the same thing. None changes the interface in §5.2; they change what `legal` allows and what the engine does.

| From | Requirement on the engine and its legality layer |
|---|---|
| Q1 | **Step [e] may create 2v2.** A side with unengaged creatures may deploy any of them into any legal position, including a fighter into an existing 1v2 match. A tied 2v2 persists into the next round's step [c]. Step [d] (the attacker's one-to-one pairing) can **never** create a new 2v2. Deployment minimums unchanged |
| Q2 | **End of fight** is one test: neither side has any creature able to continue a match, be deployed to create a new match, or be deployed to break a stalemate |
| Q3 | **Stalemate** means *neither side can beat the other on any roll*. It must be computed from the two sides' possible results (bonuses, Ring, curses, surprise), not asserted |
| Q4 | **Curses** are part of the Result formula |
| Q5 | **Scroll:** the destroying variant is usable in any round by an attacking party that is not a stranger party, with a creature able to use it, when the Eye is not present; fighters are destroyed, innate-magic creatures are not, and level 4+ invulnerable creatures survive. Strangers never read it, so it needs no strategy hook |
| Q6 | **Every fight a Hazard card can trigger** goes through the same rules: the Treasure Chest Spectre (**no surprise**) and the Ghouls. A blocked retreat does not start a new fight and keeps the roles |
| Q7 | **Casualty:** the die rule is engine-owned; strategies only nominate |
| Q10 | **A new fight is a new fight.** Step 2 starts with every artefact on the floor, guarded by the strangers; `assignArtefacts` then runs once. Survivors of an earlier fight are not remembered as armed |

Two things follow for the plan. The hazard-triggered fights are **single-purpose stranger parties** (a Spectre of magical power 5;
the Ghouls). They need the engine's rules but have nothing to decide, so they should run through the same round engine with
`standard` and need no special strategy plumbing. And because `standard` doubles as the fallback (P5), D7 must be settled, even
provisionally, before stage 4 ships.

---

## 6. Staged plan

Stages 1–3 do not depend on any open rule question and can ship with zero change to play. Stage 4 is gated on §7.

| Stage | Delivers | Depends on | Exit criterion |
|---|---|---|---|
| **0. Decisions** | The questions in §9 answered; C1–C4 in §7 ruled | You and Peter | Written answers |
| **1. Extract the loadout seam** *(built 11-OCT-2026, uncommitted)* | `StrangerStrategy` with `assignArtefacts` only; registry; `standard` = `defaultLoadout`; `variants.strangerLevel` plumbing (absent = legacy) | — | All goldens, conformance vectors and replays unchanged (P1); a second trivial strategy proves selection |
| **2. Logged decisions, driver, gating** *(built 11-OCT-2026, uncommitted; solo only, see SC-9.6-9 to SC-9.6-12)* | `strangersAssignArtefacts` action; `driveStrangers`; fallback and `strategyFallback`; public/multiplayer rejection; log header with strategy id/version | 1 | Replay of a strategy-on game is exact and never builds a strategy (P6); forgery tests pass on both paths (P7) |
| **3. Bench** *(built 11-OCT-2026, uncommitted; exit criterion NOT met, see [the bench note](2026-10-11-smart-loadout-bench.md))* | Lab adapter; a first real alternative for the loadout (Peter's "Smart Loadout": best of the ≤ 81 allocations by exact evaluation) | 2 | The smart loadout beats `standard` in the lab on the agreed measure, inside the budget (P10) |
| **4. Revised round engine** | Technical spec milestones M1–M3: the round engine behind `variants.combatRevision`; `deploy`, `engage`, `redeploy`, `chooseCasualty` hooks; the lab imports the engine | 0 (C1–C4), 2 | A full fight plays headlessly with the flag on; legacy path unchanged; **BUILT 12-OCT-2026** (engine, uncommitted until asked): see the status note below |
| **5. More built-ins** *(built 12-OCT-2026)* | `novice`, `expert` (budgeted), calibration report | 4 | Legality sweep clean (**met**); bands agreed (**open**: `novice` is weaker as intended, `expert` is not distinguishable from `standard`; see [the calibration](2026-10-12-stranger-levels-calibration.md)) |
| **6. External strategy** | Asynchronous driver, pending state, model call, fallback rate measured | 4, 5 | Decisions logged and replayable offline (P6, P11) |

## 7. Conflicts between the documents and the engine

These need a ruling because they change what a strategy is asked to decide.

| # | Conflict | Engine today | Peter / the newer documents | Needed from |
|---|---|---|---|---|
| **C1** | **When the loadout runs** | `equipStrangers` runs at fight start **and after every round** (SC-9.6-3), so survivors re-arm from a dead bearer's gear | **Ruled.** Only **once, before round 1**; artefacts dropped by the dead stay on the floor (review B7). Peter's Q10 adds that **every fight is a new fight**: artefacts start on the floor, even against survivors of an earlier fight | **Revised engine:** `assignArtefacts` is called once per fight, in step 2. **Legacy engine:** unchanged (P1), so the cadence difference is part of what `combatRevision` switches |
| **C2** | **Roles** | The party is always the attacker in the plan model | **Settled.** Roles are fixed — the attacker is who started the fight (B1). Peter's Q6 confirms a **blocked retreat changes no roles** (it is not a new fight). The lab's default (`alternate: true`) is stale | Lab fix only (review §4 item 1); the revised engine is built with fixed roles |
| **C3** | **Casualty hook** | None (the strongest stranger in a lost match is slain automatically) | **Ruled (Q7).** Casualty is *nominate, then a die: high roll = success and the nominated creature dies*, a fixed principle whatever the Fight Plan nominates. The Fight Plan decides **which** creature is nominated | Add `chooseCasualty` as a nomination hook (**not** a die hook). The die rule lives in the engine and is not pluggable. Fix the stranger side to this rule in engine and lab (B3) |
| **C4** | **Creatures that will not fight** | The Unicorn fights at strength 4 (SC-8.5-10, since the 1 October revert) | Definition 9 lists the Unicorn (and the Sibyl) as neither engaged nor unengaged. **Peter did not address this in his 10-OCT response** | Still open: a rule decision. The Sibyl already never reaches the strangers list in the engine; the Unicorn does |

## 8. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Stage 1 looks like a lot of machinery for one hook | Pushback; stalls before it pays off | Stage 3's Smart Loadout gives the plumbing a real second implementation quickly; the machinery is exactly what stage 4 needs |
| The interface is fixed before the revised engine exists | Hooks change shape | Keep the Stage 4 hooks optional and unversioned until stage 4; version every decision schema |
| Two rule implementations drift (engine vs lab) | Strategies tuned in the lab misbehave in the game | The adapter (stage 3) and the import (stage 4) |
| A strategy is slow inside a mutation | Failed or timed-out moves | Mandatory budget (P10); fallback; asynchronous path for anything heavy (P11) |
| Public path forgeable | A player picks their opponent's moves | P7 on both paths, plus the pending-state check |
| Strategy version drift breaks old replays | Recorded games change | Decisions are always logged (§5.3) |
| Ranked scores become incomparable across strategies | Leaderboard fragments or is gamed | Rank only `standard` (§5.6, D2) |

## 9. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| **D1** | Is "multiple implementations" the **strategy** axis only, or also alternative **rule sets** (axis A: old combat and the revised one) as selectable per game? | Both, in the order of §3: strategy plumbing first, then the engine axis behind `combatRevision`. |
| **D2** | If the strategy is player-visible, are scores split by it? | No. Rank `standard` only; record the id on other games for information. |
| **D3** | Build stages 1–3 now, or wait for Peter's rulings (C1–C4)? | Build now. Peter's 10-OCT answers rule C1 and C3; stages 1–3 touch only the loadout and the plumbing and do not depend on them. Only stage 4 needs C4 and D7 |
| **D4** | How should "the strangers get longer the longer the human thinks" work? | Ask Peter whether it applies to the attacker's pairing only (§5.7). Until then, a fixed budget. |
| **D5** | Where do heavy (search or model) strategies run: a Convex action, or a separate service? | Convex action first (no new infrastructure); a service only if the measured budget does not fit. |
| **D6** | Server-stamped env flag first, then a player-chosen level? | Yes, matching `TRAP_RULES_ENABLED` and `SORCERER_TELEPORT_ENABLED`. |
| **D7** | What is the `standard` deployment baseline? Peter's Q9 has **no definitive answer**; he hopes a "dumb deployment" emerges from the Monte Carlo work and the lab | Use the lab's `HEU` ("strongest against strongest") as a **placeholder** for `standard`'s `deploy`/`engage`/`redeploy`, flagged as provisional. Replace it when the lab proposes one. Stage 4 is not blocked, but `standard` is also the universal fallback, so its choice matters |

## 10. Test plan

- **Byte identity (P1):** the existing golden, conformance and replay suites run unchanged with no strategy configured.
- **Interface:** a contract test that every registered strategy returns a legal decision for every scenario in a fixed
  corpus (the lab's scenario generator), and that an illegal decision is replaced and logged.
- **Replay (P6):** record a strategy-on game, replay it with the registry emptied; the result is identical.
- **Forgery (P7):** a forged `strangers*` action is rejected by `applyAction` and by the multiplayer `act`, before and
  during a pending decision.
- **Determinism (P8, P9):** same state and strategy ⇒ same decision; a strategy cannot alter `state.seed`.
- **Budget (P10):** a deliberately exhausted budget returns the incumbent, never throws.
- **Solo/multiplayer parity (P12):** the same fight, driven both ways, gives the same log.
- **Spec maintenance:** per `CLAUDE.md`, every engine change updates `docs/specs/engine-spec.md` (new `SC-` rows for the
  action types, the registry and the pending state; Appendix C for any gap).

## 11. Traceability

| This document | Builds on |
|---|---|
| §5.1–5.4, P5, P6 | Technical spec §5.1–5.2 (interface, logging, never trust a strategy) |
| §5.6 | Technical spec §5.5 (registry, `strangerLevel`), G7 (leaderboards) |
| §5.7 | Technical spec §5.6; NN requirements §1a, §9; review B8 |
| §5.8, P14 | Pairing-lab README; review §4 (changes to the lab) |
| §7 C1–C4 | Review B1, B3, B7, R7, R9 |
| §2 | `loadout.ts`, `strangerEquip.ts`, `combatPlan.ts`, `convex/game.ts`, `multi.ts`, `replay.ts`, `pairing-lab/src` |

---

## Stage 4 status (12-OCT-2026)

**C4 is ruled:** the Unicorn fights with non-magical strength 4 (so Definition 9's "neither engaged nor unengaged" is not applied to it); the engine already did this and the revised engine adds no special case (engine-spec SC-9.7-9).

**Built (engine-spec SC-9.7-1 to SC-9.7-9):**
- `revisedRound.ts`: the round machine behind `variants.combatRevision` — fixed roles, deploy → engage → surplus → fight → wrap-up, persistent matches, 2 v 2 allowed, tie/stalemate persists, the lost-pair rule (nominate, then a die; both sides), Peter's Q2 end test and the standoff, the loadout once before round 1.
- Party actions `deploy`, `engage`, `redeploy`; stranger actions `strangersDeploy`, `strangersEngage`, `strangersRedeploy`, `strangersNominate` (driver-applied, rejected from clients); events `deployed`, `engaged`, `redeployed`, `strangerCasualty`, `fightStandoff`.
- The four pairing hooks on `StrangerStrategy` (optional; omitted ones are `standard`'s), plain-data `FightView`, engine-supplied `legalPairs` / `legalMoves`, the generalised driver with the same legality check and `fallback` as the loadout.
- `standard`'s pairing decisions (the lab's GRD, provisional per D7), written side-generically so the same code plays the party in `playRevisedFight`.
- Evidence: `revised-round.test.ts` (whole fights to the end, determinism, replay, legality, Spectre, standoff, casualty) and `engineFight.test.ts` in the lab (five positions × 400 fights, engine vs lab simulator within sampling noise). Legacy path: the whole existing suite is unchanged and green.

**Not done, and why:**
- **The lab still has its own simulator.** The exit criterion said the lab would import the engine and delete its copy. It is kept as the fast simulator (hundreds of thousands of fights) and locked to the engine by `engineFight.test.ts` instead; deleting it would make every search slower for no gain in fidelity. The lab's strategy adapter does not yet call the engine's hooks.
- **No surface and no switch.** Nothing in `apps/web` (UI, Convex schema or `game.ts` env) sets `combatRevision`, so no player or server can reach it; the manual needs no change until one does. The player's formation screen (technical spec §7) is its own piece of work.
- **Multiplayer fights against strangers** are not wired to the driver (solo only, as for the loadout), and player-versus-player fights are untouched.
- **Fights started outside `startFight`** other than the Treasure Chest Spectre have none (checked: there are none). Fights that start with surprise 0 and no player action (a turncoat Apprentice, the chest Spectre) make the **party** the attacker; that is provisional until Peter says who attacks there.
- The Scroll is not modelled (as in the lab). `smart` and the Monte Carlo strategy do not use the hooks yet (stage 5).

---

## Stage 5 status (12-OCT-2026)

**Built (engine-spec SC-9.7-10, SC-9.7-11):** the `novice` and `expert` strategies, a 150-fight legality sweep per level (no fallback, every fight ends, identical replay), and `pnpm levels` in the pairing lab with [a first calibration report](2026-10-12-stranger-levels-calibration.md).

**Result:** legality is clean (zero fallbacks in about 9,600 level-fights). `novice` is 1 to 2.5 points of R3 below `standard`, as intended. `expert` is **not** better than `standard` (within ±0.002): scoring one round exactly reproduces what greedy already does, and the Monte Carlo gain the lab measured came from playing fights out.

**Open:** agree the bands (§5 of the report), and decide whether `expert` stays as it is or gets a rollout search, which needs a rollout simulator in the engine (hook contexts carry views, not state). Nothing in `apps/web` or Convex selects a level yet, so the manual needs no change.

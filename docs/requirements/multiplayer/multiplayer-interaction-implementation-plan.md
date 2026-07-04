# Multiplayer Interaction — Implementation Plan

> Status: Draft · Created 2026-07-03 · The **HOW** for `multiplayer-interaction-specification.md` (the
> WHAT). Builds on the multiplayer core that is **already implemented** (`packages/engine/src/multi.ts`,
> `apps/web/convex/multiplayer.ts`, the `Multiplayer*` React surface). Companion to
> `2026-06-15-multiplayer-plan.html`.

**Prime directive:** *the single-player game must not be affected.* §1 makes that a set of enforced
invariants; every workstream in §4 states its single-player impact and safeguard.

---

## 1. The single-player safety guarantee

The architecture already protects solo play, and this plan keeps it that way. Solo runs through
`reduce(GameState, GameAction)`; multiplayer runs through `mpReduce(MpGameState, seat, MpAction)`, which
**composes** a per-party `GameState`, calls the **same** `reduce`, then **splits** the result back
(`multi.ts:61-70,155-178`). Interaction work must preserve four invariants:

- **INV-1 — Inter-party actions never reach solo.** New interaction actions (trade / attack / unite /
  guard / …) are added to **`MpAction` only**, never to the solo `GameAction` union. `reduce` and the
  solo action validator never see them; they are handled by new **`mpReduce` branches** (and a new
  multi-only session reducer), outside `reduce` entirely.
- **INV-2 — No observable change to solo output without explicit sign-off.** Some interactions need
  changes to *shared* engine primitives (`reduce`'s combat/petrification/loot paths, the borne/carried
  item flag). Every such change is **additive and defaulted so solo behaviour is byte-identical**, and
  is gated behind a **solo golden-snapshot test** (§8). Where a change would *improve* solo (e.g. the
  known "won-fight fallen artifacts are lost" bug), it is proposed **separately** and only landed with
  the user's explicit approval — never as a side-effect of the multiplayer work.
- **INV-3 — The compose/split boundary is stable.** New `PartyState` / `MpGameState` fields are
  **optional and additive**; `compose`/`splitCave` continue to round-trip a valid solo `GameState`
  (fields `reduce` ignores are fine — it already ignores `seat/color/name/status/kills`).
- **INV-4 — Solo modules get only additive, neutral edits.** `reduce.ts`, `setup.ts`, `selectors.ts`,
  `combat*.ts` may gain **new** helpers/branches used only by the multi path; existing solo branches are
  untouched. Multi orchestration lives in `multi.ts` + new `multi-*.ts` modules and in
  `convex/multiplayer.ts` + new `convex/mp-*.ts`.

**CI gate (blocks merge):** the full engine solo suite stays green, and a new **solo golden test**
replays a fixed seed+action script through `reduce` and asserts the final state + event stream are
unchanged. Any diff must be an intentional, approved solo change.

---

## 2. What is already built (start line)

Do **not** re-plan these — they are done and shipping under the beginner ruleset:

| Area | Built |
|---|---|
| Engine core | `CaveState` / `PartyState` / `MpGameState`, `buildMpGame`, `choosePartyFor`, `mpReduce`, `partyView`, `advanceTurn`, `turnEnds` (`multi.ts`). Compose/split reuse of `reduce`. |
| Turn model | Strict round-robin (`order`, `active`); reverse-order party draft; one-fight-round-per-turn (`turnEnds`). |
| Convex | `createMultiplayer`, `joinByCode`, `lobby`, `setPartyName/Color/Ready`, `leaveSeat`, `startGame`, `pickParty`, `gameState`/`playView`/`spectateView`, turn-gated `act`, `sendMessage`/`messages`, per-party terminal → multiplayer high-score record, action narration. |
| Web | `MultiplayerSetup` / `MultiplayerLobby` / `MultiplayerGame` / `MultiplayerPlay`, feature-flagged (`MULTIPLAYER_ENABLED`). |

So the spec's **I-1 (co-existence), I-2 (Gateway), I-3 (enter occupied chamber, no interaction), I-4
(scavenge dropped loot — via shared `contents`), I-13 (parties + strangers, per-party), I-15/I-17
(wiped/escaped terminal), I-19 (solo Sorcerer)** already work at the "beginner" level. This plan adds
the **interaction** layer (I-5, I-6, I-7, I-8, I-9, I-10, I-11, I-12, I-16 multi-facets, I-18, and the
turn-model/§ revisions).

---

## 3. Two things that touch shared engine code (handle first, carefully)

Most interaction code is multi-only (INV-1) and can't affect solo. Two prerequisites do touch `reduce`
and so carry the INV-2 burden:

1. **Borne/carried item flag (plan ④a).** Add an optional per-holding `mode?: "borne"` to a member's
   carried items (default = carried). Solo default keeps every item *carried* — which is exactly today's
   behaviour — so **solo scoring, pickup and combat are unchanged**. The flag only changes what happens
   on **petrification/death loot** (below), and only when set.
2. **Loot-spill on petrify/death (I-12, I-16).** Today `reduce` spills a fallen member's carried items
   to the chamber **only on retreat** (`reduce.ts:617-624`); on a won fight / wipe / petrification the
   items stay locked on the body (the solo bug from the earlier analysis). Unifying this (carried →
   chamber floor; borne → locked with body) **changes solo output**. Therefore it is gated:
   - **Option A (recommended, INV-2-safe):** apply the unified spill **only in the multi path** (a
     helper called from `mpReduce`/the multi fight resolver), leaving `reduce` solo behaviour identical.
   - **Option B (needs sign-off):** fix solo too (it *is* a bug) and update the golden snapshot
     deliberately. Present as a separate, approved change.

   Default to **A** to honour the prime directive; offer **B** as an opt-in solo improvement.

---

## 4. Workstreams

Each: *implements (I-refs) · engine · convex · web · single-player impact & safeguard · async/sync ·
tests.*

### WS-0 · Interaction foundations (shared-engine, solo-guarded)

- **Implements:** the borne/carried flag and the unified loot-spill (§3) that I-12/I-16 build on.
- **Engine:** add `mode?: "borne"` to the member-treasure representation; a `spillOnDown(state, member)`
  helper (carried → `contents`, borne → stays) used by the **multi** casualty/petrification paths; a
  `status:2` gate on `moveTreasure`/`dropTreasure` **in the composed multi view** so a stone comrade's
  goods can't be carted off. Reuse existing combat math untouched.
- **Convex:** none.
- **Web:** slot-based inventory UI (weapon/artefacts/belt/backpack, plan ④) that sets `mode`; shows
  borne vs carried. (Solo can adopt the same UI cosmetically without the down-spill behaviour.)
- **Single-player impact:** **none** under Option A (spill helper is called only from the multi path;
  the flag defaults to carried). Safeguard: solo golden test + the existing engine suite.
- **Async/sync:** n/a (pure state).
- **Tests:** unit — borne stays locked, carried spills, stone-member move/drop blocked; **solo golden
  unchanged**.

### WS-1 · Co-location, awareness & environment guards (multi-only)

- **Implements:** I-1, I-3, I-4 (guarded loot), I-13 (fight-in-progress guard), I-14 (special-chamber
  constraints), I-2.
- **Engine (`multi.ts`):** derive `occupants(area)`; record `arrivedFrom(seat)` on move (for surprise,
  WS-3); an `areaInteractionMask(mp, area)` that reports what's legal here (PvP legal? loot free vs
  guarded? fight in progress?). No change to `reduce`.
- **Convex:** `playView` already returns the seat's view; extend the multi views to include **other
  parties' public presence** (seat, colour, name, `partyArea`, doubled-if-union) and per-area masks.
- **Web:** occupancy chips + rival tokens on the shared map (already partly there); "Also here: …";
  disabled interaction affordances with reasons; guarded-loot ring (WS-4).
- **Single-player impact:** none (multi views only).
- **Async/sync:** fully **async** (Tier B). Reactive presence, no locks.
- **Tests:** occupancy/mask unit tests; view exposes rivals but not their private working set.

### WS-2 · Cooperative sessions: trading & knowledge (multi-only)

- **Implements:** I-5 (trade), I-18 (secret-door knowledge share).
- **Engine:** `MpGameState.session` union gains a `trade` variant (baskets per side, both-confirm);
  `applyTrade` moves cards atomically (validates carry limits; Eye curse-suppressed on completed
  trade). Secret-door knowledge becomes a **per-seat set** on `PartyState` (`knownDoors`); grant helpers
  `showDoor` / auto-grant-on-use / flute-grant. Solo keeps its global `secretDoors` rendering — the
  per-seat set is a **new multi field**, so solo is untouched (INV-3).
- **Convex:** `proposeTrade` / `respondTrade` / `commitTrade`; `showSecretDoor`. Session state lives in
  `MpGameState`; membership-gated; reaction-window timeout (WS-5).
- **Web:** two-column trade modal (both-confirm, countdown); "Show the secret door" action + toast.
- **Single-player impact:** none. `knownDoors` is additive; solo door logic unchanged.
- **Async/sync:** **Sync, 2 seats**, bounded by a 60 s window → expire; everyone else async.
- **Tests:** trade round-trip + capacity/Eye rules; door-grant grants exactly the recipient; solo golden
  unchanged.

### WS-3 · Player-vs-player combat (multi-only, the hard one)

- **Implements:** I-9 (declare), I-10 (multi-party rounds), I-11 (retreat), I-12 (violent loot).
- **Engine — new multi-only fight model.** An inter-party fight **cannot** be a composed single
  `GameState` (it needs two commands), so add `MpGameState.session` variant `pvp`:
  ```
  PvpSession {
    area, attackerCmd, defenderCmd,   // each a command = one party OR a union (WS-4)
    round, activeSide, surprise,      // surprise = +1 only if attacker !following (arrivedFrom differs)
    layout: { defenderLine, attackerEngage, defenderCasters },
    log[]
  }
  ```
  A new module `multi-fight.ts` runs the round loop from the spec §4:
  `defenderLine → attackerEngage → defenderCasters → resolve`. **Reuse solo combat math** (front
  strength, caster magic, Magic Sword, dragon-kills, Strength Potion, Ring/curse mods, casualty roll) by
  composing each side's *view* for the strength calc — but the pairing/round orchestration is new and
  never calls `reduce`. Casualties set `status:3` + `eyeForsakenByDeath`; loot uses WS-0's spill.
- **Convex:** `declareAttack` (legality mask from WS-1), `deployLine` / `engage` / `assignCasters` /
  `resolveRound` / `proposeStop` — each turn-gated to the side whose round it is, with a per-round
  reaction window (WS-5) that auto-deploys **strongest-fights-strongest** and rolls from the responder's
  own substream on timeout.
- **Web:** two-sided fight surface (extends the solo `FightSurface`): your line vs theirs, drag-to-engage,
  per-match preview, round log, "their round… (0:38)" state, **your dice stay yours to roll**. A
  no-detail "⚔ nearby fight" hint for others (fog-of-war-lite, plan ⑦).
- **Single-player impact:** **none** — entirely new `MpAction` types + `multi-fight.ts`; `reduce`,
  `FightSurface`'s solo path, and the solo fight tests are untouched (INV-1/INV-4). The shared combat
  math functions are **read-only reused** (no signature change).
- **Async/sync:** **Sync, combatants only**, alternating per-round reaction windows (45 s → auto). The
  rest of the table stays async. Retreat (I-11) grants the two-turn tempo and forbids auto-chase.
- **Tests:** deployment/round resolution vs the spec examples; surprise-only-when-not-following;
  roll-your-own-dice; retreat tempo; loot after wipe. Heavy multi-only coverage; **zero** solo test
  churn.

### WS-4 · Unions, division & shared bounty (multi-only)

- **Implements:** I-6, I-7, I-8, I-19.
- **Engine:** `Union { id, commander, members[], area }` on `MpGameState`; forfeit-a-turn on join
  (`forfeitedTurnFor`); commander-moves-combined with **strongest-fights-strongest** enforcement; leave
  at a boundary / refuse-move / defend-if-attacked; recruited-ally allocation on dissolution. A `pvp`
  command may be a union (WS-3). `Detachment { ownerSeat, area, members[], stance:"guard" }` for division
  → makes loot guarded (WS-1), defends when attacked (WS-3), rejoins on return. Sorcerer bounty:
  `sorcererSlainBy: seat[]` → split 30 at scoring.
- **Convex:** `proposeUnion`/`respondUnion`/`leaveUnion`/`refuseMove`; `divideParty`/guard orders;
  allocation handshake. Turn rotation honours forfeits.
- **Web:** union HUD (commander + members, doubled tokens), combined roster labelled by owner colour;
  leave/refuse controls; guard-placement UI; ally-allocation modal; shared-bounty line on results.
- **Single-player impact:** none.
- **Async/sync:** union form/operate = **Sync within the union** (bounded consent windows); guards are
  async until attacked.
- **Tests:** union command constraints; forfeit accounting; ally split (agreement vs neutral-until-fight);
  bounty split; guard defence.

### WS-5 · Turn model, RNG & reaction-window infrastructure (multi-only)

- **Implements:** plan revisions ① (concurrent exploration), ② (split RNG), ⑧ (timeouts); the reaction
  windows all of WS-2/3/4 depend on.
- **Engine (`multi.ts`):** **split the RNG** — keep `cave.seed` as the **shared deck-draw stream** and
  add a **per-party dice substream** (`PartyState.diceSeed`) so a party's rolls don't perturb another's
  draws and each side rolls its own (roll-your-own-dice). Refactor `compose`/`split` to route dice to the
  party seed and draws to the cave seed. **Concurrency:** replace the single `active` cursor with
  **per-seat turn-threads** — a seat exploring alone (not co-located, not in a session) may act any time;
  deck draws serialise atomically via Convex transactions; an **area/session lock** engages only during
  an interaction. Keep a strict-order fallback behind a game flag.
- **Convex:** reaction windows via `ctx.scheduler.runAfter(windowMs, autoDefaultMutation)`, cancelled on
  early response; `lastSeen` pauses the countdown (presence-aware) up to a grace cap; concurrency means
  `act` no longer checks a single `turnSeat` but the seat's own thread + any active lock.
- **Web:** whose-turn UI becomes "your thread is live" (concurrent) rather than "wait for the table";
  countdown timers on session prompts.
- **Single-player impact:** **none** — `multi.ts`/convex only. The split RNG must keep solo's single
  stream exactly as-is (solo composes cave.seed for both draws and dice, unchanged).
- **Async/sync:** this workstream is what *maximises async* — it is the payoff of the whole design.
- **Tests:** determinism of split RNG (multi replay reproduces); concurrent draws serialise; timeout
  auto-defaults fire and cancel correctly; **solo RNG stream unchanged** (golden).

### WS-6 · Terminal variants & fog-of-war (multi-only, optional)

- **Implements:** I-15 zombies option, plan ⑦ fog-of-war-lite, Phase-7 hidden cards.
- **Engine/Convex/Web:** zombie spoiler party on wipe; fog-of-war-lite (face-down rectangles for
  others' explored tiles, doubled pawns, no-detail fight hints) as a per-seat view filter; full
  hidden-cards as a stricter per-seat view.
- **Single-player impact:** none (view filters + a variant party).
- **Async/sync:** async.
- **Tests:** view-filter correctness; zombie lifecycle.

---

## 5. Reaction-window & session infrastructure (the wait-minimiser)

The spec's promise — *only ever wait on a human inside a session you chose, bounded, self-healing* —
is realised by one small mechanism reused everywhere:

- **Session object** on `MpGameState`: `session?: TradeSession | UnionSession | PvpSession`, scoped to
  its participant seats. Non-participants ignore it entirely (their threads run free).
- **Window:** on opening a window for seat `S`, schedule `autoResolve(sessionId, round)` via
  `ctx.scheduler.runAfter(windowMs, …)`. If `S` responds first, cancel the scheduled job. If `S` is
  disconnected (`lastSeen` stale), pause/extend up to a grace cap, then auto-resolve.
- **Auto-defaults:** PvP round → strongest-fights-strongest + own-substream roll; trade/union offer →
  expire (declined); union forfeit prompt → refuse. **No dead stops, ever.**

This is entirely multiplayer infrastructure (Convex scheduler + `MpGameState.session`); solo has no
sessions and never schedules anything.

---

## 6. Sequencing & milestones (each shippable, each solo-safe)

| Milestone | Workstreams | Deliverable | Flag |
|---|---|---|---|
| **M1 — Foundations** | WS-0 | Borne/carried flag + multi loot-spill helper + slot UI; solo golden green. | behind `MULTIPLAYER_ENABLED` |
| **M2 — Awareness** | WS-1 | Rivals visible, occupancy chips, guarded-loot & fight-in-progress guards, special-chamber masks. | ″ |
| **M3 — Cooperation** | WS-2 + WS-5 (windows) | Trading + secret-door sharing over reaction-window sessions. | ″ |
| **M4 — PvP** | WS-3 | Attack, multi-party rounds, retreat, violent loot. The centrepiece. | ″ |
| **M5 — Unions** | WS-4 | Unions, division/guards, shared Sorcerer bounty. | ″ |
| **M6 — Concurrency** | WS-5 (full) | Split RNG + concurrent exploration + presence-aware timeouts — the tedium killer. | ″ (or its own sub-flag) |
| **M7 — Variants** | WS-6 | Zombies, fog-of-war-lite, hidden cards. | optional game-variant flag |

Sequencing notes: M6 (concurrency) can move **earlier** if answering Peter's tedium objection is the
priority — it's independent of M3–M5 and only touches `multi.ts`/convex. M1 is the only milestone that
touches shared engine code, so it lands first and behind the strongest test gate.

---

## 7. Data-model deltas (all additive, INV-3)

- `PartyState`: `+ arrivedFrom?`, `+ diceSeed?`, `+ knownDoors?: number[]`, `+ forfeitedTurnFor?`,
  member items gain `+ mode?: "borne"`, `+ sorcererSlainBy` handling.
- `MpGameState`: `+ session?`, `+ unions?: Union[]`, `+ detachments?: Detachment[]`, `+ concurrency?`
  (thread state) `+ locks?`.
- Convex `games`/`players`/`messages`/`gameEvents`: unchanged shapes; `state` (the `MpGameState`) simply
  carries the new optional fields. `mpActionValidator` gains the new interaction action variants
  (multi-only). No solo Convex change.

---

## 8. Testing & the solo firewall

1. **Solo golden snapshot (the firewall).** Fixed seeds × scripted action logs replayed through
   `reduce`; assert final `GameState` + full event stream byte-identical. Runs in CI on every change;
   a diff **fails the build** unless it's an approved solo change. This is the concrete enforcement of
   INV-2.
2. **Existing solo suite** stays green (engine + web).
3. **Multi engine units** (`multi-*.test.ts`): mpReduce turn-gating, sessions, PvP rounds vs spec
   examples, unions, split-RNG determinism, timeout auto-defaults.
4. **Convex tests** (`convex-test`): membership/turn gating, reaction-window scheduling/cancel,
   presence pause, per-party terminal recording.
5. **E2E** (Playwright, multi-browser): two+ sessions — trade, a PvP duel while a third party raids
   elsewhere (proves scoping), a union, an escape mid-game.

---

## 9. Risks & open decisions

- **Shared combat math reuse vs a fork.** WS-3 reuses solo strength/roll functions read-only. Risk: a
  future solo tweak silently changes PvP. Mitigation: pin the shared functions with their own unit
  tests referenced by both paths; never branch solo logic on "is multi".
- **The solo loot bug (won-fight fallen artifacts lost).** Decision needed: Option A (multi-only spill,
  solo unchanged — default) vs Option B (fix solo too, approved + golden updated). Recommend A now, B as
  a separate approved PR.
- **Concurrency vs strict order for the MVP.** Recommend shipping M4–M5 on the existing strict round-
  robin, then M6 flips on concurrency — so PvP/union correctness is proven before the turn model
  changes underneath it. (Or prioritise M6 first purely for feel.)
- **Reaction-window durations & disconnect grace.** Defaults 45 s combat / 60 s offers; confirm.
- **Scheduler reliability.** Reaction-window auto-defaults depend on Convex scheduled functions firing;
  add an idempotent "resolve if overdue" check on the next `act` as a belt-and-braces backstop.
- **Secret-door variant (plan ⑥).** If the "visible ⇒ usable" variant is chosen as default, WS-2's
  per-seat `knownDoors` collapses to a much simpler shared-visibility check.

---

## 10. Bottom line

The multiplayer **core is built**; this plan adds the **interaction layer** as a set of **multi-only**
extensions (new `MpAction` types, `MpGameState.session`/`unions`, `multi-fight.ts`, Convex sessions with
reaction windows, two-sided UIs) that **never touch the solo reducer**. The only shared-engine change is
the borne/carried flag + loot-spill (M1), which is additive, defaulted to today's behaviour, and locked
behind a solo golden snapshot. Single-player stays exactly as it is; multiplayer gains the full
rulebook depth with the wait-minimising, mostly-async experience the spec calls for.

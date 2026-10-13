# Stage 6 — External Strategy: Implementation Plan

`DATE: 13-OCT-2026`
`STATUS: APPROVED with the defaults below (13-OCT-2026). Rebuilt from the spec and the code; nothing is built yet.`
`RELATED: [pluggable stranger combat](2026-10-11-pluggable-stranger-combat.md) §4 (P1–P15), §5.3–§5.7, §6 stage 6, §9 (D2, D4–D6) · [stranger levels calibration](2026-10-12-stranger-levels-calibration.md)`

## 1. Where things stand

- **The driver is synchronous.** `driveStrangers` (`packages/engine/src/strangerDriver.ts`) loops on `fight.pending.by === "strangers"`. A hook that returns a promise is rejected as `"late: the strategy answered asynchronously"` and replaced by `standard`'s decision.
- **Pending state never survives a mutation yet.** `applyAction` in `apps/web/convex/game.ts` calls `driveStrangers` in the same call and logs each applied action.
- **Forgery is already blocked on the solo path.** Any `strangers*` action from a client is rejected.
- **`strategyId` and `strategyVersion` are already on every logged decision**, so replay never builds a strategy (P6).
- **The strategy is selected by `STRANGER_STRATEGY`**, stamped server-side into `variants.strangerLevel` (D6, already in place).

## 2. Goal and exit criterion

An external strategy, such as a model endpoint, answers a stranger decision outside the mutation. The fight holds a pending decision until the answer arrives or a timeout falls back to `standard`.

**Exit:** decisions are logged and replayable offline (P6, P11), and the fallback rate is measured.

## 3. Defaults (approved)

| # | Default | Source |
|---|---|---|
| 1 | Run it in a **Convex action**, with no separate service. | D5 |
| 2 | **Thinking time is set by the level.** Each external level (for example `ext-easy`, `ext-hard`) declares its own time budget, so the budget is not one global constant. Ruled by MSW, 13-OCT-2026; this settles D4. | D4 |
| 3 | **Solo only.** Multiplayer-vs-strangers is not wired to the driver yet. | §5.5; stage 4 status |
| 4 | **Server-stamped env selection only**, such as `STRANGER_STRATEGY=ext-…`. No player-facing choice. | D6 |
| 5 | **Only `standard` is ranked.** Games on an external strategy record the id and are not listed on the leaderboard. | D2 |
| 6 | **Timeout falls back to `standard`**, logged as `strategyFallback { reason: "timeout" }`. Nothing is left hanging. | P5, P11 |
| 7 | The endpoint sees only `fightView` plus `legal` (P4), never the pack or the seed. | P4 |

## 4. Work packages

### 6.1 Engine: split "ask" from "apply" (pure, no I/O) *(built 13-OCT-2026; engine-spec SC-9.7-12)*
- Add `pendingContext(state)` to `strangerDriver.ts`. It returns the serialisable context for the current pending decision: kind, `fightView`, `legalPairs` or `legalMoves`, `min`, and `rngSeed`. The sync driver builds the same thing today.
- Add `applyStrangerDecision(state, kind, rawDecision, meta)`. It runs the existing legality check, falls back to `standard` on violation, and calls `reduce`.
- Refactor `driveStrangers` onto those two functions. It must stay byte-identical for built-ins (P1).
- Add an `external` strategy kind. `driveStrangers` stops at a pending decision owned by an external strategy and returns `{ state, applied, awaiting }`, instead of falling back as "late".

### 6.1b Level-defined thinking time *(built 13-OCT-2026; engine-spec SC-9.7-13)*
- A level declares its budget as data on the strategy: `budget: { deadlineMs, maxNodes? }`. `pendingContext` passes it to the endpoint (the context already has a `budget` field), and the action uses `deadlineMs` as its fetch timeout.
- External levels are separate ids, such as `ext-easy` (short deadline) and `ext-hard` (long deadline), defined in `externalLevels.ts`. **They are registered in 6.3, not 6.1b**: selecting one before the asynchronous path exists would leave the fight pending forever. Each is stamped through `STRANGER_STRATEGY` like any other level, so the budget is fixed per game with the level (P2).
- `EXTERNAL_STRATEGY_TIMEOUT_MS` stays only as a server-side ceiling that no level's `deadlineMs` may exceed (Convex action limits).
- The timeout watchdog and the fallback use the pending decision's own deadline, recorded when it was requested.
- Levels may also differ in what they do with the time, such as search width. That is the strategy's business and not an engine concern.

### 6.2 Pending state that persists *(built 13-OCT-2026; engine-spec SC-9.7-14)*
- For external strategies, `fight.pending` survives the mutation. `reduce` already accepts only the matching stranger action while it is pending.
- Record when the decision was requested (a server-supplied timestamp, passed in, since the engine stays pure) and a request id. Replay never needs these.
- Test: while a decision is pending, player actions are refused. A forged `strangers*` action is rejected in every phase (P7).

### 6.3 Convex: the asynchronous path (`apps/web/convex`)
- Read `convex/_generated/ai/guidelines.md` first (project `CLAUDE.md`).
- `applyAction` ends by scheduling an internal action, `resolveStrangerDecision(gameId, requestId)`, whenever `driveStrangers` returns `awaiting`.
- That action reads the state, builds `pendingContext`, `fetch`es the endpoint under the level's own `deadlineMs`, and commits through an internal mutation. The mutation re-checks that the request id still matches, applies via `applyStrangerDecision`, then drives any further built-in or external decisions.
- On an error, a non-OK response or a timeout, it commits `standard`'s decision with `fallback.reason`. A late arrival of the real answer is dropped because the request id no longer matches.
- A scheduled `sweepStale` watchdog resolves any decision pending longer than the timeout, covering a crashed action.
- Endpoint URL and secret live in Convex env vars. The response is validated against a versioned schema, and the secret is never logged.

### 6.4 Client
- Show "the strangers are deciding…" while `pending.by === "strangers"`, re-rendered from the existing reactive game query. No new input.

### 6.5 Observability (P15)
- Log per-decision latency and the fallback reason on the logged action. Add a small query or script reporting the fallback rate per strategy.

### 6.6 Lab and measurement
- Add a stub external strategy: a local HTTP server wrapping the `expert` hooks.
- Add a lab command that runs a fight through the full async path against the stub. It reports fallback rate, p50/p95 latency and the legality-sweep result. This is where "fallback rate measured" is met.
- A real model or neural net is separate work (the NN documents). Stage 6 only has to prove the plumbing.

### 6.7 Docs (per `CLAUDE.md`)
- `docs/specs/engine-spec.md`: new `SC-9.7-*` rows for `pendingContext`, `applyStrangerDecision`, the persisted pending state and the timeout fallback; amend Appendix C for any test gaps.
- Update the stage 6 row and add a status note in the pluggable-combat spec.
- The manual needs no change, since players cannot reach the feature. Say so in the PR.

## 5. Tests (TDD, written first)

- **Replay (P6):** record an external game with the registry empty and replay it. The result is identical.
- **Forgery (P7):** a forged `strangers*` action is rejected via `applyAction` and while pending.
- **Determinism (P8):** the context carries a seed substream, and the game seed is untouched.
- **Fallback paths:** timeout, 500, malformed JSON, an illegal move, a late arrival (stale request id), and a crashed action recovered by the watchdog.
- **Parity (P1):** all existing goldens and the built-in sweep are unchanged.
- **Async end-to-end:** a whole revised fight against the stub endpoint finishes with no stuck fights.

## 6. Order and checkpoints

6.1 → 6.2 → **checkpoint (engine and tests green, full suite)** → 6.3 → 6.4 → 6.5 → 6.6 → 6.7.

Commit per package on `combat-review`, in the repo's `feat(engine,web): … (stage 6)` style.

## 7. Out of scope and open

- **Multiplayer wiring** and **PvP** are untouched.
- **D4 is settled for stage 6:** thinking time is level-defined (§3 row 2, 6.1b). What remains for Peter is only whether a level's clock should *stretch* with the human's thinking time (attacker pairing only). That is a later enhancement and not needed here.
- **Real model contract items** (cost ceiling, schema versioning policy) stay open until a real model exists.
- **Revised combat is not reachable from `apps/web`**, because nothing sets `combatRevision`. A stage 6 strategy therefore runs in real games only through the loadout path for now. The pairing hooks run in the lab and in headless fights. To confirm: is that acceptable for stage 6?

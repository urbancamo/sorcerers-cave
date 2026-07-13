# Replay-by-Code — Feature Specification (Solitaire first)

> **Status:** IMPLEMENTED 2026-07-10 (all milestones; every RB row has a passing test). Written the
> same day as the **seed for a loop-oriented build**; the loop drove it red→green autonomously.
> Human review still owed on feel/placement/copy (Part 0's human-judged column).
> **Source of truth caveat:** unlike `engine-spec.md`, the `Code` and `Test` columns below name
> **targets to create**, not existing lines. Where this spec cites *existing* code it gives a real
> `file:line`; where it names code to be written it is marked **(new)**. As the loop turns red→green,
> replace each **(new)** marker with the real `file:line` + test, exactly as `engine-spec.md` is kept.
> **Scope:** solo ("Solitaire") games only. Multiplayer replay is explicitly deferred (see §RB-6).
> **Companion doc:** the loop-execution contract in **Part 0** is the method; Parts I–II are the target.

## How to read this document

- **Part 0 — Loop contract** is *how to build this*: milestones, the tests-first rule, and the split
  between what the loop verifies for itself and what stays under human review. Read this first.
- **Part I — Normative Requirements** is the testable contract: one rule per row with a stable
  **ID** (`RB-<§>-<n>`, RB = replay-by-code), the **Code** it lives in (or **(new)**), and the
  **Test** that pins it. These rows are the loop's acceptance criteria — the loop is done when every
  row has a passing test.
- **Part II — Feature Narrative** is the readable description of the flow and UX.
- **Appendix A — Existing anchors** lists the real `file:line` the implementation builds on, so the
  loop does not have to rediscover them.

---

# Part 0 — The loop contract (how to build this)

This feature is a deliberately chosen *first* loop-oriented build because its correctness splits
cleanly into a **machine-checkable** core and a **human-judged** shell. The loop owns the former; you
own the latter.

## The tests-first rule

For every backend/data requirement (`§RB-1`, `§RB-2`), **write the failing test before the
implementation**. The engine's `replay()` is pure and deterministic (Appendix A-1), so "correct" is
never a matter of opinion here: a reconstructed frame either equals the recorded state or it does not.
That exactness is the loop's fuel — the agent writes code, runs `pnpm --filter web exec vitest run`,
reads the mismatch, fixes it, and *knows* when it is right without you in the seat.

## Milestones (grow the leash)

- **Milestone A — Replay data by code (fully autonomous).** Add a read-only query that resolves a
  four-letter code to its replayable log (`§RB-1`), and prove `replay()` over that log reconstructs
  the stored final state (`§RB-2`). Success is 100% test-defined; you review only the diff.
- **Milestone B — Replay viewer (loop runs, you watch).** A transport UI that steps through
  `ReplayFrame`s, rendering each frame's state through the existing cave view (`§RB-4`, `§RB-5`).
  Frame-indexing logic is testable; the *feel* of the scrubber is not — that part is yours to judge.
- **Milestone C — Entry point & polish (loop runs, you watch).** A "Replay a game" affordance beside
  the existing "Resume a game" code box (`§RB-3`), plus empty/error states. Wiring is testable;
  placement and copy are a design call.

## The checkable / human-judged split

| Concern | Owner | Why |
|---|---|---|
| Query resolves code → log; shareable (no owner guard); no-PII bundle; not-found path | **Loop** | Deterministic; asserted in convex tests |
| `replay()` last frame == stored `game.state` | **Loop** | Pure engine invariant; already the pattern in `game.test.ts:205` |
| Transport maths (clamp at ends, seq indicator, jump) | **Loop** | Pure UI logic; jsdom-testable |
| Does stepping *feel* right; animation between frames; copy/placement | **You** | Taste; the loop cannot self-grade it |

## Constraints the loop must not violate (the "what/why" you keep)

1. **Do not modify `packages/engine`.** `replay()` and `ReplayFrame` are complete and tested; this is
   UI + one thin query. If a change seems needed in the engine, stop and raise it — that is a spec bug.
2. **Do not fork the renderer.** Reuse `createCaveAdapter` / the cave view (Appendix A-4) to draw a
   frame's `state`; a replay frame is just a `GameState`.
3. **Replay-by-code is intentionally shareable — NOT owner-scoped (decision, 2026-07-10, §RB-6-3).**
   Any caller may replay any solo game by its code; the new query deliberately drops the IDOR guard
   the other paths keep. Two consequences the loop MUST honour: (a) the existing owner-scoped paths
   (`resumeByCode`, `log`, `get`) stay exactly as they are — this relaxation applies **only** to the
   new replay query; (b) because the four-letter code is a small, guessable keyspace (26⁴ ≈ 457k), a
   guessed code now yields a stranger's replay — this is an *accepted* exposure for a low-sensitivity
   solo board game, and the bundle MUST therefore carry no owner identity (see RB-1-7).
4. **Read-only.** Replay must never write to `games` or `gameEvents`, dispatch actions, or mutate
   engine state. It reconstructs and displays; it never advances the real game.
5. **Keep the spec in sync (`CLAUDE.md`).** Because this touches `apps/web` and not
   `packages/engine`, the engine spec is unaffected — but flip each **(new)** marker below to a real
   `file:line`+test as the milestone lands.

---

# Part I — Normative Requirements

## §RB-1 — Replay data by code (backend query)

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| RB-1-1 | The backend MUST expose a read-only `query` (proposed `game.replayByCode`) taking `{ code: string }` and returning the replayable bundle for that game, OR `null` when no eligible game matches. It MUST NOT be a `mutation`. | convex/game.ts:174 | game.test.ts:223 › `replayByCode returns null for an unknown code` |
| RB-1-2 | The code MUST be normalised (`trim().toUpperCase()`) and resolved via the existing `by_code` index before lookup, mirroring `resumeByCode`. | convex/game.ts:177-178, schema.ts:31 | game.test.ts:230 › `replayByCode normalises 'abcd' to 'ABCD'` |
| RB-1-3 | The query MUST be **shareable-by-code**: it MUST resolve a valid code regardless of caller, with **no** ownership guard (decision §RB-6-3). A caller who does not own the game MUST still get its replay bundle. *(This is the single intentional divergence from `log`/`resumeByCode`; those keep their IDOR guard — do not touch them.)* | convex/game.ts:174 (no auth/owner check) | game.test.ts:241 › `replayByCode returns the bundle for a game the caller does NOT own` |
| RB-1-7 | Because RB-1-3 makes the bundle reachable by anyone with the code, it MUST NOT include owner-identity fields — no `ownerId`, no user email/name. It exposes only what the viewer needs to render (`seed`, `picks`, `moves`, and presentation fields like `color`/`status`/`createdAt`). *(The existing `log` shape already omits `ownerId`; keep it that way and add an explicit assertion.)* | convex/game.ts:188-195 | game.test.ts:255 › `replayByCode bundle carries no ownerId or user PII` |
| RB-1-4 | The returned bundle MUST be self-contained for replay: the initial conditions `seed` + `picks`, and `moves` (`{ seq, action, events }[]` in `seq` order). It SHOULD reuse the shape already returned by `log` (Appendix A-2) rather than invent a new one. | convex/game.ts:185-197 | game.test.ts:275 › `replayByCode bundle carries seed, picks and ordered moves` |
| RB-1-5 | For a solo game whose `seed`/`picks` are `null` (created before initial conditions were persisted), the query MUST still return the bundle but flag it as not reconstructable-from-scratch, so the UI can show a clear "this game predates full logging" state rather than crash. | convex/game.ts:187 (`replayable` flag) | game.test.ts:292 › `replayByCode flags a pre-logging game as unreplayable` |
| RB-1-6 | The query MUST restrict to solo games in this milestone: a game with `mode === "multi"` MUST resolve to `null` (or an explicit `unsupported` flag). | convex/game.ts:180 | game.test.ts:314 › `replayByCode does not replay a multi game` |

## §RB-2 — Deterministic reconstruction (reuse engine, no new engine code)

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| RB-2-1 | The frames MUST be produced solely by `replay(seed, picks, moves.map(m => m.action))` from `@sorcerers-cave/engine` — no bespoke re-derivation of state in the web app. | engine replay.ts:27, ReplayView.tsx:26-29 (sole call site) | game.test.ts:335 › `replayByCode log replays to the stored final state` |
| RB-2-2 | Reconstruction MUST be exact: the LAST frame's `state` MUST deep-equal the game's persisted `state`. This is the core self-check the loop drives to green (the pattern already exists at game.test.ts:205). | engine replay.ts:27, convex/game.ts:174 | game.test.ts:335 › `replayByCode log replays to the stored final state` (last-frame deep-equal) |
| RB-2-3 | Reconstruction MUST yield exactly `moves.length + 1` frames, frame 0 being the untouched initial deal (`action: null`, `events: []`). | engine replay.ts:29 | replay.test.ts:75 (existing invariant) + game.test.ts:335 (frame count + frame-0 assertions) |

## §RB-3 — Entry point (enter a game code)

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| RB-3-1 | The UI MUST provide a way to enter a four-letter code to start a replay, presented alongside — and visually parallel to — the existing "Resume a game" box on the splash screen. | SplashScreen.tsx:139-166 ("Replay a game" box) | SplashScreen.test.tsx:64 › `offers a replay-by-code entry` |
| RB-3-2 | Code entry MUST validate `^[A-Z]{4}$` (case-insensitively) before calling the backend, reusing the existing validation pattern, and MUST surface a clear message when no replay is found for the code. | SplashScreen.tsx:47-56 (`submitReplay`) | SplashScreen.test.tsx:74 › `rejects a non 4-letter replay code` |
| RB-3-3 | Entering a valid code for any solo game (owned or not, §RB-1-3) MUST open the replay viewer (§RB-4); an unreplayable (RB-1-5) or unsupported (RB-1-6) game MUST show its explanatory state, not the viewer. | GameScreen.tsx:104-112 (`handleReplay`), :134-136 | SplashScreen.test.tsx:85 › `unreplayable code shows explanation, not viewer` |

## §RB-4 — Replay viewer & transport

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| RB-4-1 | The viewer MUST hold the full `ReplayFrame[]` and a current index `i` (0-based), rendering the state of frame `i`. Stepping MUST be O(1) array indexing (no re-reduction on navigation). | ReplayView.tsx:26-33 (frames memo + cursor) | ReplayView.test.tsx:41 › `renders frame i on step` |
| RB-4-2 | Transport controls MUST include: first, previous, next, last, and a scrubber (range input) over `0..frames.length-1`, plus a readout of the current position (e.g. "move 7 / 42"). | ReplayView.tsx:60-75 | ReplayView.test.tsx:53 › `scrubber jumps to the chosen frame` |
| RB-4-3 | Navigation MUST clamp: previous at frame 0 and next at the last frame are no-ops (buttons disabled at the ends), never out-of-range. | ReplayView.tsx:32 (`jump` clamp), :62-66 (disabled at ends) | ReplayView.test.tsx:60 › `prev at 0 and next at end are no-ops` |
| RB-4-4 | For frame `i ≥ 1` the viewer MUST show the action that produced it and the events it generated, reusing the existing human-readable formatters `actionLabel` / `describeEvent` (Appendix A-3) rather than new copy. Frame 0 MUST read as the initial deal. | ReplayView.tsx:77-81, gameLog.ts:45,100 | ReplayView.test.tsx:72 › `labels the current move and its events` |
| RB-4-5 | The viewer MUST be unmistakably a replay, not live play: no action/movement controls, a visible "Replay" banner/label, and an exit back to the splash. | ReplayView.tsx:57-58 (banner + exit); adapter bound `canAct: () => false` at :42 | ReplayView.test.tsx:80 › `shows no live-action controls in replay` |
| RB-4-6 | *(added 2026-07-13, supersedes the RB-6-5 v1 non-goal)* The transport MUST offer auto-play: Play advances one frame per 500 ms until Stop is pressed or the last frame is reached (playback then ends by itself and Play is offered again); a manual jump during playback re-arms the timer from the new frame. Play is disabled at the last frame. | ReplayView.tsx:34-43 (timer), :74-79 (Play/Stop) | ReplayView.test.tsx:104 › `play animates forward at half a second per frame and stops at the end`; :117 › `stop halts playback where it is` |

## §RB-5 — Rendering a frame through the existing view

| ID | Requirement | Code | Test |
|----|-------------|------|------|
| RB-5-1 | Each frame's `state` MUST be rendered through the existing cave view via `createCaveAdapter` (Appendix A-4); the replay path MUST NOT reimplement cave/roster rendering. | ReplayView.tsx:38-45 (adapter), :56 (CaveCanvas) | ReplayView.test.tsx:94 › `mounts the cave view for a frame` |
| RB-5-2 | Changing frame MUST update the rendered cave/roster to that frame's state (forward AND backward), with no residual state leaking from a previously viewed frame. | ReplayView.tsx:41-44 (`sync` on step) | ReplayView.test.tsx:102 › `stepping back restores the earlier frame's view` |

## §RB-6 — Non-goals & open decisions

| ID | Requirement / Decision |
|----|------------------------|
| RB-6-1 | **Non-goal:** editing, branching, or resuming *from* a replayed frame. Replay is strictly read-only (Part 0, constraint 4). |
| RB-6-2 | **Non-goal (this milestone):** multiplayer replay. `mode === "multi"` is excluded by RB-1-6; a later spec revision covers multi-seat timelines. |
| RB-6-3 | **DECIDED (2026-07-10) — shareable.** Replay is reachable by anyone who has the code; the new query drops the IDOR guard (RB-1-3), the bundle carries no owner PII (RB-1-7), and the existing owner-scoped paths are untouched. Accepted trade-off: the 26⁴ (~457k) code space is guessable, so replays are effectively enumerable by a determined scraper — deemed acceptable for a low-sensitivity solo board game. **Optional future hardening (not required now):** issue a longer/opaque *share token* distinct from the short resume code if enumeration ever becomes a concern. |
| RB-6-4 | **DECIDED (2026-07-10) — splash screen.** The entry point is a "Replay a game" affordance on the splash screen, visually parallel to the existing "Resume a game" code box (SplashScreen.tsx:114). RB-3-1 already encodes this; the in-game "Game log" adjacency is rejected for v1. |
| RB-6-5 | ~~**Non-goal:** playback timing/auto-advance.~~ **SUPERSEDED (2026-07-13):** auto-play shipped as the planned fast follow — Play/Stop at a fixed 500 ms per frame (RB-4-6). Still out of scope: variable speed control. |

---

# Part II — Feature Narrative

A player has a finished (or in-progress) solo game and its four-letter code. From the splash screen —
right next to the existing **Resume a game** box, which already takes a four-letter code and calls
`onResume(code)` (SplashScreen.tsx:114, :36-45) — they instead choose **Replay a game**, type the
code, and are taken into a read-only viewer that lets them step through the game move by move.

Nothing about the game engine changes, because the hard part is already built and tested. The engine
is a pure, deterministic, seeded reducer, so a whole game is captured by `seed + picks + actions`;
`replay()` folds those actions back over `reduce()` and hands back one `ReplayFrame` per move —
frame 0 is the initial deal, frame *i* is the state after action *i*, along with the action and the
events it produced (replay.ts:8, :27). Stepping is therefore just moving an index across an array;
forward and backward are both O(1), with no recomputation.

The backend work is a single thin, read-only query: take a code, normalise and look it up through the
`by_code` index exactly as `resumeByCode` does, and return the self-contained `{ seed, picks, moves }`
bundle that `log` already produces (game.ts:141). Unlike `resumeByCode`/`log`, this query is
**shareable — deliberately not owner-scoped** (§RB-6-3): anyone holding the code can replay the game,
so it drops the IDOR guard the other paths keep and exposes no owner identity in the bundle. That is
an accepted trade-off against the guessable four-letter keyspace for a low-sensitivity solo game; the
existing owner-scoped paths are left exactly as they are. The one true correctness question — *did we faithfully rebuild the game?* — is settled
by a single assertion the loop drives to green: replay the bundle and confirm the final frame equals
the stored state, the very check `game.test.ts:205` already performs.

The viewer holds the frame array and a cursor, renders the current frame's state through the existing
cave view (`createCaveAdapter`) so the cave and roster look exactly as they did in play, and shows the
current move and its consequences using the same `actionLabel` / `describeEvent` text that powers the
downloadable log (gameLog.ts:45, :100). Transport is first / prev / next / last plus a scrubber, a
"move i / n" readout, and Play/Stop auto-advance at half a second per frame (RB-4-6). Crucially it
presents as a replay — no movement or action controls, a clear "Replay" label — so it can never be
confused with, or accidentally mutate, a live game.

What stays a human call is the *feel*: whether stepping is pleasant, whether the cave should animate
between frames or cut, and where the entry point and its copy belong. Those are the parts the loop
hands back to you; everything with a deterministic answer, it settles itself.

---

# Appendix A — Existing anchors (real `file:line`)

- **A-1 — Engine replay.** `packages/engine/src/replay.ts:8` (`interface ReplayFrame { seq, action,
  state, events }`), `:27` (`replay(seed, picks, actions): ReplayFrame[]`). Exported at
  `packages/engine/src/index.ts:9`. Pinned by `packages/engine/src/replay.test.ts` (determinism at
  `:62`, empty-log frame-0 at `:75`).
- **A-2 — Self-contained log bundle.** `apps/web/convex/game.ts:141` (`export const log`) returns
  `{ game: { code, seed, picks, color, status, createdAt }, moves: { seq, action, events }[] }`,
  owner-scoped. `game.test.ts:205` already asserts `replay(seed, picks, moves.map(m => m.action))`
  reconstructs the authoritative state — reuse this as the RB-2-2 pattern.
- **A-2b — Code resolution.** `apps/web/convex/game.ts:87` (`resumeByCode`) normalises
  `trim().toUpperCase()` and looks up via the `by_code` index (`schema.ts:31`); `uniqueCode` at
  `game.ts:43`. `games.code/seed/picks/mode` are optional fields (`schema.ts:11-…`).
- **A-3 — Human-readable move/event text.** `apps/web/src/game/gameLog.ts:45` (`actionLabel`),
  `:100` (`describeEvent`), `:87` (`describeTile`). Reuse for RB-4-4.
- **A-4 — Cave rendering adapter.** `apps/web/src/view/engineAdapter.ts:24`
  (`createCaveAdapter(initial: GameState, art, opts): CaveAdapter`); cave view + HUD in
  `apps/web/src/view/cave3d.js`, `apps/web/src/view/CaveHud.tsx`, roster in `view/viewParty.ts`.
- **A-5 — Entry-point precedent.** `apps/web/src/game/SplashScreen.tsx:114` renders the "Resume a
  game" four-letter code input; `:36-45` validates `^[A-Z]{4}$` and calls `onResume(code)`. The
  in-game log surface is `apps/web/src/game/GameLogModal.tsx` (fetches `api.game.log`).

# Appendix B — Test commands (the loop's feedback command)

```bash
# Web app — jsdom (UI) + edge-runtime (convex) projects; this is the loop's inner-loop command:
pnpm --filter web exec vitest run
# Single file while iterating a milestone:
pnpm --filter web exec vitest run apps/web/convex/game.test.ts
pnpm --filter web exec vitest run apps/web/src/game/ReplayView.test.tsx
# Whole monorepo (engine + web) before declaring a milestone done:
pnpm test
```

# Appendix C — Requirement → milestone map

| Milestone | Requirements | Autonomy |
|-----------|--------------|----------|
| A — Replay data by code | RB-1-1 … RB-1-6, RB-2-1 … RB-2-3 | Fully autonomous (test-defined) |
| B — Replay viewer | RB-4-1 … RB-4-5, RB-5-1 … RB-5-2 | Loop builds; human judges feel |
| C — Entry point & polish | RB-3-1 … RB-3-3, RB-6-3/6-4 decisions | Loop builds; human judges placement |

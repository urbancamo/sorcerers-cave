# Test Mode — Implementation Plan

> Plan for: docs/requirements/test-mode/2026-08-02-test-mode.md
> Created: 2026-08-02
> Status: Awaiting designer sign-off

## 1. Overview

Test mode lets a tester script specific scenarios — a named special area entered from a chosen
direction, a chamber stocked with chosen creatures/artifacts, a forced friendly/indifferent/hostile
reaction — and then play them out through the real game UI, so the resulting encounter, fight, or
artifact use exercises genuine engine mechanics rather than a mocked-up screen.

Access is gated by a magic-string UUID supplied as a URL query parameter
(`?test=<uuid>`), checked against a Convex environment variable that is never exposed to the
client bundle.

## 2. Scope decisions (confirmed with the designer)

| Decision | Answer |
|---|---|
| Deployment | Reachable on the production domain, gated by the secret — not dev/preview-only. |
| Leaderboard | Test-mode games are always excluded from `highScores`. |
| Solo vs multiplayer | Solo only. Multiplayer (`mpReduce`/`compose`) is out of scope for this phase. |
| UI model | Override controls layered onto normal `GameScreen` play — not a separate scenario-builder screen. A tester queues an override, then plays it out with the existing move/fight/artifact UI. |

## 3. Architecture & data flow

```
Browser: visits /?test=<uuid>
  -> client reads the query param, reveals a "Start Test Game" entry on the splash screen
  -> tester picks a party as normal, clicks Start Test Game
  -> Convex mutation game.startTestGame({ secret, seed, picks, color, variants? })
      - compares `secret` to process.env.TEST_MODE_SECRET (Convex env, NOT VITE_-prefixed
        -> never bundled to the client, never discoverable by inspecting the built app)
      - on mismatch: generic rejection, no game created
      - on match: newGame(..., testMode: true), persisted with testMode: true on the row
  -> gameplay proceeds exactly as today, plus a "Test Controls" panel is shown
     (visible only because the LIVE GAME STATE says testMode: true, not just the URL)
  -> tester queues an override BEFORE the triggering move:
      - "next area drawn will be: <special>, direction: <dir>" -> { type: "testPlaceArea", ... }
      - "next chamber will contain: <creatures/treasures/hazards>" -> { type: "testSetChamber", ... }
      - "next reaction will be: friendly/indifferent/hostile" -> { type: "testForceReaction", ... }
  -> tester then plays normally (moves, fights, uses artifacts) — the override only changes
     what the NEXT relevant draw/roll produces; everything downstream is genuine engine behavior
  -> reduce() rejects all three test-* actions with a `blocked` event unless state.testMode
     is true — defense in depth: a hand-crafted Convex call against a real game can't touch it
  -> highScores.save is a no-op for any game whose persisted state.testMode is true
```

The key property: an override doesn't replace normal play, it pre-loads the answer to the *next*
draw/roll. Movement, combat, artifacts, and chamber resolution all still run through the same
`reduce()` path a real game uses, so a scenario built this way is a faithful test of real mechanics.

## 4. Engine data model

`GameState` gains, all immutable-once-set like the existing `variants` flag:

- `testMode?: true` — set only by `newGame(..., { testMode: true })`; never toggled mid-game.
- Three single-slot "armed override" fields (queuing a new value replaces the old one — not a
  queue/list), each persisted normally like the rest of state:
  - `testNextArea?: { dir: number; special: number }`
  - `testNextChamber?: { strangers: number[]; treasures: number[]; hazards: number[] }`
  - `testNextReaction?: "friendly" | "indifferent" | "hostile"`

## 5. New engine actions

All three are rejected with a `blocked` event unless `state.testMode === true`.

### `testPlaceArea { dir, special }`
`special` is the engine's numeric `SPECIAL_*` constant (`decodeArea`'s `.special` field), restricted
to an actual named special — `SPECIAL_DEEP_POOL`(2) through `SPECIAL_WELL`(11). `SPECIAL_NONE`(0)
and `SPECIAL_GATEWAY`(1) are rejected: a plain tunnel needs no override, and there is already
exactly one Gateway, placed at game start.

Arms `testNextArea`. Nothing happens until the tester makes an ordinary `move` in that direction
**and** that direction is a genuinely fresh draw — i.e. no area is already placed at that
coordinate. (If a tile is already placed there, the move just goes to that existing tile, as
today; no draw happens, so there's nothing to override, and the armed override stays armed for a
future fresh draw.) If the current tile has no exit that way at all, the move is simply blocked,
as today, and the override again stays armed. When a matching fresh draw does happen, `tryMove`
(`map.ts`) uses the *canonical* card value for that special — looked up from `AREA_CARDS` /
`EXT_AREA_CARDS`, the same constants the real deck already draws from, so the result is always a
legitimate in-game special — instead of the next deck card. Placement, chamber draw, and event
narration all reuse the normal move-resolution path.

**Design call:** a normal draw only "connects" if the new card's printed doorway happens to face
back toward the party (`hasReverseDoor`, `map.ts`); otherwise it's a dead end. `testPlaceArea`
always connects, regardless of the special's printed orientation — deliberately trading deck-draw
realism for a guarantee that the tester actually reaches the scenario they asked for.

### `testSetChamber { strangers, treasures, hazards }`
Arms `testNextChamber`, consumed the next time a **chamber tile** is freshly entered by ANY means —
an ordinary move, the Magic Carpet, a sprung trap's fall, or a Chasm descent all resolve through
the same chamber-entry path, and any of them will consume the armed override. The normal
`smallPack` draw is replaced by exactly the named entities. `smallIdx` is left untouched, so the
shuffled deck stays intact for every other, non-overridden draw. Only meaningful for genuine
chamber tiles: Deep Pool and Viper Pit never draw a chamber even in real play, so there is nothing
to override there.

### `testForceReaction { outcome }`
Arms `testNextReaction`, consumed by the next `test` (reaction) action in place of
`reactionRoll`'s die roll.

## 6. Convex layer

One new mutation; everything else is reused as-is.

- `TEST_MODE_SECRET` — new Convex environment variable (`npx convex env set TEST_MODE_SECRET
  <uuid>`), server-only, never `VITE_`-prefixed.
- `game.startTestGame({ secret, seed, picks, color, variants? })` — the only new mutation.
  Compares `secret` to `process.env.TEST_MODE_SECRET`. Mismatch: generic rejection, no game
  created, no signal about how close the guess was. Match: `newGame(..., testMode: true)`,
  persisted like any other game row.
- The three `test*` actions need no new Convex code — they ride the existing `applyAction`
  mutation unchanged, since `reduce()` itself gates them on `state.testMode`.
- `highScores.save` rejects when the game's persisted `state.testMode === true` (server-
  authoritative; the client also simply never offers the "save score" prompt).
- Resuming a test game works exactly like resuming any other owned game — the secret is never
  needed again once the row exists.
- `replayByCode` is left working identically for test games. This fits the project's existing
  bug-report culture (`docs/bugs/*-log.json`): a tester can share a replay link showing exactly
  which overrides were queued and what happened.
- No `TEST_MODE_SECRET` configured at all (e.g. a fresh checkout) → `startTestGame` fails closed:
  every attempt is rejected, never "anything goes."

## 7. Web UI

- `apps/web/src/game/testMode.ts` — reads `?test=` from the URL once, remembers it for the
  session.
- `SplashScreen` gains a "Start Test Game" entry, shown whenever that param is present, calling
  `startTestGame` instead of `newGame` (party selection reuses the existing `PartySelect` flow).
- A new `TestControlsPanel`, rendered in `GameScreen` only when the *live game state* says
  `testMode: true` (not just the URL) — three sections mirroring the three actions:
  - **Next area:** a special picker (grouped base/extension-kit, matching the existing
    `SPECIAL[]`/`SPECIAL_*` naming already used by `projection.ts`/`data/areaCards.ts`) plus an
    N/E/S/W direction picker (not pre-filtered by currently-open exits — the override is inert
    until a matching move actually happens).
  - **Next chamber:** creature/treasure/hazard multi-pickers, reusing the existing card-art
    manifest for consistency with the rest of the UI.
  - **Next reaction:** three buttons — Friendly / Indifferent / Hostile.
  - Each "Queue" button dispatches through the existing `dispatch` pipeline already wired into
    `GameScreen` — no new dispatch plumbing. The panel shows whatever is currently armed, with a
    way to clear it.
- A persistent "TEST MODE" badge in the HUD (matching the existing `EXT` kit-badge styling).
- `GameOverScreen` never shows the "Save score" prompt for a `testMode` game.

## 8. Error handling

- Wrong/missing secret at `startTestGame` → generic rejection, no game created.
- A `test*` action dispatched against a non-test game → the existing `blocked` event, same as any
  other illegal action today.
- An override naming something invalid for the current game (e.g. an extension-kit special in a
  kit-off game) → rejected the same way `legalActions` already rejects anything else invalid for
  the active variant set.
- No `TEST_MODE_SECRET` configured → fails closed (see §6).

## 9. Testing

- `packages/engine/src/test-mode.test.ts` (new) — in this repo's established `gap-*.test.ts`
  granular style: each action's happy path, `blocked` on a non-test game, the always-connects
  placement behavior, chamber override leaving `smallIdx` untouched, reaction override skipping
  the die.
- `docs/specs/engine-spec.md` — new `SC-<n>` rows for the new state fields/actions/events, a short
  Part II narrative subsection, Appendix A updates (per this repo's standing rule for any
  `packages/engine/src` change, `CLAUDE.md`).
- `apps/web/src/game/TestControlsPanel.test.tsx` (new), alongside the existing panel tests.
- A Convex-level check that a wrong secret is rejected, and that `highScores.save` no-ops for
  `testMode` games.
- No changes to `solo-golden.test.ts` or the conformance vectors — test-mode games are an
  entirely separate, opt-in path that never touches those fixtures.

## 10. Explicitly out of scope (this phase)

- Multiplayer test mode (`mpReduce`/`compose` threading).
- Editing an *already-placed* area or *already-drawn* chamber (only the next, not-yet-drawn one
  can be overridden).
- Per-creature reaction overrides within a mixed stranger group — the engine computes one
  reaction for the whole group (from its leader's thresholds), and this plan overrides that same
  single outcome, matching existing engine semantics.

# Dead End Area Card Swap — Implementation Plan

> Requirement: `docs/requirements/2026-09-13-swap-dead-end-area-card.md`

**Goal:** Implement the rulebook's dead-end rescue rule — when a party has genuinely run out of
every doorway/stairway it could try anywhere in its explored map (including backtracking), the area
card that just made the *last* dead end is reshuffled into the pack and a new one drawn, repeating
until a way opens. Today this is a documented, deliberate gap: `docs/specs/engine-spec.md` SC-6.3-1
states a fully boxed-in tunnel can soft-lock, because there is no "return the card and redraw" path.

The user wants this as an **optional rule that is never player-selectable** — a deployment-level
setting flipped once they decide whether to enable it for the public release, because it changes
difficulty and must therefore be **excluded from head-to-head leaderboard comparison** with games
that didn't have it.

**Architecture:** Reuse this codebase's existing `extensionKit` variant machinery (state →
Convex schema → leaderboard split) for the new flag, `forcedRedraw` (named to match SC-6.3-1's own
"forced redraw" vocabulary), with one deliberate difference: unlike `extensionKit`, this flag is
never player-chosen, so it must not be client-settable at all — a tampered request could otherwise
forge an easier run onto the real leaderboard. It is stamped server-side from a Convex-only env var,
mirroring `startTestGame`'s existing `TEST_MODE_SECRET` pattern, not the client-side
`featureFlags.ts`/`MULTIPLAYER_ENABLED` pattern (which only gates UI visibility, nothing
scoring-relevant).

**Tech stack:** Engine (`packages/engine/src/map.ts`, `reduce.ts`, `state.ts`, `actions.ts`),
Convex (`apps/web/convex/game.ts`, `schema.ts`, `highScores.ts`), a small read-only web addition
(`featureFlags.ts`, `HighScores.tsx`). No PartySelect / player-facing UI change — that's the point.

---

## Task 1 — Engine: detect "the party is genuinely stuck"

**Files:** Modify `packages/engine/src/map.ts`

- Extract `existingAreaConnects(dest: PlacedArea, dir: number): boolean` from `tryMove`'s
  existing-area branch (currently inlined at lines ~96-107: destroyed → false, vertical onto a
  Whirlpool → false, vertical otherwise → true, lateral → `hasReverseDoor`). Have that branch call
  the extracted helper instead of repeating the logic, so the two paths can never drift. This
  refactor is behavior-preserving — run the full suite immediately after it, before anything else.
- Add `export function isPartyStuck(state: GameState, partyArea: number): boolean` — BFS/DFS from
  `partyArea`, expanding only through areas connected via `existingAreaConnects`. The party is stuck
  iff **every** area in that reachable set has no remaining *actionable* exit/stair bit (check via
  `decodeArea`/`hasExit`, never a raw nonzero-card check — the chamber/special bits would
  false-positive "still has an exit"). An unpruned bit is "actionable" under rules that depend on
  what it points at:
  - **Toward an already-placed area that does NOT currently connect** (`!existingAreaConnects`):
    actionable, regardless of pack state — trying it never draws a card (a pure geometry check
    against a tile that already exists), so it costs nothing and stays retryable. It counts as
    available even though we can already tell it will fail — it hasn't been *tried from here* yet,
    and trying it costs no turn (SC-4-9), so there's no need to predict the outcome ahead of time.
  - **Toward an already-placed area that DOES currently connect: NOT actionable.** This is the
    subtle, easy-to-get-wrong case — a successful connection's exit bit is *never* pruned (pruning
    only ever fires on failure), so if this counted as "still available" it would count forever,
    even after the party has genuinely explored everything reachable through it. Its only real value
    (reaching that neighbor) is already captured by including the neighbor in the BFS-reachable set —
    whatever lies beyond it is checked independently, at the neighbor's own tile. Counting the
    connecting bit itself as "still open" on top of that double-counts a resolved fact as if it were
    unresolved, and is a real bug, not a hypothetical one: consider a Gateway with North/South already
    dead-ended and pruned, East leading to a room whose only door is back West to the Gateway (dead
    end beyond it), and West leading to a similar dead-end room. Every genuinely fresh avenue is
    exhausted, but the Gateway↔East and Gateway↔West door pairs are permanently live (they connect
    successfully) — miscounting them as "available" would make `isPartyStuck` report "not stuck"
    forever, and the rescue would essentially never fire in any map with real interconnected rooms.
  - **Toward unexplored space**: actionable only while `state.largeIdx < state.largePack.length` (a
    card actually remains to draw for it). Once the pack is fully drawn, trying such a direction is a
    permanent no-op (SC-6.1-6: `tryMove` returns `{moved:false, deadEnd:false}` immediately, drawing
    nothing and — critically — *never pruning the bit*, so it would otherwise look "available"
    forever without ever being resolvable). Without this pack-awareness, a single far-off,
    already-mapped tile with a live "toward empty space" bit would make `isPartyStuck` report "not
    stuck" indefinitely once the pack runs dry, even though that bit can never actually produce a way
    forward again — silently reproducing SC-6.3-1's soft-lock in disguise, exactly the failure mode
    this feature exists to close.
- **Known, rules-faithful residual gap** (document, don't try to close): if the party's last
  *actionable* bit points at an *already-placed*, non-connecting neighbor rather than empty space,
  there's no freshly-drawn card to "put back" — the physical rule only ever describes swapping a
  fresh draw. Trying that bit prunes it via the existing-area branch (no draw, so the new mechanism
  never fires), and the party can still soft-lock in that specific shape. This mirrors the printed
  rule's own silence on the case.

## Task 2 — Engine: the swap-and-redraw loop

**Files:** Modify `packages/engine/src/map.ts`, `packages/engine/src/actions.ts`,
`packages/engine/src/reduce.ts`

- `map.ts`: `MoveResult` gains `swaps: { removed: number; drawn: number }[]` (empty when unused).
  Add a small `restoreExit` helper — `pruneExit`'s inverse (`|` instead of `& ~`) — used only on
  rollback.
- `map.ts`: `tryMove(state, dir, allowDeadEndSwap = false)` — restructure the fresh-draw section
  (currently lines ~125-193) into a loop bounded at `largePack.length - largeIdx` attempts, computed
  once before the first attempt (this count is loop-invariant: one draw + one reinsertion nets zero
  per iteration, so the pre-existing empty-pack early return can never re-trigger mid-loop). On each
  non-connecting draw: **place the card and prune the exit first** (its other doors could open
  unrelated connections elsewhere), *then* call `isPartyStuck`. Not stuck → return today's exact
  `deadEnd:true` behavior, unchanged. Stuck (and `allowDeadEndSwap`) → roll back the placement and the
  prune (`restoreExit`), reinsert the rejected card via
  `randBelow(seed, remaining + 1)` (existing `rng.ts` helper) into a uniformly random position among
  the still-undrawn cards (`splice`, not overwrite — the pack grows by one), draw again, retry the
  same direction. Exhausting the bound falls back to ordinary `deadEnd:true`.
  - Reinsertion is RNG-random, not a fixed "middle" index: a fixed midpoint is a bespoke formula this
    codebase doesn't otherwise use for shuffling, and has a real bug — with exactly one card left
    undrawn, `floor(1/2)=0` reinserts at the very front, guaranteeing the same card is redrawn
    immediately (`hasReverseDoor`/`dir` is a pure function of the card value). RNG-random has no such
    degenerate case.
  - This makes the fix **probabilistic, not absolute** (a rejected value can in principle be
    redrawn more than once before every remaining value has been tried) — call that out honestly in
    the spec rather than overselling it; it mirrors how the physical rule itself offers no bound.
- `retreat` (`reduce.ts:1175`) has its own, deliberately harsher dead-end rule (§Retreat: a failed
  retreat forces another fight round) and must be **excluded on purpose**: its call site
  (`tryMove(state, action.dir)`) is left completely untouched, so `allowDeadEndSwap` defaults to
  `false` there.
- `actions.ts`: new `GameEvent` next to `deadEnd`: `{ type: "deadEndCardSwapped"; removed: number; drawn: number }`
  — one per swap iteration, matching this codebase's existing granular-event convention (e.g.
  `combatRoll` fires per pairing, not per round).
- `reduce.ts`: the `move` case's two return points (dead-end/blocked at ~line 665, and the success
  path's event list starting ~line 671) prepend `res.swaps` mapped to `deadEndCardSwapped` events
  ahead of the existing final event(s). The `retreat` case's event construction (line 1184) is left
  untouched — `swaps` is always `[]` there.
- Test Mode's `testNextArea` override needs no special handling: it's consumed and `delete`d on its
  very first read, so by construction it can only ever apply to attempt 1 of the loop; every later
  attempt naturally falls through to a real `largePack` draw.

## Task 3 — State & type threading

**Files:** Modify `packages/engine/src/state.ts`; type-only touch on `packages/engine/src/replay.ts`

- Widen `GameState.variants?: { extensionKit?: boolean }` to
  `{ extensionKit?: boolean; forcedRedraw?: boolean }`.
- `replay.ts`'s `variants` parameter type widens the same way — no logic change, it already threads
  `variants` straight into `newGame`.
- Leave `decks.ts`'s deck-composition variants type untouched (this flag doesn't affect deck
  contents) and leave `multi.ts`'s `MpGameState.variants` / `apps/web/convex/multiplayer.ts`'s own
  separate `variantsV` validator untouched — multiplayer is out of scope **structurally**: as long as
  `forcedRedraw` is never added to those independent MP-side types, a multiplayer-composed
  `GameState` can never have it set, so `reduce.ts`'s `move` case never passes
  `allowDeadEndSwap: true` for an MP seat. No `if (multiplayer)` special-case needed anywhere.

## Task 4 — Server-side flag, never client-settable

**Files:** Modify `apps/web/convex/game.ts`, `apps/web/convex/schema.ts`

- `game.ts`: leave `variantsValidator` as `{ extensionKit: v.optional(v.boolean()) }` — **unchanged**,
  so a client literally cannot send `forcedRedraw` in a mutation call. In both the `newGame` and
  `startTestGame` handlers, immediately before calling `createGameState(...)`, compute:
  ```ts
  const effectiveVariants = process.env.FORCED_REDRAW_ENABLED === "1"
    ? { ...variants, forcedRedraw: true } : variants;
  ```
  and use `effectiveVariants` for both `createGameState(seed, picks, effectiveVariants, ...)` and the
  persisted `variants` field in `db.insert(...)`, so `replay()`/the downloadable game log reconstruct
  with the flag included. Absent env var ⇒ byte-identical to today. Set via `npx convex env set` /
  the dashboard — never a `VITE_`-prefixed name, exactly like `TEST_MODE_SECRET`'s own established
  reasoning.
- `schema.ts`: add `forcedRedraw: v.optional(v.boolean())` to `games.variants`'s object (line ~38)
  and to the `highScores` table (line ~92), exactly mirroring `extensionKit`.

## Task 5 — Leaderboard segmentation

**Files:** Modify `apps/web/convex/highScores.ts`, `apps/web/src/game/featureFlags.ts` (new export),
`apps/web/src/game/HighScores.tsx`

- `highScores.ts`: `save` stamps `forcedRedraw: state.variants?.forcedRedraw ?? undefined` (mirrors
  the existing `extensionKit` line). `list` gains a third optional arg `forcedRedraw`, with its own
  `redrawOf(r)` fallback mirroring the existing `kitOf(r)`, and an added filter clause — splitting
  the leaderboard the same way `mode × extensionKit` already does today.
- **No player-facing tab.** Unlike the kit toggle, this is never a per-game player choice, so
  normally only one table is populated at a time. Add a purely cosmetic client-side constant to
  `featureFlags.ts`: `FORCED_REDRAW_ENABLED = import.meta.env.VITE_FORCED_REDRAW === "1"` (same shape
  as `MULTIPLAYER_ENABLED`), used only by `HighScores.tsx` as the *default* value passed to `list`'s
  `forcedRedraw` arg — this only affects which already-correctly-labeled table a viewer's browser
  opens on, never what gets recorded (that's locked down server-side per Task 4). A toggle tab for
  comparing tables later is a small follow-up, not part of this change.
- `GameScreen.tsx`: no change — the flag is folded in server-side, never passed from the client at
  game creation.

## Task 6 — Spec sync (required in the same change per this repo's CLAUDE.md)

**Files:** Modify `docs/specs/engine-spec.md`

- Amend **SC-6.3-1**'s requirement text with a forward reference: "…so a fully boxed-in tunnel can
  soft-lock — optional, off-by-default `variants.forcedRedraw` closes this gap when set; see SC-6.3-2."
- Add **SC-6.3-2**: the `isPartyStuck` check, the splice-and-redraw mechanics, the `retreat`
  exclusion, the probabilistic (not absolute) nature of the fix, and the residual
  already-placed-incompatible-neighbor gap from Task 1. Code: `map.ts`; Test: new engine test file
  (Task 7).
- Update the §6 narrative paragraph that currently calls the forced redraw "deliberately omitted" to
  note it's now implemented, off by default, cross-referencing SC-6.3-2.

## Task 7 — Tests

**Files:** New `packages/engine/src/forced-redraw.test.ts`; edit `packages/engine/src/gap-movement.test.ts`;
edit `apps/web/convex/game.test.ts`, `apps/web/convex/highScores.test.ts`

- `isPartyStuck` in isolation on small hand-built `makeState({areas:[...]})` fixtures:
  - Single area, all bits pruned, empty `largePack` → `true`.
  - Single area with one live bit toward unexplored space, `largePack` NON-empty (a card remains) →
    `false`.
  - **The bug this design review caught, pinned explicitly**: two areas CONNECTED to each other (a
    Gateway-shaped area with a live door to a placed neighbor whose only door leads back, i.e. a
    confirmed, successfully-connecting dead-end room beyond it), every other bit on both areas
    already pruned, `largePack` empty → `true` (stuck). This is the case that would silently fail
    (wrongly report `false` forever) under a naive "any unpruned bit toward an existing area counts"
    rule, since a successful connection's bit is never pruned — asserting `true` here is what proves
    the connects/doesn't-connect distinction is actually implemented, not just documented.
  - Two areas connected, only the FAR one still has a live bit toward unexplored space (with cards
    remaining) → `false` (proves BFS expansion reaches beyond the immediate tile).
  - Two areas placed adjacently but NOT geometrically connecting (no matching reverse door), the far
    one's own live bit is toward unexplored space → the far area must NOT be reachable via BFS (its
    live bit must not count), proving traversal is gated by `existingAreaConnects` and not "any live
    bit anywhere in `state.areas`".
  - A live bit toward an *already-placed, non-connecting* neighbor, with an EMPTY `largePack` → still
    counts as available (pack state is irrelevant to an existing-area check either way).
  - A live bit toward UNEXPLORED space with an empty `largePack` → does NOT count as available, so a
    party whose only remaining live bits are all pack-starved "toward empty space" ones (with every
    other reachable bit pruned or a confirmed connection) must report `true` — the pack-exhaustion
    refinement, and directly what closes the "no more area cards left" scenario.
- `tryMove(..., true)` swap-loop: first redraw connects (exactly one `swaps` entry, `moved:true`);
  every remaining card fails for `dir` (loop runs exactly `remaining` times, exhausts, falls back to
  `deadEnd:true`, `largePack.length` grew by the rejection count); pin the exact splice arithmetic
  with a small fully-worked example (e.g. `largePack=[10,20,30,40,50]`, draw index 2) for a fixed seed.
- Byte-identity: `tryMove(state, dir)` and `tryMove(state, dir, false)` match today's output exactly.
  Add a third arm to the existing SC-6.3-1 "fully sealed tile" test: `tryMove(sealed, dir, true)`
  still refuses every move (zero exit bits ⇒ nothing to swap either way).
- Retreat regression: a scenario that would trigger a swap as a `move` still dead-ends and locks
  retreat exactly as today via `reduce(state, {type:"retreat", dir})`.
- Convex (mirroring the existing `TEST_MODE_SECRET` env save/restore pattern and the `extensionKit`
  segmentation tests): `FORCED_REDRAW_ENABLED` unset ⇒ no `forcedRedraw` key on a new game and no
  client argument can create one; set to `"1"` ⇒ every new game gets
  `state.variants.forcedRedraw === true` with zero client involvement. `highScores.save`/`list`
  segmentation mirrors the existing `extensionKit` tests verbatim, with a `forcedRedraw` axis added.
- Verification: `npx turbo test typecheck` across the monorepo. No browser verification needed — the
  only visible effect is game-log narration text for `deadEndCardSwapped`, spot-checkable via a
  constructed Test Mode scenario if desired.

## Explicitly not doing

- No PartySelect UI, no `kitToggle`-style checkbox — confirmed non-selectable, per the requirement.
- No multiplayer support — excluded structurally (Task 3), not revisited here.
- No leaderboard tab/UI for switching between the two tables — deferred until the user actually
  decides to change the deployment default and wants to compare historical data.
# Pickup window: "too heavy to carry" info message — design

> Approved by MSW 2026-07-28 (conversation). Scope: display-only, `apps/web`.

## Problem

During the `pickup` phase the engine's `legalActions` (selectors.ts:171) only emits
`takeTreasure` for members that pass `canCarry` (and, in a Deep Pool, are a Giant).
When no member qualifies — e.g. the 100 kg Treasure Chest with no Giant, or every
carrier already loaded — the pickup window lists the treasure's name but renders no
assignment row and no explanation. The player can't tell why there is no option.

## Design

Display-only change in `apps/web/src/game/EncounterPanel.tsx`. No engine changes —
the option is already (correctly) withheld; the panel explains the silence.

During `pickup` phase only, for each treasure in `state.treasures` with **no** entry
in the existing `takeByTi` map (no eligible carrier), and provided at least one party
member is active (status 0 or 1 — so the message never claims "too heavy" when the
real problem is that everyone is down), render a muted info line instead of an
assignment row:

- Deep Pool chamber (`decodeArea(state.areas[state.partyArea].card).special ===
  SPECIAL_DEEP_POOL`, both already exported by the engine package) with **no active
  Giant** in the party: `Only a Giant can lift the <name> from the pool.`
- Otherwise — including a Deep Pool where a Giant is present but already loaded:
  `The <name> is too heavy for anyone to carry.`

Artifacts weigh 0 and always fit, so they can never trigger the message by
construction. Encounter/medusa phases are untouched (takes are never offered there).
Styling reuses `scv-enc-line` plus muted text; at most one small CSS addition.

## Amendment (approved 2026-07-28, follow-up): auto-skip the leave-only window

MSW: the window with only "Leave the treasure" interrupts play. Approved shape:

- When a pickup's ONLY legal action is `leaveTreasure` (nothing takeable, nothing
  usable), the window never opens — `EncounterPanel` auto-dispatches the leave
  (ref-guarded per state object, StrictMode/MP-async safe) and renders nothing.
- The explanation becomes a standing chamber note in `ExplorePanel` while the party
  remains on the tile: parked `200+tid` contents that nobody can take get the same
  wording (too heavy / Giant-only pool), from the shared `uncarryableNotes.ts`
  helper. Silent when the whole party is down.
- A mixed chamber (something takeable or usable, e.g. a Healing-Balm revive) still
  opens the window, with the info line beside the takeable rows as before.

## Testing (component tests)

`EncounterPanel.test.tsx`: mixed chamber shows message + rows, no auto-skip; auto-skip
dispatches leave exactly once (incl. across re-renders) and renders nothing; revive
available keeps the window; all-down auto-skips without a too-heavy claim; carryable
treasure and encounter phase show no message.
`ExplorePanel.test.tsx`: parked chest note; Deep Pool no-Giant pool wording; Deep Pool
loaded-Giant too-heavy wording; carryable parked gold silent; all-down silent.

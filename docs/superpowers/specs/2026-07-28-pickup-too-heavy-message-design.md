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

## Testing (component tests, `EncounterPanel.test.tsx`)

1. Chest with no eligible carrier in pickup → message shown, no dropdown for it.
2. A carryable treasure → no message, dropdown as today.
3. Deep Pool, no Giant → pool wording.
4. Deep Pool, Giant present but at capacity → too-heavy wording.
5. All members down → no message (today's silence preserved).
6. Encounter phase → no message.

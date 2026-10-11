# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/spec.md

> Created: 2026-10-11
> Version: 1.0.0

## Technical Requirements

### Finding that shaped the scope

Today a trap is one-shot. `applyHazards` (`hazards.ts:200`) fires it, then clears `state.hazards` (`hazards.ts:370`); only Medusa, Ghouls and Harpies are re-parked as `300 + id` in `area.contents` (`hazards.ts:358-363`). There is no standing trap to re-enter, so "knowing re-entry" and the retreated-party case need a persisted marker first.

### Standing trap (gated by `variants.trapRules`)

- In the re-park tail of `applyHazards`, park one `300 + HAZARD_TRAP` in `area.contents` per trap in `state.hazards`, whether it fell, was avoided, or both. Unlike Medusa, allow duplicates (no `!includes` guard) so two traps stay two.
- `reload` (chamber.ts) already restores `300 + id` codes into `state.hazards`; confirm it keeps duplicates.
- Record how many traps were reloaded rather than drawn on this entry in `enterChamber` as a per-entry scratch count (`state.knownTraps`, deleted after the hazard pass).
- Well and Bell Rope extra draws add drawn traps to the working set; the total in the working set decides "two traps".
- When the trap is the party's way down, the chamber behind is still parked first (`persistAndExplore`, `finishChamber`), so strangers and treasure stay.

### Dwarf choice (new `trap` pause)

- New phase `"trap"` in `GamePhase` (`state.ts:30`) and a `trapPause?: { freshEntry: boolean; extraDraw?: { hadSurprise?: boolean } }` field modelled exactly on `medusaPause` (`state.ts:199`).
- In `applyHazards`, at `HAZARD_TRAP` with a living Dwarf (`FLAG_GUIDES_PAST_TRAP`) and exactly one trap: do not emit `trapAvoided` or set `fell`; return `trapChoice: true`. The remaining kit hazards after Trap (Desertion, Harpies, Quarrel, Spell) still resolve in the same pass, as today. Two or more traps: `fell = true`, no choice, not deliberate.
- `finishChamber` handles `trapChoice` after the whole-party-incapacitated check: set `phase = "trap"`, `trapPause = { freshEntry }`, emit `trapLooms`, return without running the tail. Split the post-hazard tail (lull, Demon ambush, pacified area, encounter/pickup/explore settle) into a function shared by the normal path and both resumes.
- New actions (`actions.ts`): `{ type: "avoidTrap" }` and `{ type: "fallThroughTrap" }`. `legalActions` returns exactly these two in phase `trap` (`selectors.ts`, beside the `medusa` branch at line 148). `reduce` rejects them in any other phase with `blocked`.
- `avoidTrap`: emit `trapAvoided`, delete `trapPause`, run the shared tail. `fallThroughTrap`: set `deliberateFall`, delete `trapPause`, `persistAndExplore`, `relocateDown`, emit `trapSprung` and `moved`, then `resolveAreaLoop`, as the existing fall branch does (`reduce.ts:316-322`).
- Extra-draw pauses follow the Medusa precedent: `trapPause.extraDraw` carries the captured `surpriseReady` so `finishExtraDraw` restores it (SC-4-16). A trap that arrives by a Well/Bell draw is freshly drawn, so a fall from it is accidental unless the Dwarf chooses to fall.
- A Medusa pause and a trap pause can both occur in one entry; Medusa's pause comes first (it holds all hazards), the trap pause comes after the earlier hazards have fired, matching the fixed order Earthquake, Medusa, Ghouls, Mutiny, Trap (SC-7.2-1). If those hazards end the game, no trap pause opens.

### Deliberate fall and surprise

- New optional `state.deliberateFall?: boolean`, set (a) by `fallThroughTrap` and (b) when a fall is forced by a trap that was reloaded rather than drawn on this entry (`knownTraps > 0` and the trap fell). Never set for a trap drawn on the current entry or a two-trap fall. Cleared with `delete`, never `= false` (SC-EXT-1 byte identity), wherever `fellThroughTrap` is cleared (`reduce.ts:387`, `708`, `597`).
- `relocateDown` stays unchanged except that its callers set `deliberateFall` after it returns; the Chasm, Whirlpool and Crypt callers do not.
- `resolveAreaLoop`: when `deliberateFall` is set, `freshEntry` is true regardless of `area.visited`.
- `finishChamber` surprise: `surpriseReady = freshEntry && (!fellThroughTrap || deliberateFall)` (`reduce.ts:357`).
- Hostile (retreated-from) areas, `reduce.ts:351`: if `deliberateFall`, start the fight with surprise to the party (`startFight(state, 1)`) instead of `-1`. Assumption to confirm in review: the fight starts immediately because the strangers are hostile on sight; the party's +1 replaces the strangers' surprise. If an encounter choice is wanted instead, only this branch changes.
- Withdraw and retreat stay blocked: `fellThroughTrap` is still true after any trap fall.

### Variant gate

- `variants.trapRules?: boolean` on `GameState.variants` (`state.ts:251`) and the `replay`/`newGame` variants type (`replay.ts:40`).
- Stamped server-side from `process.env.TRAP_RULES_ENABLED === "1"` in `withForcedRedraw` (`apps/web/convex/game.ts:82`), never client-settable, same pattern as `forcedRedraw` and `sorcererTeleport`. Document in `apps/web/OPTIONS.md`.
- With the flag off, `applyHazards` takes today's path (dwarf always avoids, trap never parked); the `trap` phase, new actions and `deliberateFall` can never occur.

### UI and presentation

- Web (`apps/web/src/game/EncounterPanel.tsx`): add `"trap"` to `ACTIVE` (line 14) and render a popup, in the manner of the Medusa pause block (line 180), with two plain buttons labelled "Guided past the trap" and "Fall through the trap". The popup is modal for the duration of the phase and cannot be dismissed without choosing.
- `eventNotices.ts`: notices for `trapLooms` and for a deliberate fall (reuse `trapSprung`, add a deliberate marker to the event: `trapSprung { level, deliberate? }`). `gameLog.ts`: action text and mnemonics for `avoidTrap` / `fallThroughTrap` / `trapLooms` (e.g. `TRP AVD`, `TRP FAL`, `TRP LOM`).
- Test Mode panel: no change required.

### Multiplayer (open point)

The parked marker lives on the shared area, so another party meets a standing trap through the same reload. The multiplayer reducer and per-party state (`multi-zombies.ts` carries `fellThroughTrap` per party) need `deliberateFall` and the `trap` pause per acting party. Task 1 of the build is to read the multiplayer reduce path and either implement parity or record it as a follow-up if the solo path is shipped first.

## Approach Options

**Option A:** Pause at hazard-resolution time, like Medusa, with new actions and a popup (Selected)
- Pros: matches the user's popup requirement; reuses the proven Medusa pause pattern and its surprise-preservation contract; keeps the fixed hazard order.
- Cons: touches `applyHazards`, `finishChamber`, `selectors` and the Medusa-style resume paths; the post-hazard tail must be split out.

**Option B:** Choose before the move, as a separate action while standing in a trap chamber
- Pros: no pause phase.
- Cons: does not cover a trap drawn on entry; the dwarf is auto-saved before the player can act; conflicts with the popup requirement.

**Option C:** Ask the client to confirm and send a flag with `move`
- Pros: small engine change.
- Cons: the engine would not own the decision; breaks replay determinism and the "UI renders from `legalActions`" contract.

**Rationale:** Option A is the only one that fits both the drawn-on-entry and re-entry cases and keeps the engine the single source of truth.

## External Dependencies

None. No new libraries.

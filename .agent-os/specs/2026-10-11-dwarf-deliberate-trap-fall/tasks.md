# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/spec.md

> Created: 2026-10-11
> Status: Ready for Implementation

## Tasks

- [ ] 1. Variant gate and multiplayer survey
  - [ ] 1.1 Write tests: `TRAP_RULES_ENABLED=1` stamps `variants.trapRules` in `game.test.ts`; unset does not; a client-sent key is rejected
  - [ ] 1.2 Add `trapRules` to `GameState.variants` (`state.ts`), the `replay`/`newGame` variants types, and the `schema.ts` validator
  - [ ] 1.3 Stamp the flag in `withForcedRedraw` (`apps/web/convex/game.ts`); document it in `apps/web/OPTIONS.md`
  - [ ] 1.4 Read the multiplayer reduce path and per-party state; record whether parity ships now or as a follow-up
  - [ ] 1.5 Verify all tests pass (flag off: goldens and replays unchanged)

- [ ] 2. Standing trap
  - [ ] 2.1 Write tests for `applyHazards` and `reload`: flag off is unchanged; flag on parks one `300 + HAZARD_TRAP` per trap (duplicates kept) whether it fell or was avoided; reload restores them
  - [ ] 2.2 Park traps in the `applyHazards` re-park tail, gated on `trapRules`
  - [ ] 2.3 Count reloaded versus drawn traps per entry in `enterChamber` (`knownTraps` scratch, deleted after the hazard pass)
  - [ ] 2.4 Two or more traps in the working set: Dwarf cannot avoid (covers Well/Bell extra draws)
  - [ ] 2.5 Verify all tests pass

- [ ] 3. Dwarf choice pause
  - [ ] 3.1 Write tests: `legalActions` in phase `trap` is exactly `avoidTrap` and `fallThroughTrap`; both `blocked` elsewhere; avoid settles to encounter/pickup/explore; fall relocates one level down; Medusa-then-trap ordering; earlier hazards wiping the party skip the pause; Well/Bell `extraDraw` restores `surpriseReady`
  - [ ] 3.2 Add phase `"trap"`, `trapPause` state, `avoidTrap`/`fallThroughTrap` actions and `trapLooms` event (`state.ts`, `actions.ts`)
  - [ ] 3.3 Make `applyHazards` return `trapChoice` for a Dwarf party with one trap, after the later kit hazards have resolved
  - [ ] 3.4 Split the post-hazard tail out of `finishChamber`; open the pause there; add the avoid and fall resumes in `reduce.ts`, with the `extraDraw` path following `medusaPause`
  - [ ] 3.5 Offer the two actions in `legalActions` (`selectors.ts`)
  - [ ] 3.6 Verify all tests pass

- [ ] 4. Deliberate fall and surprise
  - [ ] 4.1 Write tests: Dwarf-chosen fall and knowing re-entry gain +1, including into a visited chamber; fresh-draw and two-trap falls gain none; retreated chamber starts an immediate fight with the party's +1; Chasm and Crypt unchanged; `deliberateFall` is deleted on the next normal move and absent when the flag is off
  - [ ] 4.2 Add `deliberateFall?` (`state.ts`); set it on `fallThroughTrap` and on a forced fall from a reloaded trap; clear with `delete` beside every `fellThroughTrap` reset
  - [ ] 4.3 Treat a deliberate arrival as a fresh entry in `resolveAreaLoop`; change the `surpriseReady` rule in `finishChamber`
  - [ ] 4.4 Start the hostile-area fight with party surprise when `deliberateFall` is set (`reduce.ts:351`)
  - [ ] 4.5 Update the existing tests that assert a trap fall never grants surprise so they cover accidental falls only; add a flag-on golden replay
  - [ ] 4.6 Verify all tests pass

- [ ] 5. Popup, presentation and docs
  - [ ] 5.1 Write web tests: phase `trap` renders a popup with two buttons dispatching `avoidTrap` and `fallThroughTrap`; notices, log lines and mnemonics exist for the new events and actions
  - [ ] 5.2 Add `"trap"` to `ACTIVE` in `EncounterPanel.tsx` and render the modal popup (cannot be dismissed without choosing)
  - [ ] 5.3 Add `eventNotices.ts` and `gameLog.ts` entries (`TRP AVD`, `TRP FAL`, `TRP LOM`; `trapSprung` gains `deliberate?`)
  - [ ] 5.4 Update `docs/specs/engine-spec.md` (SC-4-14, SC-4-16, SC-7.1-11, SC-7.2-9, SC-8.1-1, SC-9.2-2, new rows, Part II, Appendices A and C) and the Expanded Consolidated Rules
  - [ ] 5.5 Run the whole test suite and `tsc`, then check the popup in the browser with Test Mode (Dwarf party, forced trap chamber, both buttons, re-entry)

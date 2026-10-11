# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/spec.md

> Created: 2026-10-11
> Status: Ready for Implementation

## Tasks

- [x] 1. Variant gate and standing trap
  - [x] 1.1 Write tests: `TRAP_RULES_ENABLED=1` stamps `variants.trapRules` in `game.test.ts` (unset does not; a client-sent key is rejected); `applyHazards` and `reload` — flag off is unchanged, flag on parks one `300 + HAZARD_TRAP` per trap (duplicates kept) and reload restores them
  - [x] 1.2 Add `trapRules` to `GameState.variants` (`state.ts`), the `replay`/`newGame` variants types and the `schema.ts` validator; stamp it in `withForcedRedraw` (`apps/web/convex/game.ts`); document it in `apps/web/OPTIONS.md`
  - [x] 1.3 Park traps in the `applyHazards` re-park tail, gated on `trapRules`; count reloaded versus drawn traps per entry in `enterChamber` (`knownTraps` scratch, deleted after the hazard pass)
  - [x] 1.4 Two or more traps in the working set: a Dwarf cannot avoid (covers Well/Bell extra draws)
  - [x] 1.5 Read the multiplayer reduce path and per-party state; record whether parity ships now or as a follow-up (follow-up: MP never receives `trapRules`; see technical-spec)
  - [x] 1.6 Verify all tests pass (flag off: goldens and replays unchanged)

- [x] 2. Dwarf choice pause
  - [x] 2.1 Write tests: `legalActions` in phase `trap` is exactly `avoidTrap` and `fallThroughTrap`; both `blocked` elsewhere; avoid settles to encounter/pickup/explore; fall relocates one level down; Medusa-then-trap ordering; earlier hazards wiping the party skip the pause; Well/Bell `extraDraw` restores `surpriseReady`
  - [x] 2.2 Add phase `"trap"`, `trapPause` state, `avoidTrap`/`fallThroughTrap` actions and `trapLooms` event (`state.ts`, `actions.ts`)
  - [x] 2.3 Make `applyHazards` return `trapChoice` for a Dwarf party with one trap, after the later kit hazards have resolved
  - [x] 2.4 Split the post-hazard tail out of `finishChamber`; open the pause there; add the avoid and fall resumes in `reduce.ts`, with the `extraDraw` path following `medusaPause`
  - [x] 2.5 Offer the two actions in `legalActions` (`selectors.ts`)
  - [x] 2.6 Verify all tests pass

- [x] 3. Deliberate fall and surprise
  - [x] 3.1 Write tests: Dwarf-chosen fall and knowing re-entry gain +1, including into a visited chamber; fresh-draw and two-trap falls gain none; retreated chamber starts an immediate fight with the party's +1; Chasm and Crypt unchanged; `deliberateFall` is deleted on the next normal move and absent when the flag is off
  - [x] 3.2 Add `deliberateFall?` (`state.ts`); set it on `fallThroughTrap` and on a forced fall from a reloaded trap; clear with `delete` beside every `fellThroughTrap` reset
  - [x] 3.3 Treat a deliberate arrival as a fresh entry in `resolveAreaLoop`; change the `surpriseReady` rule in `finishChamber`
  - [x] 3.4 Start the hostile-area fight with party surprise when `deliberateFall` is set (`reduce.ts:351`)
  - [x] 3.5 Update the existing tests that assert a trap fall never grants surprise so they cover accidental falls only; add a flag-on golden replay
  - [x] 3.6 Verify all tests pass

- [x] 4. Guide lost
  - [x] 4.1 Write tests: Dwarf alive leaves normally; Dwarf killed then `move` (any direction, including a stair), `withdraw` and `retreat` each fall instead; retreat still leaves the chamber hostile; no tile placed and no dead end on the move; fall is accidental (no `deliberateFall`, no surprise); petrified, deserted and vanished Dwarf behave the same; no standing trap or flag off is unchanged; carpet, teleport and Chasm unaffected
  - [x] 4.2 Add one shared helper in `reduce.ts` that tests "standing trap here and no living Dwarf" and performs the fall (`persistAndExplore`, `relocateDown`, `trapSprung { guideLost }`, `moved`, `resolveAreaLoop`)
  - [x] 4.3 Call it at the top of `move`, `withdraw` and `retreat`, keeping each action's own bookkeeping (strangers left behind, `hostileAreas` on retreat, turn counted on move)
  - [x] 4.4 Verify all tests pass

- [ ] 5. Popup, presentation and docs
  - [x] 5.1 Write web tests: phase `trap` renders a popup with two buttons dispatching `avoidTrap` and `fallThroughTrap`; notices, log lines and mnemonics exist for the new events and actions, including the guide-lost notice
  - [x] 5.2 Render the modal `TrapChoice` popup from `GameScreen.tsx` (not in the EncounterPanel; cannot be dismissed without choosing, and held back while dice or notices are showing)
  - [x] 5.3 Add `eventNotices.ts` and `gameLog.ts` entries (`TRP AVD`, `TRP FAL`, `TRP LOM`; `trapSprung` gains `deliberate?` and `guideLost?`; action codes `TAV`/`TFL`)
  - [x] 5.4 Update `docs/specs/engine-spec.md` (SC-4-14, SC-4-16, SC-7.1-11, SC-7.2-9, SC-8.1-1, SC-9.2-2, new rows incl. guide lost, Part II, Appendices A and C) and the Expanded Consolidated Rules
  - [ ] 5.5 Run the whole test suite and `tsc` (done: engine 1159, web 706, both `tsc` clean), then check the popup and the guide-lost fall in the browser with Test Mode
    ⚠️ Browser check pending: the Claude in Chrome extension was not connected. It needs `npx convex dev --once` (the engine is bundled into the Convex functions) and `TRAP_RULES_ENABLED=1` on the shared backend, removed again afterwards.

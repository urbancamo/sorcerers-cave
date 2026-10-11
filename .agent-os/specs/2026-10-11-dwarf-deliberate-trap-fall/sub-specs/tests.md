# Tests Specification

This is the tests coverage details for the spec detailed in @.agent-os/specs/2026-10-11-dwarf-deliberate-trap-fall/spec.md

> Created: 2026-10-11
> Version: 1.0.0

## Test Coverage

### Unit Tests

**hazards.ts (`applyHazards`)**
- Flag off: a Dwarf party still gets `trapAvoided` with no pause, and no trap is parked (byte-identical to today).
- Flag on, no Dwarf: the trap falls and one `300 + HAZARD_TRAP` is parked on the chamber.
- Flag on, Dwarf, one trap: returns `trapChoice`, emits neither `trapAvoided` nor a fall.
- Flag on, Dwarf, two traps: falls with no choice; two markers parked.
- Kit hazards after Trap (Desertion, Quarrel) still resolve in the same pass before the pause.

**reduce.ts (trap pause)**
- `legalActions` in phase `trap` is exactly `avoidTrap` and `fallThroughTrap`; both are `blocked` in any other phase.
- `avoidTrap` emits `trapAvoided` and settles to encounter, pickup or explore as the chamber demands.
- `fallThroughTrap` emits `trapSprung` (deliberate) and `moved`, party one level down, `fellThroughTrap` true, `deliberateFall` true, strangers and treasure left behind.
- Withdraw and retreat remain blocked after both a deliberate and an accidental fall.
- A Medusa pause followed by a trap pause in one entry resolves in order; a party wiped out by an earlier hazard never opens the trap pause.
- A Well/Bell-drawn trap opens the pause with `extraDraw`, restoring `surpriseReady` on avoid (SC-4-16).

**Surprise**
- Deliberate fall by Dwarf choice into an unvisited chamber: attack gets +1.
- Deliberate fall into a previously visited chamber: attack gets +1 (new route).
- Knowing re-entry (reloaded trap) by a party with no Dwarf: falls and attack gets +1.
- Trap drawn on the current entry: the fall gains no surprise.
- Two traps drawn on this entry (the Dwarf cannot avoid them): no surprise. Two standing traps entered knowingly: a deliberate fall, with surprise.
- Retreated-from chamber below plus deliberate fall: the fight starts immediately with the party's +1, not the strangers'.
- Chasm descent and Crypt trap: unchanged (no new surprise).
- `deliberateFall` is `delete`d on the next normal move and absent from a flag-off state.

**Guide lost**
- Flag on, trap standing, Dwarf alive: `move`, `withdraw` and `retreat` leave normally.
- Flag on, trap standing, Dwarf killed in a fight in the chamber: `move` (any direction, including a stair) falls instead; no tile is placed and no dead end can occur; turn counts.
- Same for `withdraw` and `retreat`; a retreat still leaves the chamber hostile and the strangers behind.
- The fall emits `trapSprung` with `guideLost`, sets `fellThroughTrap`, does not set `deliberateFall`, and an attack below has no surprise.
- Dwarf gone by petrification, desertion or Bell Rope vanish triggers the same fall.
- No standing trap in the chamber (trap never drawn, or flag off): leaving is unchanged.
- Magic Carpet, the Sorcerer's teleport and `descendChasm` are unaffected.

### Integration Tests

**Replay and golden**
- Flag off: existing golden and replay tests pass unchanged (SC-EXT-1).
- A scripted flag-on replay (Dwarf, trap chamber, choose fall, attack) is added as a new golden.
- Update the tests that assert "a trap fall never grants surprise" to scope them to accidental falls (SC-4-16, SC-7.1-11, SC-9.2-2).

**Convex (`apps/web/convex/game.test.ts`)**
- `TRAP_RULES_ENABLED=1` stamps `variants.trapRules` on a new game; unset does not; a client-sent `trapRules` is rejected by the validator.

**Web (`EncounterPanel.test.tsx`, `eventNotices.test.ts`, `gameLog.test.ts`)**
- Phase `trap` renders a popup with exactly two buttons that dispatch `avoidTrap` and `fallThroughTrap`.
- Notices and log lines/mnemonics exist for the new events and actions.

### Feature Tests (browser, Test Mode)

- Queue a trap chamber with `testSetChamber` (hazard: Trap) for a Dwarf party: popup appears; each button behaves per the deliverables.
- Re-enter the same chamber: popup appears again; a no-Dwarf party falls with no popup.
- Choose "Guided past", kill the Dwarf in a fight, then try to leave: the party falls with the guide-lost notice.

### Mocking Requirements

- **Dice and packs:** use Test Mode forced chambers and seeded replays; no mocks.
- **Convex env:** set `process.env.TRAP_RULES_ENABLED` per test in `game.test.ts`.

## Docs to update with the change (CLAUDE.md rule)

`docs/specs/engine-spec.md`: amend SC-4-14, SC-4-16, SC-7.1-11, SC-7.2-9, SC-8.1-1, SC-9.2-2; add new `SC-7.2-*` rows for the standing trap, the pause and the deliberate-fall marker; update Part II prose, Appendix A (state fields, variants) and Appendix C. Add the clarification to `docs/rules/Expanded Consolidated Rules PV2026 V2.md`. Document `TRAP_RULES_ENABLED` in `apps/web/OPTIONS.md`.

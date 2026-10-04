# Stage 1 — Stranger Loadout: Implementation Summary

`DATE: 04-OCT-2026`
`BRANCH: stranger-loadout (uncommitted)`
`IMPLEMENTS: Peter's default loadout V2 ([strangers-default-loadout-v2-20261003.md](../../rules/strangers-default-loadout-v2-20261003.md)), plus the capability table (tech spec §4.4.2) and the area-wide Eye (§4.4.3)`
`SPEC ROWS: engine-spec.md SC-9.6-1 to SC-9.6-8`

Strangers can now use the fight artefacts guarded in a chamber, chosen by Peter's heuristic. It is always on and works in the solo reducer only. It is not behind the `combatRevision` flag. No game has been played in a browser; verification is by tests.

## What strangers do now

- **Equipping.** When a fight starts, the guards pick up the fight artefacts lying in the chamber. Order: Sword, Axe, Staff, Shield, Ring. Each goes to the first eligible creature on Peter's list. Gear is stored in `fight.gear`, which exists only when someone is armed, so unarmed fights leave the state unchanged.
- **Effects in the fight.**
  - A Sword or Axe adds to the bearer's strength, and a Staff adds to its magic.
  - A Shield nullifies the magic of the party members matched against its bearer.
  - A Ring adds 1 to the strangers' dice. On level 4 or deeper, a defeated Ring bearer vanishes with the Ring and leaves its other gear behind.
- **Death and retreat.** A dead bearer drops its gear. A surviving stranger who can use it takes it up next round, or the winners collect it. Retreating returns all gear to the floor.
- **Capability table.** Who may use an artefact is read through capability classes, not creature ids:
  - Thief counts as a Man.
  - Witch and Scholar count as a Priest.
  - Apprentice counts as a Wizard.
  - Sorcerer counts as a Wizard (a house rule, recorded as Addendum note #4).
  - Woman-Hero counts as Woman plus Hero.

  This applies to both sides, so a player's Thief now gains from the Sword too.
- **Area-wide Eye.** An Eye lying in the chamber, or held by the party, switches off artefacts and magic for both sides and skips the loadout.
- **UI and log.** Fight cards show a stranger's artefacts and the strength the resolver will use. The log and notices have two new lines, "took up" and "vanished with".

## New and changed code

| Area | Files |
|---|---|
| Capability table | `capabilities.ts` (new) |
| Loadout heuristic | `loadout.ts` (new, pure) |
| Applying it to a fight | `strangerEquip.ts` (new), `strangerGear.ts` (new, keeps gear aligned with strangers) |
| Strength and fight effects | `combat.ts`, `combatPlan.ts`, `effects.ts` (`eyePresent`) |
| Wiring | `reduce.ts` (fight start, Lotus Dust, Holy Water, Scroll, retreat), `state.ts` (`FightState.gear`), `actions.ts` (`strangerEquipped`, `strangerVanished`), `index.ts` |
| Web | `FightSurface.tsx`, `eventNotices.ts`, `gameLog.ts` |
| Docs | `engine-spec.md` (SC-9.6-1 to SC-9.6-8, amended strength rows, event catalog, narrative, FightState table); tech spec status line |

## Tests

- **Suites:** engine 1058 tests (up from 1001), web and Convex 671. All pass. Typechecks are clean for the engine, web and Convex.
- **New tests:**
  - the 15 loadout vectors from the spec's Appendix C, plus tie-break cases
  - capability table and Eye-on-the-floor tests
  - stranger gear effects, lifecycle (death, retreat, Ring vanish, re-equip) and dice
  - a fight-surface display test
  - log and notice tests
- **Invariant sweep:** 400 played games checking that gear stays aligned with strangers and no fight artefact is duplicated. It covered 474 fights and 7 stranger equips, which matches the feasibility odds. The Ring-vanish and retreat paths are therefore covered by unit tests, not by played games.
- **Superseded tests:** two `kit-creatures` tests pinned the old rules (Apprentice with a Staff, Thief with a Sword). I rewrote them to the new rulings.
- **Regenerated on purpose:** the kit golden and three conformance vectors. For the kit golden only one new event and the state hash differ. The three vectors mix the capability table, the floor Eye and the loadout. I did not attribute each change to a single cause.

## Things to know

- **Multiplayer is not fully unchanged.** The loadout does not run in multiplayer fights or PvP. But the capability table and the area-wide Eye live in the shared strength functions, so multiplayer fights get them too. Gating them to solo is possible.
- **The Eye is only partly widened.** Only the fight calculations treat a floor Eye as present. The Scroll, Medusa and Spectre-annihilation checks still require a held Eye. This is deliberate and recorded in the spec.
- **Defaults used for open questions.** The loadout re-runs after each round (the Q-R15 default). The Staff bonus stays Priest +1 and Wizard +2, because D3 is unresolved. The loadout trigger (Q-L6) is the fight start.
- **A stash mishap, fully reverted.** While attributing a vector change I ran `git stash push` (it created nothing) followed by `git stash pop`. That applied an old stash from the `milestone-c2-encounters` branch. It staged two docs files and put `.gitignore` into conflict. I restored all three from HEAD. Your work was untouched, and the old stash is still in the stash list, unchanged.

## Not done

- Nothing is committed or pushed.
- The loadout is not wired into multiplayer or PvP fights.
- The pairing strategies, round engine and persistent engagements from the technical spec (M1 onwards) are not started.

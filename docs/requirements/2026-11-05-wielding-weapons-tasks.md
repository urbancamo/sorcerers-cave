# Wielding Weapons: tasks

These are the tasks for the spec in `2026-11-05-wielding-weapons-spec.md`.

> Created: 2026-11-05
> Status: Complete (10.2 browser playthrough not done: needs the Convex backend; see follow-ups)

Work test-first. Commands: engine `npx vitest run` and `npx tsc --noEmit -p .` in `packages/engine`; web `npx vitest run` and `npx tsc -p tsconfig.app.json --noEmit` in `apps/web`. Golden and conformance files are regenerated (`vitest -u`) only after the intended change is in, and the diff is reviewed. Each task is its own commit. Engine changes update `docs/specs/engine-spec.md` in the same commit; player-visible changes update `apps/web/src/manual/*`.

## Tasks

- [x] 1. Audit and pin today's behaviour
  - [x] 1.1 List every place the party's bonus reads possession rather than "in use": `combat.ts`, `combatPlan.ts`, `revisedRound.ts`, `effects.ts`, `hazards.ts`, `strategy.ts`, `multi-fight.ts`, `loadout.ts`, `strangerGear.ts`, and the Convex `game.ts` / `multiplayer.ts`
  - [x] 1.2 Check which of these also drive stranger gear (these must keep reading it) and which the solo bot and Test Mode use
  - [x] 1.3 Record the list in the spec's Design section

- [x] 2. Wield and wear state (engine)
  - [x] 2.1 Write tests: Talisman can be worn; the Sword, Axe and Staff are mutually exclusive (W-3); the Shield is wielded alongside any one of them; the Ring and Talisman are worn alongside everything; an item gives no hand-slot conflict when worn
  - [x] 2.2 Write tests: nothing is in use after pickup, trade, moveTreasure, or a won fight (W-1, W-6); wielding and wearing stay blocked in a fight
  - [x] 2.3 Add the Talisman to the usable set in `loot.ts`, split it into wielded and worn, and add the W-3 refusal to `setBorne` in `reduce.ts`
  - [x] 2.4 Update spec SC-7.3-13 (new usable set, wielded versus worn, the refusal)
  - [x] 2.5 Verify all tests pass

- [x] 3. Combat effects need the item in use (engine)
  - [x] 3.1 Write tests for each party effect, carried (no effect) versus in use (effect): Sword bonus and Spectre ability; Axe bonus and Demon ability; Staff magic power; Shield ward; Ring rolls and invincibility; Eye still works carried
  - [x] 3.2 Switch the party's reads from "holds" to "in use" in `combat.ts`, `combatPlan.ts`, `revisedRound.ts` and `effects.ts`; strangers keep reading their gear
  - [x] 3.3 Update the match breakdown (`matchModifiers`) so only items in use appear, and the strength badge (`partyContribution`)
  - [x] 3.4 Update spec SC-9.x combat rows and SC-EXT-26/27
  - [x] 3.5 Verify all tests pass

- [x] 4. Non-combat effects: Talisman and Staff (engine)
  - [x] 4.1 Write tests: a worn Talisman wards Ghouls, Zombies, Spectres (level 4+) and parks Harpies; one wearer covers the whole party; a carried one does nothing
  - [x] 4.2 Write tests: a wielded Wizard's Staff wards Medusa and reanimates the stoned; carried, it does not
  - [x] 4.3 Switch `hazards.ts` and `effects.ts` Talisman and Staff checks to "in use"
  - [x] 4.4 Update spec SC-7.2 hazard rows and SC-EXT-15
  - [x] 4.5 Verify all tests pass

- [x] 5. Nothing is lost with a fallen holder (engine)
  - [x] 5.1 Write tests: a slain or petrified member's Sword, Axe, Staff, Shield, Ring and Talisman all spill like carried items; none vanishes
  - [x] 5.2 Remove the borne carve-out in `loot.ts`, and the special cases in `multi-trade.ts`, `multi-zombies.ts` and `hazards.ts` (Harpies); a spilled item leaves the in-use list
  - [x] 5.3 Update spec SC-7.2-13, SC-9.5-11, SC-7.3-14 and the Axe and Shield petrification rows
  - [x] 5.4 Verify all tests pass

- [x] 6. Regenerate and review the frozen files
  - [x] 6.1 Run the full engine suite; list each failing golden, conformance or bot test and why it failed
  - [x] 6.2 Where a test gave a member an item and expected its bonus, make the test wield it; do not weaken assertions
  - [x] 6.3 Regenerate the golden and conformance files with `vitest -u` and review every changed line
  - [x] 6.4 Verify all engine tests pass and `tsc` is clean

- [x] 7. Party panel and inventory (web)
  - [x] 7.1 Write tests: Wield / Stow for the weapons and Shield, Wear / Remove for the Ring and Talisman; the refusal message when a second attacking weapon is wielded; a state tag on each item (Carried, Wielded, Worn)
  - [x] 7.2 Update `PartyPanel.tsx`, `shell/ItemActions.tsx` and `inventory.ts` (the Talisman gains the controls; wording follows the item)
  - [x] 7.3 Update the strength badge and the match breakdown to show only what is in use
  - [x] 7.4 Verify all web tests and `tsc` pass

- [x] 8. Fight-screen note (web)
  - [x] 8.1 Write a test: a carried weapon that would have helped shows "Magic Sword carried, not wielded"; a wielded or irrelevant one shows nothing; the note never acts
  - [x] 8.2 Add the note to the fight surfaces (`RevisedFightSurface.tsx`, `FightSurface.tsx`)
  - [x] 8.3 Verify all web tests and `tsc` pass

- [x] 9. Manual and rules text
  - [x] 9.1 Update the manual: `treasure.ts` (each item's wield or wear and effect), `house.ts`, `play.ts` (how to wield and wear, prepare before a fight)
  - [x] 9.2 Update `docs/other/Expanded Consolidated Rules PV2026.md` and the multiplayer rules text where they say bonuses apply by possession
  - [x] 9.3 Verify the manual drift tests pass

- [x] 10. Final verification
  - [x] 10.1 Run both full suites and both `tsc` checks
  - [ ] 10.2 Play through in the browser: pick up a Sword, fight (no bonus), wield it, fight (bonus); wear the Ring; a Talisman against Ghouls
  - [x] 10.3 Mark the tasks done and record any follow-ups (multiplayer trade UI, Test Mode)

## Follow-ups

- Browser playthrough (10.2) still to do by hand: pick up a Sword and fight (no bonus), wield and fight (bonus); wear the Ring; Talisman against Ghouls.
- Multiplayer trade UI has no wield/wear controls yet; the engine rules apply, the multiplayer review should cover it.
- Test Mode gives items carried (Q3), so tests must wield them first.

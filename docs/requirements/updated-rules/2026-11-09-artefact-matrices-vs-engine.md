# Artefact matrices (Appendices 20261006) against the engine

> **Superseded 2026-11-11** by `2026-11-11-rebaseline-20261110.md`. This report read the 20261006 ticks as "may carry and use". Peter's 20261110 tables show they meant only "may use" (the new U / C / T key), which overturns the Eye, Elixir, Scroll and Talisman changes described below.

> Created: 2026-11-09
> Source: `docs/rules/Consolidated Rules Appendices 20261006.pdf` (the "Who can use artefacts" allies and strangers tables),
> carried into `docs/rules/Expanded Consolidated Rules PV2026 V3.md`
> Checked against: `packages/engine/src/capabilities.ts`, `effects.ts` (`canUseArtifact`, `usesArtifactsAs`, `isHumanOrPriestClass`),
> `loadout.ts` (`canBearArtifact`), `reduce.ts` (Elixir, line ~1972) and `selectors.ts`.

## Result

**The engine agrees with both matrices for every item that has a class gate, and, since 2026-11-10, for the four items that had none (Eye of God, Elixir, Scroll, Talisman): all four are now human and magic user only, as in Peter's tables.** The sections below record how it stood before the change. No engine
code was changed. Each cell of both tables (15 items by 17 ally creatures, and by 18 stranger creatures including the Sorcerer) was
computed from the engine's own predicates and compared with the PDF.

| Item | Allies: the PDF | Engine | Strangers |
|---|---|---|---|
| Charmed Flute | humans + magic users | same | matches (nobody bears it) |
| Healing Balm | Woman Hero, Woman, magic users | same | matches |
| Holy Water, Lotus Dust | humans + magic users | same (`FLAG_HUMAN`) | matches |
| Magic Carpet | magic users | same (Priest and Wizard classes) | matches |
| Magic Sword | humans (Hero, Woman Hero, Man, Thief, Woman) | same (`swordBonus > 0`) | matches (`loadout.ts`) |
| Magic Axe | humans + Dwarf | same (`axeBonus > 0`) | matches |
| Magic Shield | humans | same (`shieldEligible`) | matches |
| Strength Potion | humans | same (`potionEligible`) | matches |
| Magic Staff | magic users (Apprentice, Priest, Scholar, Witch, Wizard) | same (`staffBonus > 0`) | matches, incl. the Sorcerer |
| The Ring | humans + magic users + Dwarf | same (`ringEligible`) | matches, incl. the Sorcerer and the Dwarf |
| Elixir | humans + magic users | **humans and magic users only since 2026-11-10** (was any member) | matches (strangers bear none) |
| **Eye of God** | humans + magic users | **any bearer** | matches |
| **Scroll** | humans + magic users | **any bearer** (needs a living human in the party) | matches |
| **Talisman** | humans + magic users | **any bearer** | matches |

## The differences

For **Eye of God, Scroll and Talisman** (and the Elixir, see Decision) the PDF leaves the inhuman allies blank (Dwarf, Giant, Lion, Ogre, Troll, Unicorn,
Wolf). The engine has no class gate for these four, so an Ogre or a Dwarf holding one still gets its effect:

- **Elixir** (`reduce.ts` case 15): any living member may drink it; the target is not checked against a class. This one is new: the
  *previous* table gave the inhuman allies the Elixir (house-rule note #3, "rules read 'any creature'"), and the PDF has dropped it.
- **Eye of God** (`effects.ts` `eyeActive`, `eyePresent`): active while any living member holds it.
- **Talisman** (`effects.ts` `partyUses`): its ward is live while any living member wears it.
- **Scroll** (`selectors.ts`, `revisedRound.ts` `scrollOffered`): the bearer can be any creature, provided a living human is in the party.

The older table already showed Eye of God, Scroll and Talisman as human and priest class only, so those three are a long-standing gap,
not something this PDF created. Only the **Elixir** is a change in the rules.

## Other things found

- **Wielding is not gated by class.** `ItemActions` offers Wield or Wear for any Sword, Axe, Staff, Shield, Ring or Talisman held by
  anyone (only the two-hands conflict is checked). An ineligible creature can wield a Sword, but its bonus is 0, so the effect is
  right and only the offer is loose. The new "unused gear" note in `wielding.ts` already ignores such items.
- **Appendix creature table disagrees with the rules text.** The PDF's table has Hero STR 6 / PHY 6 and Spectre STR 4 / MAG 4. The
  rules PDF's own cards and the engine (`data/creatures.ts`) use Hero 5 and Spectre 5 (MAG 5). Peter should confirm. (Woman Hero in
  the base pack agrees with `SC-3-14`.)
- **Stale references.** Comments in `capabilities.ts` and `effects.ts` point at `docs/rules/Expanded Consolidated Rules PV2026 V2.md` and
  `docs/other/Expanded Consolidated Rules PV2026.md`; the file is now `... V3.md`.

## Decision

- **Elixir (MSW, 2026-11-10): humans and magic users only** (an earlier ruling the same day said "any creature"; overruled). A human or
  magic user must carry it, and only a human or magic user can drink it: `canUseArtifact` case 15, the offer list in `selectors.ts` and
  the target check in `reduce.ts` (SC-EXT-22, SC-11-51). House-rule note #3 is withdrawn in the rules file.
- **Healing Balm (MSW, 2026-11-10): a Wizard, a Priest or a Woman may use it.** Read by class, as the PDF and the engine already do:
  Wizard class (Wizard, Apprentice), Priest class (Priest, Scholar, Witch) and Woman class (Woman, Woman Hero, who has all of a woman's
  capabilities). Hero, Man and Thief cannot. The rules file, the PDF and `canUseArtifact` (`effects.ts`) all agree, so nothing changes.
- **Eye of God, Scroll, Talisman (MSW, 2026-11-10): humans and magic users only, as in Peter's Appendix.** This overturns ruling R-21
  ("any holder counts"). Done in the engine as `canUseArtifact` cases 7, 13 and 19 (`effects.ts`), applied to the Eye (`partyHolds`), the
  Talisman (`partyUses` and the Ghouls and Harpies wards in `hazards.ts`) and the Scroll (`legalActions`, `findBearer`, `scrollOffered`).
  An inhuman may still carry one; it does nothing there. Spec row SC-11-51; register R-21 marked overturned; the manual's Eye, Talisman
  and Scroll topics say so. `rulebookArtefacts.test.ts` now reads Peter's two tables and checks all 376 cells: the engine agrees with
  every one.

## What the change touched

- **Tests moved to a human bearer:** an Ogre holding the Eye in `chest.test.ts` (bug DOFO: an Ogre held both the chest and the Eye),
  a Dwarf wearing the Talisman in `hazards.test.ts` and `ghouls-revised.test.ts`, a Dwarf holding the Eye in `kit-axe-shield.test.ts`
  and an Ogre carrying the Scroll in `kit-holywater-scroll.test.ts`. New cases pin the new behaviour (`human-artefacts.test.ts`, and an
  Ogre with the Eye in `chest.test.ts`).
- **Golden snapshots and conformance vectors regenerated** (`solo-seed2678-party5-6-7-artifacts` and `solo-seed53-party2-7-chest2`,
  and the multi-kit snapshot): the scripted bots no longer count an inhuman's Eye, Talisman or Scroll.
- **The pinned search results are stale and are skipped, not fixed.** 26 of the 75 pinned top-score games, the pinned best game K001 and
  the golden game replay with an inhuman holding one of the three, so they now diverge. Their tests are `it.skip` with a note in
  `scoreSearch.pinned.test.ts`, `goldenSearch.pinned.test.ts`, `ScenarioBrowser.test.tsx` and `goldenGame.test.ts`. They need the
  overnight search re-run and the results re-pinned. Until then, those 26 scenarios in the in-game scenario browser will not replay
  legally.
- **Unchanged:** the loose "Wield" offer for an ineligible creature.

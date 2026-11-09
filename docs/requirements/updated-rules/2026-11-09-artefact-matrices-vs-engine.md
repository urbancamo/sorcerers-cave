# Artefact matrices (Appendices 20261006) against the engine

> Created: 2026-11-09
> Source: `docs/rules/Consolidated Rules Appendices 20261006.pdf` (the "Who can use artefacts" allies and strangers tables),
> carried into `docs/rules/Expanded Consolidated Rules PV2026 V3.md`
> Checked against: `packages/engine/src/capabilities.ts`, `effects.ts` (`canUseArtifact`, `usesArtifactsAs`, `isHumanOrPriestClass`),
> `loadout.ts` (`canBearArtifact`), `reduce.ts` (Elixir, line ~1972) and `selectors.ts`.

## Result

**The engine agrees with both matrices for every item that has a class gate, and differs for four items that have none.** No engine
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
| **Elixir** | humans + magic users | **any member, including inhuman** | matches (strangers bear none) |
| **Eye of God** | humans + magic users | **any bearer** | matches |
| **Scroll** | humans + magic users | **any bearer** (needs a living human in the party) | matches |
| **Talisman** | humans + magic users | **any bearer** | matches |

## The differences

For **Elixir, Eye of God, Scroll and Talisman** the PDF leaves the inhuman allies blank (Dwarf, Giant, Lion, Ogre, Troll, Unicorn,
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

## Options (for MSW)

1. **Leave the engine as it is** (the PDF's blanks are read as "not worth modelling"). Cheapest; the four gaps stay.
2. **Gate Elixir only**: refuse an inhuman drinker, in `reduce.ts` and in `legalActions`, since it is the one place the PDF changed.
   Small, but it also needs a decision on who may *hold* the Elixir (carrying is not the same as using).
3. **Gate all four** through `canUseArtifact`: Eye of God and Talisman would then work only while a human or magic user holds or wears
   them, and the Scroll only when such a member carries it. Bigger: it changes passive effects, the Eye's presence rule, and the
   golden and conformance snapshots.

Whichever is chosen, `docs/specs/engine-spec.md` (the artefact rows, Part II and Appendix C) and the manual's treasure topics change in
the same commit.

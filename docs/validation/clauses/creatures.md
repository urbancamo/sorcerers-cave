# Creatures and strangers (Consolidated Rules V2: creature cards, Encountering Strangers)

> Result so far: creature statistics and reaction tables **agree** (22 + 20 table checks); the **leader priority** list differed in 12 pairs (R-32, ruled 'follow Peter' and fixed). The creatures' special-rule prose (Sibyl, Apprentice, Lion, Unicorn, Demon, Spectre, Sorcerer) is not yet re-checked beyond the existing spec rows.

| ID | Clause | Status | Tests |
|---|---|---|---|
| RC-CR-1 | STR (and MAG), CAP and vp for every creature card | Agrees | rulebookCreatures (parsed from the book) |
| RC-CR-2 | Reaction bands for every creature with a printed table | Agrees | rulebookCreatures |
| RC-CR-3 | Leader = highest in Sorcerer, Apprentice, Demon/Spectre, Dragon, Wizard, Hero/W-Hero, Priest, Witch, Man, Woman, Scholar, Thief, Giant, Ogre, Troll, Lion, Wolf, Dwarf | Agrees since R-32 | rulebookCreatures |
| RC-CR-4 | A natural 1 is always hostile whatever the bonus | Agrees | reaction.test (SC-8.3-5) |
| RC-CR-5 | Hostile strangers fight at once; indifferent: test again, attack or leave; the third indifference pacifies | Agrees | reaction/reduce tests (SC-8.4) |

## Creature special rules (checked against the spec rows, not by new tests)

| ID | Clause | Status |
|---|---|---|
| RC-CR-6 | Dragon-slayer: slaying a dragon single-handed adds 1 to the slayer's strength, cumulatively | Agrees (SC-9.x `dragonKills`) |
| RC-CR-7 | Hero: +1 on the reaction die; two Heroes do not double it | Agrees (SC-8.3-2, any charisma member) |
| RC-CR-8 | Lion: not affected by Quarrel, carries and uses no artefact | Agrees (capacity 0; kit-creatures tests) |
| RC-CR-9 | Spectre: magic only; with no magic the strongest member is matched and slain | Agrees (SC-9.4) |
| RC-CR-10 | Sibyl: tested once, only after other strangers are dealt with | Agrees (SC-SIB-4) |
| RC-CR-11 | Demon: appears in the area the party just left, magic only | Agrees (SC-EXT-21) |
| RC-CR-12 | Unicorn: approached only after the other strangers; joins only with a Woman; leaves without one | Agrees (SC-8.5-4/5, R-17) |
| RC-CR-13 | Apprentice: hostile once the Sorcerer is dead; will not go to the surface; uses artefacts as a Wizard | Agrees in the legacy combat; the revised combat defers the revert (SC-EXT-20, SC-EXT-42). Not re-run here |
| RC-CR-14 | Sorcerer: Lotus Dust and Eye of God each -2; may not be tested; spared on terms; a failed attack is cursed | Agrees (SC-8.5-1, SC-12-21..23, SC-11-x) |
| RC-CR-15 | Thief: steals ONE treasure of your choice from indifferent strangers, who then turn hostile and attack next turn | Agrees since R-33 |

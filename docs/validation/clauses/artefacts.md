# Rule clauses: artefacts and curses

> Second area of `docs/requirements/engine-rules-validation/plan.md`. Source: Expanded Consolidated Rules PV2026 V2 (Treasure Cards,
> lines 565-727; Curse, line 271; the Addendum table "ARTEFACTS - WHO CAN USE?"). Tests: `packages/engine/src/rulebookArtefacts.test.ts`.

| RC id | Clause (book) | Status | Test | Register |
|---|---|---|---|---|
| RC-AR-T | The table "WHO CAN USE?": 14 artefacts x creature types x ally/stranger (273 cells checked; strangers only for Sword, Staff, Ring, Axe, Shield, the items the engine gives them) | Rulings: R-21/22/24 keep, R-23 Thief added; 273 cells checked, 3 differences remain by ruling | one test per cell | R-21, R-22, R-23, R-24 |
| RC-AR-EL | Elixir: 1 poison kills, 2-3 nothing, 4-6 permanently +2 strength | Verified | Elixir x6 | |
| RC-AR-CH | Chest: 1 curse, 2 Spectre attacks, 3 sand, 4 silver 20, 5 gold 40, 6 gems 80 | Verified | Chest x6 | |
| RC-AR-CU | A curse subtracts one from all die rolls; cumulative; no effect once the Sorcerer is dead | Verified (the "never below 1" outside fights is Peter's 2026-11-04 ruling) | curses x2 | |
| RC-AR-RG | The Ring makes the bearer invincible on level 4 or deeper | Verified | Ring | |
| RC-AR-TL | The Talisman wards off Spectres on level 4 or deeper | Verified | Talisman | |
| RC-AR-ST | Magic Staff: +2 magical power for a Priest or a Wizard | Verified against the printed card (Priest +1, Wizard +2; R-25) | Staff x2 (`it.fails`) | R-25 |

| RC-AR-EY | Eye of God: annihilates Spectres; Staff magic and Sword bonus powerless, fighting strength kept; dropping it is a curse | Verified | Eye x4 | |
| RC-AR-BM | Healing Balm: a Wizard/Priest/Woman restores a creature just killed; not in a fight; one cure | Verified | Balm x3 | |
| RC-AR-CP | Magic Carpet: a Priest/Wizard moves the party to an adjacent area; the carpet stays where used | Verified | Carpet | |
| RC-AR-LD | Lotus Dust: works on creatures, not on Spectres | Verified | Lotus | |
| RC-AR-SC | Scroll: attacking only; not used up; once per area | Classic combat differs by ruling (any party, consumed; R-26 leave); revised combat agrees | Scroll (pins classic) | R-26 |
| RC-AR-CR/ID | Crypt: 1-2 trap, 3-6 gems; Idol worth 10 x a die | Verified by existing tests (kit-crypt-desertion, kit-elixir-idol), numbers equal the book | existing | |
| RC-AR-HW | Holy Water: reanimates stone, destroys Medusa/Spectre/Demon, weakens Sorcerer/Apprentice by 2, one use | Verified by existing tests (kit-holywater-scroll) | existing | |

Not covered in this area: Magic Shield matching (belongs to the fights area), the Lost Ruby statue (strength 8; special areas).

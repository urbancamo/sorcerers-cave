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

Not yet covered in this area (next): Crypt/Gems bands, Idol value, Holy Water modes, Lotus Dust, Scroll, Healing Balm window, Magic Shield matching, Carpet, Eye curse on loss, Lost Ruby statue.

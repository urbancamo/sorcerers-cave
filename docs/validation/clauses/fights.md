# Rule clauses: fights (classic combat)

> Third area of `docs/requirements/engine-rules-validation/plan.md`. Source: Expanded Consolidated Rules PV2026 V2, FIGHTS (lines 296-378),
> Spectre, Sorcerer, Dragon cards. Tests: `packages/engine/src/rulebookFights.test.ts` (26). All verified: no differences found.

| RC id | Clause (book) | Status | Test |
|---|---|---|---|
| RC-FT-1 | Worked example: hero with sword 5+2 v. ogre 5, woman 2 + dwarf 1 + priest's magic 2 v. troll 4, strangers +1 for surprise | Verified | worked example x2 |
| RC-FT-2 | Surprise adds 1 to all that side's rolls in the first round only; the party's surprise helps the party | Verified | surprise x2 |
| RC-FT-3 | A party too small to engage all strangers fights the strongest combination (hero v. priest, troll, man, dwarf: total 9) | Verified | strongest combination |
| RC-FT-4 | A larger party may send two against one; casters may stay in the background and add magical power, any number combine; a non-caster may not | Verified | who may be sent x4 |
| RC-FT-5 | Spectre: not fought hand-to-hand except by a Man/Woman/Hero with the Magic Sword; casters use magical power only; otherwise the strongest is slain | Verified | Spectres x4 |
| RC-FT-6 | A lost two-creature match: the player states a preference, a die of 4-6 grants it | Verified (all six faces) | casualty x6 |
| RC-FT-7 | Retreat only after a round has been fought | Verified | retreat |
| RC-FT-8 | Sorcerer STR 13; the Eye and Lotus Dust each take 2 off | Verified | Sorcerer x4 |
| RC-FT-9 | A Dragon slain single-handed adds 1 to its slayer's strength; not when two kill it | Verified | Dragon x2 |

Not covered here (existing engine tests cover them; the book gives no numbers to check against): heavy treasure dropped by hand-to-hand
fighters, what a retreat leaves behind, the tie rule, the Sorcerer's spare option and his curse on a failed attack, the Apprentice turning.

## The revised combat has no oracle in the Consolidated Rules

V2 describes only the classic combat. The revised combat (`combatRevision`) is specified in Peter's reformulated rules and the combat-revision
documents under `docs/requirements/combat/`, which are not the agreed source of truth. See register R-27.

# Rule clauses: hazard cards

> Pilot of `docs/requirements/engine-rules-validation/plan.md`. Source of truth: Expanded Consolidated Rules PV2026 V2
> (`docs/rules/Expanded Consolidated Rules PV2026 V2.md`, hazard cards at lines 466-563).
> Tests: `packages/engine/src/rulebookHazards.test.ts` (built with `makeState` / `applyHazards`).
> Status: **Verified** (a test asserts the book's value and passes), **Mismatch** (the test asserts the book, the engine differs;
> written as `it.fails` so it flips red once the engine is fixed), **Deviation** (differs on purpose), **Ambiguous** (book silent; see register).
> The SC rows are the engine spec's section 7 (`SC-7.*`); per-row SC mapping is still to do (see pilot report).

| RC id | Clause (book) | Status | Test | Register |
|---|---|---|---|---|
| RC-HZ-1 | Several hazards in one chamber are dealt with in the order Earthquake, Spell, Harpies, Medusa, Ghouls, Quarrel, Desertion, Mutiny, Trap | Verified (the hazards that fire occur in book order) | RC-HZ-1 | |
| RC-HZ-D1/D2 | Desertion: each ally rolls; 1-2 and it disappears with its treasure. Original members never roll | Verified | RC-HZ-D1/D2 | |
| RC-HZ-D3 | Book: an all-ally party designates one immune. **Superseded by ruling R-07/R-10**: when no original members remain, for any cause, the player picks a new leader who counts as original | **Mismatch** (test asserts the book wording and must be rewritten to the ruling when implemented) | RC-HZ-D3 (`it.fails`) | R-07, R-10 |
| RC-HZ-E1 | Earthquake: the last area the party was in collapses, impassable; its small cards leave play | Verified | RC-HZ-E1 | |
| RC-HZ-E2 | Two Earthquakes in one chamber destroy one area (ruling R-08); one in each of two chambers destroy two | Verified (by ruling) | RC-HZ-E2 | R-08 |
| RC-HZ-M1/M2 | Medusa: each creature rolls on entry; 1-2 turns it to stone | Verified | RC-HZ-M1/M2 | |
| RC-HZ-M4 | A stoned creature's goods stay in the chamber, to be taken at the end of the turn | Verified | RC-HZ-M4 | |
| RC-HZ-M5 | The Eye of God makes Medusa powerless | **Mismatch** | RC-HZ-M5 (`it.fails`) | R-09 |
| RC-HZ-M6 | A Wizard with the Magic Staff wards her off | Verified | RC-HZ-M6 | |
| RC-HZ-G5 | Medusa and Ghouls stay and strike again on each re-entry | Verified | RC-HZ-G5 | |
| RC-HZ-G6 | The Talisman wards off Ghouls | Verified, with a house rule (worn, not merely held) | RC-HZ-G6 | R-13 |
| RC-HZ-H3 | Harpies take the party's artefacts, not those found in this chamber | Verified | RC-HZ-H3 | |
| RC-HZ-H4 | Harpies with nothing to take, or against the Talisman, stay in the chamber | Verified | RC-HZ-H4 | R-13 |
| RC-HZ-Q1/Q2 | Quarrel is between the two strongest members by total strength; the Lion and Wolf take no part | Verified; tie-break is code | RC-HZ-Q1/Q2 | R-14 |
| RC-HZ-U1/U3 | Mutiny turns every ally back into a stranger here; original members stay | Verified | RC-HZ-U1/U3 | R-11 |
| RC-HZ-U4 | If the party is all allies, one stays loyal | Verified, but the engine picks the first, not the player | RC-HZ-U4 | R-10 |
| RC-HZ-T1/T2 | A Trap drops the party a level; a Dwarf guides it past one trap, not two | Verified | RC-HZ-T1/T2 | |
| RC-HZ-S1 | Spell: the last unoccupied tunnel walked through is replaced by the next card, face down | Verified for the tile just left | RC-HZ-S1 | |
| RC-HZ-S2 | Chambers are not affected | Verified | RC-HZ-S2 | |
| RC-HZ-S3 | Tile just left is a chamber: take the last tunnel walked through before it | **Mismatch** (engine fizzles) | RC-HZ-S3 (`it.fails`) | R-12 |
| RC-HZ-S4 | A tunnel with a small card is skipped | **Mismatch** (engine remaps it) | RC-HZ-S4 (`it.fails`) | R-12 |
| RC-HZ-S5 | Earthquake drawn here is placed first; Spell takes the last tunnel left standing | **Mismatch** (engine fizzles) | RC-HZ-S5 (`it.fails`) | R-12 |
| RC-HZ-S6 | Secret-door markers on the level below, at the far end of a stairway in the vanished tunnel, are removed | **Mismatch** | RC-HZ-S6 (`it.fails`) | R-12 |

Counts: 23 clauses: 17 verified (two with a house rule or a code-chosen tie-break), 6 mismatches (R-07, R-09, R-12 x4). The R-14 tie choice has no test: it needs a player-choice action first.

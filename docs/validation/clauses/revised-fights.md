# Rule clauses: fights (revised combat)

> Fourth area. Oracle (register R-27, MSW 2026-11-08): Peter's reformulated rules, `docs/rules/fighting-rules-reformulated-20261014.md`
> (which carries his 2026-10-10 answers), not the Consolidated Rules V2. Tests: `rulebookLoadout.test.ts` (90), `rulebookRevisedFights.test.ts` (22).
> Result: **one difference**, R-28 (surprise into a visited chamber), ruled 'follow Peter' and fixed; everything else agrees.

| RC id | Clause (Peter) | Status | Test |
|---|---|---|---|
| RC-RV-L | Default loadout: the Sword, Axe, Staff and Shield preference lists, in the order printed (parsed from the document, every pair compared); the Ring to the highest adjusted strength, then the tie list; the Eye of God leaves nothing allocated; an artefact nobody can bear stays on the floor | Verified (90 tests) | rulebookLoadout |
| RC-RV-A | Step a: a party bearing the Ring adds 1; not while the Eye is present; the attacker's surprise bonus is 1, first round only; a player side's result is reduced by its curses | Verified | Step a x4 |
| RC-RV-B | Step b: the attacking player party with the Scroll may use it; not with the Eye; not when being attacked; it destroys enemies without innate magic (magic-users and the Sibyl survive), curses the attacker, and is not consumed | Verified | Step b x5 |
| RC-RV-C | Step c: a defender with fewer unengaged creatures than the attacker deploys them all; it may not deploy fewer than the attacker has unengaged | Verified | Step c x2 |
| RC-RV-Q6 | The Treasure Chest Spectre gets no surprise bonus and the fight ends after one round (Peter Q6) | Verified | Chest Spectre |
| RC-RV-Q1 | 2v2 front-line pairings can arise in Step e (Peter Q1) | Verified by reading `redeployViolation`: up to two in front per side, no 2v2 ban in the revised engine (the ban is classic-only, SC-9.1-5) | none yet |

| RC-RV-D | Step d: the attacker pairs one-to-one with the defender's front line; an engagement that leaves a defender unpaired is refused | Verified | Step d x2 |
| RC-RV-O | Outcome: a lost two-creature front line nominates and a die of 4-6 grants it (all die values over 40 fights); with the Ring +1 (7 counts as 6); a tie leaves the match unresolved | Verified | outcome x3 |
| RC-RV-G | Step g / Ending a Fight: a Spectre against a Thief with the Magic Shield (Peter's example) ends in a standoff | Verified | stalemate |
| RC-RV-S | The Scroll cannot be used again in an area where it has been used | Verified | Scroll once per area |
| RC-RV-QF | Quarrel Fight: no Ring, curse or surprise effect on the duel | Verified (the same dice give the same loser, 40 seeds) | Quarrel |
| RC-RV-SU | Determining Surprise Attack: carpet, teleport, whirlpool, chasm arrivals, and a doorway not used before | Agrees since R-28 was fixed (one-way routes and an unused doorway give surprise even into a visited chamber) | carpet, doorway and Chasm tests |

Not covered by a book-derived test: the Ghouls fight (strength-2 creatures, one per party member; covered by the engine's ghouls-revised.test.ts and SC-7.2-21),
the other one-way routes (teleport, whirlpool, chasm: the same `freshEntry` mechanism as the carpet), a deliberate versus accidental trap (SC-4-16, SC-7.2-19),
step e in detail (the surplus placement rules: `redeployViolation` read and consistent), and the end-of-fight test beyond the one standoff example.

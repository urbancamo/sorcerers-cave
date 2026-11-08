# Rule clauses: fights (revised combat)

> Fourth area. Oracle (register R-27, MSW 2026-11-08): Peter's reformulated rules, `docs/rules/fighting-rules-reformulated-20261014.md`
> (which carries his 2026-10-10 answers), not the Consolidated Rules V2. Tests: `rulebookLoadout.test.ts` (90), `rulebookRevisedFights.test.ts` (12).
> Result: **no differences found** in the clauses checked.

| RC id | Clause (Peter) | Status | Test |
|---|---|---|---|
| RC-RV-L | Default loadout: the Sword, Axe, Staff and Shield preference lists, in the order printed (parsed from the document, every pair compared); the Ring to the highest adjusted strength, then the tie list; the Eye of God leaves nothing allocated; an artefact nobody can bear stays on the floor | Verified (90 tests) | rulebookLoadout |
| RC-RV-A | Step a: a party bearing the Ring adds 1; not while the Eye is present; the attacker's surprise bonus is 1, first round only; a player side's result is reduced by its curses | Verified | Step a x4 |
| RC-RV-B | Step b: the attacking player party with the Scroll may use it; not with the Eye; not when being attacked; it destroys enemies without innate magic (magic-users and the Sibyl survive), curses the attacker, and is not consumed | Verified | Step b x5 |
| RC-RV-C | Step c: a defender with fewer unengaged creatures than the attacker deploys them all; it may not deploy fewer than the attacker has unengaged | Verified | Step c x2 |
| RC-RV-Q6 | The Treasure Chest Spectre gets no surprise bonus and the fight ends after one round (Peter Q6) | Verified | Chest Spectre |
| RC-RV-Q1 | 2v2 front-line pairings can arise in Step e (Peter Q1) | Verified by reading `redeployViolation`: up to two in front per side, no 2v2 ban in the revised engine (the ban is classic-only, SC-9.1-5) | none yet |

Not yet covered here: Steps d-g in full (one-to-one engagement, deployment, wrap-up and the end-of-fight condition), the casualty nomination with the Ring (7 counts as 6),
stalemate/tie outcomes, Quarrel fight and Ghouls fight, the surprise-determination table (carpet, teleport, whirlpool, chasm, deliberate trap, unused route),
the Scroll's once-per-area limit. The engine's own tests (SC-9.7-1..22) cover most of these as code behaviour; a book-derived check is still to write.

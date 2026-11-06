# Engine rules validation: pilot report (hazards)

> 2026-11-06. Plan: `docs/requirements/engine-rules-validation/plan.md`. Register: `rulings-register.md`. Clauses: `clauses/hazards.md`.
> Nothing in the engine was changed. All new files are uncommitted.

## Verdict

The approach works and found real problems. The pilot found **5 table mismatches, 6 rule mismatches, 4 confirmed defects and 2 unclassified ones** in an area the engine spec called fully covered. "No remaining bugs" cannot be certified by any method, but the defects below are **release-relevant** and were invisible to the existing 1,500 tests.

## What was built

| Piece | File | Result |
|---|---|---|
| Rulebook table diff (creatures, treasures, parsed from the book) | `rulebookTables.test.ts` | 46 pass (the 5 kit creature band mismatches are fixed) |
| Clause-tagged hazard tests | `rulebookHazards.test.ts` | 17 pass, 6 expected-fail |
| Invariant checker + its own tests | `invariants.ts`, `invariants.test.ts` | 18 tests; 15 corruptions each caught |
| Invariant soak (sharded, resumable, replayable) | `invariants.soak.ts` | see below |

Expected-fail tests (`it.fails`) turn red the moment the engine is fixed, so each fix must delete its marker.

## Soak results

648,591 random games, 46.3 million actions, 6 rule sets (base, kit, kit+Sibyl; classic and revised combat), 4 shards x 15 min.
11,335 violations in 6 groups (see register B-01..B-07): dead-end stranding 9,076, move offered on a full pack 1,390, last member dies yet game continues 596, stale indices after Unicorn departs (revised) 231, in-use item not carried 25, fight no-action 15.
Rates are similar across all six configurations (1.5-1.9% of games), so none of this is specific to the Extension Kit.
The first run (8,199 violations) was mostly harness error (revised combat not driven); fixing the harness removed about 98% of them. The harness still plays randomly, so these are rates under random play, not under human play.

## Effort and yield

Clause extraction and tests for one area (hazards, 18 clauses) plus tooling took one working session. Table diffs cost almost nothing per row and gave the most certain findings. The soak found the most serious defects (B-01..B-03) with no per-rule effort at all. Estimate for the remaining areas (artefacts and curses, fights, special areas, creatures, movement, scoring, setup): roughly 6-8 comparable sessions for clauses, plus a rule-aware soak, plus review time from Peter and MSW on the register.

## Not yet done

- Per-row mapping of clauses to SC rows (section level only); the Spell hazard has no test (R-12).
- B-06 and B-07 not root-caused. The soak does not yet steer to rare states (beam search), and there is no coverage or mutation measurement.
- `docs/specs/engine-spec.md` Appendix C and the 986-test count are stale and need updating when tests are committed.

## Decisions needed

1. Which engine mismatches to fix (R-02..R-09). Fixing creature bands changes kit games and requires re-running the search and re-pinning the 75 scenarios.
2. Whether B-01..B-03 block release. My view: B-02 and B-03 are small fixes (a wipe check; re-index fight state on a departure) and should be fixed; B-01 is the pending Dead End rewrite and is the biggest risk.
3. Whether to commit the pilot files.


## Update 2026-11-06 (end of the pre-search fixes)

Done: scoring checked against the book (one mismatch, R-20, open); R-02..R-06 creature bands, R-07/R-10 new leader, R-09 Eye vs Medusa, R-12 Spell path, R-14 Quarrel choice, R-15 full cave, R-17 Unicorn without a Woman; B-02, B-03, B-04, B-06 fixed. B-07 is B-01 inside a fight. `candidateActions` (the search's move generator) now offers the empty round and single-front plans when neither builder finds a plan, and the two new choices come from `legalActions`.

Soak after the changes (97,056 games, 4 x 120 s, salt 77): 1,422 B-01 explore deadlocks, 5 B-07 fight deadlocks (B-01 class), 5 B-06 (fixed since). Nothing else.

Engine suite: 1,648 pass, 3 expected-fail, 39 fail: all 39 are the pinned searched games and web scenario replays, which wait for the re-pin (`overnight-search.sh`, then `pin-results.sh`). Not run. R-20 is decided (+10 per dragon). B-01 is not waiting on a rewrite: see the B-01 triage in the register (the soak default has the Dead End rescue off).

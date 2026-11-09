# Engine rules validation — feasibility and plan

## Context

The owner wants to release now and be as sure as possible that the engine matches the rulebook. The brief
(`docs/requirements/engine-rules-validation/requirements.md`) offers two methods (overnight runner; a table of every
scenario) and expects (a) a report of rules the book leaves open, which Peter or MSW must rule on, and (b) work from both
directions (engine → scenarios, rulebook → scenarios).

Decisions taken with the owner:
- **Source of truth: Peter's Expanded Consolidated Rules PV2026 V2** (`docs/rules/Expanded Consolidated Rules PV2026 V2.md`, 75 KB
  markdown) only. Other documents are used to explain its gaps, not as competing specs.
- **Scope of the release gate:** solo base game, solo Extension Kit + Sibyl, revised combat (`combatRevision`). Multiplayer is out of scope.
- **This stage:** the feasibility report plus a **pilot** on one rules area (hazards), to prove effort and yield before the rest.

## What I found (evidence behind the verdict)

1. **The existing verification is circular.** `docs/specs/engine-spec.md` has 497 `SC-*` rows; 496 cite a test. But the spec says "the code
   is authoritative": the rows were written from the engine, then pinned by tests. So tests prove *code = spec*, and nothing yet proves
   *spec = rulebook*. That missing link is the whole task. (The spec's "986 tests" is stale: the engine suite is 1542.)
2. **There is no general invariant oracle.** `redraw.soak.ts` checks invariants only for the Dead End rule. The score searches
   (`scoreSearch.search.ts`) steer towards high scores and only check "escaped, score matches". No coverage tooling, no mutation testing,
   no CI workflow in the repo. `legalActions` is never checked against `reduce` exhaustively.
3. **The infrastructure to build on is good.** Games are pure functions of `(seed, picks, variants, actions)`, so every failure is a
   replayable action list. `testkit.ts makeState`, Test Mode actions (`testPlaceArea`, `testSetChamber`, `testForceDie`…) build contrived states.
   `botKit.ts` bots and the sharded, resumable, deterministic overnight runner (`scripts/overnight-search.sh`, `run.json` provenance,
   `goldenSearch.ts` beam search) can be reused. The beam search can be pointed at *rare states* as goals.
4. **Where the bugs have been** (862 commits, 9 bug reports): (a) two features interacting (Apprentice × Sorcerer, curses × Eye,
   Lotus/Holy Water × revised combat); (b) stale indices after the party array reshapes; (c) deadlocks and stranding (standoffs,
   Whirlpool, Chasm); (d) rule scope (one-shot vs standing, once per game vs per visit); (e) data-table typos (Dragon table, card 41,
   Idol weight, Woman id); (f) UI/engine drift. Class (e) is cheap to eliminate completely; (a)–(d) need invariants and interaction scenarios.
5. **The rulebook is machine-readable** (markdown), with stable section names. Open questions already recorded: ~20 `SC` rows cite a
   Peter/MSW ruling or house rule, e.g. SC-9.3-4 ("D3 open"), SC-EXT-33 (pending), SC-10.5-5 (house rule), SC-9.7-18 (engine decision).

## Verdict

**Feasible, but "certain there are no bugs" is not achievable by any method; the plan makes the residual risk measurable.**
- A full cross-product is infeasible (order 10^9: ~60 card types × ~15 binary party features × dice × 7 variant flags).
- A reduced, rule-driven set is feasible: ~150–250 rules, each tested against the 3–6 party features that actually branch it
  (equivalence classes + pairwise), giving roughly 1,500–3,000 scenarios (estimate, to be confirmed by the pilot).
- The two methods in the brief are complementary, not alternatives: tables find *known-shaped* bugs; invariant soak finds
  *unknown-shaped* ones (the interaction, stale-index and deadlock classes).

## Method (the disciplines applied)

- **Requirements traceability matrix (RTM).** Split the Consolidated Rules into atomic clauses `RC-<section>-<n>`. Each gets a status:
  *Verified* (maps to an `SC` row and a test that asserts the book's value, not the code's), *Mismatch*, *Gap* (no engine rule/test),
  *Deviation* (engine differs on purpose, with ruling cited), or *Ambiguous*. The `SC-§` numbering is the join key.
- **Independent oracles to break the circularity.** Data tables (card reference, creature and treasure distribution, areas by exit,
  reaction bands, artefact-use table) are parsed from the rulebook markdown and diffed against `data/*.ts`. The oracle must come from
  the book, never from engine code.
- **Equivalence classes + pairwise combinatorial scenarios** for the rule × party-feature × dice-band × variant tables, built with
  `makeState` and Test Mode dice forcing.
- **Property-based invariants and metamorphic checks in a soak:** card and treasure conservation; party/status consistency; score equals
  the sum of its parts; every `legalActions` entry is accepted by `reduce` and nothing outside it is; always a legal action or game over
  (no deadlock); `reduce` never mutates its input; indices valid after party reshaping; replay reproduces state; events match state changes.
- **Goal-directed generation.** Use the existing beam search to *reach* rare states (Sorcerer + Apprentice + curse, Ring + Ghouls,
  revised-combat Lotus mid-fight) that random play rarely produces.
- **Measurement:** v8 coverage of the rule modules to show which branches no scenario or soak run reaches; mutation testing (Stryker) on
  the rule modules to estimate whether the tests would notice a rule change.
- **Rulings register:** each Ambiguous/Gap item as a structured entry (question, book text, engine behaviour, options, recommendation,
  decider Peter/MSW, status), seeded from the existing rulings.

## Pilot (this stage's work): hazards, base + kit

1. Extract RC clauses for the hazard sections of the Consolidated Rules (Mutiny, Trap, Earthquake, Medusa, Ghouls; Desertion, Harpies,
   Quarrel, Spell) into `docs/validation/clauses/hazards.md`, and map each to `SC` rows and tests.
2. Table-diff harness `packages/engine/src/rulebookTables.test.ts` (parses the markdown tables; compares to `data/hazards.ts`,
   `data/smallPack.ts` counts, etc.). Reuse the style of `data.test.ts`.
3. Scenario table for hazards (hazard × party features that branch it × dice band × rules set), run via `makeState` and Test Mode.
   Reuse `testkit.ts`. Fill the one gap the explorers found: Test Mode has no dice script, only one forced value at a time.
4. Invariant checker v1: `packages/engine/src/invariants.ts` (pure function of `GameState`) plus `invariants.soak.ts` that plays
   random-with-bias games with `legalActions` and asserts it after each action. Sharded and resumable like `scoreSearch.search.ts`
   (copy its `run.json`, salt and per-shard pattern). Run it for about an hour on base, kit and kit+Sibyl, classic and revised.
5. Deliver `docs/validation/rulings-register.md` and `docs/validation/pilot-report.md` with: clauses extracted per hour, discrepancies
   found, soak violations (each as a replayable action list), and a measured estimate of effort for the remaining areas.

Pilot success criteria: either it finds real discrepancies (proving yield) or runs clean with a coverage figure showing the hazard
code is reached; and the effort estimate for the other areas is evidence-based.

## After the pilot (not part of this approval)

Remaining areas in order of past-bug density: artefacts and curses, fights (classic and revised), special areas, creatures and
strangers, movement and dead ends, scoring and setup. Then an overnight soak across all three rule sets; review sessions with
Peter and MSW on the register; a release-gate report.

**Proposed release gate (to agree with the owner):** every in-scope clause classified; zero open Mismatch; every Ambiguous either ruled or
signed off as accepted; scenario tables green; invariant soak of N CPU-hours per rule set with zero violations; rule-module branch
coverage reported with unhit branches explained; mutation score reported.

## Risks and assumptions

- The Consolidated Rules V2 may not fully specify the revised fight engine (the reformulated fighting rules are separate documents). The
  pilot checks this; if V2 is silent, those items go to the register as "specified elsewhere" for a ruling, not silently skipped.
- Clause extraction is manual judgement; the pilot measures its rate. Independent review of the clause list (by Peter or MSW) is the
  main defence against misreading the book.
- Invariants can only check what we thought to state; coverage and mutation figures are the guard against that.

## Critical files

- Read/parse: `docs/rules/Expanded Consolidated Rules PV2026 V2.md`; `docs/specs/engine-spec.md` (SC rows, Appendix C).
- Engine under test: `packages/engine/src/{reduce,hazards,combat,combatPlan,revisedRound,effects,special,map,redraw,score}.ts`, `data/*.ts`.
- Reuse: `testkit.ts`, `botKit.ts`, `selectors.ts` (`legalActions`), `replay.ts`, `redraw.soak.ts` (invariant structure),
  `scoreSearch.search.ts` and `scripts/overnight-search.sh` (shard, resume, provenance), `goldenSearch.ts` (goal-directed reach).
- New: `docs/validation/` (clauses, register, pilot report); `packages/engine/src/{rulebookTables.test.ts, invariants.ts, invariants.soak.ts}`.

## Verification

- `pnpm --filter engine exec vitest run` stays green (currently 1542 tests); `tsc --noEmit` clean.
- The invariant checker has its own tests that feed it deliberately corrupted states (it must flag each) so a silent checker cannot pass.
- The table diff is proven to bite by temporarily changing one value in `data/*.ts` and confirming the test fails.
- The soak is run from a fixed salt and any violation is reproducible from its action list with `replay()`.
- Engine changes made to fix findings follow CLAUDE.md: update `docs/specs/engine-spec.md` in the same change, and the manual if player-visible.

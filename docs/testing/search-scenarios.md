# Search-found scenarios

Games found by an offline search of the engine, kept as ready-made, deterministic test scenarios. Nothing here is a rule: each
game is an ordinary list of actions that `replay()` plays back on the real engine.

## What is stored

| File (`packages/engine/src/fixtures/`) | Contents | Produced by |
|---|---|---|
| `best-score-search.json` | The single highest-scoring escaped game found, plus the search budget. **This is replay code `K001`.** | `scoreSearch.search.ts` |
| `top-score-games.json` | The 25 best *distinct* games (different draft or seed) of **each** rule set (base, kit, kit + Sibyl), 75 in all, best first within a rule set, each with its full action list. | `scoreSearch.search.ts` |
| `golden-search.json` | An earlier, goal-driven game: Extension Kit + Sibyl on, Sorcerer slain, escaped (score 341). | `goldenSearch.search.ts` |
| `search-index.json` | **Every** search of the run that reached the surface (6,574 of them), best first: item number, score, rules, draft, seed, whether it killed the Sorcerer first. No moves (they are rebuilt, below). About 200 KB. | the merge |
| `docs/testing/search-scenario-tables.md` | Generated: the run's provenance and budget, and a table of all 75 games. | `scripts/pin-results.sh` |
| `apps/web/src/data/scenario-games.json` | All 75 games keyed by replay code (`B001`…`S025`), generated from `top-score-games.json` by the conformance-vectors test. | `vitest -u` |

Each game records `rules` (base / kit / kit+sibyl), `variants`, `seed`, `picks` (the draft), `score`, the `search` settings that
found it, and `actions`. Replay it with `replay(seed, picks, actions, variants)`; every game ends `GS_ESCAPED`, with its score
equal to `scoreBreakdown(end).total`.

**"Best" means best found, not a proven maximum.** The scores are the highest the search reached within the budget below.

## How they were found

The goal was only the score of a party that gets back to the surface: no Sorcerer, Sibyl or Extension Kit requirement.
`scoreSearch.search.ts` is a random search. Work item `i` derives, from `i` alone, the rule set (base : kit : kit+sibyl = 1 : 2 : 4),
a draft (80% from the strongest third), a seed, the heuristic weights, when the party may start heading home, and the beam width
and length. Each item runs a beam search (`goldenSearch.ts`) over real engine states. 85% of items only let the party leave once
the Sorcerer is dead (a search tactic that scored best earlier); the rest roam first and head home later. The run is therefore
deterministic and any item can be reproduced from its number and the salt.

The full record of the run that produced the current fixtures (start time, machine, salt, engine commit, budget, the items each
shard got through, and every pinned game with its item number) is in the generated
[`search-scenario-tables.md`](search-scenario-tables.md). In short: 12 shards for 7 hours, salt 1, 111,268 searches, 6,574 of
which escaped, 3.1 billion states, 84 CPU-hours.

## Replay codes

Each scenario opens in the replay viewer: in Test Mode (`?test=`) the **List** button next to **Replay** on the splash screen browses
all 75 with a summary of each; anyone can type a code into the **Replay a game** box. A code is a rules prefix and a three-digit rank
within that rule set: `B001`–`B025` for the base game, `K001`–`K025` for the Extension Kit, `S001`–`S025` for kit + Sibyl. `K001` is
the best score found. Real game codes are always four letters A–Z, so a code with digits can never clash with one. Opening a
scenario writes nothing to the backend. The data is loaded on demand so the main bundle doesn't carry it.

The 75 games, with their codes, scores, drafts, seeds, item numbers and outcomes, are in
[`search-scenario-tables.md`](search-scenario-tables.md). Patterns in the current set: 72 of 75 slay the Sorcerer; the Sibyl features
in few of them; the best games finish with a very large party, because they recruit heavily on the way.

## Reproducing a run

A game is a pure function of `(seed, draft, variants, actions)`, and a search item is a pure function of its number and the salt, so
nothing is random that is not recorded. To reproduce:

1. Check out the engine commit recorded in `run.json` (copied into the fixtures' `budget.run` and the generated tables). Any change to
   the engine rules can change what a search finds; that is the point of re-running after one.
2. `itemFor(i)` in `scoreSearch.search.ts` derives item `i` — rule set, draft, seed, heuristic weights, beam width and length — from `i`
   and the salt alone (`SEARCH_SALT`, default 1).
3. Run the item: `beamSearch(newGame(seed, picks, variants), { width, maxSteps, weights, exitAfter, requireSorcerer: killFirst })`. The
   game kept for an item is the first-found highest score among the games that reached the surface.
4. Every pinned game stores those settings (`search`) and its item number, so step 2 is not even needed to re-run one. A fast test
   (`scoreSearch.pinned.test.ts`) does exactly this for the best game and checks it comes out move for move the same.

## The index, and rebuilding any game

The shard files kept moves for only a handful of searches, and each search keeps only its single best escape (the beam found 22.3
million escapes in total; the rest were never stored and are near-duplicates). So `search-index.json` is what makes the whole run
reusable: it lists every search that reached the surface, so you can choose by score, rules or draft, and any listed game can be
rebuilt exactly from its item number, because the search is deterministic.

```
# one or more items
SEARCH_ITEMS=112180,85070 SEARCH_SALT=1 npx vitest run -c vitest.search.config.ts src/scoreSearch.search.ts
# every indexed game scoring at least 300 (the index's salt is checked)
SEARCH_MIN_SCORE=300 SEARCH_SALT=1 npx vitest run -c vitest.search.config.ts src/scoreSearch.search.ts
```

Run these in `packages/engine`, on the engine commit recorded in the index's `run`. They write `search-items.json` (override with
`SEARCH_ITEMS_OUT`): each game re-run, replayed on the engine and checked to end on the surface with the indexed score, in the same shape
as `top-score-games.json`. It costs about 2 seconds per item. A game that fails to replay to its score stops the command, which is how you
find out that a rule change has invalidated the index (then re-run the search). Checked on 6 games that had no moves stored, scoring 18
to 384: all rebuilt to exactly their indexed score.

What is not kept: the raw shard output (`search-out-score/`, about 36 MB, not committed), which the index replaces, and the non-best
escapes. The shards' item ranges are in the generated tables, so the exact set of items searched can be re-enumerated (shard `k` of `n`
ran items `k, k+n, k+2n, …` up to its last item).

## How they are tested

`scoreSearch.pinned.test.ts` (part of the normal suite, fast) replays the best game and all 75 scenarios and asserts that every draft is
legal for its rule set, the engine never refuses an action, the party ends on the surface, and the score equals the recorded one. It also
re-runs the best game's recorded search settings and checks the result is identical, and that the fixture records the run's provenance.
If an engine rule change makes a stored game drift, these fail first.

`apps/web/src/game/goldenGame.test.ts` checks that every code opens, replays legally, ends on the surface and is ranked best first, and
that `K001` is the best kit game.

## Using a scenario in a new test

```ts
import top from "./fixtures/top-score-games.json";
import { replay } from "./index";

const g = top.games.find((x) => x.rules === "kit+sibyl" && x.rank === 5)!; // code S005
const frames = replay(g.seed, g.picks, g.actions as GameAction[], g.variants);
```

Frames expose every intermediate state, so a scenario is also a quick way to reach a late-game position (a large party, a slain
Sorcerer, treasure carried) without hand-building one.

## When the rules change

A rule change can invalidate stored games: their replays diverge, `scoreSearch.pinned.test.ts` and the web scenario tests fail, and
the codes should be re-found. To do another overnight run:

1. `packages/engine/scripts/overnight-search.sh [hours] [shards]` (defaults 7 and 12; stays awake with `caffeinate`; it writes
   `search-out-score/run.json`). Use `SEARCH_SALT=2 …` for an independent run. After an earlier run (the engine rules may have changed),
   start with `FRESH=1`, which archives `search-out-score/` first. The run is restartable: `overnight-search.sh stop | status | resume`.
   A resume carries on to the original end time and refuses if the engine source changed since the run began (the results would mix
   two rule sets); a shard killed mid-write loses only its torn last line.
2. When it finishes, `packages/engine/scripts/pin-results.sh`. It merges the shards (replaying candidates best-first on the engine, keeping
   only games that really escape with the recorded score, and re-deriving the moves of any candidate its shard did not keep), writes
   `best-score-search.json`, `top-score-games.json` (top 25 per rule set), `search-index.json` and the generated tables, regenerates the web bundle
   (`apps/web/src/data/scenario-games.json`), then runs the pinned engine tests and the web tests. No test needs editing by hand.
3. Review the diff and commit the fixtures, the bundle and the tables.

Search tooling (`*.search.ts`, `vitest.search.config.ts`, the scripts) never runs in CI.

# Search-found scenarios

Games found by an offline search of the engine, kept as ready-made, deterministic test scenarios. Nothing here is a rule: each
game is an ordinary list of actions that `replay()` plays back on the real engine.

## What is stored

| File (`packages/engine/src/fixtures/`) | Contents | Produced by |
|---|---|---|
| `best-score-search.json` | The single highest-scoring escaped game found, plus the search budget. **This is the `GOLD` replay code.** | `scoreSearch.search.ts` |
| `top-score-games.json` | The 25 best *distinct* games (different rules, draft and seed), best first, each with its full action list. | `scoreSearch.search.ts` |
| `golden-search.json` | An earlier, goal-driven game: Extension Kit + Sibyl on, Sorcerer slain, escaped (score 264). | `goldenSearch.search.ts` |
| `apps/web/src/data/golden-game.json` | The `GOLD` bundle, generated from `best-score-search.json` by the conformance-vectors test. | `vitest -u` |

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

Run on 2026-11-06, 12 shards for 7 hours (salt 1):

| | |
|---|---|
| Searches | 111,268 |
| Searches that escaped | 6,574 |
| States expanded | 3,127,362,131 |
| CPU time | 84 h |

| Rules | Searches | Best score |
|---|---|---|
| base | 15,851 | 384 |
| kit | 31,876 | 538 |
| kit+sibyl | 63,541 | 460 |

## The top 25

"Slain" and "Sibyl" say whether the replay contains a `sorcererSlain` / `sibylJoins` event. "Alive" is the surviving party at the end.

| # | Score | Rules | Draft | Seed | Moves | Slain | Sibyl | Alive |
|---|---|---|---|---|---|---|---|---|
| 1 | 538 | kit | [6, 6, 16] | 727800 | 158 | yes | no | 23/24 |
| 2 | 486 | kit | [18] | 76206 | 175 | yes | no | 23/24 |
| 3 | 467 | kit | [2, 7, 20] | 751991 | 193 | yes | no | 16/17 |
| 4 | 460 | kit+sibyl | [5, 7, 7, 20] | 197144 | 242 | yes | no | 15/16 |
| 5 | 454 | kit | [3, 16] | 447813 | 138 | yes | no | 18/20 |
| 6 | 445 | kit | [7, 16, 19] | 120931 | 159 | yes | no | 10/13 |
| 7 | 440 | kit+sibyl | [6, 7, 16] | 883614 | 269 | yes | no | 18/19 |
| 8 | 432 | kit+sibyl | [4, 7, 7] | 909212 | 187 | yes | no | 12/12 |
| 9 | 431 | kit+sibyl | [5, 7, 7, 20] | 483243 | 156 | yes | yes | 20/20 |
| 10 | 429 | kit | [3, 16] | 925726 | 160 | yes | no | 16/16 |
| 11 | 420 | kit+sibyl | [6, 17, 20] | 634119 | 124 | yes | no | 17/17 |
| 12 | 419 | kit | [3, 6, 7] | 167224 | 113 | yes | no | 17/21 |
| 13 | 418 | kit | [4, 16] | 387671 | 163 | yes | no | 18/21 |
| 14 | 413 | kit+sibyl | [3, 7, 7, 7] | 634320 | 169 | yes | no | 12/16 |
| 15 | 410 | kit+sibyl | [4, 7, 7] | 871921 | 304 | yes | no | 12/14 |
| 16 | 407 | kit+sibyl | [7, 16, 17] | 444956 | 158 | yes | no | 10/11 |
| 17 | 406 | kit | [2, 7, 20] | 755935 | 293 | yes | no | 11/13 |
| 18 | 400 | kit | [5, 6, 20] | 441841 | 176 | yes | no | 14/15 |
| 19 | 396 | kit+sibyl | [2, 7, 20] | 333099 | 179 | yes | no | 16/18 |
| 20 | 392 | kit+sibyl | [2, 7, 20] | 718944 | 143 | yes | no | 16/16 |
| 21 | 392 | kit | [16, 17, 20] | 914101 | 160 | yes | no | 18/19 |
| 22 | 390 | kit | [4, 7] | 214737 | 258 | yes | no | 11/12 |
| 23 | 386 | kit | [7, 18] | 349371 | 183 | no | no | 21/21 |
| 24 | 384 | kit+sibyl | [2, 20] | 864186 | 269 | yes | yes | 16/17 |
| 25 | 377 | kit | [7, 7, 7, 16, 20] | 737805 | 150 | yes | no | 17/18 |

Patterns worth knowing when picking one: 24 of 25 slay the Sorcerer; only 2 involve the Sibyl; the best games finish with a very
large party, because they recruit heavily on the way. Rank 23 is the only one that leaves the Sorcerer alive.

## How they are tested

`scoreSearch.pinned.test.ts` (part of the normal suite, fast) replays the best game and all 25 scenarios and asserts that every
draft is legal, the engine never refuses an action, the party ends on the surface, and the score equals the recorded one. If an
engine rule change makes a stored game drift, these fail first.

`apps/web/src/game/goldenGame.test.ts` checks that `GOLD` opens, replays legally and scores 538.

## Using a scenario in a new test

```ts
import top from "./fixtures/top-score-games.json";
import { replay } from "./index";

const g = top.games[4]; // rank 5
const frames = replay(g.seed, g.picks, g.actions as GameAction[], g.variants);
```

Frames expose every intermediate state, so a scenario is also a quick way to reach a late-game position (a large party, a slain
Sorcerer, treasure carried) without hand-building one.

## When the engine changes

A rule change can invalidate stored games. Re-run the search and re-pin:

1. `packages/engine/scripts/overnight-search.sh [hours] [shards]` (defaults 7 and 12; resumable; stays awake with `caffeinate`).
2. `SEARCH_MERGE=search-out-score npx vitest run -c vitest.search.config.ts src/scoreSearch.search.ts` in `packages/engine`.
   This replays candidates best-first on the engine and writes both fixtures, keeping only games that really escape with the
   recorded score.
3. `vitest run -u src/conformance-vectors.test.ts -t "golden game"` to regenerate the `GOLD` bundle.
4. Update the score in `goldenGame.test.ts` and the figures in this document.

Search tooling (`*.search.ts`, `vitest.search.config.ts`) never runs in CI. The raw shard output (`search-out-score/`) is not
committed.

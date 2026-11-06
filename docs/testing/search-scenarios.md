# Search-found scenarios

Games found by an offline search of the engine, kept as ready-made, deterministic test scenarios. Nothing here is a rule: each
game is an ordinary list of actions that `replay()` plays back on the real engine.

## What is stored

| File (`packages/engine/src/fixtures/`) | Contents | Produced by |
|---|---|---|
| `best-score-search.json` | The single highest-scoring escaped game found, plus the search budget. **This is the `GOLD` replay code.** | `scoreSearch.search.ts` |
| `top-score-games.json` | The 25 best *distinct* games (different draft or seed) of **each** rule set (base, kit, kit + Sibyl), 75 in all, best first within a rule set, each with its full action list. | `scoreSearch.search.ts` |
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

## The 75 scenarios (top 25 per rule set)

"Slain" and "Sibyl" say whether the replay contains a `sorcererSlain` / `sibylJoins` event. "Alive" is the surviving party at the end. Ranks are within the rule set.

### Base game (`rules: "base"`)

23 of 25 slay the Sorcerer; 0 involve the Sibyl.

| # | Score | Draft | Seed | Moves | Slain | Sibyl | Alive |
|---|---|---|---|---|---|---|---|
| 1 | 384 | [2, 7] | 270483 | 122 | yes | no | 19/21 |
| 2 | 369 | [4, 7, 7] | 251310 | 121 | yes | no | 15/16 |
| 3 | 366 | [4, 7] | 346506 | 116 | yes | no | 20/20 |
| 4 | 360 | [4, 6] | 333623 | 117 | yes | no | 11/13 |
| 5 | 343 | [4, 7, 7] | 159802 | 117 | yes | no | 11/13 |
| 6 | 335 | [4, 7] | 923423 | 227 | yes | no | 20/21 |
| 7 | 332 | [6, 7, 7] | 551118 | 110 | yes | no | 16/16 |
| 8 | 311 | [4] | 315795 | 129 | yes | no | 15/15 |
| 9 | 309 | [2, 7] | 448756 | 92 | yes | no | 11/11 |
| 10 | 304 | [5] | 491343 | 126 | yes | no | 12/13 |
| 11 | 295 | [3, 6] | 28357 | 246 | yes | no | 14/16 |
| 12 | 292 | [5, 6, 7] | 707410 | 93 | yes | no | 14/14 |
| 13 | 289 | [5, 7, 7, 7] | 532978 | 190 | no | no | 12/13 |
| 14 | 288 | [6, 6, 6] | 935195 | 129 | yes | no | 11/14 |
| 15 | 282 | [5, 6, 7] | 59430 | 111 | yes | no | 15/16 |
| 16 | 282 | [4, 7] | 411922 | 141 | yes | no | 11/12 |
| 17 | 281 | [4] | 231093 | 262 | yes | no | 9/10 |
| 18 | 273 | [3, 6] | 940380 | 101 | yes | no | 14/14 |
| 19 | 273 | [4, 7, 7] | 319618 | 218 | yes | no | 16/16 |
| 20 | 273 | [5, 7, 7] | 937675 | 202 | yes | no | 10/15 |
| 21 | 270 | [5, 5] | 145724 | 96 | yes | no | 10/10 |
| 22 | 269 | [4, 6] | 585825 | 89 | yes | no | 12/12 |
| 23 | 267 | [3, 7, 7] | 888759 | 95 | yes | no | 7/8 |
| 24 | 266 | [6, 6, 7, 7] | 245540 | 384 | no | no | 16/16 |
| 25 | 265 | [2, 7] | 537120 | 125 | yes | no | 10/11 |

### Extension Kit (`rules: "kit"`)

24 of 25 slay the Sorcerer; 0 involve the Sibyl.

| # | Score | Draft | Seed | Moves | Slain | Sibyl | Alive |
|---|---|---|---|---|---|---|---|
| 1 | 538 | [6, 6, 16] | 727800 | 158 | yes | no | 23/24 |
| 2 | 486 | [18] | 76206 | 175 | yes | no | 23/24 |
| 3 | 467 | [2, 7, 20] | 751991 | 193 | yes | no | 16/17 |
| 4 | 454 | [3, 16] | 447813 | 138 | yes | no | 18/20 |
| 5 | 445 | [7, 16, 19] | 120931 | 159 | yes | no | 10/13 |
| 6 | 429 | [3, 16] | 925726 | 160 | yes | no | 16/16 |
| 7 | 419 | [3, 6, 7] | 167224 | 113 | yes | no | 17/21 |
| 8 | 418 | [4, 16] | 387671 | 163 | yes | no | 18/21 |
| 9 | 406 | [2, 7, 20] | 755935 | 293 | yes | no | 11/13 |
| 10 | 400 | [5, 6, 20] | 441841 | 176 | yes | no | 14/15 |
| 11 | 392 | [16, 17, 20] | 914101 | 160 | yes | no | 18/19 |
| 12 | 390 | [4, 7] | 214737 | 258 | yes | no | 11/12 |
| 13 | 386 | [7, 18] | 349371 | 183 | no | no | 21/21 |
| 14 | 381 | [1] | 631726 | 299 | yes | no | 12/16 |
| 15 | 377 | [7, 7, 7, 16, 20] | 737805 | 150 | yes | no | 17/18 |
| 16 | 373 | [7, 16, 17] | 111528 | 159 | yes | no | 15/17 |
| 17 | 363 | [6, 7, 7, 20] | 320377 | 148 | yes | no | 13/13 |
| 18 | 362 | [7, 18] | 40016 | 160 | yes | no | 13/13 |
| 19 | 362 | [3, 5] | 729825 | 135 | yes | no | 13/13 |
| 20 | 355 | [3, 3] | 246028 | 249 | yes | no | 13/15 |
| 21 | 352 | [7, 7, 17, 20] | 779231 | 143 | yes | no | 15/17 |
| 22 | 351 | [4, 7, 20] | 505204 | 147 | yes | no | 13/13 |
| 23 | 349 | [2, 16] | 554101 | 94 | yes | no | 11/13 |
| 24 | 348 | [4, 7] | 227254 | 148 | yes | no | 18/18 |
| 25 | 348 | [4, 7, 7] | 768710 | 168 | yes | no | 9/10 |

### Extension Kit + Sibyl (`rules: "kit+sibyl"`)

25 of 25 slay the Sorcerer; 6 involve the Sibyl.

| # | Score | Draft | Seed | Moves | Slain | Sibyl | Alive |
|---|---|---|---|---|---|---|---|
| 1 | 460 | [5, 7, 7, 20] | 197144 | 242 | yes | no | 15/16 |
| 2 | 440 | [6, 7, 16] | 883614 | 269 | yes | no | 18/19 |
| 3 | 432 | [4, 7, 7] | 909212 | 187 | yes | no | 12/12 |
| 4 | 431 | [5, 7, 7, 20] | 483243 | 156 | yes | yes | 20/20 |
| 5 | 420 | [6, 17, 20] | 634119 | 124 | yes | no | 17/17 |
| 6 | 413 | [3, 7, 7, 7] | 634320 | 169 | yes | no | 12/16 |
| 7 | 410 | [4, 7, 7] | 871921 | 304 | yes | no | 12/14 |
| 8 | 407 | [7, 16, 17] | 444956 | 158 | yes | no | 10/11 |
| 9 | 396 | [2, 7, 20] | 333099 | 179 | yes | no | 16/18 |
| 10 | 392 | [2, 7, 20] | 718944 | 143 | yes | no | 16/16 |
| 11 | 384 | [2, 20] | 864186 | 269 | yes | yes | 16/17 |
| 12 | 376 | [6, 7, 20] | 85563 | 158 | yes | no | 13/14 |
| 13 | 375 | [6, 16, 20] | 171438 | 129 | yes | yes | 8/8 |
| 14 | 375 | [16, 17, 20] | 321423 | 220 | yes | no | 10/13 |
| 15 | 374 | [7, 7, 17, 20] | 730998 | 163 | yes | no | 20/24 |
| 16 | 374 | [7, 16, 17] | 381203 | 148 | yes | no | 13/15 |
| 17 | 373 | [3, 17] | 69082 | 142 | yes | no | 20/20 |
| 18 | 372 | [6, 7, 16, 20] | 181160 | 111 | yes | no | 16/18 |
| 19 | 372 | [3, 5] | 162450 | 137 | yes | yes | 12/12 |
| 20 | 370 | [16, 19] | 828511 | 188 | yes | yes | 15/22 |
| 21 | 370 | [4, 7, 7] | 486785 | 165 | yes | no | 14/14 |
| 22 | 369 | [4, 7] | 651438 | 153 | yes | yes | 18/20 |
| 23 | 369 | [5, 17] | 490131 | 186 | yes | no | 14/14 |
| 24 | 369 | [6, 6, 16] | 990686 | 238 | yes | no | 12/14 |
| 25 | 366 | [4, 7] | 975222 | 168 | yes | no | 12/12 |

The best games finish with a very large party, because they recruit heavily on the way. The Sibyl is not needed for a high score.

## How they are tested

`scoreSearch.pinned.test.ts` (part of the normal suite, fast) replays the best game and all 75 scenarios and asserts that every draft is legal for its rule set, the engine never refuses an action, the party ends on the surface, and the score equals the recorded one. If an engine rule change makes a stored game drift, these fail first.

`apps/web/src/game/goldenGame.test.ts` checks that `GOLD` opens, replays legally and scores 538.

## Using a scenario in a new test

```ts
import top from "./fixtures/top-score-games.json";
import { replay } from "./index";

const g = top.games.find((x) => x.rules === "kit+sibyl" && x.rank === 5)!;
const frames = replay(g.seed, g.picks, g.actions as GameAction[], g.variants);
```

Frames expose every intermediate state, so a scenario is also a quick way to reach a late-game position (a large party, a slain
Sorcerer, treasure carried) without hand-building one.

## When the engine changes

A rule change can invalidate stored games. Re-run the search and re-pin:

1. `packages/engine/scripts/overnight-search.sh [hours] [shards]` (defaults 7 and 12; resumable; stays awake with `caffeinate`).
2. `SEARCH_MERGE=search-out-score npx vitest run -c vitest.search.config.ts src/scoreSearch.search.ts` in `packages/engine`.
   This replays candidates best-first on the engine and writes both fixtures, keeping only games that really escape with the
   recorded score. Games whose moves the shard file did not keep are re-derived by running the item again (about 2 minutes).
3. `vitest run -u src/conformance-vectors.test.ts -t "golden game"` to regenerate the `GOLD` bundle.
4. Update the score in `goldenGame.test.ts` and the figures in this document.

Search tooling (`*.search.ts`, `vitest.search.config.ts`) never runs in CI. The raw shard output (`search-out-score/`) is not
committed.

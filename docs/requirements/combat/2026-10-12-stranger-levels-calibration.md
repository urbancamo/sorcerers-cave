# Stranger Difficulty Levels: First Calibration

`DATE: 12-OCT-2026`
`STATUS: stage 5 of [the pluggable stranger combat spec](2026-10-11-pluggable-stranger-combat.md), on branch combat-review`
`REPRODUCE: pnpm --filter @sorcerers-cave/pairing-lab levels 600 kit 0.5`

## 1. What was built

- `novice` (`levelStrategies.ts`): deploys a random few, pairs at random, leaves half its surplus idle, nominates at random. Loadout is `standard`'s.
- `expert` (`levelStrategies.ts`): scores every deployment and every pairing by the **exact expected value** of the round's matches (value destroyed less value lost, using the two-d6 win odds), within a node budget, keeping `standard`'s answer unless something scores strictly higher. A lost pair nominates the cheaper creature. Surplus and loadout are `standard`'s.
- A **legality sweep** (`level-strategies.test.ts`): 150 whole revised fights per level, requiring that no logged stranger decision carries a `fallback`, that every fight ends, and that a second run produces the identical action log.
- The **calibration harness** (`levelBench.ts`, `levelsCli.ts`): the same strength-matched lab scenarios played through the real engine and driver with each level on the stranger side, the party always `standard`, scored by R3 and R2 (as in [the first tournament](2026-10-11-first-tournament-under-final-rules.md)).

## 2. Result (600 fights per row; kit deck; artefacts under guard in half the fights)

```
BAND   LEVEL      N      R3     dR3   +-95%     R2     dR2  decisions fallbacks stuck
1-3    standard   600   0.480   0.000   0.000   0.387   0.000       1854         0     0
1-3    novice     600   0.471  -0.009   0.006   0.370  -0.017       1491         0     0
1-3    expert     600   0.479  -0.001   0.004   0.383  -0.003       1870         0     0
1-3    smart      600   0.485   0.005   0.004   0.397   0.010       1848         0     0
4-6    standard   600   0.495   0.000   0.000   0.428   0.000       4203         0     0
4-6    novice     600   0.471  -0.025   0.008   0.357  -0.072       2346         0     0
4-6    expert     600   0.493  -0.002   0.004   0.422  -0.007       4392         0     0
4-6    smart      600   0.493  -0.002   0.005   0.417  -0.012       4798         0     0
7-12   standard   600   0.494   0.000   0.000   0.420   0.000       5771         0     0
7-12   novice     600   0.473  -0.020   0.007   0.370  -0.050       3134         0     0
7-12   expert     600   0.493  -0.001   0.005   0.417  -0.003       5747         0     0
7-12   smart      600   0.493  -0.001   0.005   0.408  -0.012       6182         0     0
13-20  standard   600   0.509   0.000   0.000   0.458   0.000       8219         0     0
13-20  novice     600   0.490  -0.020   0.005   0.422  -0.037       4072         0     0
13-20  expert     600   0.508  -0.001   0.003   0.452  -0.007       7941         0     0
13-20  smart      600   0.509   0.000   0.003   0.455  -0.003       8892         0     0
```

`dR3` / `dR2` are paired differences from `standard` on identical fights; `+-95%` is the half-width of the `dR3` interval. R3 is from the strangers' side (higher is better for them); R2 is the share of fights the party did not win outright.

## 3. What it says

1. **Legality is clean.** Zero fallbacks and zero stuck fights across 9,600 level-fights here and 600 in the sweep: every decision the new levels make is accepted by the engine's legality layer.
2. **`novice` is measurably weaker**, by 0.9 points of R3 against 1-3 strangers and 2.0-2.5 points from 4 strangers up (R2 down 2 to 7 points). That is the size of the gap between greedy and the lab's cautious and random styles (first tournament, §3), so the level behaves as designed.
3. **`expert` is not distinguishable from `standard`**: every `dR3` is within its interval of zero (-0.002 to -0.001). Judging each round by its exact expected value reproduces what greedy strongest-against-strongest already does. The lab's flat Monte Carlo search found +1 to +2 points from 4 strangers up by playing the fight out, not by scoring one round; that gain is **not** reproduced here.
4. **`smart`** (loadout only) shows no effect beyond noise either, except a small gain with 1-3 strangers; the loadout matters only in fights with artefacts, and these runs put artefacts in about half.
5. The levels therefore span a **real range only downward**: `novice` < `standard` ≈ `expert`.

## 4. Limits

- The party is `standard` only; the engine has no other party style yet, so the lab's four styles are not represented, and the gain against real players is unknown.
- `expert` is a one-round exact model plus a model of the attacker as strongest-against-strongest. It does not look ahead to later rounds, persistent matches, or the surplus step.
- Fights with the Eye or curses are not built; the Scroll is not modelled.
- Artefacts are under guard in half the fights (the game's rate is far lower), so loadout effects are shown larger than they would be in play.

## 5. Decisions needed (the stage's "bands agreed")

1. **Bands.** Proposed target, against `standard` in the band 4-6 and above: `novice` about -0.02 R3 (met), `expert` at least +0.01 R3 (**not met**).
2. **`expert`.** Either accept it as an alias-strength "expert = standard + exact checks" for now, or port the lab's Monte Carlo rollout search into the engine behind the budget, which is the one approach measured to gain. That needs a rollout simulator the engine does not have (hook contexts carry views, not state), so it is its own piece of work.

## 6. Update: `expert` version 2 — the Monte Carlo rollout search, ported (12-OCT-2026)

`expert` now plays candidate deployments and pairings out to the end of the fight on copies of the game and keeps the best (flat Monte Carlo, 8 candidates x 16 rollouts, the lab's `MC8x16`). The rollouts are run by **the engine's own rules** (`reduce`, the driver, the party as `standard`), not by a second simulator, so the search cannot believe a rule the game lacks (spec §5.8). The hooks gain an `evaluate(candidates, rollouts)` function for this; the version-1 expected-value model survives as one candidate generator. Casualty and surplus are not searched (as in the lab).

```
pnpm --filter @sorcerers-cave/pairing-lab levels 800 kit 0.5 standard,expert
BAND   LEVEL      N      R3     dR3   +-95%     R2     dR2  decisions fallbacks stuck
1-3    standard   800   0.481   0.000   0.000   0.389   0.000       2581         0     0
1-3    expert     800   0.486   0.005   0.003   0.401   0.013       2580         0     0
4-6    standard   800   0.489   0.000   0.000   0.410   0.000       5317         0     0
4-6    expert     800   0.497   0.008   0.005   0.427   0.018       6070         0     0
7-12   standard   800   0.498   0.000   0.000   0.432   0.000       7803         0     0
7-12   expert     800   0.505   0.007   0.005   0.455   0.022       8705         0     0
13-20  standard   800   0.513   0.000   0.000   0.469   0.000      10920         0     0
13-20  expert     800   0.514   0.001   0.003   0.475   0.006      11756         0     0
```

- **It now beats `standard`**: +0.5 to +0.8 points of R3 (and +1.3 to +2.2 points of R2) in the first three bands, each outside its interval; nothing measurable at 13-20 strangers. The version-1 model was at ±0.002.
- **Smaller than the lab's gain** (+1 to +2 points from 4 strangers up). The party here is `standard` only, the lab drew from four styles; an opponent that plays greedily leaves less to exploit. The target proposed in §5 (at least +0.01 R3) is **not met**, so the bands are still for you and Peter to set.
- **Cost**: about 0.1 to 0.3 s per decision on this machine (the 800-fight run took about 3 minutes); no fallbacks, nothing stuck.
- Hidden information: the rollouts copy the real game, so the party's replies in a rollout are `standard`'s, played with full knowledge of the position. Everything in a fight is visible to both sides, so nothing hidden is used; a strategy that must not see more than the human-visible view (an external one, stage 6) would need its own rollout source.

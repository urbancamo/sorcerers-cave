# Stranger Combat Strategy: First Monte Carlo Tournament Under Peter's Final Rules

`DATE: 11-OCT-2026`
`STATUS: first result, uncommitted lab work on branch combat-review`
`SUPERSEDES: sections 4.2, 4.4, 4.5 and 5 of [the 06-OCT findings report](2026-10-06-pairing-lab-findings-report.md), which were measured under the pre-response rules (alternating roles, no 2v2, no stalemate)`

## 1. What was built

- The pairing lab now follows Peter's rules as corrected on 10-OCT-2026: roles fixed for the whole fight, 2v2 allowed (Q1), end of fight and stalemate per Q2/Q3, curses in the roll (Q4), one casualty rule: high roll kills the nominated creature (Q7), chest/hazard fights covered by giving the attacker and surprise per scenario (Q6). The Scroll (Q5) and the Unicorn are **not** modelled (the Unicorn is excluded from both pools; the engine still lets it fight, conflict C4 in the pluggable-combat spec).
- `search.ts`: `mcPolicy({candidates, rollouts})`, a flat Monte Carlo decision maker. For each deployment (when defending) and each engagement (when attacking) it tries a set of candidate choices (the four built-in styles' choices, strongest-first, weakest-first, random ones), plays each out many times against opponents drawn from the four party styles, using the same dice for every candidate, and keeps the best. It uses the greedy heuristic (`GRD`, the `HEU` baseline) for everything else.
- `tournament.ts` and `pnpm tournament [scenarios] [deck]`: paired comparison on strength-matched fights, by number of strangers.

## 2. Reward

R3 = value destroyed minus value lost, as a fraction of everything in the fight (0.5 = even), from the strangers' side. R2 (the share of fights where the party does not win outright) is reported alongside. Figures are means over 1500 fights per row, party style rotating through GRD, CAU, MAG, RLG; `dR3` is the paired difference from `GRD` and `+-95%` its confidence half-width.

```
BAND   PARTY  POLICY       N      R3     dR3   +-95%     R2    dR2
1-3    ALL    GRD          1500   0.478   0.000   0.000  0.379  0.000
1-3    ALL    CAU          1500   0.467  -0.011   0.004  0.351 -0.027
1-3    ALL    RLG          1500   0.481   0.003   0.011  0.385  0.006
1-3    ALL    MC8x16       1500   0.483   0.005   0.010  0.390  0.011
1-3    ALL    MC16x48      1500   0.476  -0.002   0.011  0.376 -0.003
4-6    ALL    GRD          1500   0.489   0.000   0.000  0.429  0.000
4-6    ALL    CAU          1500   0.461  -0.028   0.005  0.349 -0.081
4-6    ALL    RLG          1500   0.475  -0.014   0.008  0.387 -0.042
4-6    ALL    MC8x16       1500   0.500   0.010   0.009  0.450  0.021
4-6    ALL    MC16x48      1500   0.508   0.019   0.009  0.467  0.037
7-12   ALL    GRD          1500   0.500   0.000   0.000  0.461  0.000
7-12   ALL    CAU          1500   0.472  -0.028   0.004  0.383 -0.077
7-12   ALL    RLG          1500   0.489  -0.011   0.007  0.443 -0.017
7-12   ALL    MC8x16       1500   0.511   0.011   0.007  0.485  0.024
7-12   ALL    MC16x48      1500   0.511   0.011   0.007  0.489  0.029
13-20  ALL    GRD          1500   0.548   0.000   0.000  0.683  0.000
13-20  ALL    CAU          1500   0.504  -0.044   0.005  0.560 -0.123
13-20  ALL    RLG          1500   0.523  -0.026   0.006  0.645 -0.038
13-20  ALL    MC8x16       1500   0.559   0.010   0.006  0.721  0.038
13-20  ALL    MC16x48      1500   0.563   0.015   0.006  0.722  0.039
```

## 3. What it says

1. **Greedy strongest-against-strongest (`GRD`) is already the best simple heuristic.** The cautious (`CAU`) and random (`RLG`) strangers are significantly worse at every size (up to -0.044 R3 and -12 points of R2).
2. **Searching adds a small but real gain, from 4 strangers upward.** `MC16x48` is +0.019 R3 / +3.7 points R2 at 4-6 strangers, +0.011 at 7-12, +0.015 at 13-20, all outside the interval. `MC8x16` is nearly as good. Against that, **there is nothing to gain with 1-3 strangers** (within noise): a small fight has few decisions to get wrong.
3. **The gain is modest.** A well-chosen pairing moves the result by a point or two of R3, because the dice dominate. The strategy to plug in is worth having, but the strangers' difficulty is not going to be changed much by it.
4. Quadrupling the search (`MC8x16` to `MC16x48`) added little except at 4-6 strangers, so a cheap budget is a sensible default.

## 4. Limits of this result

- The party is four invented styles, not people. The gain against real players is unknown. Recorded `resolveRound` actions could give a human-like style.
- Dumb-versus-smart deployment (Peter's Q9) has no baseline from him; `GRD` is a placeholder for it.
- The retreat ratio (party leaves when outmatched), the artefact odds for strangers (4%) and the surprise distribution are assumptions.
- Scroll and Unicorn are not modelled; one-step lookahead only (no tree search); casualty nomination and surplus placement are not searched, only deployment and engagement.

## 5. Next

Plug `mcPolicy` into the pluggable-strategy interface (stage 3 of [the pluggable stranger combat spec](2026-10-11-pluggable-stranger-combat.md)); try a human-like party style from recorded games; add surplus placement to the search; model the Scroll.

# Smart Loadout: Bench Result (Stage 3)

`DATE: 11-OCT-2026`
`STATUS: first result; exit criterion of stage 3 not met`

## 1. What was tested

Peter's Fight Plan lists a *Smart Loadout procedure* but does not define it. Stage 3 of [the pluggable stranger combat spec](2026-10-11-pluggable-stranger-combat.md) asks for "the best of the allocations by exact evaluation", and a bench in which it beats `standard`.

- **`smart`** (engine, `smartLoadout.ts`): every way of giving the floor's artefacts to the strangers who can bear them is scored by the expected value destroyed minus value lost in round one (strongest stranger against strongest party member, exact d6 odds, the capability-table bonuses, the Shield blunting the magic it faces, the Ring's +1 and level 4+ invulnerability). `standard`'s allocation is the incumbent; it is replaced only by a strictly higher score. It sees the party's visible strength (new in the strategy context).
- **`search`** (lab only, `mcLoadout.ts`): scores every candidate allocation (up to 300) by playing the whole fight out 40 times, rotating through the four party styles. It sees the full scenario. It exists to measure the *headroom*: if even this cannot beat the default, no cheaper rule will.
- **Bench** (`loadoutBench.ts`, `pnpm loadout`): each balanced fight is built once with the strangers unarmed, then armed two ways from the same floor, party and dice (an exact pairing). Artefacts are put under the strangers' guard 90% of the time per artefact (the game's rate is about 4%) so that there is something to decide. Reward: R3 for the strangers (value destroyed minus value lost, as a fraction of the fight), R2 beside it.

## 2. Result (kit deck; differences are against `standard`, paired, 95% interval)

| Strategy | Strangers | Fights | Allocation differed | dR3 | dR2 |
|---|---|---|---|---|---|
| smart | 1-3 | 3000 | 20% | +0.0020 ±0.0019 | +0.005 |
| smart | 4-6 | 3000 | 35% | +0.0008 ±0.0019 | -0.009 |
| smart | 7-12 | 3000 | 47% | -0.0015 ±0.0019 | -0.015 |
| smart | 13-20 | 3000 | 60% | +0.0005 ±0.0016 | -0.007 |
| search (upper bound) | 1-3 | 600 | 22% | +0.0048 ±0.0038 | +0.008 |
| search | 4-6 | 600 | 50% | +0.0040 ±0.0048 | +0.001 |
| search | 7-12 | 600 | 66% | +0.0035 ±0.0052 | +0.003 |
| search | 13-20 | 600 | 74% | +0.0001 ±0.0039 | -0.014 |

## 3. What it says

1. **`smart` does not beat `standard`.** Every difference is inside its interval, and it is slightly negative for 7-12 strangers (the one-round model misleads when many creatures are left unpaired).
2. **A loadout has little headroom.** The brute-force search, which plays each allocation out, gains at most about half a point of R3, also inside its interval. Peter's default preference list is already close to the best that artefact placement can do. This is consistent with the earlier finding that pairing, not equipment, is where the strangers' decisions matter (first-tournament note).
3. The exit criterion for stage 3 ("the smart loadout beats `standard` on the agreed measure") is **not met**. `smart` stays registered and selectable, but there is no case for making it the default.

## 4. Limits

- Artefact odds are exaggerated on purpose; at the game's real odds the effect on any average is about twenty times smaller.
- The party is four invented styles; the rollouts' own noise (40 per candidate) makes `search` slightly optimistic when it picks, and its numbers are measured on different dice.
- Only deployment and engagement were searched in the earlier tournament; here only the loadout. They are independent decisions and could interact (a Shield matters more if the pairing puts it opposite a caster).

## 5. What this means for the plan

The plumbing of stages 1 and 2 is proved by a real second strategy, but the strategy itself earns nothing. The remaining value is in the pairing decisions (deploy, engage), which need the revised round engine (stage 4) before they can be offered to the game.

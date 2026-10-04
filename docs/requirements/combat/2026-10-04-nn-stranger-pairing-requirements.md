# Requirements — Neural-Network Stranger Pairing (`nn-v1`)

`DATE: 04-OCT-2026`
`STATUS: DRAFT FOR REVIEW — decisions taken 04-OCT-2026, numeric targets are proposals`
`SUPERSEDES: the open items N1, N2, N6, N8, N10, N12 in [2026-10-03b feasibility study](2026-10-03b-neural-net-stranger-pairing-feasibility.md) §12`
`RELATED: [technical spec](2026-10-03-combat-revision-technical-spec.md) §4.5 legality, §5 strategies, §5.3 exact evaluator, §5.4 objective, §8 bench`

## 1. Decisions taken

| # | Question | Decision |
|---|---|---|
| D1 | Purpose of the network | **Imitate `expert` for speed.** The network learns to reproduce the exact search's choice at a fraction of the cost. |
| D2 | Training objective (G1/N12) | **Technical spec §5.4**: maximise `E[party value lost] − E[stranger value lost]`, dice-aware, each match margin clamped to ±5, ties broken by total effective strength, always subject to the legality layer. The feasibility study's R1 ("matches led") is dropped as the label. |
| D3 | Sequencing | Build the engine prerequisites first (M1, M2, `expert`, bench). Training starts only once they exist. |
| D4 | Runtime | **Embedded, server-only, human-visible view.** Weights in a versioned file, forward pass in TypeScript under `convex/`, run inside the mutation, fallback to `standard`. No Linux service. |

## 2. Honest value statement

With D1 and D2 every label is computed exactly by `expert`, so the network is an approximation of a function we can already evaluate. It has a product reason to exist only if `expert` does not fit the Convex mutation budget (Q-T3, not yet measured) on fights the network is expected to cover. This project therefore has a **go/no-go gate** (§8): if `expert` is fast enough on every in-scope fight, `nn-v1` is optional and stays a learning exercise. This is a deliberate outcome, not a failure.

## 3. Scope

**In scope.** One pairing decision: the `deploy`, `engage` and `redeploy` hooks (spec §5.1) in a solo or multiplayer-vs-strangers fight, with the strangers' loadout already fixed.

**Out of scope for `nn-v1`.**
- Artefact assignment: solved by exact search (≤ 81 loadouts, feasibility §4.6) or the default loadout, and passed to the network as an input.
- Casualty choice and the Scroll (spec §5.1: no strategy hook).
- Multi-round lookahead and reinforcement learning (a separate project with its own gate).
- PvP fights.
- Human-style or tiered personalities (needs recorded human decisions, N5).

**Routed to `standard`, not the network.**
- More than **6** strangers. A configuration constant, with **8** as the engine cap (feasibility §2.5); anything above goes to `standard`.
- Fights where every achievable pairing is already decided by the ±5 rule (feasibility §2.6).
- Any illegal, late or failed decision (spec §5.2 fallback).

## 4. Inputs and output

### 4.1 Inputs (human-visible view only)

- Stranger creatures: type, strength, magic, borne artefacts (the loadout after assignment).
- Player creatures: type, strength, magic, wielded artefacts, kill count, and **deployment state** (front line, held back, background, already engaged) — N11, default **yes**.
- Context: Eye of God present (held or on the floor), active curses, dungeon level (Ring from level 4), round number, who attacks, surprise.
- Nothing hidden: no undrawn cards, no other party's secrets (G3, Q-T2).

### 4.2 Output

A **score for one candidate formation**. At play time the legality layer (spec §4.5) enumerates the legal formations, the model scores each, and the highest wins. The network never produces a formation directly, so it cannot produce an illegal one.

### 4.3 Candidate cap

If a fight offers more than **K** legal formations (proposed **K = 2,000**), pre-filter to the top K with the `standard` heuristic before scoring.

## 5. Training data

- **Generator.** The bench harness (spec §8), not a separate tool. Strangers are drawn from the real decks so the odds in feasibility §2.5 hold; the player's party and its wielded artefacts are generated realistically (up to 14 creatures).
- **Strata.** Typical fights dominate; a deliberate share of 5–6-stranger fights (Great Hall) and a separate held-out stratum of larger Mutiny-sized fights. Mix weights are proposed from the §2.5 odds and re-set once real game data is available.
- **Label.** `expert`'s exact objective value (D2) for every legal candidate, plus the identity of the optimal candidate.
- **Tie-break.** A fixed deterministic rule (D2: total effective strength, then a fixed creature order) so labels never contradict themselves.
- **Splits.** Train, validation and test by **scenario**, never by candidate. A held-out large-fight set is evaluated separately. The test set is used once.
- **Size.** 10⁵–10⁶ scenarios (proposed).
- **Versioning.** Every dataset records the engine git SHA, `featureVersion`, seed and a content hash.

## 6. Features and the cross-language contract

- One feature encoder, **in TypeScript**, used for both export and play. Python never reimplements it (feasibility §8).
- Fixed slots: 6 stranger slots (8 reserved for the engine cap), 14 party slots, creature-type code plus the numeric fields above, zeros for empty slots. Training data is canonicalised (sorted) and optionally shuffled.
- Golden vectors checked in CI: the TypeScript forward pass must match PyTorch to about 1e-5.
- The game refuses to load a model whose `featureVersion` it does not know.

## 7. Models

Train **two** and compare, as the study recommends: gradient-boosted trees (LightGBM) and a small MLP (2–3 hidden layers, about 10⁴–10⁵ parameters). Ship whichever meets §8; trees are an acceptable winner (compiled to JavaScript, or run as data).

## 8. Acceptance criteria and gates

Targets marked *(proposed)* are to be re-set once Stage 1 has measured `expert`.

| ID | Criterion | Target |
|---|---|---|
| NN-A1 | Legality | 100% (by construction; verified by a sweep) |
| NN-A2 | Regret vs `expert` on typical fights (mean shortfall in the §5.4 objective, as a share of `expert`'s advantage over `standard`) | ≤ 5% *(proposed)* |
| NN-A3 | Top-1 agreement with `expert` on typical fights | ≥ 90% *(proposed)* |
| NN-A4 | Held-out large fights (5–6 strangers): no pathological failures | Regret ≤ 15% *(proposed)*, and never worse than `standard` |
| NN-A5 | Beats `standard` in the arena (whole fights to the end) | Win-rate improvement with a confidence interval above 0 |
| NN-A6 | Latency of scoring one decision, in the real mutation, at the largest in-scope fight | Within the budget measured in Q-T3 *(measure first)* |
| NN-A7 | Parity: TypeScript forward pass vs PyTorch on golden vectors | ≤ 1e-5 |
| NN-A8 | Fallback rate in the bench | Reported; target < 1% *(proposed)* |

**Go/no-go gates.**
1. **After the Stage 1 baseline.** If `expert` is optimal and fits the Q-T3 budget on every in-scope fight, `nn-v1` is optional. Decide whether to proceed as a learning exercise.
2. **After Stage 2 (prototype).** Stop if NN-A2 and NN-A3 are not within reach.
3. **Before ship.** NN-A5 and NN-A6 must hold on the real mutation.

## 9. Runtime contract (D4)

- A `StrangerStrategy` with id `nn-v1`, `kind: "builtin"`, in a **server-only module under `convex/`**. The shared `@sorcerers-cave/engine` package is imported by the browser, so weights must not live there (N10).
- The model sees the minimised human view only (§4.1).
- Each logged decision records the model id and version (spec §5.2). A bad model can be switched off per game and falls back to `standard`.
- The `why` trace carries the top few scores, not a narrative.
- Selectable per game through `variants.strangerLevel` or a hidden test-mode option (decision deferred to the difficulty work, G1/G10).

## 10. Prerequisites (D3)

| Prerequisite | Milestone | Status |
|---|---|---|
| Rules sign-off incl. G13 (triggering and ending a fight), D3 Staff bonus, Q-R/Q-L items | M0 | Open |
| `model`, `strength`, `legality`, `artefacts` behind `combatRevision` | M1 | Not started |
| Round engine, persistent matches, `standard` strategy | M2 | Not started |
| Exact evaluator and `expert`, bench harness, CPU budget measured (Q-T3) | M5 | Not started |
| Default loadout (Peter's V2), capability table, area-wide Eye | Stage 1 | **Done** (branch `stranger-loadout`) |

Training must not begin until the rules and strength numbers are stable (feasibility §10, "rules drift"). Any later change to the artefact table or strength rules invalidates a trained model, so retraining must be one command.

## 11. Remaining open items

- **Q-T3**: the CPU budget of a Convex mutation for `expert` and the embedded model. Measure before sizing anything.
- **N11**: confirm deployment state is an input (default yes).
- **N5**: any recorded human pairings? Without them an evaluation set could come from Test Mode captures.
- **Difficulty mapping (G1/G10)**: how `nn-v1` relates to `standard` and `expert` as a level.
- **Targets in §8**: re-set after the Stage 1 baseline.
- **Mix weights (§5)**: re-set from real game data.

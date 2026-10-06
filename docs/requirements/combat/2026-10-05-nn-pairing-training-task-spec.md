# Training Task Specification — Stranger Pairing, One Round (`pairing-v1`)

`DATE: 05-OCT-2026`
`STATUS: DRAFT FOR REVIEW — decisions confirmed by Mark 05-OCT-2026; numeric targets are proposals`
`IMPLEMENTS: stage A of [2026-10-04-nn-stranger-pairing-requirements.md](2026-10-04-nn-stranger-pairing-requirements.md) (§1a)`
`RELATED: [feasibility study](2026-10-03b-neural-net-stranger-pairing-feasibility.md), [original request](2026-10-03a-neural-net-based-stranger-pairing.md), [questions for Peter](2026-10-04-questions-for-peter.md)`
`ASSUMES: the default answers to the questions for Peter are correct`

This defines the first training task: **learn to choose the strangers' best pairing in a single round, when the strangers attack.** It is deliberately small. Exact search can already solve it, so the network cannot beat the search here. The task proves the whole pipeline (scenario generator, exact evaluator, data export, training, evaluation) and gives the baseline that multi-round play (stage B) must beat.

---

## 1. Decisions confirmed (05-OCT-2026)

| # | Decision | Confirmed |
|---|---|---|
| T1 | **Win goal.** Maximise the **expected number of matches the strangers win**, with ties counting half. Computed exactly from the 36 dice outcomes per match. | Yes |
| T2 | **Decision in scope.** The strangers' pairing when **they attack** (step c of *Each Round is Fought*): who engages whom, and which stranger casters back which match. Deploy (b) and redeploy (d) are later. | Yes |
| T3 | **The party's formation** comes from a set of **party policies** (random-legal, greedy, cautious, magic-heavy). Real deployments from the Convex game logs are a later option and need a separate go-ahead, because they use production data. | Yes |
| T4 | **Freeze the rules** at a recorded snapshot. The Priest Staff +2 (D3) is the working assumption. If Peter rules otherwise, regenerate all data. | Yes |
| T5 | **Sequencing.** Build a standalone module over the current engine types rather than waiting for the M1/M2 round engine. This bends D3 of the requirements ("engine prerequisites first"). | Yes |
| T6 | **Two training runs, two nets:** one for the **base deck** (`BAS`) and one for the **extension kit** (`KIT`). Each has its own scenarios, vocabulary, dataset, model and run record. | Yes |
| T7 | **Python tooling** (PyTorch, LightGBM, scikit-learn) is acceptable in this repo. | Yes |
| T8 | The **party policies** (§6.1) and the **`HEU` baseline** (§8.1) are drafted below for review. | Draft |

---

## 2. The task, precisely

Given a **scenario** (§3), choose one **candidate pairing** (§5) from the legal ones. The score of a candidate is

```
J(candidate) = Σ over matches m of [ P(strangers win m) + 0.5 · P(tie m) ]
```

where each match is two d6 rolls plus known totals (spec §5.3, `FIGHTING A MATCH` steps i–iv). A match whose strength gap is more than 5 in either direction is already decided, and the enumeration reproduces that. **Stalemate** (both results zero) counts as a tie.

**Why this goal and not the summed strength margin.** The summed margin scores every pairing of the same engaged creatures identically, so it cannot teach pairing (feasibility §4.3a). Win probability is not linear in the margin, so it can. It also does not depend on the unresolved casualty rules (Q3), which is what makes it safe to start with.

**Worked example (a test vector).** Strangers Ogre (5) and Dwarf (1) against a Hero with the Magic Sword (5 + 2 = 7) and a Man (3). No surprise, curses or Ring.

| Pairing | Strength gaps | J |
|---|---|---|
| Ogre v Hero, Dwarf v Man | −2, −2 | 8/36 + 8/36 = **0.444** |
| Ogre v Man, Dwarf v Hero | +2, −6 | 28/36 + 0 = **0.778** |

The summed margin is −4 for both. The second pairing is far better because it takes a near-certain win on one match and gives up one that was already lost.

---

## 3. A scenario

**Strangers** (1–6): creature, and the artefacts each bears after the default loadout (Stage 1 `defaultLoadout`). Each run has its own deck (T6): the **base** run uses the base creatures (not the Spectre, §3 limits) and the base fight artefacts (Sword, Staff, Ring, Eye of God, Talisman, Strength Potion); the **kit** run adds the kit creatures (Apprentice, Lion, Scholar, Witch, Thief, Wolf) and the Axe and Shield (and the Elixir's permanent +2 on a party creature). The Spectre and Demon are excluded from both.

**The party's formation** (from a party policy, T3): the deployed **front line** of one or more creatures, and for each front-line creature any **background casters** supporting it. Each party creature has its type, the artefacts it wields, `dragonKills`, `fsBonus` and a Strength Potion flag.

**Context:** Eye of God present, curses on the party, surprise bonus for the strangers (+1 in the first round of a hostile approach, else 0), dungeon level, round number.

**Scope limits for `pairing-v1`** (so the labels are exact and the rules are unambiguous):

| Limit | Why |
|---|---|
| **Strangers not outnumbering the party's front line** (`strangers ≤ front line`) | Otherwise the larger side's step (d) lets leftover strangers join a match (two against one). That adds a second decision. It is the next version. |
| **No Spectre, Demon or Sybil among the strangers** | Their magic-only and neutral rules are a separate legality case. |
| **At most 6 strangers** | The requirements route larger groups to the heuristic. |
| **The party's reply is not modelled** | The larger party's step (d) redeployment is ignored. Unengaged party creatures sit out the round. |
| **No casualties, no later rounds** | The goal is matches won in this round only. |

---

**On the size limit of 14.** The party limit of 14 here is a limit of the **exact enumeration** and the **fixed-slot network input**, not of the game: the game allows 30 allies in the base deck and 40 with the kit, and a Mutiny can give 20 or more strangers. The Monte Carlo simulator is not bound by 14 (Monte Carlo spec, Appendix C.1).

## 4. The exact evaluator

Each match is **one stranger fighter against one party front-line creature**, with optional stranger background casters and the party's own backers. Strengths use the existing engine functions, so there is one source of truth:

- **Party side:** `frontStrength` for the front creature, plus `casterMP` for each of its backers.
- **Stranger side:** `strangerFS` plus its magic (`strangerMP`), plus the magic of any stranger caster backing it.
- **The Magic Shield.** A party creature bearing it nullifies the magic of the stranger(s) matched against it. A stranger bearing it nullifies the magic of the party creatures matched against it, front and background. The Sorcerer's and Apprentice's magic is reduced by 2 instead.
- **The Eye** zeroes all magic and artefacts. The Staff, Sword, Axe, Ring and Shield effects go through the capability table (`capabilities.ts`).
- **Dice bonuses:** party = the Ring (+1) minus curses; strangers = the Ring (+1) plus the surprise bonus.

**Parity test (T-A1).** For random scenarios with no stranger backers, the evaluator's strengths must equal `previewPlan` on the equivalent state. Stranger-chosen backers are not expressible in `previewPlan`, so they are covered by hand-worked vectors, including §2.

---

## 5. Candidates and legality

A **candidate** is:
- a choice of which stranger casters, if any, stay in the background, each backing one of the strangers who fight;
- a one-to-one assignment of the remaining strangers (the **fighters**) to distinct front-line party creatures.

**Legal** means:
- a caster in the background must back a stranger who fights (a backer needs a front fighter);
- any number of casters may back one match;
- the strangers engage as many front-line creatures as they have fighters;
- no two strangers share a party creature (two against one is out of scope).

Casters otherwise fight hand to hand with their total strength. There is no numerical-advantage condition for strangers (the default for question 4 of the questions for Peter).

**Number of candidates.** The count is small for typical fights and grows quickly for large ones (for 6 strangers against a front line of 14 it is about two million). So:
- enumerate all candidates when there are at most **2,000**;
- otherwise sample **2,000** with a fixed seed and always include the true optimum, found by branch-and-bound on `J`.

**Canonical form.** Strangers or party creatures with the same type and gear are interchangeable. Candidates are de-duplicated by canonical form so that exact ties don't inflate the count.

**Tie-break.** Equal `J`: higher summed strength margin, then a fixed order by creature slot. The tie-break makes labels deterministic. **Top-1 agreement is measured by value**, so choosing any candidate with the optimal `J` counts as correct.

---

## 6. Data generation

A new package **`packages/pairing-lab`**, not part of `@sorcerers-cave/engine`. The engine is imported by the browser, so training code and, later, weights stay out of it. It reuses the engine's exported functions. If an export is missing it is added, and that change updates `engine-spec.md` as the project rules require.

- **Strangers** are drawn from the real small-pack composition (base and kit) using the odds in feasibility §2.5, then equipped with the default loadout. Typical fights (1–3 strangers, no artefacts) dominate, as they do in play. A deliberate share of artefact-bearing and 4–6-stranger scenarios is added so the model sees them. The mix is recorded with the dataset.
- **The party** has 1–14 creatures with realistic artefacts, with the front line set by a **party policy**: random-legal, greedy (strongest in front), cautious (weakest in front, casters back) and magic-heavy (casters back). Each policy gets an equal share.
- **Context** is sampled over curses (0–3), the Eye (rare), surprise and level.
- **Splits** are by scenario (train, validation, test), with a **held-out set** of large fights (5–6 strangers) and one of **unseen party policies**.
- **Size (proposed):** about 50,000 scenarios with up to 32 candidates each, which is about 1.6 million rows and comfortably fits in a MacBook's memory. Scale up only if the results need it.
- **Versioning:** each dataset records the engine git SHA, the rules snapshot (T4), `featureVersion`, the seed, the mix and a content hash.

**Label.** For each candidate, store the **regret** `J* − J(candidate)`, where `J*` is the scenario's optimum. A regret of 0 is the best. Regret removes the per-scenario offset the model has no use for.

---

### 6.1 Party policies (DRAFT FOR REVIEW)

**What they are, and why.** The strangers choose who to fight **after** the player has lined the party up, so every scenario needs a party line-up. The generator can't ask a person, so it uses a few simple, named **party policies**: each one is a rule for how a simulated player lines up its party. Using several different ones means the network sees many kinds of line-up and learns to pair well against all of them, not against one habit. One policy is held back from training to test whether the network copes with a line-up style it has never seen.

**What a policy decides.** Given a party of *m* creatures facing *k* strangers (*k* ≤ *m*, the version 1 limit):
1. **How many deploy** to the front line (*n*, at least *k*, because the defender must deploy at least as many as the attacker has).
2. **Which creatures** deploy.
3. **Which casters** (Priest, Wizard, Witch, Scholar, Apprentice, Sorcerer) fight in front, which **back** a front creature, and which stay held back.
4. **Which front creature** each background caster backs.

A creature that isn't in the front line and isn't backing anyone is **held back** and takes no part in this round. A creature can't be both in front and backing. "Strength" below means a creature's own total with its wielded artefacts (a caster in front counts its fighting strength plus magic). "Value" means its victory points.

| Code | Name | Rule |
|---|---|---|
| `RLG` | Random-legal | *n* is chosen uniformly between *k* and *m*. The deployed creatures are chosen uniformly. Each deployed caster fights in front or, with equal chance, is moved to the background to back a randomly chosen front creature. Everyone else is held back. |
| `GRD` | Greedy | *n* = *k*. Deploy the *k* **strongest** creatures (ties: non-casters first, then creature order). Any caster not deployed backs the **strongest** front creature. Everyone else is held back. |
| `CAU` | Cautious | *n* = *k*. Deploy the *k* **lowest-value** creatures, so the valuable ones stay safe (ties: weakest first). No creature backs anyone. Everyone else is held back. |
| `MAG` | Magic-heavy | *n* = *k*. Deploy the *k* strongest **non-casters**. Every caster not deployed backs a front creature, taking the front creatures strongest first and the casters strongest magic first, wrapping round if there are more casters than front creatures. Everyone else is held back. |
| `ALL` | All-in (**held out of training**, used only for the unseen-policy test set `UPO`) | *n* = *m*. Everyone deploys, casters fight in front, and nobody backs or is held back. |

**Worked example.** A party of five facing two strangers (*k* = 2): the Hero with the Magic Sword (7), the Wizard (7), the Priest (4), the Man (3) and the Dwarf (1). Values: Hero 10, Wizard 15, Priest 8, Man 5, Dwarf 2.

| Policy | Front line | Backing | Held back |
|---|---|---|---|
| `GRD` | Hero, Wizard (tied at 7; both deploy) | Priest backs the Hero | Man, Dwarf |
| `CAU` | Dwarf, Man (lowest value) | nobody | Hero, Wizard, Priest |
| `MAG` | Hero, Man (strongest non-casters) | Wizard backs the Hero, Priest backs the Man | Dwarf |
| `ALL` | all five | nobody | nobody |
| `RLG` | any legal choice, drawn at random | | |

**Mix.** `RLG`, `GRD`, `CAU` and `MAG` get equal shares of the training data. `ALL` is used only for the held-out set. The policies and the mix are recorded with every dataset.

**For your review:** is this the right spread of styles? Missing ones I considered but left out: "keep the best creatures out of the fight entirely" (close to `CAU`) and "send everyone with a weapon first".

## 7. Features and models

- **One feature encoder, in TypeScript**, used for export now and for scoring later. Python never reimplements it.
- **Fixed slots:** 6 stranger slots (type code, strength, magic, borne-artefact flags, caster flag), a front line of up to 14 party slots (the same fields plus `dragonKills`, `fsBonus`, potion), the backing relation, and the context. The candidate is encoded as, for each stranger, which front slot it engages or which it backs. Data is canonicalised (sorted) and optionally shuffled.
- **Models, as in the requirements:** a gradient-boosted tree model (LightGBM) and a small MLP (2–3 hidden layers, about 10⁴–10⁵ parameters). Train both and compare. If the trees win, that is a good result.

---

## 8. Success criteria

Targets marked *(proposed)* are re-set once the exact baseline (task 4 below) has measured the real spread.

| ID | Criterion | Target |
|---|---|---|
| T-A1 | Evaluator parity with `previewPlan` on the no-backer scenarios | Exact match on 10,000 scenarios |
| T-A2 | The §2 worked example and the other hand-worked vectors | Exact |
| T-A3 | Legality: every candidate offered passes the legality check | 100% |
| T-A4 | **Pairing matters:** share of scenarios where the best and worst legal pairing differ in `J` by more than 0.05 | Reported (this sizes the whole project) |
| T-A5 | Mean normalised regret against the optimum, on scenarios where pairing matters | ≤ 5% *(proposed)* |
| T-A6 | Top-1 agreement by value, on the same scenarios | ≥ 90% *(proposed)* |
| T-A7 | The same on the held-out large fights, and on unseen party policies | No worse than 15% regret *(proposed)*, and never worse than the heuristic |
| T-A8 | Scoring latency for 2,000 candidates in TypeScript | To be measured against the Q-T3 budget |

**Baselines compared:** random-legal (`RAN`), a **rank-match heuristic** (`HEU`) and the exact optimum (`OPT`). Today the game does no pairing for the strangers (the player does it, question 8), so `HEU` is a new, proposed baseline: sort the strangers by total strength and the party's front line by strength, both strongest first, and pair them in order. Stranger casters fight hand to hand. It is the obvious greedy rule, and the model must beat it.

**Go/no-go.** T-A4 is the first gate. If pairing rarely matters, the project is small and this stage is a pipeline exercise only. Stop and report if T-A5 and T-A6 are out of reach.

---

### 8.1 The `HEU` baseline (DRAFT FOR REVIEW)

**What it is.** `HEU` is the **simplest sensible rule a player might use** to pair the strangers, used purely as a benchmark. The comparison is:

| Subject | What it does | Role |
|---|---|---|
| `RAN` | Picks any legal pairing at random | The floor: how bad pairing can be |
| `HEU` | The obvious rule of thumb (below) | The bar the network must beat |
| `GBM` / `MLP` | The trained models | What we are testing |
| `OPT` | Tries every legal pairing and picks the best | The ceiling: no pairing can beat it |

**The rule.** Line the strangers up from strongest to weakest. Line the party's front line up from strongest to weakest. Pair them off in order: **strongest stranger against the strongest party creature, second against second**, and so on. Strangers with magic fight hand to hand with their total strength and never stay back. Nothing is held in the background.

**Why a benchmark like this.** Without it, "the network picks the best pairing" can't be judged: best compared with what? It also measures **whether pairing matters at all**. If `HEU` is nearly as good as `OPT` everywhere, there isn't much for a network to add.

**It can be beaten.** In the worked example in §2, `HEU` pairs the Ogre (5) with the Hero and Sword (7) and the Dwarf (1) with the Man (3). That scores 0.444. The optimum, the Ogre against the Man and the Dwarf against the Hero, scores 0.778, because giving up one lost match makes a near-certain win on the other. A strongest-against-strongest rule misses this, and so would many players.

**Not today's game behaviour.** Today the game does no pairing for the strangers (the player does it), so `HEU` is a new definition written for this task.

## 9. Run records: the replay file and the printout

Every training or evaluation run writes **two files from the same records**, named after the run id:

| File | For | Form |
|---|---|---|
| `pairing-run-<RUN>.json` | Replaying a run exactly in a future iteration | JSON |
| `pairing-run-<RUN>.log` | Reading each combat and its result | Fixed-width, uppercase, 3-letter mnemonics, in the style of the game-log printer listing |

### 9.1 What is recorded

Both files cover the same set of scenarios: the whole **test** split, the **held-out** large fights, the **unseen-policy** set, and a seeded sample of **1,000 validation** and **1,000 training** scenarios. A run option records every scenario instead.

For each scenario the **subject** pairings are recorded: the exact optimum (`OPT`), the rank-match heuristic (`HEU`), random-legal (`RAN`) and each model trained (`GBM`, `MLP`). The listing prints **one subject** (default: the best model on validation, or `--subject`). The JSON file holds all of them.

### 9.2 The JSON replay file

```
{ "version": 1, "kind": "pairing-run",
  "run":       { "id", "deck", "createdAt", "engineSha", "rulesSnapshot", "featureVersion", "dataHash", "seed",
                 "generator": { "mix", "policies", "sizes" },
                 "models": [ { "id", "kind", "paramCount", "file", "hash" } ] },
  "scenarios": [ {
      "id", "split", "policy", "seed", "hash",
      "context":   { "level", "round", "curses", "eye", "strangerSurprise" },
      "strangers": [ { "creatureId", "borne": [treasureId] } ],
      "party":     { "front": [ { "creatureId", "wielded": [treasureId], "dragonKills", "fsBonus", "potion",
                                  "backers": [ { "creatureId", "wielded": [treasureId] } ] } ] },
      "candidates": { "count", "enumerated", "optimumScore36" },
      "results":   [ { "subject", "regret36", "score36",
                       "pairing":  [ { "stranger", "engages", "backers": [strangerIndex] } ],
                       "combats":  [ { "stranger", "party", "strangerStrength", "partyStrength",
                                       "strangerDieBonus", "partyDieBonus", "gap",
                                       "win36", "tie36", "result", "flags": [] } ] } ] } ],
  "summary": { ... } }
```

- **Exact numbers.** Probabilities are stored as **counts out of 36** (`win36`, `tie36`) and scores as integers (`score36` = twice the sum of wins plus ties, out of 72), so a replay compares integers, not floating-point values. The decimal columns in the printout are derived from them.
- **Scenarios are stored in full**, not only as seeds, so a later change to the generator cannot break a replay.
- **Replay.** `pairing-lab replay <file> [--subject ...]` re-evaluates every scenario under the recorded rules snapshot and checks that every result matches exactly. It can also run a **new model** over the same scenarios and report against the recorded subjects. A different engine SHA or rules snapshot gives a warning, not a failure.
- **Size.** Pretty-printed for runs under 5,000 scenarios, compact above that.
- **Candidate rows are not stored here.** They live in the training dataset (§6). The JSON holds the scenario, the optimum and each subject's choice.

### 9.3 The printout

**One line per combat.** Each line is self-contained: the scenario number, its context, the two sides in the match, the result, and the scenario-level totals are all on the line, so a single line can be searched for or read alone. The scenario number is the `id` in the JSON file.

**Style.** As in the game log: 7-bit ASCII, uppercase, 3-letter mnemonics (the **same creature and treasure codes as the game log**), numbers right-aligned, codes left-aligned, a centred spaced-out banner, a header, `=` and `-` rules, trailing spaces trimmed, an end-of-listing footer and a KEY block at the end.

**Width.** There is no fixed width. Each column is as wide as its widest value in the run, worked out in a first pass, so **nothing is ever truncated**. The width is printed in the header. All lines in one listing are the same width, so a printer can be set to match.

| Col | Meaning | Col | Meaning |
|---|---|---|---|
| `SCN#` | Scenario number (the JSON `id`) | `PST` | Party total strength in the match |
| `MN` | Match number within the scenario | `SDB` | Strangers' die bonus (Ring + surprise) |
| `SPL` | Split (`TRN` `VAL` `TST` `HLD` `UPO`) | `PDB` | Party's die bonus (Ring − curses) |
| `POL` | Party policy (`RLG` `GRD` `CAU` `MAG`) | `GAP` | (`SST`+`SDB`) − (`PST`+`PDB`), signed |
| `LVL` | Dungeon level | `PWN` | Chance the strangers win, % |
| `CRS` | Curses on the party | `PTI` | Chance of a tie, % |
| `EYE` | Eye of God present (`Y` or `-`) | `EXP` | `PWN` + half of `PTI`, as a score (0 to 1) |
| `SUP` | Strangers' surprise bonus (0 or 1) | `RES` | `WON` certain win, `LOS` certain loss, `UND` the dice decide |
| `SFT` | Stranger fighter (creature code) | `FLG` | Flags, space-separated: `SHW` `EYE` `POT` `DRK` `ELX` (`-` none) |
| `SGR` | Its borne artefacts, comma-separated | `SUB` | Subject that chose this pairing |
| `SBK` | Stranger casters backing it | `JOPT` | Exact optimum for the scenario (sum of `EXP`) |
| `PFT` | Party fighter it engages | `JSUB` | The subject's score for the scenario |
| `PGR` | Party fighter's wielded artefacts | `JHEU` | The rank-match heuristic's score |
| `PBK` | Party casters backing it | `RGR` | Regret, `JOPT` − `JSUB` |
| `OPP` | The party fighter the **optimum** gives this stranger (shows where the subject differs) | `OPT` | `Y` if the subject's score equals the optimum |
| `SST` | Stranger total strength in the match | `MAT` | `Y` if pairing matters here (best − worst > 0.05) |
| | | `HASH` `SEED` | Scenario hash (8 hex) and seed |

**The end-of-listing summary** prints, per split and per party policy: scenarios, combats, share where pairing matters, mean and 95th-percentile regret, top-1 agreement by value, and the share legal. The **KEY** block then decodes every mnemonic, as the game log does.

**Example** (the §2 worked example; subject `GBM` found the optimum in scenario 1, and the heuristic `HEU` did not in scenario 2):

```
============================================================================================================================================================
                                                      P A I R I N G   T R A I N I N G   R U N   L O G
                                                  S T R A N G E R S   A T T A C K   -   O N E   R O U N D
============================================================================================================================================================
RUN PR-0001   DATA 9C3E71A0   FEATURES 1   RULES R20261005   ENGINE 1D4F77D   SEED 1000417   PRINTED 2026-10-05 14:02:11
LISTING TST HLD UPO   DECK BAS   SUBJECT GBM   SCENARIOS 2   COMBATS 4   WIDTH 156   JSON PR-0001.JSON
------------------------------------------------------------------------------------------------------------------------------------------------------------
SCN# MN SPL POL LVL CRS EYE SUP SFT SGR SBK PFT PGR PBK OPP SST PST SDB PDB GAP  PWN  PTI   EXP RES FLG SUB  JOPT  JSUB  JHEU   RGR OPT MAT HASH        SEED
------------------------------------------------------------------------------------------------------------------------------------------------------------
   1  1 TST GRD   4   0 -     0 OGR -   -   MAN -   -   MAN   5   3   0   0  +2 72.2 11.1 0.778 UND -   GBM 0.778 0.778 0.444 0.000 Y   Y   A41F09C2 1000417
   1  2 TST GRD   4   0 -     0 DWF -   -   HER SWD -   HER   1   7   0   0  -6  0.0  0.0 0.000 LOS -   GBM 0.778 0.778 0.444 0.000 Y   Y   A41F09C2 1000417
   2  1 TST GRD   4   0 -     0 OGR -   -   HER SWD -   MAN   5   7   0   0  -2 16.7 11.1 0.222 UND -   HEU 0.778 0.444 0.444 0.333 N   Y   A41F09C2 1000417
   2  2 TST GRD   4   0 -     0 DWF -   -   MAN -   -   HER   1   3   0   0  -2 16.7 11.1 0.222 UND -   HEU 0.778 0.444 0.444 0.333 N   Y   A41F09C2 1000417
------------------------------------------------------------------------------------------------------------------------------------------------------------
                              * * *   E N D   O F   L I S T I N G   -   2   S C E N A R I O S   -   4   C O M B A T S   * * *
------------------------------------------------------------------------------------------------------------------------------------------------------------
KEY  CREATURE  HER=HERO WHR=WOMAN-HERO OGR=OGRE TRL=TROLL PRI=PRIEST MAN=MAN WMN=WOMAN DWF=DWARF WIZ=WIZARD DRG=DRAGON SOR=SORCERER GNT=GIANT UNI=UNICORN
KEY  TREASURE  SWD=SWORD STF=STAFF RNG=RING AXE=AXE SHD=SHIELD EYE=EYE OF GOD TAL=TALISMAN POT=STRENGTH POTION
KEY  SPLIT     TRN=TRAIN VAL=VALIDATION TST=TEST HLD=HELD-OUT LARGE FIGHTS UPO=UNSEEN PARTY POLICY
KEY  POLICY    RLG=RANDOM LEGAL GRD=GREEDY (STRONGEST IN FRONT) CAU=CAUTIOUS (WEAKEST IN FRONT) MAG=MAGIC-HEAVY (CASTERS BACK)
KEY  DECK      BAS=BASE DECK KIT=EXTENSION KIT
KEY  SUBJECT   OPT=EXACT OPTIMUM HEU=RANK-MATCH HEURISTIC RAN=RANDOM LEGAL GBM=GRADIENT-BOOSTED TREES MLP=NEURAL NET
KEY  RESULT    WON=CERTAIN STRANGER WIN LOS=CERTAIN STRANGER LOSS UND=DICE DECIDE
KEY  FLAG      SHW=SHIELD NULLIFIED MAGIC EYE=EYE OF GOD POT=STRENGTH POTION DRK=DRAGON-SLAYER ELX=ELIXIR
KEY  COLUMN    (EACH COLUMN IS DECODED IN FULL IN THE LISTING KEY, AS IN THE TABLE ABOVE)
============================================================================================================================================================
```

The listing above is illustrative: the header, key and summary are generated from the same tables the writer uses, and the code lists are the full game-log lists.

### 9.4 Acceptance for the run records

| ID | Criterion |
|---|---|
| T-R1 | A run always writes both files, named with the run id. |
| T-R2 | **Replay is exact:** `pairing-lab replay` reproduces every recorded integer result, for every subject, on a committed sample run. |
| T-R3 | The listing has **exactly one line per combat** of the printed subject, and no value is truncated (a test feeds the longest possible gear and backer lists). |
| T-R4 | The listing's creature and treasure mnemonics are **identical to the game log's** (one shared source, or a test asserting equality), and no mnemonic is used for two meanings within a column. |
| T-R5 | The JSON file validates against a checked-in schema, and carries `version`. |
| T-R6 | A small sample run (the §2 vector among others) is committed as a golden fixture for both files. |

## 10. Deliverables and tasks

- [ ] 1. **Evaluator** — write the §2 and §4 vectors first; build the exact evaluator with the parity test (T-A1, T-A2)
- [ ] 2. **Scenario generator** — the strangers' draw, the party policies and the context sampler, with the mix recorded
- [ ] 3. **Candidate enumerator** — legality, canonical form, branch-and-bound optimum, sampling over 2,000
- [ ] 4. **Exact baseline report** — T-A4, the heuristic and random baselines, and the spread by stratum
- [ ] 5. **Exporter and features** — the TypeScript encoder, the dataset with its metadata, golden vectors
- [ ] 6. **Run records** — write the JSON replay file and the printout from the same records, with `replay`, the schema, and the golden fixtures (§9, T-R1 to T-R6); share the game log's mnemonics
- [ ] 7. **Training** — LightGBM and MLP in Python, with a results note against T-A5 to T-A7, producing a run record each time
- [ ] 8. **Verify** — all suites pass, and the engine-spec is updated for any engine export added

Out of this task, and still ahead: the embedded model and parity tests (stage 3 of the requirements), strangers outnumbering the party (the next scenario version), deploy and redeploy, and everything multi-round (stage B).

---

## 11. Open items

- **O1 — Priest Staff (D3).** The working assumption is +2. A ruling of +1 means regenerating the data.
- **O2 — The Shield and stranger backers (kit run only).** The card says the Shield affects any creature with magical power matched against the bearer, "whether in the background or fighting hand-to-hand". The engine currently leaves a leftover stranger caster outside the ward. This task follows the **card text**, so a party Shield bearer also nullifies the magic of stranger casters backing the match against it. This drives pairing choices, so please confirm it with Peter. The **base run does not need it** (no Shield), so it can start first.
- **O3 — Casters held back.** Whether a stranger caster may stay in the background without a numerical advantage (question 4 of the questions for Peter). The default is that it may.
- **O4 — Real deployments.** Using party formations from the Convex game logs is a possible improvement. It needs your separate go-ahead.
- **O5 — Next scenario version.** Strangers outnumbering the party, where gang-ups (two against one) are the main decision.
- **O6 — Run records in git.** Proposed: full run records are gitignored; only the small golden sample from §9.4 (T-R6) is committed.

# Combat Review: Report for Peter

```
DATE: 13-OCT-2026
FOR: Peter
STATUS: Stages 1 to 6 built on the combat-review branch. The outside-decision plumbing (stage 6) is tested against a
        stand-in; no real AI model has played yet.
```

## The short version

The combat review set out to do five things: apply your reformulated rules, let the strangers use artefacts, make the
strangers' decisions **pluggable** so that there can be easier and harder opponents, find out whether a smarter stranger is
worth building, and leave a door open for an outside "brain" such as a trained AI model.

Where it stands:

- **Your rules are built** as a second combat engine, switched on per game. The old combat is untouched. Nothing in the
  live game switches the new one on yet, so players cannot reach it.
- **The strangers use artefacts** by your default loadout, in the live game.
- **The strangers' decisions are pluggable.** Six levels are registered (table below), and the game can also ask an outside program.
- **The main finding is that a smarter stranger is worth less than we hoped.** The best search we built beats the plain
  greedy rule by only half a point to two points on our fairness score, because the dice dominate. "Strongest against
  strongest" is already hard to improve on.
- **An outside decision-maker is possible and the plumbing is proven.** Whether to build one is now a product choice, not a
  technical obstacle (see "An external rules engine").

## What happened, stage by stage

### Groundwork (3 to 10 October)

| Step | What it produced |
|---|---|
| Requirements (3 Oct) | Five aims: better stranger pairing, artefact use by strangers, the player's matching restriction, pluggable strategies, and a formation screen that cannot produce an illegal line-up. |
| Technical spec and your feedback (3 to 4 Oct) | A design for the new round engine and the strategy interface, with 45 open questions. Your answers settled the Eye of God, the capability table (Thief counts as a Man and so on) and the loadout wording. We also found a real bug: the Thief, Witch, Scholar and Apprentice were not getting artefact bonuses they were entitled to. |
| Neural-network study (3 to 5 Oct) | Feasible, and a MacBook is enough to train it. But a one-round pairing can be solved exactly without learning, so a network only earns its place by looking several rounds ahead. We also counted the possible fights: far too many to enumerate (billions even for the base game), so testing must sample. |
| Pairing lab (5 to 7 Oct) | A fast, seeded fight simulator (43,000 to 324,000 fights a second), a scenario generator, four simulated party styles, and a flat Monte Carlo decision-maker. Its strength arithmetic matches the game's. |
| Your rulings (10 Oct) | Fixed attacker and defender roles, 2-against-2 allowed in step e only, one definition of "the fight is over", stalemate means neither side can win on any roll, curses count, the Scroll's destroying variant, the Treasure Chest Spectre gets no surprise, a blocked retreat changes no roles, casualty is "nominate, then a die: high roll kills the nominee", and every new fight starts with artefacts on the floor. All of these are in the lab and the new engine. The Chest Spectre rule and "*n* Dwarves guide past *n* traps" are also in the live game. |

### The build (11 to 13 October)

| Stage | What was built | Result |
|---|---|---|
| **1. Loadout seam** | The strangers' artefact choice moved behind a swappable interface; a per-game level field; `standard` is your default loadout. | The live game is byte-for-byte unchanged. |
| **2. Logged decisions** | A stranger's choice is now recorded as an ordinary action, so a game replays exactly without the strategy running. Clients cannot forge a stranger action. A bad choice is replaced by `standard`'s and logged. | Replay and forgery tests pass. |
| **3. Smart loadout bench** | A cleverer artefact allocation (best of up to 81, scored exactly), plus a brute-force upper bound. | **No gain.** Even the brute-force search gains under half a point. Your default preference list is already close to the best artefact placement can do. The real decisions are in the pairing. |
| **4. Revised round engine** | Your rules as a working engine: deploy, engage, surplus, fight, wrap-up; persistent matches; 2v2; stalemates; the casualty rule; the end-of-fight test. Four decision points for a strategy (deploy, engage, redeploy, nominate). | Whole fights play to the end, deterministically, and agree with the lab simulator within sampling noise. The Unicorn fights at strength 4, as before. |
| **5. More levels** | `novice` and `expert`, a legality sweep, and a calibration harness that plays each level against the same fights. | See the table below. The bands were accepted on 12 Oct. |
| **6. Outside decisions** | Ask an outside program for a decision, wait safely, fall back to `standard` on any failure. | Details in the next sections. |

### What the first tournament told us (Monte Carlo, your final rules)

"Fairness score" below is **R3**: value of creatures destroyed minus value lost, as a share of everything in the fight, from
the strangers' side. 0.5 is an even fight.

- Greedy "strongest against strongest" beats the cautious and random styles at every size, by up to 4.4 points.
- Playing fights out by Monte Carlo search adds only **1 to 2 points** from four strangers upward, and nothing measurable
  with one to three strangers (few decisions to get wrong).
- Quadrupling the search effort added little. A cheap search is a sensible default.

## The levels implemented today

A level decides what the strangers choose. The engine's legality layer checks every choice, so no level can break a rule.
Scores are the change in R3 against `standard` on the same fights (higher is stronger for the strangers).

| Level | Version | Where it runs | What it decides | How | Strength vs `standard` | Time per decision |
|---|---|---|---|---|---|---|
| *(none: legacy combat)* | n/a | In the game | Artefacts only; the player builds the pairing plan | Your default loadout, then the original plan-based combat | n/a | Instant |
| `standard` | 1 | In the game | Artefacts, deployment, engagement, surplus, casualty nominee | Your default loadout; "strongest against strongest" (provisional, see below) | Baseline. The only level on the leaderboard | Instant |
| `novice` | 1 | In the game | Same decisions | Deploys a random few, pairs at random, leaves half the surplus idle, nominates at random | **-0.9 points** (1-3 strangers); **-2.0 to -2.5 points** (4 or more). Accepted band: -1 to -2.5 | Instant |
| `expert` | 2 | In the game | Deployment and engagement, by search | Tries up to 8 candidates, plays each out 16 times to the end of the fight on a copy of the game, using the game's own rules; keeps `standard`'s answer unless another is strictly better | **+0.5 to +0.8 points** up to 12 strangers; level at 13 to 20. Accepted band | About 0.1 to 0.3 s |
| `smart` | 1 | In the game | Artefacts only | Best of up to 81 allocations by expected value in round one | **Nothing measurable** (kept, but not recommended) | Instant |
| `ext-easy` | 1 | Outside program | Whatever the program answers | Game asks over HTTP; falls back to `standard` on any failure | **Not measured** (no real model yet) | Limit 1.5 s |
| `ext-hard` | 1 | Outside program | Same | Same | **Not measured** | Limit 6 s |

Notes:

- **Everything is server-chosen.** A level is stamped on a game by the server (an environment setting). Players cannot pick
  one, and no manual change was needed.
- **Only `standard` is ranked.** Games on any other level record the level and are refused by the leaderboard.
- **The levels span a real range only downward.** `novice` is clearly weaker; `expert` is only slightly stronger. There is
  no "much harder than standard" level yet, and the evidence says there may not be much headroom (see below).
- **`standard`'s deployment is a placeholder.** You had no definitive answer on a "dumb deployment" (Q9), so we use the lab's
  strongest-against-strongest rule until something better emerges. Because `standard` is also the fallback for every other
  level, its choice matters.
- **The measurements use a `standard` party**, not human players, so the gain against real people is unknown.

## How stage 6 works (outside decisions)

Until now every stranger decision was made by rules inside the game. Stage 6 lets a level be answered by **a separate
program**, such as a trained AI model, which the game asks.

1. **Ask, then apply.** The game asks for a decision and applies the answer as two separate steps. Built-in levels behave as
   before.
2. **Each level sets its own thinking time**, following your ruling: `ext-easy` 1.5 s, `ext-hard` 6 s (provisional).
3. **The game can wait.** While a decision is outstanding no other move is possible and nobody can fake the answer.
4. **The program sees only what a human opponent could see**: fighters, strengths and legal moves. Never the cave, the deck or
   the random seed. A password protects the exchange.
5. **Every failure falls back.** If the program is slow, crashes, sends nonsense or proposes an illegal move, the game uses
   `standard`'s decision for that step and records why. A backup timer covers a lost request. A fight cannot hang.
6. **Everything is logged** (which level, whether it was replaced, how long it took), and a game replays from its log alone.
7. **What players see:** a line reading "The strangers are deciding…" while the buttons wait.

### How we know the plumbing works

We built a stand-in program that can be told to misbehave, and played whole fights against it:

| Test | Decisions | Replaced by `standard` | Fights stuck |
|---|---|---|---|
| Well-behaved stand-in | 134 | **0 (0%)** | **0** |
| Misbehaving stand-in (10% crashes, 5% illegal moves, random delays) | 134 | 22 (16%): 15 crashes, 7 illegal moves | **0** |

A good answer took about 2 ms. The automated tests pass. One command repeats the test against any program that follows the
same simple format.

## An external rules engine

The question is whether the strangers' decisions (and, more ambitiously, a stronger form of play) could come from something
outside the game. **The door is open and the hinges are tested.** What it would and would not mean:

**What an outside engine can do**
- Make the strangers' choices: who carries which artefact, who stands where, who faces whom, who is put at risk.
- Be anything that speaks the simple request/answer format: a trained neural network, a Monte Carlo search service, or a
  human-style imitation learned from recorded games.
- Run on its own machine (your original idea was a Linux box that Convex calls), or inside Convex as an action.
- Be tried safely: it can only ever lose to `standard`'s fallback, never break a rule or a game.

**What it cannot do, by design**
- **Change the rules.** The game's legality layer is the sole authority and rejects an illegal answer. The rules live in one
  place and the outside program only chooses among legal moves.
- **See hidden information** or touch the random seed.
- **Run its own "what if" fights using the game.** It receives a view, not the game, so it cannot try a move on a copy the way
  `expert` does. A real model must bring its own evaluation: a learned value, or its own copy of the rules. The lab's
  simulator is such a copy, locked to the game by tests.

**Is it worth building?** The evidence is mixed, and this is the honest summary:
- A one-round pairing is solved well by the built-in rules, so an outside engine has nothing to add there.
- The measured headroom from searching is **small**: about 0.5 to 2 points of R3. A model that looks several rounds ahead
  might find more, but nobody yet knows the best strategy, and the dice dominate.
- Its stronger cases are **difficulty personalities** (a model trained to play like a particular style) and **very large
  fights**, where search is slow.
- The cost is real: a model to train and host, a per-decision cost ceiling, a schema versioning policy, and the 1.5 to 6
  second waits that players will feel.

**Recommendation:** treat it as optional. The next measured step, if you want to pursue it, is a first model that imitates
`expert`, run through the same calibration to see its fallback rate and its strength, and only then a model that looks
further ahead.

## Next steps to complete the review

Ordered by dependency. Items 1 and 2 are needed before the new combat can be called finished; the rest extend it.

1. **Make the revised combat reachable.** Nothing sets `combatRevision` for real games, so players still get the old combat
   and the outside levels act only on the artefact-sharing step. Needed: a server switch (like the other house-rule flags)
   and the player's formation screen, so that a legal line-up always results. Update the manual when this ships.
2. **Wire multiplayer against strangers** to the stranger driver, so solo and multiplayer behave identically. Player-versus-player
   fights stay as they are.
3. **Settle the provisional rules.** Replace the placeholder `standard` deployment (the "dumb deployment", Q9) once the lab
   proposes one; confirm who attacks in fights that start without a player action (turncoat Apprentice, chest Spectre).
4. **Measure against people, not just `standard`.** Add a human-like party style from recorded games, and model the Scroll,
   the Eye and curses, then re-run the level calibration. Re-measure the bands whenever `standard` or the rules change.
5. **Decide whether to build an outside decision-maker.** If yes: first a model that imitates `expert`, run through the same
   calibration; then one that looks several rounds ahead. Agree its cost ceiling and schema versioning policy first.
6. **Tune the outside levels against a real endpoint:** measure fallback rate and p50/p95 latency, then set the `ext-easy`
   and `ext-hard` deadlines (currently 1.5 s and 6 s, provisional). Decide whether a level's clock should stretch with the
   human's thinking time (attacker pairing only).
7. **Tidy-ups:** hide the leaderboard save button for outside-level games (the server already refuses it), and regenerate the
   PDF of this report.

## What this does not yet show

- **No real AI has played yet.** The stand-in uses the game's own `expert` rules, so these results prove the plumbing, not
  that a model plays well.
- **Real speed is unknown.** The timings are from one computer, and the 1.5 and 6 second limits should be tuned once a real
  model exists.
- **Solo play only.** Multiplayer against strangers is not connected to the new decisions, and player-versus-player fights
  are untouched.
- **The party is always `standard`.** There is no human-like party style yet, so strength against real players is unknown.
- **Not modelled in the measurements:** the Scroll, the Eye and curses. Artefacts were put under guard in half the fights
  (the game's real rate is much lower), which exaggerates loadout effects.
- **Small leftovers:** the leaderboard save button is not yet hidden for an outside-level game (the server already refuses it),
  and fights that start without a player action (a turncoat Apprentice, the chest Spectre) make the party the attacker,
  provisionally, until you say who attacks there.

## Where this leaves us

The game can now host stranger players of several strengths, and can ask an outside program to be one, falling back safely
when it fails. The strongest practical finding is that stranger intelligence moves the result by a point or two, so the next
decision is yours: whether a smarter opponent, a set of difficulty styles, or the formation screen for players (still its own
piece of work) is where the effort should go.

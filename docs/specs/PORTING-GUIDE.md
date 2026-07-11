# Porting Guide — bringing a foreign implementation in line with this engine

> **Audience:** the person or AI agent working **inside another implementation's codebase**
> (the immediate case: the VAX Macro-32 version of Sorcerer's Cave) with the goal of making it
> behave **identically** to this repository's engine (`packages/engine`).
> **Written:** 2026-07-11. The documents it cites live beside it in `docs/specs/`.

## 0. What to carry across

Copy (or vendor) these into the target repo — they are the whole contract; the TypeScript source
is NOT required reading for the port:

| File | Role |
|---|---|
| `docs/specs/engine-spec.md` | The specification. Part I = normative testable rules; Part II = readable rulebook; Appendix A = data tables, RNG algorithm (A.5), full state shape (A.6); Appendix B = deliberate deviations from the original 1978/1982 rules; Appendix D = the conformance-vector contract. |
| `docs/specs/conformance/README.md` | Vector file format + action grammar. |
| `docs/specs/conformance/solo-*.txt` | Eight machine-checkable playthroughs — the port's acceptance tests. |
| `docs/specs/PORTING-GUIDE.md` | This file. |

## 1. What you are porting — and what you are not

The engine is a **pure, deterministic, seeded state machine**: `reduce(state, action) → {state,
events}` (SC-4-1), with ALL randomness in one 31-bit LCG cursor (`state.seed`, SC-5-13). A whole
game is exactly `seed + picks + ordered actions`. That is what makes cross-implementation parity
*provable* rather than aspirational.

**In scope:** the solo game — data model (§3), turn lifecycle (§4), RNG (§5), movement (§6),
chambers/hazards (§7), encounters (§8), fights (§9), special areas (§10), artifacts (§11),
scoring (§12).

**Out of scope:** the multiplayer layer (§MP — it leans on backend orchestration outside the
engine), the web UI, the Convex backend, and the replay-by-code feature. Your terminal UI is your
own; only the rules underneath must match.

**Definition of done:** every line of every conformance vector matches (§4 below). Rules parity
without vector parity is not done; vector parity without reading Part I is not safe (the vectors
are smoke tests, not the contract).

## 2. Reading order

1. **Appendix B first** if the target implementation was written from the original rulebook — it
   is the list of places this engine deliberately differs from (or resolves ambiguity in) the
   printed rules. Every one of these is a place your existing code is probably "correct to the
   book" and must nevertheless change: 71-card small pack, two Earthquakes, Dragon reaction 4/6,
   flat −30 curse penalty, never-rotate tiles, submitted battle plans, etc. Match **this engine**,
   not the book.
2. **Appendix A** — transcribe the data (A.1–A.4), the RNG (A.5), the state shape (A.6). Every
   A.1 cell is pinned by an engine test; transcribe, don't re-derive.
3. **Part II** for the shape of play, then **Part I** section by section as you implement — each
   row is one testable rule with a stable `SC-` id. Keep the ids in your code comments; they make
   divergences discussable across the two codebases.
4. **Appendix D + `conformance/README.md`** before writing any game logic, so you build the
   replay harness (§4) early and develop against it.

## 3. VAX / Macro-32 specific notes

- **The RNG is 32-bit friendly by design** (A.5 port note): `nextSeed` is `MULL` by 1103515245,
  `ADDL` 12345, then `BICL #^X80000000` — the low 31 bits of the product are all that matter, so
  VAX's truncating 32-bit multiply is exact; no 64-bit arithmetic (`EMUL`) needed. First
  self-check: `nextSeed(1) = 1103527590` (SC-5-6).
- **Bit extraction:** `bits = (seed >> 15) & 0xFFFF`. After the mask the seed is non-negative, so
  an arithmetic shift is safe; die value = `min(5, bits/10923) + 1` using integer division.
- **Everything is integer longwords.** No floating point anywhere in the engine. Largest values:
  packed coords ≤ 6,999,999-ish (`level*10000 + y*100 + x`), seeds < 2^31, scores in the hundreds.
- **Shuffle order is normative:** Fisher–Yates from `i = len−1` down to `1`, `j = randBelow(i+1)`,
  swap (SC-5-9) — and RNG **consumption order** at setup is large pack → small pack → store the
  cursor (SC-5-12). Get these wrong and the very first `SETUP` line of every vector fails.
- **Mutation discipline is yours to choose.** The reference engine is pure/immutable
  (`structuredClone`); that is an implementation detail. In-place mutation in Macro-32 is fine —
  only the observable post-action state must match. But two behaviours DO depend on it: a failed
  move must leave state untouched except documented pruning (SC-6.1-1/4/9), and a rejected plan /
  blocked action must change nothing (SC-4-6, SC-4-24).
- **Array semantics:** where order matters the spec says so explicitly (hazard firing priority
  SC-7.2-1, seq-ordered event logs, party join order, mutiny SPLICES deserters out SC-7.2-8).
  When you index `party`/`strangers`/`treasures`, the vectors' indices refer to those arrays at
  the moment of the action — your arrays must evolve identically (same insert/remove positions).
- **Strings** (creature/treasure names) are display-only; game logic keys off ids.

## 4. The conformance harness — build this first

Write a small vector replayer in the target repo (host language of your choice — it can even run
on the VAX): parse a `solo-*.txt`, call your `newGame(seed, picks)`, compare the `SETUP` line,
then apply each action per the grammar in `conformance/README.md` and compare each checkpoint.
**Print your own checkpoint lines in exactly the vector format** so `diff` (or `DIFFERENCES` on
VMS) pinpoints the first divergent line.

Interpretation of a divergence:

| First mismatching field | Look at |
|---|---|
| `SEED` on the `SETUP` line | LCG arithmetic, shuffle, or deck-build order (A.5, SC-5-9..12) |
| `SEED` on a move line | a roll happened that shouldn't (or didn't happen, or out of order) inside that action's resolution — the spec row for that action/event pins the sequence |
| `ARA`/`LVL`/`TRN` | movement/placement rules (§6) |
| `PH`/`GS` | phase-machine transitions (§4) |
| `EV` list | event emission order (SC-4-42 and the per-mechanic rows) |
| `FINAL`/`PARTY`/`AREA` block only | state bookkeeping that no checkpoint field surfaces — usually treasure/contents handling (§7) |

Work vector-by-vector, shortest first (`solo-seed23-party4-6.txt`, 7 moves, exercises setup,
movement, chamber draw, pickup and the Lost-Ruby statue). Do not move on while an earlier vector
fails: later ones compound everything.

## 5. Suggested milestones

1. **M1 — RNG + static data.** A.5 exactly; transcribe A.1–A.4. Check `nextSeed(1)=1103527590`,
   the SC-3 counts (61 area cards, 71-card small pack, 14 creatures, 15 treasures, 5 hazards).
2. **M2 — decks + newGame.** SC-5-1..5-12, §3 state init (SC-3-23/24). Gate: the `SETUP` line of
   **all eight** vectors matches (this alone proves shuffle + consumption order).
3. **M3 — movement.** §6. Gate: every vector matches up to its first non-move action.
4. **M4 — chambers, hazards, encounters.** §7–§8. 5. **M5 — fights.** §9 (the battle-plan
   validation rules SC-9.1-* are the subtle part). 6. **M6 — special areas, artifacts, scoring.**
   §10–§12. Gate after M6: **all eight vectors match end to end, including the FINAL blocks.**
5. **M7 — reconcile legacy behaviour.** Walk Appendix B and remove any remaining
   rulebook-faithful behaviour the vectors happened not to exercise (the vectors are smoke tests;
   Part I is the contract — an audit pass of Part I rows against your code closes the gap).

## 6. Ground rules

- **This engine is the reference.** If the VAX version disagrees and both "read the rulebook
  correctly", the port changes — parity is the goal, not adjudication. If you believe the
  *reference* is wrong, don't diverge silently: file it against this repo (the spec header's
  discipline applies — the code wins until the spec/code are changed together).
- **Never hand-edit a vector.** They are generated from the engine and guarded by its test suite
  (`conformance-vectors.test.ts`). A vector that "needs" editing means one of the two engines is
  wrong — find out which.
- **Determinism bar:** when done, the two implementations are interchangeable — the same
  `seed + picks + actions` produces the same game in both, so a game log exported from one can be
  replayed by the other (the web app's replay-by-code viewer and `.json` machine log already
  speak this format on this side).
- If more vectors would help (deeper levels, specific artifacts, a Sorcerer kill, an escape with
  loot), ask for them on this side — the generator takes any `seed × picks` and the policy bot is
  ~40 lines; targeted vectors are cheap to mint.

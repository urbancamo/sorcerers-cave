# Rulings register (pilot: hazards, creature and treasure tables)

> Date 2026-11-06. Source of truth: Consolidated Rules V2. "Decider" is who must rule: **Peter** (rules author) or **MSW** (owner).
> Two kinds of entry: **R-** a rule the book states or leaves open, where the engine differs or has to guess;
> **B-** a defect that needs no ruling (the engine contradicts itself or the book plainly), found by the invariant soak.
> Nothing here has been changed in the engine. Fixing any creature band (R-02..R-06) changes kit games and invalidates the
> 75 pinned searched games (re-run per `docs/testing/search-scenarios.md`).

## Rulings

| ID | Topic | Book says | Engine does | Options | Recommendation | Decider | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Woman Hero reaction line | Prints "1-3 Hostile. 3-6 Friendly" (3 appears twice) | Treats it as 1-3 Hostile, 4-6 Friendly | a) keep the engine's reading; b) another reading Peter intends | a) it is a misprint; confirm the intended bands and correct the book | Peter | **Ruled: misprint; the engine reading is right. Closed, no change** |
| R-02 | Demon reactions | 1-5 Hostile, 6 Indifferent | Every roll hostile | a) follow book; b) keep | a) follow the book | Peter/MSW | **Ruled: follow the book. FIXED 2026-11-06** (re-pin of the searched games still pending) |
| R-03 | Lion reactions | 1-4 Hostile, 5-6 Friendly | 5 is Indifferent | a) book; b) keep | a) book | Peter/MSW | **Ruled: follow the book. FIXED 2026-11-06** (re-pin of the searched games still pending) |
| R-04 | Scholar reactions | 1-2 Hostile, 3-4 Indifferent, 5-6 Friendly | Only 1 Hostile | a) book; b) keep | a) book | Peter/MSW | **Ruled: follow the book. FIXED 2026-11-06** (re-pin of the searched games still pending) |
| R-05 | Witch reactions | 1-2 Hostile, 3-5 Indifferent, 6 Friendly | 5 is Friendly | a) book; b) keep | a) book | Peter/MSW | **Ruled: follow the book. FIXED 2026-11-06** (re-pin of the searched games still pending) |
| R-06 | Wolf reactions | 1 Hostile, 2-3 Indifferent, 4-6 Friendly | Uses the Lion's band | a) book; b) keep | a) book | Peter/MSW | **Ruled: follow the book. FIXED 2026-11-06** (re-pin of the searched games still pending) |
| R-07 | Desertion, all-ally party | One ally is immune, so the party cannot be wiped out by Desertion | An all-ally party can desert to nothing | a) implement immunity; b) keep | a) implement (also removes a wipe-out path) | Peter | **Ruled (new mechanic, covers R-07 and R-10): whenever the party has no original members left, by ANY cause (death, Desertion, Mutiny, anything else), the player is prompted to pick a new leader from the remaining members; that member counts as original from then on, not as an ally. **IMPLEMENTED 2026-11-06** (`chooseLeader`, phase `leader`; SC-EXT-45; web `LeaderChoice`) |
| R-08 | Two Earthquakes | Destroys the last two areas | Destroys only the last one (the pack holds two Earthquakes) | a) implement; b) keep | a) implement | Peter | **Ruled: same chamber, one area; different chambers, two areas. The engine already does this (the pilot test was wrong and is corrected). Closed** |
| R-09 | Eye of God vs Medusa | The Eye renders Medusa powerless | The party is stoned either way; a code comment in `effects.ts` says it protects | a) implement the book; b) fix the comment | a) implement | Peter | **Ruled and FIXED 2026-11-06** (Eye makes Medusa powerless; pinned games must be re-pinned) |
| R-10 | Mutiny loyal ally | Player's choice of the one that stays loyal | First ally in roster order | a) let the player choose; b) first | a) player choice (needs a UI step) | MSW | **Ruled (new mechanic, covers R-07 and R-10): whenever the party has no original members left, by ANY cause (death, Desertion, Mutiny, anything else), the player is prompted to pick a new leader from the remaining members; that member counts as original from then on, not as an ally. **IMPLEMENTED 2026-11-06** (covered with R-07) |
| R-11 | Mutineers' treasure | Silent | Dropped in the chamber | a) as engine; b) goes with them | a) keep and state it in the book | Peter | **Ruled: as recommended (keep; state it in the book). Closed** |
| R-12 | Spell: which tunnel | "The last unoccupied tunnel your party was in" (no exploring party, no small card); chambers not affected; an Earthquake drawn here is placed first; secret-door markers in the vanished tunnel and on adjacent levels connected to its stairs are removed. **MSW's reading (2026-11-06): the last unoccupied tunnel the party walked through, found by looking back along its path** (unoccupied = no other player, in multiplayer) | Looks only at the tile just left (`prev`): it fizzles if that is a chamber, ignores a small card lying on it, fizzles if an Earthquake just destroyed it, and does not clear secret doors on the level below. The engine keeps no path, only `prev` and `prev2` | a) implement the look-back (needs a path record in the state); b) keep | a) implement. Open point for Peter: does a tunnel collapsed by an Earthquake count as "left standing" (my reading: skipped)? | MSW (reading given) / Peter (Earthquake point) | **Ruled: the look-back reading. IMPLEMENTED 2026-11-06** (`state.trail`, SC-EXT-43). Open for Peter: a tunnel collapsed by an Earthquake is skipped (my reading) |
| R-13 | Talisman against Ghouls and Harpies | The party "has" the Talisman | It must be worn (house rule SC-7.2-7) | a) keep; b) held is enough | a) keep, say so in the book | MSW | **Ruled: must be worn, not carried. The engine already does this. Closed** |
| R-14 | Quarrel ties | "Determined by total strength, including sword, staff or axe, where these are carried; you may choose between equals" (the player picks) | Roster order, no choice | a) player picks; b) keep | a) player picks (needs a UI step) | MSW | **Ruled 2026-11-06: as the book; normal combat bonuses (party artefacts, worn items, wielded weapons) count. **IMPLEMENTED 2026-11-06** (`chooseQuarrel`, phase `quarrel`; SC-EXT-44; web `QuarrelChoice`) |

## Defects found by the invariant soak (replayable)

Each carries `seed`, `picks`, `variants` and the full action list in the soak output; `replay(seed, picks, actions, variants)` reproduces it.

| ID | Defect | Frequency (648,591 random games, 15 min x 4 shards) | Severity | Notes |
|---|---|---|---|---|
| B-01 | **Party sealed in: a tile with no usable exit and nothing offered by `legalActions`** (the game can only be quit). Triage 2026-11-06, below. | 9,076 with the Dead End rescue OFF (the soak default); with `variants.forcedRedraw` ON (`SOAK_REDRAW=1`) 39 explore + 7 fight deadlocks in 109,650 games | Medium: the rescue closes about 97% of them | **Not a defect of the rewrite.** Closed doors are kept in `deadDoors`, the card is not changed (`map.ts` `pruneExit`); the rewrite exists. What is left is arrival paths the rescue was not designed for (see the triage) and the pack running out |
| B-02 | **FIXED 2026-11-06.** **Last member dies from the Elixir; the game carries on.** A lone survivor drinking the Elixir and rolling 1 dies, but `gs` stays PLAYING with nobody alive, in explore phase | 595 (plus 1 after `stay`) | **High**: dead party, game not over | `reduce.ts` Elixir case (`case 15`) has no wipe-out check after `markDied` |
| B-03 | **FIXED 2026-11-06.** **Unicorn departs mid-fight in the revised combat; the fight keeps stale party indices.** After a casualty the Unicorn leaves, shifting the party array, but `fight.rev.matches` and `casualtyQueue` still hold the old indices, so `fightView` throws | 231 | **High**: crash or stuck fight | The stale-index-after-reshape class. Only revised combat |
| B-04 | **FIXED 2026-11-06 (R-15).** **A move to a new tile is offered when the large pack is used up, and refused.** `legalActions` offers it; `reduce` replies `blocked` | 1,390 | Low (bounded: only long games) (needs a very long game) | Needs a ruling on what the book says when every tile is placed: R-15 |
| B-06 | **Living member lists an item as in use (`borne`) that it no longer carries**, after `useArtifact` (items 3, 7, 9, 10, 17, 20) | 25 | Medium: may let a spent or moved item still count as wielded | **FIXED 2026-11-06.** Root cause: the Healing Balm revived a member whose `borne` list (never cleared at death, B-05) still named items the fall had spilled. The revival now drops what is no longer carried (SC-EXT-46) |
| B-07 | Classic/revised fight with no action offered (7 of the 46 with the rescue on) | 15 / 648k off; 7 / 110k on | Medium | **Classified 2026-11-06: B-01 inside a fight.** A revised-combat standoff in a chamber whose every exit was closed by failed `retreat`s (retreat has its own harsher rule, SC-6-8, with no rescue). Neither a retreat nor a round is offered |
| B-05 | A dead member's `borne` list is not cleared | common, invariant now ignores the dead | None visible | Nothing reads it. The invariant now ignores the dead |

| ID | Question | Decider | Status |
|---|---|---|---|
| R-16 | A casualty pair loses a member to a departing Unicorn before the player chose who falls (B-03 fix). Implemented: the pair is settled and the other member stays | MSW | Open (implemented as a guess) |
| R-17 | Unicorn without a Woman, in and after a fight | Book: allied only while the party has a Woman; otherwise indifferent, guarding treasure | MSW (2026-11-06): inside a round everything is simultaneous; after the round a still-engaged Unicorn keeps fighting to protect itself; unengaged between rounds, or surviving the fight, it becomes an indifferent stranger. Answers to my questions: classic = stays for the whole fight; outside a fight = at once; retreat = left in the fight's chamber. **Implemented** (replaces R-16 for the common case: a departure no longer settles a casualty pair, because an engaged Unicorn stays) | MSW | Ruled and implemented. **Addendum (MSW 2026-11-08): a lone Unicorn with no Woman turns indifferent and is no longer a member, so nobody is left and the party does not survive (game over, with a message).** |
| R-15 | When the cave is full (every tile placed), what may the party do at an unexplored exit? | MSW | **Ruled 2026-11-06: unexplored exits are no longer viable; the cave stays as it is from then on, except that an Earthquake still applies if the party enters an unexplored chamber elsewhere. FIXED: `legalActions` no longer offers such moves (B-04).** **Also (MSW): a Spell drawn with the tile pack used up cannot swap anything and is ineffective; the engine already does this (RC-HZ-S2b).** |

| ID | Question | Decider | Status |
|---|---|---|---|
| R-18 | Demon count: the pilot's selection-table diff found the engine's Demon distribution differs from the book | MSW | **Ruled (MSW 2026-11-06): the Demon is Extension Kit only; the engine is right and the book's table is wrong. Closed, no change** (a documented deviation in `rulebookSelection.test.ts`) |
| R-19 | Woman Hero: base game vs kit availability differs from the book | MSW | **Ruled (MSW 2026-11-06): the Woman Hero is in the base game; the engine is right. Closed, no change.** The Sybil is a base-game special card played only by choice, hence its add-on |
| R-20 | **Dragon-slayer scoring.** Book: "+10 per dragon killed". Engine: a member's dragon kills double its creature points once. Strongly affects the searched scores | MSW | **Ruled: follow the book, +10 per dragon killed. IMPLEMENTED 2026-11-06** (`score.ts`; RC-SC-6 now a normal test). Searched scores change; re-pin needed |

## B-01 triage (46 stuck games, `SOAK_REDRAW=1`, 109,650 games, salt 77)

| Group | Games | Cause |
|---|---|---|
| A. Pack used up | 31 | Every remaining door leads to an unplaced cell and no card is left (R-15). 18 followed a trap fall. Nothing to draw, so nothing for the rescue to swap. **Open product question: end the game or warn when the party has no legal move and the pack is empty** |
| B. Sealed with cards left | 8 | All outside the rescue's remit: first entry to a chamber laid earlier that draws an Earthquake collapsing the way back (2, pinned by `dead-end-sealed.test.ts`); a Whirlpool crossing (2, the crossing roll is not rehearsed, SC-6.3-3); a Chasm descent (1); a Carpet landing (1); a withdraw that draws a chamber (1); a retreat into a dead end during a fight (1, SC-6-8) |
| C. Sealed chamber in a fight | 7 | B-07 |

**Ruled by MSW 2026-11-06:** group A (pack used up, no legal move): no rescue and no warning, the player quits. Rescue scope: do not extend it; it stays on the fresh-draw `move` path (SC-6.3-2). B-01 is closed as accepted behaviour; `dead-end-sealed.test.ts` pins it.

## Harness gaps found and fixed (not engine bugs)

The first soak gave 8,199 violations in 14,063 games. About 98% were the harness, not the engine: it did not play the revised combat (the strangers' turn, the party's deploy/engage/redeploy steps), and its classic plan builders skipped a magic-capable ally and the empty round against a Demon or Spectre. After the fix the same size of run gives ~120, all of B-01 to B-04.

## Mark's Answers to the Questions

- R-01: misprint, implemented correctly
- R-02: follow the book, 6 is indifferent, 1-5 hostile
- R-03: book, 1-4 hostile, 5-6 friendly
- R-04: 1-2 hostile, 3-4 indifferent, 5-6 friendly - book
- R-05: a) book
- R-06: a) book
- R-07: when the last original party member is lost, the player should be prompted to select a new leader - it is this leader that is consider original after that and not an ally.
- R-08: if both cards are drawn in the same chamber, only one area destroyed. If drawn in different chambers, two areas destroyed.
- R-09: Eye of God prevents Medusa’s gaze, but doesn’t reanimate stone creatures.
- R-10: see R-07
- R-11: as recommended
- R-12: it's the last unoccupied (ie no other players in multiplayer) tunnel that the party walked through. So the code needs to look back at the party's path and find the last unoccupied tunnel the party walked through
- R-13: The Talisman needs to be worn (and not pocketed/carried) by any party member to be effective.
- R-14: As book, the player chooses a combatant where multiple party members have equal strength (including bonuses). Any party artifacts, artifacts worn by the combatant or wielded weapons are taken into account (basically normal combat bonuses apply).
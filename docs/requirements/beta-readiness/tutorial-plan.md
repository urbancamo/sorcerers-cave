# Tutorial plan: matching Peter's response

Source: [2026113-Response-to-tutorial-notes.pdf](2026113-Response-to-tutorial-notes.pdf) (Peter's answers of 2026-11-13 to
`docs/requirements/tutorial/notes-for-peter.md`). Checked against the code on `main` (2026-11-24): the engine route in
`packages/engine/src/tutorial.ts`, the coach cards in `apps/web/src/tutorial/script.ts` and `partyScript.ts`, and the coach
component `TutorialCoach.tsx`.

The code is already ahead of the notes: most of Peter's answers are built. The table says which, so only the real gaps are worked.

## Status of each answer

| # | Peter's answer | Now | Action |
|---|----------------|-----|--------|
| Q1 | The Priest fights in the Troll battle, and the numbers and outcome show the party winning by a larger margin | The Priest does fight (deployed with the Woman Hero and the Dwarf). The margin is small: party 10 + die 3 = 13 against Troll 9 (`testForceDice [3, 4]`) | **Change** (A) |
| Q2 | Show the numbers in components so the Axe's contribution is obvious | The `fight` card breaks the party's side into parts (Woman Hero 4, Dwarf 1 + Axe 3, Priest magic 2). The `won` card says only "13 to 9" | **Change** (B) |
| Q3 | Witch fight: adjust the party's roll so the party still wins, only just, against a Witch bearing the Ring | Party die 2 gives 13 against the Witch 5 + 6 + Ring 1 = 12: a win by one | Done. Pin it with a test (C) |
| Q4 | Do not teach falling down the Trap. Dwarf guides past; explore West (tunnel, exits East and North); explore North (Whirlpool); try the shallows and fall in | The route is exactly this (`TUTORIAL_ROUTE` steps 5 and 6, die forced to 1 at the shallows) | Done |
| Q5 | The first hazard is avoided (the Trap) | The `hazard` card follows the Trap and says the Dwarf guides the party past | Done |
| Q6 | Withdraw then south is two actions | Two actions | Done |
| Q7 | End mid-expedition; add a comment on the running score on leaving | The `end` card says "If the party walked out now it would score {score} points" | Done |
| Q8 | Remove the demo | No demo code or caption text remains in the tutorial or the splash/game screens | Done. Confirm no leftover files or tests (D) |

## Things a new player needs

| Peter | Now | Action |
|-------|-----|--------|
| Objective and scoring at the start, including walking back out through the Gateway: YES | Step 1 has "Welcome" and "The aim of the game" cards | Done |
| Treasure taking, giving, dropping, carrying capacity: NO | Not taught beyond what the route needs (take, pass, retake) | Done. Leave capacity for real play |
| Retreat: not in the story, but mention it in the lead-up to the Witch fight, at the end of a round if the party takes a casualty | The `retreat` card sits before the attack and says so | **Change** (E): drop "You will not need it here", which pre-announces the fight |
| Level and deck counter, after the first small-card draw: YES | `deck-counter` follows the Spectre, the first small card | Done |
| Touch and keyboard controls: NO | Not taught. The `arrows` card mentions the N, E, S, W, U, D keys in passing | Optional: keep, or trim the key names (F) |
| Help button and bug-report icon: NO | Not mentioned | Done. Keep it that way: item 1 of beta readiness removes the general Help button |

## Other feedback

| Peter | Now | Action |
|-------|-----|--------|
| The Coach never pre-announces what the next card draw will be | `script.ts` says it was written to follow this, and the brackets from Peter's script are not relayed | **Audit and fix** (G): known cases below |
| A preliminary Coach Card before Step 1 that introduces itself, explains that it can be dragged and snapped back | The `coach` card is first in `partyScript.ts`, with the drag and double-click-to-snap-back text | Done |
| Later Coach Cards rely on the tooltip over the top bar; the bar a slightly different shade | `.scv-tut-grip` has its own tint, a tooltip and a grab cursor | Done |

## Changes to make

**A. A larger margin in the Troll fight.** In `tutorial.ts`, change the forced dice for the Troll fight (now `[3, 4]`) so the
party wins decisively. Suggestion: `[5, 2]`, giving party 10 + 5 = 15 against Troll 4 + 1 + 2 = 7 (a margin of 8, from 4). Peter did
not give figures, so confirm with him. Then update: the comment above the beat, the `won` card ("13 to 9"), `tutorial.test.ts`
and any pinned totals. Check the revised-combat rules for any effect of margin on the outcome (casualties, what the loser drops)
so the on-screen result matches "a larger margin".

**B. Components on the result as well as the set-up.** The `fight` card already breaks the party's side into parts. Make the `won`
card do the same for the actual totals, for example "Woman Hero 4 + Dwarf 1 + Axe 3 + Priest 2 + die 5 = 15, against the Troll
4 + 1 surprise + die 2 = 7", so the Axe's 3 stands out. Also check what the combat window itself shows per fighter (see item 5 of
beta readiness, the combat window's font sizes): if it only shows totals, consider showing each side's parts there, with the Axe
labelled.

**C. Pin the Witch result.** Add a test that the scripted Witch fight is won by exactly 1 (party 13, Witch 12), so a rules change
cannot silently flip it to a tie or a loss.

**D. Demo leftovers.** Search `src`, `docs` and tests for demo assets, captions and a "K001" tutorial reference; remove any
dead code. `notes-for-peter.md` still describes the demo as built: add a note there that it was removed.

**E. Retreat card.** In `script.ts`, change the text to: "A word on retreat. If the party takes a casualty in a fight, it can
retreat at the end of the round instead of fighting on." Remove "You will not need it here."

**F. Keyboard keys (optional).** Peter said no to touch and keyboard controls. The `arrows` card names the keys in passing. Either
leave it or reduce it to "click an arrow".

**G. No pre-announcing the next card.** Read every card body (script.ts, partyScript.ts) and remove any sentence that says what a
coming draw, fight or event will be. Known cases:
- `gems`: "the guide needs her to carry them for the next fight" announces the Witch fight.
- `retreat`: "You will not need it here" (also fixed by E).
- `card-panel` also says "notes from the manual", which conflicts with beta-readiness item 1 (no manual). Remove that phrase.
Add a test over the script that no card contains phrases such as "next fight", "next card", "you will meet" or "ahead".

## Also affected by beta readiness

- Item 1 removes the manual and every general help entry point. The tutorial must not mention the Help button, the manual or a
  "How to Play" link (the `card-panel` card does today).
- Item 4 (Auto Wield/Wear, on by default) changes the tutorial's wield step: with it on, picking up or passing the Axe wields it
  automatically, so the `wield` card and its `setBorne` route action no longer apply. Plan: the tutorial should run with
  auto-wield **off**, so the player still learns to wield, and the setting should not change the scripted route. Confirm with
  Peter whether the tutorial should teach manual wielding, since the real game will not need it by default.

## Order of work

1. G and E (text only), then A, B and C together (engine route, card text and tests), then D.
2. Decide F and the auto-wield question with Peter.
3. Update `notes-for-peter.md` so it matches the built tutorial, or replace it with a short status.

## Progress (2026-11-24)

Done: **A** (Troll dice now `[5, 2]`: 15 to 7), **B** (the `won` card gives each side's parts; the combat window itself still shows totals only),
**C** (the Witch's 13 to 12 was already pinned in `tutorial.test.ts`), **D** (no demo code left; `notes-for-peter.md` says it was removed),
**E**, **F**, **G** (audited every card; fixed `gems`, `retreat`, `assess`, `explore-north`, `arrows`; `script.test.ts` now guards against
announcing what is coming, naming keys, and mentioning a manual or Help button). The `wield` card now says Auto Wield/Wear does this in a
real game and that the tutorial leaves it to the player (auto-wield is off in the tutorial).

Open for Peter: confirm the Troll margin (15 to 7), and whether the tutorial should keep teaching manual wielding.

**Trap dialog (2026-11-24).** The tutorial game now runs with `trapRules`, so arriving at the Trap shows the real "A trap lies in this chamber" dialog (Guided past / Fall through). The route has an `avoidTrap` beat and the Step 6 card (`trap`) asks the player to press "Guided past the trap"; later `until` cursors moved up by one.

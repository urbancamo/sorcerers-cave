# Manual test checklist: gameplay changes from the rules validation

Branch `engine-rules-validation`. Automated tests cover the rules; this list checks what a player actually sees: the wording, the buttons and the order of events. Use Test Mode (see `apps/web/OPTIONS.md`) to build the situations quickly: force dice, place areas, set the chamber contents.

Tick each box and note the date and build. "Kit" means the Extension Kit is switched on; "Revised" means the revised combat is switched on.

## A. Changes made in this session

### A1. Lone Unicorn ends the game (R-17 addendum)
- [ ] **A Woman and a Unicorn lose a fight against a Giant.** The message must name the Unicorn leaving, not only "The party is slain".
- [ ] **Medusa turns the only Woman to stone while a Unicorn is in the party.** The Unicorn leaves, the game ends, and the message explains why.
- [ ] **Woman, Unicorn and a third member.** Kill or stone the Woman. The Unicorn leaves, the game continues, and it appears as an indifferent guard.
- [ ] **Revised combat:** a Woman and Unicorn party loses a match. The Unicorn leaves at once and the combat view says so.
- [ ] **Game log and notices** show the same wording as the pop-up.

### A2. Strength Potion works for the Thief (R-23) (Kit)
- [ ] A Thief holding the Strength Potion is offered "use" in a fight. Strength rises by 2 for that fight.
- [ ] A Priest, Witch or Scholar holding the Potion is **not** offered it.
- [ ] Manual: the Potion topic lists "Man, Woman, Hero or Thief".

### A3. Surprise on one-way routes and unused doorways (R-28)
Needs strangers waiting in a chamber the party has already visited (leave one by withdrawing).
- [ ] **Magic Carpet** to a visited chamber with strangers: Attack at once shows the surprise bonus (+1) in the fight.
- [ ] **Sorcerer's teleport** to such a chamber: same.
- [ ] **Whirlpool drag** to such a chamber below: same. (Kit)
- [ ] **Chasm descent** to such a chamber: same. (Kit)
- [ ] **A doorway never used before** into a visited chamber: Attack at once gives +1. Entering by a doorway already walked through gives none.
- [ ] **Accidental trap fall** into a visited chamber: **no** surprise.
- [ ] **Testing the strangers first** forfeits the surprise, as before.
- [ ] Manual, "Surprise" topic: mentions unused doorways and the one-way routes.

### A4. The Well gives surprise (R-29) (Kit)
- [ ] Draw from the Well and get a stranger. Attack at once shows +1 surprise.
- [ ] Test the stranger first: no surprise.
- [ ] The **Bell Rope** "stir" (roll 4-6) with a stranger: **no** surprise.
- [ ] Withdraw is still blocked on the turn of a Well draw or a Bell stir.
- [ ] Manual: the Well topic mentions surprise.

### A5. Deep Pool: a Giant's extra loads cost turns (R-30)
- [ ] Giant plus others carry **6 sacks or fewer** of heavy treasure across: no delay, no message.
- [ ] **7 sacks** (for example Giant with 4, Man with 3): one extra trip. The notice "The Giant needs 2 trips ... 1 turn lost" appears, and the turn counter goes up by 1 more than usual.
- [ ] **13 sacks** with one Giant: 3 trips, 2 turns lost.
- [ ] **Two Giants** with 12 sacks: no delay.
- [ ] **No Giant:** heavy treasure still sinks into the pool as before.
- [ ] The game log line for the delay reads sensibly.
- [ ] Manual, Deep Pool topic: mentions the 150 kg trip and the turn cost.

### A6. A dead end uses up the turn (R-31)
- [ ] Try a doorway that turns out to be a dead end. The turn counter goes up by 1 and the card is placed face down.
- [ ] A **blocked** move (a wall, no doorway) does **not** use a turn.
- [ ] Healing Balm: if a member dies in a turn and the party then hits a dead end, the Balm can no longer be used on that member (the turn has moved on).
- [ ] After a Well draw or Bell stir (withdraw blocked), a dead end on the next try makes withdraw available again.
- [ ] A dead end while leaving an indifferent encounter still returns you to the same encounter (existing behaviour, check it did not change).

### A7. Who leads a group of strangers (R-32)
Use Test Mode to place mixed groups and read which reaction table is rolled.
- [ ] Priest with Witch: the **Priest** leads.
- [ ] Man with Woman: the **Man** leads regardless of draw order (swap the order and recheck).
- [ ] Ogre with Lion, Troll with Wolf: the **Ogre** and the **Troll** lead.
- [ ] Apprentice with Demon or Spectre: the **Apprentice** leads. (Kit)
- [ ] Scholar with Thief: the **Scholar** leads. (Kit)
- [ ] The leader shown in the encounter panel and in the revised combat strangers' view is the same creature.

### A8. The Thief steals one treasure (R-33) (Kit)
Set up: an area where the strangers have been tested indifferent three times (permanent indifference), treasure on the floor, and a Thief in the party.
- [ ] The party enters the pickup screen. Only the **Thief** can take treasure; other members' take buttons are absent.
- [ ] The Thief takes one treasure. The notices read "The Thief palms the ..." and "The strangers realise they have been robbed ...".
- [ ] The strangers are back in the chamber and the screen is the encounter screen. The remaining treasure is **not** takeable yet.
- [ ] **Leaving** by a doorway at once works and costs nothing more.
- [ ] **Test** or **Attack** starts a fight straight away with the strangers having surprise (−1 shown).
- [ ] Coming back later: the strangers attack on sight (the chamber is hostile for good).
- [ ] Without a Thief: the chamber is still guarded and nothing can be taken (unchanged).
- [ ] Manual, Thief topic: reads correctly.

## B. Changes made earlier on this branch

These came from earlier rulings in the register. Spot-check each once.

| Ref | Change | Check |
|---|---|---|
| R-07 / R-10 | When no original member is left (death, Desertion, Mutiny), the player picks a new leader. | [ ] The prompt appears and the chosen member is then treated as original (not shown as an ally). |
| R-09 | The Eye of God makes Medusa powerless. | [ ] Enter a Medusa chamber holding the Eye: nobody is stoned and the notice says why. |
| R-14 | Quarrel: the player chooses between equals. | [ ] A tie shows the choice screen; combat bonuses count in the totals shown. |
| R-12 | Spell takes the last unoccupied tunnel walked through, looking back along the path. | [ ] Draw a Spell with a tunnel behind you: that tunnel vanishes; chambers are untouched. |
| R-20 | Dragon-slayers score +10 per dragon killed. | [ ] Kill a dragon with one creature, leave the cave: the score breakdown shows +10. |
| R-03..R-06 | Reaction bands for Lion, Scholar, Witch, Wolf, Demon follow the book. | [ ] Force dice 1 to 6 on each and check the outcomes against the book. |
| R-15 | When every tile is placed, unexplored exits are no longer offered. | [ ] Play to the end of the large pack: no move into an unexplored exit is offered. |
| R-26 / R-27 | Classic Scroll unchanged; revised combat follows Peter's reformulated rules. | [ ] Revised Scroll: only when attacking, once per area, kept after use. |

## C. Regression sweep

After the above, play these through without stopping at problems:
- [ ] One full **base game**, classic combat, to escape.
- [ ] One full **Extension Kit** game, revised combat, to escape.
- [ ] One **Extension Kit with Sibyl** game to escape, using a Well, a Bell Rope and a Whirlpool if they appear.
- [ ] One game that **ends in a wipe-out** (check the final message and score of 0).
- [ ] Reload the page in the middle of a fight and in the middle of a pickup: the state resumes correctly.
- [ ] Open the Help panel and search for "surprise", "Thief", "Deep Pool", "Well" and "Unicorn": each finds the updated text.
- [ ] Open a pinned scenario from the scenario browser and replay it to the end: it finishes with the score shown.

## Notes
- Record failures with the game seed, party, variants and the action list (the share or export option) so the game can be replayed.
- Anything that looks wrong but matches the book is a ruling question, not a bug: add it to `docs/validation/rulings-register.md`.

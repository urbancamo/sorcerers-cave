# Tutorial: notes and questions for Peter

The tutorial is built from your *Tutorial Game Script* (all 12 steps) and plays a fixed game of the real UI. This note lists
where the engine or the screens made us depart from the script, what we need you to confirm, and what we would suggest adding.
Nothing here blocks playtesting; please play it through against your script and tell us what reads wrong.

How it works, briefly: the packs are stacked so the cave comes up exactly as your script needs; the reactions and the fight dice
(Priest friendly, Troll hostile, the two fight rolls) are scripted, so a player cannot get a different result; and the tutorial only
accepts the action it is asking for. The game is played in Test Mode, so no score is ever saved. It runs with the **Extension Kit
on** (your script uses Spectre, Trap, Earthquake and the Tomb of Kings), and the player ticks the kit switch on the new-game screen.

## Questions we need you to answer

1. **Does the Priest fight in the Troll battle?**
   Your line is `Party {4+4+d6(3)} = 11`, which leaves the Priest out (see question 2 for the two 4s).
   In the Witch fight you do count her support (+2). We deploy only the Woman-Hero and the Dwarf in the Troll fight and the Priest
   stays behind, so the total is 11 as you wrote it. If she should stand in support there, the total becomes 13 and the
   dice/totals in the script change.

2. **The "4+4" in the Troll line.**
   It only works as Woman-Hero 4, plus the Dwarf 1 + Axe 3 = 4, which is why step 8 has the Dwarf wield the Axe. A new player
   will not see that from "4+4". How would you like it explained? (The coach card currently says the party scores
   "4 + 4 plus its die".)

3. **The Witch totals do not come out as written under the current rules.**
   Your line: `Party {4+4+support(2)+surprise(1)+d6(1)} = 12` against `Witch {5+d6(6)} = 11`. Two things differ in the engine:
   - the Witch is **fighting strength 1 plus magic 4** (5 in total, but not "5 strength");
   - strangers **pick up the artefacts lying in their chamber**, so she takes the Magic Ring she guards (+1).
   With her die at 6 that is 5+6+1 = 12 against the party's 12, a **tie**. To keep your 12 against 11 we have her roll **5**
   (5+5+1 = 11). Is that acceptable, or would you rather change what she is guarding or whether she wields the Ring?

4. **The Trap needs the optional trap rule.**
   For the Dwarf to get the "fall through on purpose" choice, the game is played with `trapRules`; under the base rule a Dwarf
   just guides the party past without asking. Is the optional rule what you intend the tutorial to teach?

5. **Step 6, "What a Hazard is".**
   The first hazard is the Trap, at the end of step 5, not in step 6. We introduce *Hazard* on the first card of step 6 (right after
   the fall) and use the Earthquake in step 11 as the second example. Does that order suit you?

6. **Step 5, "Withdraw South, via the tunnel to the Gateway".**
   Withdraw returns the party one area (to the tunnel); getting to the Gateway is then a separate move south. We teach it as
   two actions: Withdraw, then south. Is that what you meant?

7. **Step 12.**
   The script ends mid-expedition, on the Earthquake line ("you cannot retrace your steps"). We close with a short card
   (explore, test strangers, fight when the odds are good, withdraw when they are not, carry the treasure home) and a Finish
   button. Do you want your Earthquake line on it as well, or something about scoring?

8. **The demo (step 1).**
   We play the first 24 moves of the best searched Extension Kit game (K001) with captions, paced at 7 seconds a move after a
   15-second opening pause. It is a different party from the tutorial's (Hero, Dwarf, Dwarf). Would you prefer a particular game or
   different captions?

## What we changed or added that your script did not say

- **Step 2** starts on the real new-game screen: the player ticks the Extension kit and adds the W-Hero and the Dwarf, with the
  budget and the base-versus-Extension difference explained. They cannot start with any other party.
- **Step 3** covers full screen, Settings, Exit/save, the Party panel and its expand arrow, then the arrows.
- **Step 4** has the player try the camera (drag, zoom), then press Continue; the view returns to the party.
- **Step 6** asks the player to use the orbit button, the level selector and the Home button.
- **Step 7** has an extra card on the Card panel before the Priest, and explains the Party and Inventory panels before the first pickup.
- **Step 10** shows how to select several fighters in the party panel and drag (or click) them into the green front-line area.
- **Step 11** asks the player to read the Witch's and the Ring's cards on the card panel before attacking.
- After the Witch fight the fighters have dropped their heavy treasure, so the player is also asked to **retake dropped treasure**, then take the Ring.

## Things a new player needs that the script does not cover (not built)

- The **objective and scoring**: what counts, and that the party must walk back out through the Gateway.
- **Treasure**: taking, giving, dropping, and carrying capacity.
- **Retreat**, and what happens when a fight goes wrong.
- The **level and deck counter** (why deeper levels draw more cards).
- **Touch and keyboard** controls on a phone or tablet.
- The Help button and the **bug-report icon** (mentioned once, early).

Tell us which of these you would add, and where in the script they should go.

## Please check the wording

All the coach-card text is ours, written from your list of things to understand. Please read it in play and correct anything
that is wrong or says the rules differently from how you would.

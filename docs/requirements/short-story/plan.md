# Short story: plan

Companion to `requirements.md`. This is the plan the story was written from: which game run, why, what the
run actually contained, the story structure chosen, and the beat sheet. The draft is `story-draft.md`, the
editor's review is `editor-notes.md`, and the finished story is `story.md`.

## 1. Choosing the game run

**Method.** The overnight search stores the best escaped games per rule set in
`packages/engine/src/fixtures/top-score-games.json` (75 games: base, kit, kit+sibyl, 25 each). I replayed
all 75 with the engine, tallied every event type, and ranked them by how many *different kinds* of
interaction each contained (special areas crossed, befriendings, fights, artefacts used, hazards survived,
a slain Sorcerer, the Lost Ruby) rather than by score alone. All 75 escape, so all have a score. I then
preferred a medium length: long enough for an arc, short enough to tell. Most of the stored games run 80 to
240 actions.

| Game | Score | Actions | Distinct interaction types | Verdict |
|---|---|---|---|---|
| base rank 1 (B001) | 380 | 239 | 20 | the richest, but twice the length: it would turn into a travelogue |
| **base rank 2 (B002)** | **366** | **110** | **16** | **chosen: dense, medium length, a clear arc** |
| kit rank 17 | 323 | 181 | 16 | strong, but needs the Extension Kit's extra rules explained |
| kit+sibyl rank 3 | 390 | 148 | 15 | good, but kit rules again |
| base rank 8 | 310 | 198 | 14 | long, with fewer set pieces |

B002 uses the base rules only, so the story needs no variant rules to make sense. It also has a shape a
story wants: a lone hero, a first companion who is lost, a betrayal that is repaired, a set-piece ambush,
and a quiet, stranger ending.

**Source:** seed 827430, picks `[4]` (a single Priest), no variants, 110 actions, 62 game turns, escaped
with a score of 366 (the stored game's search metadata is in the fixture). To re-read the run: replay it
with `replay(seed, picks, actions, variants)`; the full action and event log is reproduced in section 2.

## 2. What actually happened (the facts the story must respect)

Creature ids: Priest 4, Woman 6, W-Hero 1, Man 5, Wizard 8, Ogre 2, Giant 12, Troll 3, Dwarf 7. Level is
the first digit of the area coordinate; the cave here is four levels deep (level 1 is the top, by the
entrance).

| # | Level | What happened |
|---|---|---|
| 1-2 | 1 | The lone **Priest** steps in. A **Woman** sits in the first chamber; the Priest tests her reaction: **friendly, a 6** (the best roll). She joins. |
| 10-17 | 2 | Down a stair. A chamber with a **Troll** and a Healing Balm: the party **withdraws without testing** it. Another chamber holds the **Eye of God** and the **Charmed Flute**. The Priest **takes the Flute and leaves the Eye**. |
| 21 | 3-4 | Down another stair into a **Dragon's** chamber (silver, gold, Lotus Dust). A **Trap** fires: the party **falls to level 4** before the Dragon is troubled. |
| 22-27 | 4 | They land among a **Hero** and a **Woman** (strangers). Reaction **hostile, a 3**: the strangers have surprise (-1). The Priest and Woman **tie, then win**, and the two strangers are slain. Silver and Gems taken. |
| 28-29 | 4 | The next chamber holds a **Wizard, an Ogre and a Giant** and a **Mutiny**: the Woman **deserts**, dropping what she carried. The Priest tests the strangers: **friendly, a 6**. **Four join**: the Wizard, the Ogre, the Giant, and the Woman who had deserted. |
| 33-38 | 4 | A **W-Hero and a Man** (friendly, a 5) join, with a **Magic Sword** and a **Magic Staff**. The Priest bears the Sword, the Wizard the Staff. |
| 39-40 | 4 | A chamber of gold and silver with **Ghouls**. The party wins every duel but one: **the Woman is lost** to the Ghouls. A second **Wizard** in the chamber is friendly (5) and joins. |
| 46-49 | 4 | A **Viper Pit**. The Priest plays the **Charmed Flute**: the vipers sleep and the party crosses. |
| 50-54 | 4 | An **Earthquake** chamber with a **Dwarf and a Woman**: the party attacks with surprise and wins. |
| 55-60 | 4 | A chamber of a **Wizard, an Ogre and the Sorcerer**, with a **Magic Carpet**. The party **attacks with surprise** (Giant, Ogre, Priest and two Wizards against the Sorcerer, 30 to 18): **the Sorcerer is slain** (+30). They take the Carpet and ride it **up a stair to level 3**. |
| 64-66 | 3 | A **Giant, a Dwarf and a Man**: the first test is **indifferent (a 2)**; the second is **friendly (a 4)**. All three join. |
| 69-71 | 2 | Up a stair. A **Unicorn and a Spectre**: reaction **indifferent (a 5)**. Nothing joins. The party moves on. |
| 78-82 | 2 | A **Deep Pool** is crossed. Beyond it, the **Lost Ruby**: the Wizard **wrestles the Statue (10 against 9)** and wins. **The Ruby is taken.** |
| 84-97 | 2-1 | A **Man and a Priest** join (friendly, a 5); a **Troll** with a **Treasure Chest** joins (friendly, a 5); the Chest is opened (a 5: gold); another **Man** joins. Up the last stair to level 1. |
| 100-108 | 1 | The party finds **The Ring** and the **Talisman** (the Priest bears both). A chamber with **Medusa**: **the Magic Staff turns her gaze aside**. |
| 110 | 1 | **They exit the cave** with **14 living members** (one fallen: the Woman). Score 366. At the exit the Priest carries the Flute, Sword, Gems, Ring and Talisman; a Wizard carries the Staff and the Ruby. |

**Liberties.** The run has no dialogue, no names, and no reasons. The story invents those. It does not
contradict a single event above: every roll, every fall, every joining and every loss is as recorded.
Where the log is bare (why the Woman deserted, why the Priest left the Eye, what the Unicorn did) the story
supplies a motive that the recorded result is consistent with.

## 3. Structure

**Chosen: a three-act spine with Freytag's rise and fall, and Campbell/Vogler's journey beats as a
checklist.** For a story of two or three pages the useful part of all these formulas is the same: a hero
who wants something and lacks something, a cost, a turn, and a change that can be shown in an image.
(Vogler's twelve beats do not all fit in 1,700 words, so only the load-bearing ones are used.)

- **The want (external):** retrieve the Ruby of Calamir, stolen from the shrine the Priest keeps.
- **The lack (internal):** Aldric believes he is useless: he has no strength, and no one left to send. His
  gift, which the run proves with its string of 5s and 6s, is that people *choose* to follow him.
- **The opposing idea:** the Sorcerer, Skeldur, is a **collector who commands**. Aldric is a **gatherer who
  asks**. The story is that argument, played out in rooms.
- **Theme (stated once, near the end, and never before):** what is gathered by asking can be carried out;
  what is taken by force has to be guarded.
- **The cost:** the first companion, Wynne, is lost. The story must not let the victory pay for her.
- **The final image:** the count at the door.

| Structural beat | Where it falls in the run | Purpose |
|---|---|---|
| Ordinary world and wound | the lone Priest at the cave mouth | establish the want and the lack |
| Call and the first ally | the Woman in the first chamber (6) | the cost is created here |
| Choice that defines him | the Eye of God left, the Flute taken | his character in one act; plants the Flute |
| Crossing the threshold | the trap: falling past the Dragon | the point of no return; no way back up |
| First violence | the hostile Hero and Woman on level 4 | the hero's hands are no longer clean |
| Crisis of the central bond | the Mutiny, and the 6 that repairs it | tests the theme: asking, not forcing, wins |
| Fellowship grows | the Wizard, Ogre, Giant, W-Hero, Man | the Sword and the Staff are given to the right hands (plants the Staff) |
| The price | the Ghouls take Wynne | the midpoint of loss: the story's low note |
| Payoff 1 | the Viper Pit and the Flute | the humble tool beats the obstacle |
| The dark lord, briefly | the Sorcerer's ambush | the violent climax, kept short and unglamorous |
| Quiet echo of the loss | the Unicorn indifferent | a hush that gives the loss weight |
| The true climax | the Statue wrestled, the Ruby taken | the quest object, won by a margin of one |
| Payoff 2 | Medusa turned aside by the Staff | the second planted gun fires |
| Return, and the changed hero | the exit, the count | the final image |

**Why the Sorcerer is not the climax.** In the run the Sorcerer dies on the fourth level, with the Ruby still
two levels away; the party wins by overwhelming him (30 against 18). Making that fight the emotional climax
would be dishonest. The honest drama of the run is the opposite shape: the loud fight is short and easy,
and the quiet one, a Wizard wrestling a statue and winning by a single point, is the real test. The story
follows the run.

## 4. Characters

- **Aldric**, a Priest of the Order of the Kindled Lamp (the run's Priest: strength 2, magic 2). Gentle,
  watchful, unaccustomed to being obeyed. He changes by the end: not into a fighter, but into someone who
  knows what he is for.
- **Wynne**, the first companion (the Woman). Practical and quick, and the first to trust him. Her
  desertion at the Mutiny is a real betrayal, so her return and her death both cost something.
- **Skeldur**, the Sorcerer. Once of the Order's own wise. Seen once, briefly, which is enough: he is a
  man who *has* a carpet, a lamp, a wizard, an ogre.
- **The Wizard** (the first one, who takes the Staff and wrestles the Statue). Dry, tired, underrated.
- **The rest** (Ogre, Giant, Man, W-Hero, Dwarf, Troll) are named by kind only. Tolkien's own fellowships
  are named; a *crowd* is not, and a story of this length cannot afford fourteen names.

## 5. Setups and payoffs (Chekhov's list)

| Planted | Paid off |
|---|---|
| the Charmed Flute, taken instead of the Eye | the Viper Pit |
| the Magic Staff, given to the Wizard | Medusa's gaze |
| Aldric's belief that he is useless | the count at the door |
| the Woman's loyalty and desertion | her loss to the Ghouls; the Unicorn's indifference |
| "no one left to send" (opening line) | fourteen walk out (closing image) |
| the lamp gone dark | the Ruby, held up in the doorway |

## 6. Voice, point of view and tone

- **Third person limited** (Aldric), **past tense**, with an **omniscient narrator's long view** allowed in
  the opening paragraph only: the unhurried, slightly elevated tone of the Appendices, then close in.
- **Register:** concrete nouns, plain Anglo-Saxon verbs, similes from craft, weather and the body (never from
  other fiction), dry understatement for violence. Avoid "suddenly", stacked adjectives, and exclamation marks.
- **Tolkien material, used with a light hand:** the Elder Days, the light before the Sun, the smiths who
  made the Ruby, a Sorcerer who was once of the wise and fell to the love of command (the shape of
  Saruman and of the fallen Maiar), the Dwarf-stair feel of the deep levels. No borrowed names, no borrowed
  plot, no quotation. The mythology gives the Ruby a past and Skeldur a reason; it is not decoration.
- **Length:** target 1,500 to 1,800 words in the final story, which is about three pages. The draft may run
  longer; the edit is where it is cut.
- **Compression:** the run has 110 actions; the story is built from about fifteen of them. The rest is a
  montage sentence or nothing. The Earthquake chamber, the Troll's Chest and the second Wizard are dropped.

## 7. Editing plan

The draft is then reviewed as an editor would, in a separate pass, against this checklist:

1. **Fact check** against section 2: every roll, count, fall and loss.
2. **Cut** what does not serve the want, the cost or the theme.
3. **Clarity:** can a reader who has never played the game follow it?
4. **Show, don't tell:** especially the theme, which must be said at most once.
5. **Voice:** remove anachronism, repetition, purple patches, and mannered "Tolkien-isms".
6. **Opening and ending:** the first line makes a promise; the last image keeps it.
7. **Rhythm:** vary sentence length; check that the middle does not become a list.

The editor's notes are recorded in `editor-notes.md`, with the changes made, and the result is `story.md`.

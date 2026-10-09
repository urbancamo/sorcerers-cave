# Fighting Rules Reformulated (Draft 20261008)

*Converted from `S.C. Fighting Rules Reformulated 20261008.pdf` (Peter's Google Doc, 13 pages). The wording is Peter's and is
unchanged, including typos; only the layout has been turned into Markdown. Everything below the "work in progress"
marker is, as in the original, unfinished.*

**Objectives in order of priority:**

1. To design a single set of rules for fighting that works equally well for solitaire and multiplayer modes.
2. To ensure the rules are clear and internally consistent.
3. To ensure the design is workable in a video game.
4. To achieve this with only minimal "reinterpretation" of the as-written rules.

## Introduction

In order to approach this, we need to define fighting in terms of "player vs player" - where we understand that one player
**may** be the computer controlling a group of strangers. Procedures are specified in such a manner as to be - with a few
exceptions - largely agnostic as to which player is the computer.

## Definitions

1. **A fight** involves exactly two **parties**.

2. **A party** involved in a fight may be:
   1. A player party
   2. A stranger party
   3. A union of 2 or more parties under a single commander.
   4. A single creature involved in a Quarrel.

3. **A fight** consists of one or more **rounds**.

4. **A round** consists of zero, one, or more **matches**. {**Note:** A round of zero matches occurs if a fight is
   triggered, but one player's creatures are rendered unable to fight before the first round happens. (e.g. Scroll is
   used and destroys all the other party's creatures.}

5. **Party Roles** - In each fight there is an **attacker** party and a **defender** party. These roles do not change for
   the duration of the fight.

6. **Turns** - The first round is fought during the attacker's turn, the second in the defender's turn, and so on until
   one of the parties is wiped out or retreats, or a stalemate occurs, or both parties agree to end the fight at the end
   of a round.

7. **Strangers' Turn** - If one party is a stranger party, then the strangers "turn" is notional only. In a solitaire
   game it is always the player party's turn, and all events happen in those turns.

8. **Engaged** describes a creature that is currently assigned to a match, and is not free to be deployed elsewhere.

9. **Unengaged** is true of all creatures that are not currently assigned to a match, but are eligible to fight.
   {Note: So for example, a Spectre in the presence of Talisman is not eligible to fight. It is not engaged, neither is it
   unengaged, it is simply not taking any part in the fighting. A creature that has been put to sleep is similarly not
   eligible to fight. A creature that will not fight in the current situation is not eligible to fight ( Sybil/Unicorn )}

10. A **Quarrel Fight** is resolved by executing just one instance of the "Fighting a Match" procedure where surprise
    attack bonus = 0 and Ring bonus = 0.

## Fundamentals

### A Fight Plan

These rules are agnostic about whether the attacker and the defender are human players or not.
It is assumed that if one of the parties is a party of strangers controlled by the computer, then the stranger party has
access to a Fight Plan.

A Fight Plan is a tool that is able to provide a stranger party involved in a fight with a decision - whenever a decision
is called for that a human player would make for themselves.

These procedures are therefore not concerned with whether the strangers' Fight Plan comprises a set of pre-determined
choices that are referenced as needed, or whether the Fight Plan is a separate procedure that is called in real time to
"think" about the current game scenario before providing the required decision. All that matters is that a decision is
provided.

Consequently, hese fighting rules can reasonably aspire to be fully deterministic and unambiguous.

### Attacker's Advantages

In Sorcerer's Cave, a round is weighted towards the party that is attacking - in three ways:

1. Only a party attacking in the first round can get a first round bonus to the die roll for the advantage of surprise.
2. There exists an artefact (Scroll) that can only be used when attacking.
3. In each round of fighting, the attacker may gain a tactical advantage due to the sequence of steps:
   1. Defender Prepares Their Defense.
   2. Attacker Creates Engagement (Matches).
   3. Deployment is Finalised.

   When the number of fighting creatures on each side is **equal**, then the third step does not happen. The attacker in
   this round effectively gets to "pick targets" even though the numbers are equal.

### The Structure of a Fight

A fight is structured as follows:

1. Triggering a Fight.
2. Stranger Fight Preparations (stranger party only).
3. Each Round is Fought:
   1. Establish Round Bonuses.
   2. The Scroll Option.
   3. Defender Prepares Their Defense.
   4. Attacker Creates Engagements (Matches).
   5. Deployment is Finalised.
   6. Each Match in the Round is Fought:
      1. Calculate Effective Strength per Creature.
      2. Calculate Total Effective Strength Per Side.
      3. Roll Dice & Determine Results.
      4. Match is Resolved
   7. Wrap Up the Round.
4. Ending a Fight.

## PROCEDURE: FIGHTING

### [1] Triggering a Fight

1. A fight is triggered by one of:
   1. A player party attacks. The player party is then the attacker.
   2. A stranger party is approached and proves to be hostile. The stranger party is then the attacker.
   3. The hazard 'Quarrel" is encountered, in which case, a mini-fight occurs which follows a much simplified version of
      the fighting procedure.

### [2] Stranger Fight Preparations

IF (One of the parties is a stranger party) THEN:

- Referring to their Fight Plan, the strangers decide how to allocate between them any artefacts they possess that are
  usable in a fight (Magic Axe, Magic Sword, Magic Shield, Magic Staff, The Ring). {See Fight Plan: Procedure: Default
  Loadout.}

### [3] Each Round Is Fought

#### [Step a] Establish Round Bonuses

FOR EACH PARTY:

- Set Surprise-Attack bonus = zero.
- Set Ring bonus = zero.
- IF (This party includes a creature **bearing** The Ring) AND (Eye of God is not present in the area) THEN (Set this
  party's Ring Bonus = 1)

IF (This is the first round) AND (The attacker party has the advantage of surprise) THEN (Add 1 to the attacker's
Surprise-Attack Bonus) {See Procedure: "Determining Surprise Attack"}

#### [Step b] The Scroll Option

- IF (This **is not** the first round) AND (The attacking party is not a stranger party) AND (The attacking party includes
  a creature carrying the Scroll and able to use the Scroll) AND (Eye-of-God is not present) THEN (The attacker may choose
  to use the Scroll to destroy all enemies in this area that do not have innate magical power i.e. fighters. Invulnerable
  creatures on level 4+ are not destroyed.)

- IF (This **is** the first round) AND (The attacking party **are not** strangers) AND (The attacking party includes a
  creature carrying the Scroll and able to use the Scroll) AND (Eye-of-God is not present) THEN (The attacker may choose to
  use the Scroll to add 1 to the attacking party's surprise-attack bonus.)

The attacker is then cursed. The Scroll is not consumed. Curses are cumulative. The Scroll can not be used in any area in
which it has already been used in any previous turn. Enemies destroyed by Scroll drop anything they were carrying. Sybil
is not destroyed. An invulnerable stranger bearing the Ring on level 4+ is defeated and disappears along with the Ring.
Magic Shield does not protect from Scroll.}

#### [Step c] Defender Prepares Their Defense

- All creatures that were **already engaged** in the front line of a match at the start of this round must remain where
  they are, and may not be redeployed.
- IF (Both the attacker and the defender have **unengaged** creatures) THEN (The defender deploys unengaged creatures into
  the front line. The defender **must** attempt to deploy **at least** as many creatures as the attacker **has unengaged
  creatures**. Any creatures that are deployed in this way are in the front line, but not yet engaged in a match.)
- IF (The defender has **fewer** unengaged creatures than the attacker) THEN (All of the defender's unengaged creatures
  must deploy to the front line.)
- IF (The defender has **more** unengaged creatures than the attacker) THEN (The defender **may** keep back surplus
  creatures for later deployment in [Step e].)

#### [Step d] Attacker Creates Engagement (Matches)

- IF (The defender has **unengaged** creatures in the front line) THEN (The attacker pairs up their unengaged creatures
  against the defender front line unengaged creatures one-to-one, thereby creating one or more new **matches** of
  front-line engaged creatures. This proceeds until all of the defender's front line are **engaged** in a match, or until
  no more new **matches** are possible.)
- IF (The defender has no **unengaged** creatures in the front line) THEN (proceed to [Step e] )

#### [Step e] Deployment is Finalised

IF (One party still has **unengaged** creatures) THEN:

- That party **may** now deploy any or all of their **remaining** **unengaged** (i.e. surplus) creatures, including any
  magic-users that were disengaged from the **background** of a **previous round**. **Each** surplus creature **may be
  assigned** to any position that they are allowed to adopt - provided that the number of matches is not changed, and the
  number of creatures in the front line of any match does not exceed two.
- IF (all matches now involve two creatures fighting in the front line) AND (there are still **fighters unengaged**) THEN
  (Those fighters stay out of the fight for the duration of this round).
- IF (There are still **magic-users** **remaining** **unengaged**) THEN (Those magic-users stay out of the fight for the
  duration of this round) {Note: The party has already declined to deploy surplus magic users - they are not **obliged**
  to deploy any surplus.}

#### [Step f] Each Match in the Round is Fought

- The round is fought, match by match, until all matches have been fought. {See "Procedure: Fighting A Match"}.

#### [Step g] Wrap up the Round

- All matches in which one side has no creatures in the front line are **resolved**. All creatures that survived the match
  become **unengaged**. The match no longer exists.
- All creatures in the **background** become **unengaged**.
- All creatures still engaged **in the front line** of an **unresolved** match remain where they are.

IF (All matches are **resolved**) THEN (The fight is over, go to [4] Ending a Fight).

IF (The only remaining unresolved matches are stalemates) AND (Neither side has unengaged creatures which could be
deployed to break the stalemate) THEN ((The fight is over, go to [4] Ending a Fight).

ELSE:

- Another round is fought commencing at [Step a]).

### [4] Ending a Fight

- IF (The fight ended with a successful **retreat**) THEN ( A player party retreating from another player party may take
  two turns in a row in order to escape possible pursuit, provided that in its first turn of retreat it does not encounter
  strangers, another party, a hazard - whether or not it affects the party - the viper pit, deep pool or chasm, and does
  not stop to pick up any unguarded treasure.)

- IF (A party of strangers is **defeated**) THEN (The player party is free to continue as they wish, including looting the
  area for treasure).

- IF (A human player party is **defeated**) THEN (That player is out of the game) {Note: Unless the "Zombies" variant is
  implemented.}

- IF (One party is asleep - a **pause**) THEN (The other party must leave at the start of their next turn. They may not
  attack the sleepers, and may not take their treasure. A Thief may not steal on the way out, as the other party is only
  asleep, not indifferent.)

- IF (A **stalemate** halts the fight) THEN:
  - IF (No strangers are involved) THEN (Both parties must immediately agree to stop fighting and to divide between them
    any treasure that is on the ground.)
  - IF (A stranger party has fought a player to a standstill) THEN (The strangers remain in the area with any treasure that
    is on the ground. The player party must leave at the start of their next turn. A Thief may not steal on the way out, as
    the other party is still hostile, not indifferent.)

{Note: Example Stalemate Scenarios:

1. On level 4, two players have fought until only one match remains unresolved: The Apprentice versus a Dwarf bearing the
   The Ring. Since the Dwarf (STR 1) cannot roll higher than 8, they cannot defeat the Apprentice (STR 9), But the Dwarf
   cannot die, so a stalemate exists.

2. A player party has fought a stranger party until only one match remains unresolved: A Spectre versus a Thief bearing the
   Magic Shield. Since neither side can deal any damage to the other, a stalemate exists.

**END OF PROCEDURE: FIGHTING**

## PROCEDURE: FIGHTING A MATCH

### [Step i] Calculate Effective Strength per Creature

**Effective strength** is the strength that the creature is able to contribute to their side of the match, after
considering any applicable effects as follows:

1. Positional Effects:
   - Magic users in the background
2. Artefact Effects:
   - Eye-of-God present
   - Magic Axe borne by a creature able to bear it.
   - Magic Shield borne by a creature able to bear it.
   - Magic Staff borne by a creature able to bear it.
   - Magic Sword borne by a creature able to bear it.
   - Talisman on display
   - The Ring borne by a creature able to bear it.
3. Immaterial Creature Effects:
   - Spectre
   - Demon

### [Step ii] Calculate Total Effective Strength Per Side

Calculate each side's total effective strength (TES) by adding the effective strength of each creature engaged in the
match.

### [Step iii] Roll Dice & Calculate Result Per Side

Roll a single d6 for each side.

**Result** = ( TES) + ( Die Roll ) + (pre-determined surprise-attack bonus) + (pre-determined Ring bonus)

{Note: Surprise-attack and Ring bonuses for attacker and defender are pre-determined in [Step a] Establish Round Bonuses}

### [Step iiii] Determine Match Outcome

The possible outcomes of a match are:

1. **Stalemate**: Both side's result is zero. The match is **unresolved**.

2. **Tie**: Both side's results are numerically equal but non-zero. The match is **unresolved**.

3. **Casualty**: One side's result is higher than the other. A creature on the losing side has been killed.

(IF (The losing side in this round had 2 creatures in the front line THEN:

- IF (The losing party are strangers) THEN (The strangers consult their Fight Plan for a casualty nomination decision.)
- The losing party nominates one front-line creature to become a casualty.
- A die is rolled (+1 if the losing party has the Ring, 7 counts as 6). On 4, 5, 6, the loser gets their choice and that
  creature dies.
- The dead creature is removed from play, but the small card remains in the area for now (in case healing balm can be
  applied after the fighting is over).
- The match is **unresolved**.

ELSE IF (The losing side in this round had 1 creature in the front line) THEN:

- That creature dies and is removed from play, but the small card remains in the area for now (in case healing balm can be
  applied after the fighting is over).
- The match is **resolved**.

**END OF PROCEDURE: FIGHTING A MATCH**

## PROCEDURE: DEFAULT LOADOUT

IF (Eye of God is present in the area) THEN (All other artefacts relevant to fighting are powerless. The decision is "No
artefacts are allocated." )

**[Step 1]** IF (the Magic Sword is present) THEN (allocate it).

The Magic Sword is allocated to (in order of preference) :

1. Hero
2. Woman-Hero
3. Man
4. Woman
5. Thief

If two creatures are equally eligible, the bearer is selected randomly.
If no-one is able to bear it, then it remains on the floor.

**[Step 2]** IF (the Magic Axe is present) THEN (allocate it).

The Magic Axe is allocated to (in order of preference) :

1. Dwarf
2. Hero not bearing Magic Sword
3. Woman-Hero not bearing Magic Sword
4. Man not bearing Magic Sword
5. Woman not bearing Magic Sword
6. Thief not bearing Magic Sword

If two creatures are equally eligible, the bearer is selected randomly.
If no-one is able to bear it, then it remains on the floor.

**[Step 3]** IF (the Magic Staff is present) THEN (allocate it).

The Magic Staff is allocated to (in order of preference) :

1. Sorcerer
2. Apprentice
3. Wizard
4. Witch
5. Priest
6. Scholar

If two creatures are equally eligible, the bearer is selected randomly.
If no-one is able to bear it, then it remains on the floor.

**[Step 4]** IF (the Magic Shield is present) THEN (allocate it).

The Magic Shield is allocated to (in order of preference) :

1. Hero bearing either Magic Sword or Magic Axe
2. Woman-Hero bearing either Magic Sword or Magic Axe
3. Man bearing either Magic Sword or Magic Axe
4. Woman bearing either Magic Sword or Magic Axe
5. Thief bearing either Magic Sword or Magic Axe
6. Hero not bearing either Magic Sword or Magic Axe
7. Woman-Hero not bearing either Magic Sword or Magic Axe
8. Man not bearing either Magic Sword or Magic Axe
9. Woman not bearing either Magic Sword or Magic Axe
10. Thief not bearing either Magic Sword or Magic Axe

If two creatures are equally eligible, the bearer is selected randomly.
If no-one is able to bear it, then it remains on the floor.

**[Step 5]** IF (The Ring is present) THEN (allocate it).

The Ring is allocated by identifying each creature in the party that can bear The Ring, and first calculating for each
creature an "adjusted strength" which is calculated by taking the creature's strength and adding any bonus to strength that
the creature has acquired due to bearing Magic Sword, Magic Axe, or Magic Staff.
Then The Ring is allocated to the one with the highest **adjusted strength**. If two creatures remain equally eligible, the
bearer is chosen in preference from the list below. If two creatures of the same type remain equally eligible, the bearer
is selected randomly.

1. Sorcerer
2. Apprentice
3. Wizard
4. Hero
5. Witch
6. Woman-Hero
7. Priest
8. Man
9. Scholar
10. Woman
11. Thief
12. Dwarf

If no-one is able to bear it, then it remains on the floor.

**END OF PROCEDURE: DEFAULT LOADOUT**

## PROCEDURE: DETERMINING SURPRISE ATTACK

**(1) Stranger party attacks:**

IF (The player party approaches strangers to test reactions) AND (The strangers prove hostile) THEN (The **strangers**
**always** attack with a surprise-attack **bonus**).

**(2) Player party attacks:**

When a player party attacks immediately after entering an area containing strangers, they **may** be eligible for a
surprise-attack bonus - as follows:

IF (The party arrived by a route that is not navigable in the reverse direction) THEN (The party gets a surprise-attack
bonus).

Non reverse navigable routes include:

- Arriving by Magic Carpet.
- Arriving by Sorcerer's Teleport.
- Arriving by falling into the Whirlpool.
- Descending from The Chasm.

IF (The attacking party arrived this turn via a Trap from the area above that was **triggered deliberately**) THEN (The
attacking party gets surprise-attack **bonus**).

IF (The attacking party arrived this turn via a Trap from the area above that was **not triggered deliberately**) THEN (The
attacking party does not get **surprise-attack bonus**).

IF (The attacking party arrived this turn from a route that is navigable both ways) AND (In the time that this group of
strangers has occupied this area, no party has used that route previously - either to enter or to exit the area) THEN (The
attacking party gets a surprise-attack bonus).

ELSE:
The attacking party does not get a surprise-attack bonus.

**END OF PROCEDURE: DETERMINING SURPRISE ATTACK**

---

## !!! BELOW HERE IS WORK IN PROGRESS !!!

### STRANGERS MAKING A FIGHT PLAN

Approaching it pragmatically, maybe what we actually need is a **Fight Plan** that contains a "library" of procedures that
can be called by the stranger party whenever a fight scenario waits for any decision that would normally be made by a
human.

This conceptual "reference book" could at least contain:

1. Default Loadout procedure
2. Smart Loadout procedure
3. Dumb Deployment procedure
4. Smart Deployment procedure.
5. Choosing The Casualty procedure.

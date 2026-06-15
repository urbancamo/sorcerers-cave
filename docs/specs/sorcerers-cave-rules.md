# Rules for THE SORCERER’S CAVE

---

*Lape Trone Averno:
noctes atque dies patet atri a Ditis
sed revocare gradum rents evi rates ad auras,
hoc opus, hic labor est.*
—Vergil, Aeneid vi. 126-29

“The descent to the underworld is easy: through
day and night the door of black Dis lies open.
But to retrace your steps and escape to the upper
air—there is trouble and toil.

**A Game of Exploration, Magic, and Adventure**
Copyright © 1978 Terence Donnelly

---

### ERRATA
(NOTE: these have been applied to the values in the tables below)

1. The point value in the lower left-hand corner of the Hero card should read 10 not 5.
2. The magical power on one of the Wizard cards is given as 2, which should be 5.

---

Before beginning play, remove the blank cards and the `SIBYL` from the small pack, and put these aside for variations on the basic game.

## Introduction
IN THE HEART OF A FOREST in a faraway land is the entrance to a vast underground labyrinth, the treasure-house of an evil Sorcerer. During his long lifetime of wicked deeds this Sorcerer has gathered immense wealth: heaps of silver and gold and glittering jewels, and artifacts of wondrous power. The fame of the Sorcerer's treasure-house has spread far and wide, and many a thief and adventurer longs to carry off a portion of the bounty. To protect his hoard, the Sorcerer has made by his magic arts an ever-changing Cave of many tunnels and chambers, and filled it with all manner of pitfalls and fearsome creatures to beset those who venture within.

Yet many still come to the Cave to match wits and strength with the Sorcerer, and with the other bands of brigands found there. You can be one of these adventurers. You may enter the Cave alone or with a few companions. Within its twisting passages and echoing caverns you may find friends, and enemies too. You will encounter magic which may help or harm you; you will find treasure; and perhaps you will meet the Sorcerer himself.

May you have good luck. But heed this warning: many do not return from the perils of the Sorcerer's Cave!

## HOW TO USE THE RULES

First read the section entitled BASIC RULES. This gives you enough information to begin playing the game. As soon as an exploring party becomes involved in a fight, read the section called FIGHTS. If any other points arise which are not covered in these two sections, refer to the NOTES ON THE CARDS.

Until you have learned the basic principles of the game you are unlikely to need the rules governing PLAYER INTERACTION. These are followed by a section on OPTIONS AND VARIATIONS, which may be experimented with by experienced players.

The BASIC RULES are for a game with two to four players. Solitaire play is essentially the same; see under OPTIONS AND VARIATIONS. Any number of players may co-operate as a team in competitive or solitaire play. Young children who are not able to grasp all the rules can still enjoy helping make decisions, turning over cards, and so on.

## BASIC RULES

### Game Equipment

#### Area Cards

These cards are laid down one by one to form a map of the part of the Cave that has been explored. 

An area may be a tunnel, a chamber, or one of three special areas, the gateway, the deep pool, and the viper pit. Each area has two, three, or four doorways along the edges which may meet matching doorways on adjacent cards, or which may lead to dead ends. Some tunnels also have stairways which lead up or down to the centre of an area directly above or below.

Each area card has a directional symbol which should be in the upper left-hand (northwest) corner

#### Chamber Cards

From which cards are drawn each time an exploring party enters a chamber that has not been explored before. 

These cards are of three types:

- **Hazard cards.** These represent phenomena or events that may affect the party entering the chamber.
- **Treasure cards.** These are of two kinds: **heavy treasure**, found mainly in sacks weighing 25 kg each; and **artifacts**, which for the purposes of the game are considered weightless.
- **Creature cards.** These represent various human and inhuman beings. Certain information about each creature is given on the card: fighting strength, magical power, and the weight it can carry, if any. The original exploring parties are made up of one or more creature cards. Creatures found within the Cave may, on being approached, react in a hostile, indifferent, or friendly manner to an exploring party, according to a die roll and the reaction table of the creature being tested.

Example, Priest Card:

```
┌────────────────────────────────┐
|  Priest                     4  | ← total strength
|                                |
|           fighting strength 2  | ← fighting strength
|            magical power    2  | ← magical power
|     1 Hostile                  | ← reaction table, hostile
| 2 - 4 Indifferent              | ← reaction table, indifferent
| 5 - 6 Friendly                 | ← reaction table, friendly
|                          25KG  | ← maximum carrying weight
|     8                          | ← point value
└────────────────────────────────┘ 
```

Where only one figure appears in the upper right-hand corner, this total strength is equivalent to fighting strength.

Each treasure and creature that can be brought out of the Cave is worth a number of points, shown in the bottom left-hand corner.

#### A six-sided die

used in determining various events but not movement.

#### Four different tokens

Each represents an exploring party and to show its position on the map.

#### Plain markers of four different colours

Used to orient different levels of the Cave to one another, and to mark secret doors.

## Object of the Game

Players form exploring parties and, by turns, explore the Cave area by area until the large pack is exhausted or no one cares to go further. Play ends when all parties which are able to do so have left the Cave. The winner is the player whose party has left the Cave with the most points in creature and treasure cards. Points may also be acquired by slaying the Sorcerer.

### Making Up the Exploring Parties

Players roll the die to determine order of play. The player who has first choice of an exploring party is the last to move, and vice versa.

Each player makes up his exploring party by choosing one or more creatures from the small pack, ignoring reaction tables. Referring to the table below, a player may select available creatures with a total selection value of 6; e.g. a priest and a Woman, or a troll and two dwarves.

### BASIC RULES

#### Area Cards

I've encoded the area cards as a string, this is the key:

| Character | Meaning                             |
|-----------|-------------------------------------|
| `N`       | Exit to the North                   |
| `E`       | Exit to the East                    |
| `S`       | Exit to the South                   |
| `W`       | Exit to the West                    |
| `C`       | Chamber (if absent then a corridor) |
| `U`       | Staircase up                        |
| `D`       | Staircase Down                      |

This is the full set of cards, with the encoded string in column 1.

| Card String | Special          |
|-------------|------------------|
| `NSEWUD`    |                  |
| `NESC`      |                  |
| `NSWD`      |                  |
| `NESC`      |                  |
| `NSEWD`     |                  |
| `NSEWC`     | `TOMB OF KINGS`  |
| `NSEWC`     | `THE GREAT HALL` |
| `NSEWC`     | `DEEP POOL`      |
| `NSEWC`     |                  |
| `NSEW`      |                  |
| `NSWC`      |                  |
| `NESC`      |                  |
| `NW`        |                  |
| `NES`       |                  |
| `NEW`       |                  |
| `NSEWC`     | `VIPER PIT`      |
| `NW`        |                  |
| `NEWU`      |                  |
| `NEWD`      |                  |
| `NW`        |                  |
| `NW`        |                  |
| `NSEWU`     | `THE GATEWAY`    |
| `NESU`      |                  |
| `NESD`      |                  |
| `ESW`       |                  |
| `NSEWC`     |                  |
| `NEWC`      |                  |
| `NSWC`      |                  |
| `NED`       |                  |
| `ESWC`      |                  |
| `ESW`       |                  |
| `NS`        |                  |
| `NSD`       |                  |
| `NSEWC`     |                  |
| `NESC`      |                  |
| `NSWC`      |                  |
| `ESWC`      |                  |
| `NSEWU`     |                  |
| `ESWU`      |                  |
| `NEW`       |                  |
| `NE`        |                  |
| `EWD`       |                  |
| `NSEWC`     |                  |
| `NE`        |                  |
| `ESWD`      |                  |
| `NEWC`      |                  |
| `EW`        |                  |
| `SWD`       |                  |
| `NESW`      |                  |
| `NES`       |                  |
| `NEWC`      |                  |
| `NSWU`      |                  |
| `NESC`      |                  |
| `NSW`       |                  |
| `NSW`       |                  |
| `SW`        |                  |
| `ESWD`      |                  |
| `EW`        |                  |
| `NS`        |                  |
| `SW`        |                  |
| `NSWC`      |                  |

#### Creature Cards

**Starting Creatures**

| Type         | Magical Power | Fighting Strength | Carries (kg) | Number in Pack | Other Characteristics                                        | Selection Value | Points |
|--------------|---------------|-------------------|--------------|----------------|--------------------------------------------------------------|-----------------|--------|
| `HERO`       | —             |                   | 75           | 1              | Has charisma: adds 1 to die 6 roll when testing `STRANGERS`. | 6               | 10     |
| `WOMAN-HERO` | —             | 4                 | 50           | 1              | Has capabilities of `WOMAN` and `HERO`                       | 5               | 10     |   
| `OGRE`       | —             | 5                 | 100          | 3              | Inhuman: cannot use most artifacts                           | 5               | 5      |
| `TROLL`      | —             | 4                 | 75           | 3              | Inhuman                                                      | 4               | 4      | 
| `PRIEST`     | 2             | 2                 | 25           | 3              |                                                              | 4               | 8      | 
| `MAN`        | —             | 3                 | 50           | 6              |                                                              | 3               | 5      |
| `WOMAN`      | —             | 2                 | 25           | 3              | Befriends `UNICORN`                                          | 2               | 5      |
| `DWARF`      | —             | 1                 | 25           | 3              | Inhuman. Guides past `TRAPS`                                 | 1               | 2      |

**Cave Creatures**

| Type           | Magical Power | Fighting Strength | Carries (kg) | Number in Pack | Other Characteristics                                                              | Points |
|----------------|---------------|-------------------|--------------|----------------|------------------------------------------------------------------------------------|--------|
| `WIZARD`       | 5             | 2                 |              | 3              |                                                                                    | 15     |
| `SPECTRE`      | 5             |                   |              | 3              | Can be fought with `MAGICAL POWER` only                                            |        |
| `DRAGON`       |               | 6                 |              | 3              | Anyone who slays a `DRAGON` single-handedly adds 1 to his fighting strength        |        |
| `THE SORCEROR` | 9             | 4                 |              | 1              | `LOTUS DUST` and `EYE OF GOD` each reduce his strength by only 2                   |        |
| `OGRE`         | 0             | 5                 | 100          | 3              |                                                                                    | 5      |
| `TROLL`        | 0             | 4                 | 75           | 2              |                                                                                    | 4      |
| `UNICORN`      | 4             | 0                 | 0            | 1              | Friendly to `WOMEN`, otherwise indifferent                                         | 4      | 
| `GIANT`        | 0             | 7                 | 150          | 2              |                                                                                    | 7      | 
| `WOMAN-HERO`   | 0             | 4                 | 50           | 1              | If there is a `HERO` in your party, add 1 to the die roll when testing `STRANGERS` | 10     |

**Cave Creatures - Die Roll Results**

| Type           | Hostile | Indifferent | Friendly | 
|----------------|---------|-------------|----------|
| `WIZARD`       | 1       | 2-5         | 6        |
| `SPECTRE`      | 1-5     | 6           |          |
| `THE SORCEROR` | 1-6     |             |          |
| `OGRE`         | 1-4     | 5           | 6        |
| `TROLL`        | 1-3     | 4           | 5-6      | 
| `UNICORN`      |         |             | ✝        | 
| `GIANT`        | 1-3     | 4-5         | 6        | 
| `WOMAN HERO`   | 1-3     |             | 4-6      | 

✝- `UNICORN` is Friendly to `WOMEN` otherwise Indifferent

**Starting Creatures - Die Roll Results**

The starting creatures are part of the same small pack, so any not chosen for a party may be drawn
in the cave as `STRANGERS` and are tested by the reaction tables printed on their cards:

| Type     | Hostile | Indifferent | Friendly |
|----------|---------|-------------|----------|
| `HERO`   | 1-3     |             | 4-6      |
| `PRIEST` | 1       | 2-4         | 5-6      |
| `MAN`    | 1-2     | 3-4         | 5-6      |
| `WOMAN`  | 1-2     | 3-4         | 5-6      |
| `DWARF`  |         | 1-4         | 5-6      |

> **One pack.** There is a single small pack. A party is built only from the *starting creatures*
> subset (those with a Selection Value), but every creature — starting or cave — is one of the
> physical cards in that pack. Cards taken into a party are removed; the rest are shuffled into the
> chamber draw pile, where they are tested via the reaction tables above.

The composition of the exploring parties will change throughout the game as creatures and treasure are gained and lost. At all times the players should keep their holdings neatly arranged and open to view, each creature with whatever treasure it may be carrying, A player may redistribute treasure among the creatures of his party at the beginning or end of a turn, provided the party is not involved in a fight at the time.

After the exploring parties have been chosen, shuffle the small pack thoroughly and put it face down in a place handy to all the players.


#### Treasure Cards - Heavy Treasure

| Name     | Weight | Points | Number in Pack |
|----------|--------|--------|----------------|
| `SILVER` | 25     | 5      | 6              | 
| `GOLD`   | 25     | 10     | 6              | 
| `GEMS`   | 25     | 20     | 3              |

#### Treasure Cards - Artifacts

| Name              | Points | Weight | Description                                                                                                                                                                                           |
|-------------------|--------|--------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `MAGIC SWORD`     | 15     |        | Adds 1 to the strength of the `MAN` or `WOMAN` who bears it, 2 to that of a `HERO`. Also enables bearer to fight `SPECTRES`                                                                           |
| `MAGIC CARPET`    | 5      |        | When commanded by a `PRIEST` or `WIZARD`, will transport a party to an adjecent area in any direction (at right angles). Cannot be used to retreat. Good only once. Will not take you out of the cave |
| `LOTUS DUST`      | 5      |        | Enough to put 1 creature to sleep for 2 turns of the player who uses it. Works on `MEDUSA` but not `SPECTRES`, `GHOULES` or `ZOMBIES`. Sleeping creatures are protected by a `CURSE`                  |
| `HEALING BALM`    | 5      |        | In the hands of a `WOMAN`, `PRIEST` or `WIZARD`, will restore life to any creature just killed. Enough for one cure only                                                                              |
| `TALISMAN`        | 10     |        | Wards off `ZOMBIES` and `GHOULS` from the party displaying it. On the 4th level or deeper also wards off `SPECTRES`                                                                                   |
| `STRENGTH POTION` | 5      |        | Adds 2 to the strength of a `MAN`, `WOMAN` or `HERO` for the duration of a fight. One draught only                                                                                                    |
| `MAGIC STAFF`     | 15     |        | Increases the magical power of a `PRIEST` by 1, of a `WIZARD` by 2. In the hands of a `WIZARD` reanimates creatures turned to STONE                                                                   |
| `THE RING`        | 30     |        | When worn by a `MAN`, `WOMAN`, `PRIEST`, `WIZARD`, `HERO` or `DWARF`, adds 1 to the die rolls of your party. Also makes the bearer invicible on the 4th level or deeper                               |
|                   |        |        |                                                                                                                                                                                                       |
| `THE LOST RUBY`   | 20     |        | Set in the forehead of a colossal statue. Try to remove it at the beginning of a turn. The statue attacks with a strength of 8, and you must defeat it to win the jewel                               | 
| `CHARMED FLUTE`   | 10     |        | When played by a `MAN`, `WOMAN`, `HERO`, `PRIEST` or `WIZARD`, lulls `DRAGONS` and `VIPERS` to sleep. Also opens `SECRET DOORS`. Sleeping creatures are protected by a `CURSE`                        |
| `EYE OF GOD`      | 0      |        | A gem which renders powerless all magic in the area, and annilates `SPECTRES` and `ZOMBIES`. Having taken it up you must keep it, otherwise `CURSE` results                                           |
| `TREASURE CHEST`  | 0      | 100    | When you wish to open it, roll a die (see below).                                                                                                                                                     |
#### Special rules for `TREASURE CHEST`
Die roll results: 

| Die Roll | Result                     | Points |
|----------|----------------------------|--------|
| 1        | a `CURSE`                  | 0      |
| 2        | a `SPECTRE`, which attacks | 0      |
| 3        | `SAND`                     | 0      |
| 4        | `SILVER`                   | 20     |
| 5        | `GOLD`                     | 40     |
| 6        | `GEMS`                     | 80     |

#### Hazard Cards

| Name         | Description                                                                                                                                                                                                   | Number in Pack | 
|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| `MUTINY`     | All `ALLIES` in your party revert to the status of `STRANGERS`. They join any other `STRANGERS` in the chamber, and may be retested in the normal way                                                         | 1              | 
| `TRAP`       | Your entire party goes to the area one level below. Any creature or treasure found in this chamber remain here. Continues in effect                                                                           | 2              | 
| `EARTHQUAKE` | The last area your party was in collapses and remains impassable. Place this card in the area affected                                                                                                        | 1              | 
| `GHOULS`     | Each creature in your party is immediately attacked by `GHOULS` with a strength of 2. They are driven off until the chamber is entered again; meanwhile your turn proceeds as usual                           | 
| `MEDUSA`     | All who catch her glance are turned to `STONE`. Whenever the party enters the area, roll a die for each creature in the party. A throw of 1 or 2 turns that creature to `STONE`. `STRANGERS` are not affected | 1              |

## Exploring the Cave

Remove the `GATEWAY` card from the large pack and place it, face up, near one end of a spacious floor. Allow enough space around it for the first level to be explored in all directions, and allow plenty of space in the rest of the room for other levels to be mapped. Place the rest of the large pack face down in a convenient spot. Put the tokens representing the exploring parties on the gateway card. The parties are now just under the surface of the earth, on the highest level of a labyrinth that may have many deeper levels.

Play proceeds by turns. Basically it takes one turn to explore one area. But a variety of things may happen in one turn. In the following discussion, any event or decision which marks the end of a player’s turn will be indicated thus: (*).

To explore an area, a player announces through which doorway his party intends to leave the area it is now in. He then draws the top card from the large pack and puts it in place next to the area his party is in. If his chosen doorway leads to a dead end on the new card, he places the card face down and leaves his party where it is (*). (Later a party may be able to enter this area from another direction, at which time it is turned face up.)

But if his chosen doorway matches a doorway in the new arca, the player leaves the card face up and moves his token onto it. If the new area is a tunnel (*), the party can explore any of its doorways or stairways on the following turn. If it is the viper pit or deep pool, the player leaves his token just inside the doorway (*) and may proceed across the barrier and through another doorway on the following turn.

If the new area is a chamber, the player draws one or more cards from the small pack, and his turn continues as described in Entering a Chamber, below.

At any time a party may move through areas that have already been explored, at the rate of one area per turn. If it enters a chamber that has been previously explored no more small cards are drawn, but any hazards, creatures, or treasure remaining in the chamber must be dealt with in the usual way.

Occasionally it may happen that a player or players meet nothing but dead ends wherever they turn, and cannot continue exploring. If all available doorways and stairways have been tried, the last area card played to make a dead end may in the same turn be put back into the middle of the pack, and another one drawn, until a way is found. This course cannot be followed when there is any other means of continuing the exploration, however time-consuming, difficult, or dangerous.

### Entering a Chamber

The player whose party first enters a chamber must draw from the small pack. If the chamber is on the first level he draws one card; if it is on the second level he draws two; if on the third level three; and if on the fourth or any deeper level he draws four. He shows these cards to all the players, and places them on the area card.

If he has drawn a hazard card which affects his party, he must immediately act on its instructions.

If he has drawn unguarded treasure cards, he may pick them up and distribute them among members of his exploring party, taking care that no creature is given more heavy treasure than it will carry (*).

If he has drawn any creatures (which we call `STRANGERS` as long as they are not attached to an exploring party), he may not for the moment pick up any treasure in the chamber, and his turn continues as follows.

### Encountering Strangers

When a party has entered a chamber containing strangers, it must in the same turn adopt one of the following three courses of action.

1. If the way is open, withdraw from the chamber by the way it came in. The strangers remain in the chamber, along with any treasure found there (*).
2. Attack the strangers, and fight one round (*). (See FIGHTS.)
3. Approach the strangers to test their reaction. Determine which of the strangers is the leader of the group according to priority in this list:

`SPECTRE`, `DRAGON`, `WIZARD`, `HERO` or `WOMAN-HERO`, `PRIEST`, `MAN` or `WOMAN`, `GIANT`,
`OGRE`, `TROLL`, `DWARF`

(that is, `SPECTRE`, `DRAGON`, `HUMANS` in order of strength, `IHUMANS` in order of strength)

The other strangers will react in the same way as the leader. Roll a die and consult the leader’s reaction table. Note that a bonus-on this die roll (through having a hero or the ring) does not apply to a score of 1, which will always cause potentially unfriendly strangers to attack.

If the strangers are hostile, they immediately attack the exploring party, and one round is fought (*). If the party subsequently retreats, the strangers remain hostile to it for the rest of the game; however, they may still be approached by other parties.

If the strangers are indifferent (*), in its next turn the party may test them again, or attack them, or leave the chamber by any doorway without picking up any treasure found there. If the party chooses to remain in the chamber, or finds itself delayed by a dead end, or if at any time it re-enters the chamber, it must in the same turn either test the strangers again or attack them. Meanwhile other parties entering the chamber have the usual options.

If the strangers prove friendly, the player immediately adds them to his party as allies, and may take any treasure found in the chamber (*).

###  Starting a New Level

The Cave may have any number of levels, or floors, extending down from the first level. 

When a party descends a stairway, or falls down a trap, or moves down by magic carpet, it goes to the approximate centre of an area directly underneath, and one level down. The new area card is placed on another part of the playing surface, preferably in line with the card representing the area directly above it, and plain markers of one colour are placed on the two cards to show the relationship between them. As the game goes on, several connections between the two levels, and connections with yet deeper levels, may be established. At all times the players should keep the area cards neatly arranged so that the orientation of different levels to one another is clear. 

Movement upwards from lower levels is dealt with in the same way. Any stairway leading up from the first level is an exit from the Cave. Once a party leaves the Cave by one of these stairways, it may not return.

### Secret Doors
More often than not, a stairway will lead to an area on which no corresponding stairway is pictured. In such a case, one end of the stairway is considered to be concealed by a secret door.

When a player explores such a stairway, marking the two levels as usual with plain markers of his colour, the marker at the hidden entrance to the stairway will show that the player has knowledge of the secret door, and may use it to retrace their steps. No other party may use this secret door, unless it has also explored the stairway from its visible end, or has been shown the secret door by a knowledgeable party in the same area, or is in the area when another party uses the door, or has the ability to find secret doors with the charmed flute. Every player who discovers a secret door should mark it with his colour.

The charmed flute will discover any secret door, even if it has never been explored, as long as the stairway it leads to is visible among the area cards that have been played.

### Curse
A party under a curse subtracts 1 from all its die rolls. Multiple curses have a cumulative effect. A curse has no effect if the Sorcerer is dead.

### Note on die scores 
Additions to and subtractions from die rolls are accumulated: thus a hero with the ring will add 2 to his score when testing strangers. Except in fights, a die score of less than 1 equals 1, and a score of more than 6 equals 6.

Remember that, as stated before, a roll of 1 when testing strangers always counts as 1, regardless of any addition that would normally be made.

### Ending and Scoring the Game
A player is out of the game when all creatures in his exploring party are dead, or when there is no possibility of the party’s getting out of the Cave.

Players whose parties succeed in leaving the Cave receive points for all cards they hold.(Note that magic carpet, lotus dust, strength potion, and healing balm are discarded once used.) Dragon-slayers have double value. A player whose party has killed the Sorcerer receives a bonus of 30 points (divided equally if two or more parties combined against the Sorcerer). A player whose party is under a curse deducts 30 points from his score.

## FIGHTS
A fight occurs when an exploring party attacks or is attacked by strangers or another exploring party. Only fights with strangers will be discussed here; guidelines for fights between parties are given in the PLAYER INTERACTION section.

A fight may last one or more rounds, each round ending a turn of play. The fight will continue until all the strangers or all of the exploring party have been killed or put to sleep, or until the party chooses to retreat and does so successfully.

### Setting up the Fight
Take all the cards involved and lay them out on an open part of the floor. Any members of the exploring party. who are to fight hand-to-hand must drop any heavy treasure they are carrying(this is left on the area card until the issue is decided), but they may continue to carry artefacts. Strangers will use the ring, magic staff, and magic sword to best advantage, but not lotus dust or strength potion.

The player involved in the fight lays out the stranger cards in a line, and then pairs off his own fighting creatures against them. If the party is numerically larger than the group of strangers, the player may send two against one. If the group of strangers is larger, the player must send one against two; if he is still unable to engage all the strangers, he must fight the strongest. 

**Priests and wizards** can either fight hand-to-hand, using their total strength, or remain in the background, adding their magical power to the fighting strength of a creature in the front line, or to the combined strength of two creatures fighting a single enemy. Any number of priests and wizards may combine their magical power against a single enemy in this way. 

Priests, wizards, and the Sorcerer among strangers will normally fight hand-to-hand, except when the over-all strength of the strangers will be improved if they remain in the background.

**Example.** A party made up of a single hero becomes involved in a fight with a priest, a troll, a man, and a dwarf. Being unable to engage all the strangers, the hero must engage the strongest combination: that is, the troll and the man fighting hand-to-hand, with the priest in the background contributing his magical power, for a total strength of 9.

 ### Advantage of Surprise
The party or group of strangers which gains the advantage of surprise in a fight adds | to all its die rolls in the first round of the fight.

A party gains the advantage of surprise over strangers when attacking immediately after coming into the chamber by a doorway or stairway that has not been used before, or when arriving by magic carpet. There is no advantage when the party has fallen down a trap, unless it has done so deliberately.

Strangers gain the advantage when they attack on being approached.

### A Round of Fighting
Each pairing-off or match is resolved separately..A die is rolled for each side, with that side’s total strength (together with any bonus for advantage of surprise, the ring, etc.) being added to the score. The side with the higher score wins that match, and the opponent (or one of them, if there are two) is slain. If the score is tied, no one is slain in that match. After each match has been resolved in this way, one round of fighting is completed, and the turn ends.

**Example.** A party comprising a hero with the magic sword, a woman, a dwarf, and a priest has approached an ogre anda troll, and found them hostile. The player may set up the fight thus:

```
           ogre (5)                  troll (4)
      hero & sword (5-/-2)     woman (2) dwarf (1)
                                     priest (2)
```

The strength of each creature is shown in brackets. Only the magical power of the priest is shown, as he remains in the background using his power to support the woman and the dwarf. Note that he could have been placed alongside the hero, where he would have used his total strength of 4 against the ogre.

There are two matches taking place. In the first, the player rolls 3 for the ogre and 4 for the hero. Since the strangers have the advantage of surprise, the ogre’s total score is 3+5+1=—9. The hero’s score is 4-+5+2=11; so the ogre is slain. In the other match, the player rolls 5 for the troll and 3 for his own side. The troll’s score is 5+-4-+1=-10; the player’s score is 3-+-2+2+1=8; so the player loses that match, and one of his creatures is slain. The priest, being in the background, is not vulnerable; therefore either the woman or the dwarf must perish. The player states which he prefers to remove from play; he then rolls a die and if the score is 4, 5, or 6 he gets his preference.

When a round of fighting has been completed, on his next turn the player may choose to have his party retreat (see below) or continue fighting. If he chooses to go on fighting, he may shift forces which are not engaged hand-to-hand. (In the example, the hero could turn to fight alongside the survivor of the other match, or the priest could be put into the front line.)

### Retreat 
A party may retreat by any doorway or stairway. However, if the way proves to be blocked by a dead end or by creatures from whom the player wishes to withdraw, the party must return and fight another round in the same turn.

Note that retreat is not the same as withdrawal. A party withdraws from creatures it does not wish to attack or approach, and must withdraw in the same turn and by the same doorway or stairway by which it entered the chamber. A party retreats after at least one round has been fought, and may leave the area by any available doorway or stairway.

A party which retreats must leave behind any treasure dropped in the area, including artefacts that were being carried by creatures who have perished.

## NOTES ON THE CARDS

### Special Area Cards

#### Viper Pit
On first turning the card over you move your token onto it, but not onto the narrow ledge. On the following turn you may either go back to the area you were last in or cross one segment of the narrow ledge and, if you wish, try to leave by that doorway. To cross another segment and proceed through that doorway requires another turn.

Any treasure carried by a creature who falls off the ledge remains in the pit, and is recoverable only by a party with the charmed flute. Treasure may be deliberately cast into the pit. 

A stairway or trap leading to the viper pit comes out ona safe island in the middle.

#### Deep pool
On first turning the card over you move your token onto it, but not across the water. On the following turn you may either move back to the area you were last in or cross the water and proceed through any doorway. If a giant has to carry across more than one load of heavy treasure there is a delay of one turn per additional load before the party can proceed. 

Heavy treasure that has to be left behind is left in the doorway. Treasure may be deliberately cast into the pool, and is recoverable only by a giant.

A stairway or trap leading to the deep pool comes out on an island in the middle. Treasure may be left on this island.

#### The Great Hall
Draw 2 extra small cards.

#### Tomb of Kings
Draw 1 extra small card.

### Hazard Cards
When two or more different hazard cards are drawn in the same chamber, they are dealt with in the order in which they are listed here, and before any other cards in the chamber are dealt with. 

#### Earthquake
If two earthquake cards are drawn together, the last two areas your party was in are destroyed. Any small cards in a destroyed area, including exploring parties represented by tokens, are permanently removed from play.

#### Medusa
She only attacks parties actually entering the chamber, not those delayed by dead ends or by strangers. Her victims cannot be moved, but anything they were carrying can be taken from them at the end of the turn, provided the party is not involved in a fight at the time.

#### Ghouls
A round of battle is fought in the normal way, each creature in the party being matched against ghouls with a total strength of 2. There is no advantage of surprise on either side. Any members of the party killed in the fight are removed from play and the turn continues. All heavy treasure must be dropped; this may be picked up at the end of the turn, provided the party is not involved in a fight with other creatures at the time. Like Medusa, ghouls will not attack the party again unless it actually leaves the chamber and comes back again.

#### Mutiny
The mutineers immediately join forces with any strangers in the chamber, and the mutiny card is discarded. You have the same options as with any group of strangers. If your party consists entirely of allies, all original members having been lost before the mutiny, one ally of your choice will remain loyal to your cause.

#### Trap
A party which falls down a trap ignores any treasure or creature cards found with it, but proceeds normally with the turn in the area below, drawing more small cards if this is a newly-discovered chamber. A party which includes a dwarf may ignore a trap, but not two traps drawn in the same chamber. If a party guided by a dwarf becomes involved in a fight in a chamber where there is a trap, and the dwarf is killed, the party falls down the trap as soon as it tries to leave the chamber.

### Treasure Cards

#### Charmed flute
Dragons and vipers will be lulled to sleep immediately, and remain asleep as long as the party is in the area. The flute-player may fight in the same turn. A dragon may be put to sleep before strangers are approached, so that a friendlier creature will be their leader. A creature involved in a fight cannot use the flute to find a secret door to retreat by.

#### Healing balm
It may be applied only at the beginning of a turn in which the party is not involved in a fight.

#### Lost ruby
If a party has aroused the statue and then retreated, the statue attacks any party which later enters the area.

#### Lotus dust
It may be used before approaching strangers, or before any round of fighting. Magic carpet. It will transport the party one level directly up or down, or to a card adjacent along an edge. A new area card may be placed if necessary. If the party encounters strangers it may not withdraw. If it is transported to the viper pit or deep pool the party ends up on the island.

#### Magic staff
Medusa cannot harm a wizard bearing the staff.

#### Eye of God
Priests, wizards, and all other artefacts are powerless when this gem is in the same area (priests and wizards retain fighting strength); spectres and zombies are permanently destroyed. The statue bearing the lost ruby is powerless to attack. Once a party has taken up the Eye, the gem must be kept with the main body of the party; otherwise there is a curse on that party until the gem is again taken up by the same or another party. This applies even if the gem is left behind involuntarily, e.g., on the body of a slain creature. Note that on encountering the Eye your party is under no obligation to pick it up.

#### The Ring
The bonus value of the ring applies to all die rolls in a round of fighting, even if the bearer is slain in that round. On the fourth level or deeper the bearer fights in the normal way, but die rolls which would normally indicate his death are ignored.

#### Strength potion 
It can be taken immediately before any round of fighting.

#### Talisman
It has no warding-off power until actually taken up by an exploring party. The party possessing it may use its power to protect other parties in the same area.

#### Treasure Chest
Two or more creatures may join in carrying it. It can be opened at the beginning of any turn when the party is still in the Cave. If a spectre appears, it attacks with a magical power of 5 and the turn ends after one round of fighting. If the spectre is not defeated, it remains in the area and is hostile to all parties.

###  Creature Cards

#### Dragon 
If a creature slays a dragon single-handedly, the dragon card is inverted and put with its slayer to indicate that creature’s status as a dragon-“slayer. 1The creature may acquire greater strength by slaying more dragons.

#### Hero and woman-hero 
The presence of both in a party does not double the bonus on die rolls when testing strangers. The woman-hero has all capabilities of a woman and of a hero. Spectre. Spectres are not of flesh and blood, so they cannot be fought hand-to-hand, except by a man, woman, or hero bearing the magic sword. Priests and wizards not otherwise engaged may fight spectres, using their magical power only. In any round of a fight in which a party does not have any magical power to pit against a spectre, the strongest creature in the party must be matched against the spectre, and is automatically slain.

#### Unicorn 
If found with a woman it will remain loyal to her. Otherwise it may not be approached till other strangers in the chamber have been befriended, found indifferent, or slain. Then it will join your party if it contains a woman; otherwise it will remain indifferent, guarding any treasure in the area. A unicorn will remain allied to your party only as long as it contains a woman.

#### The Sorcerer 
An exploring party which encounters the Sorcerer may withdraw from the chamber or attack in the normal way; but it may not approach the Sorcerer or his companions to test them, as they will always be hostile.

A player who defeats the Sorcerer and his companions has the option of sparing the Sorcerer’s life, on condition that he immediately transport the party and any treasure in the chamber, by magical means, to an area of the player’s choice. This option must be taken up in the first turn after the fight is over. It cannot be done if the Eye of God is present. The Sorcerer remains in the chamber.

A party which attacks the Sorcerer and fails to defeat him falls under a curse.

##  PLAYER INTERACTION
At any time, two or more exploring parties may occupy the same area and continue to act independently. Obviously the first party to enter a chamber will have the first opportunity of befriending or fighting strangers and of picking up booty.

For beginners, it is suggested that parties in the same area not be permitted to fight one another or to combine against a common enemy, and that no party be permitted to enter an area where a fight is in progress. Once the basic rules have been mastered, however, parties may interact in the ways set out in this section.

### Trading Cards
Players whose parties are in the same area may trade any cards that they hold. The Eye of God may be traded without a curse falling on the original holder.

### Fights between Exploring Parties
A player can attack another player whose party is in the same area, unless the parties are in the viper pit, the deep pool, or any chamber containing strangers, Medusa, trap, or ghouls. A party may move into the area and attack in the same turn.

A party gains the advantage of surprise over another party only when attacking immediately after arriving in the area by another way than the one by which the defender entered the area. In other words, you cannot gain the advantage over a party which you are following.

Fights between parties are conducted in basically the same way as fights with strangers. (See FIGHTS.) The first round is fought during the attacker’s turn, the second in the defenders’s turn, and so on until one of the parties is wiped out or retreats, or both parties agree to end the fight at the end of a round. Meanwhile other players continue to take their turns as usual.

A fight between parties is set up as follows:

1. The defender lays out all his fighting creatures in a line of battle. If his party has the numerical advantage, he may deploy priests and wizards behind the line, without specifying where they will direct their magical power.
2. The attacker now deploys his fighting creatures, engaging every creature in the other’s front line if he can (sending one against two if necessary). If his party has the numerical advantage, he may deploy priests and wizards behind the line, specifying where they are to direct their power.
3. The defender now assigns the magical power of any priests or wizards he has in the background. After a round has been fought the defender may, in his turn, either retreat or fight another round.

If he chooses to continue fighting he may shift uncommitted forces. He must continue to engage each enemy creature in the front line if he can. If after doing so he still has uncommitted forces, they may attack any enemy creatures in the background. In any subsequent rounds the player whose turn it is has the same options.

It is always a player’s privilege to roll the die for his own scores, regardless of whose turn it is.

### Retreat from Another Party
A party retreating from another party may take two turns in a row in order to escape possible pursuit, provided that in its first turn of retreat it does not encounter strangers, another party, a hazard (whether or not it affects the party), the viper pit, or the deep pool, and does not stop to pick up any unguarded treasure.

### Union of Exploring Parties
At the beginning of any turn of a player involved, two or more parties in the same area may form a union under the command of one player. The commander may move the combined party only during his own turn, and only after the other players in the union have each forfeited a turn. (If attacked in the meantime, the union may defend itself.)

A partner in a union may end his involvement in it by retaking his place in the normal order of turns, unless the union is involved in a fight at the time. He may also refuse to let his party be moved during the commander’s turn. Once a union has entered an area, however, the commander has complete control over it till the end of the turn, or until any ensuing fight is over. The commander cannot deploy the union in a fight in such a way that creatures. of a subordinate partner’s party are most likely to be killed; the principle of strongest fights strongest must apply if there is any disagreement among the partners in such a case.

Two parties which wish to co-operate in fighting a common enemy, whether strangers or another party, must form a union. Two parties involved in a fight with one another can stop the fight at the end of any round and form a union to meet a common enemy.

A party which enters an area where a fight is in progress may form a union with a party involved in the fight, after forfeiting a turn and placing his party under the other’s command. Otherwise the party may not interfere in the fight, nor may it pick up any treasure in the area, nor may it pass through the area. After the fight is over it must deal with any strangers in the area in the usual way. 

If a union has gained new allies since being formed, these allies may be divided among the parties by agreement when the union is dissolved. If an agreement cannot be reached and a fight ensues, new allies will remain neutral until the fight is over, and then join the victorious party.

### Division of a Party
A player may divide his party, but he may continue to move only one part of it. He may leave creatures behind (e.g. to guard treasure) with instructions to attack other parties which enter the area, but these may not move except to retreat. They will rejoin the main party when it comesback to the area.

## OPTIONS AND VARIATIONS

### Hidden Cards

For beginners’ or co-operative play it is recommended that all cards drawn from the small pack be shown to all the players and left face up. In serious competitive play, however, each player should keep as much information as possible to himself.

Players need keep on display in their parties only their creature cards and any artifact which is being used. (It is wise to keep the talisman on display so that ghouls and spectres can be passed by without comment.) They must also show the top edges of any other treasure cards they hold.

On first drawing cards from the small pack, a player need show only hazards which affect him. If he wishes to approach strangers, the leader must be shown. If he becomes involved in a fight with strangers, they must all be shown. Other cards may be left in the area, face down, and only another party which enters the area may see what they are.

An area card which has been left face down may be examined only in the normal course of exploration, even by the player who originally drew it. A small card which has been shown to all the players in accordance with the rules is left face up, and can be examined by any player at will.

#### Zombies

If this option is to be used, any creatures which die in the course of the game are not removed from play, but are left in the appropriate area, with their top edges toward the south. If all other creature cards are left either face down or with their top edges toward the north, it will be easy to distinguish the living from the dead. Dragons and spectres do not leave corpses.

When a player's entire party has been slain he cannot win the game, but he can try to keep any other player from winning. He forfeits one turn, then the body of the last creature of his party to die is resurrected as a zombie, along with any other bodies in the area. This party of zombies is moved by the player during his turn. Whenever the party enters an area containing dead creatures, these immediately rise up and join the party. If the party enters an area containing the Sorcerer, he and any companions join the party, subject to the same rules of movement but fighting as living creatures. All other living strangers are indifferent to zombies.

Zombies cannot carry or use treasure. They will not attack strangers. They are not affected by Medusa, vipers, or ghouls, but they will fall down traps unless accompanied by a living dwarf. They will not cross water. If the Sorcerer is with them they have access to all secret doors; otherwise they have access to none.

Zombies can form a union with other zombies. They can attack or be attacked by living creatures in the normal way. They have no magical power and may fight only with normal physical strength. A zombie which is “killed” is reanimated after one full turn of the controlling player has elapsed since the end of the fight, provided the main party of zombies is still in the area.

If the Sorcerer is killed all zombies are annihilated and no more may be created.

### Solitaire Play

In solitaire play there is only one exploring party, and all rules governing turns and player interaction are ignored. Strangers which remain indifferent after three rolls of the die stay indifferent for the rest of the game. The player may set his own conditions for victory, or simply try to better previous scores.

### Elaborations

The cards and the basic rules can be used to explore any situation that imagination suggests. New dimensions may be added to characters, or new creatures, hazards, and treasures may. be created with the blank cards provided. (Use pencil, as new ideas may take some time to solidify.) Here are a few suggestions for new dimensions, creatures, and artifacts.

Damsels in distress. Any woman found in a group of strangers who are all inhuman, or in the company of the Sorcerer, is considered to be a captive of the strangers, and will be friendly to any party which slays them.


## OPTIONS AND VARIATIONS

- `CERBERUS` The three-headed dog of classical mythology. He has characteristics of a `DRAGON`, but must be slain three times before actually perishing.
- `GENIES LAMP` When you rub it, roll a die. With score of 1 a hostile `SPECTRE` appears; otherwise a friendly `SPECTRE`. On being defeated, or at the end of the fight, the genie goes back into the lamp.
- `SCROLL` On being read by any human, destroys all enemies in an area other than those with magical power. A curse on the party that uses it.
- `SIBYL` This card is provided but its use is optional. She does not guard treasure found with her, She is not affected by mutiny. She will not be the only member of a party.

### Special Scenarios
The object of the game may be altered, and certain features of the Cave may be determined beforehand. In some scenarios the acquisition of heavy treasure may not be an object; but these cards should be left in play, to preserve balance.

#### The Sorcerer's Den.
The great cavern is placed on the fourth level directly under the gateway.

Certain small cards may be placed here beforehand, and others drawn on entry to make a total of six. The object may be to reach this area and slay the Sorcerer. A good solitaire game has Orpheus(hero with charmed flute) trying to rescue Eurydice (woman in Den with the Sorcerer) and bring her to the surface.

#### The Quest
A valuable treasure, such as `THE RING` or the `TREASURE CHEST` full of gold, is put in a hard-to-get-at place, such as in the Sorcerer’s Den, or on the island in the `VIPER PIT` at the centre of the third level and guarded by a `SPECTRE`. In a competitive game, certain tasks may be assigned to each player by secret lot, with extra points awarded for the accomplishment of the tasks. These tasks might include killing a `GIANT` (10 points), reaching the 5th level (20), finding the `MAGIC SWORD`and killing a `SPECTRE` with it (25), and carrying the `LOST RUBY` to the island in the `VIPER PIT` (40).

#### The Ringbearer
A party with a selection value of 4 tries to carry the ring from the gateway to the deep pool, which is at the centre of the fourth level. This party has a head start of seven turns over a party of three `TROLLS`, whose object is to capture `THE RING` and bring it to the surface. `THE SORCEROR` and companions are indifferent to the `TROLL`-party. The game ends when either party achieves its goal. 



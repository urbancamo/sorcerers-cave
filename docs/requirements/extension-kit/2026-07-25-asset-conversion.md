# Sorcerer's Cave Kit Extension

This is an extension kit for the base game of Sorcerer's Cave that includes new area cards and small cards.

The extension kit will be an optional addition to the base game, and will need to be coded up as such.

## Initial Requirements

We need to apply asset conversion from the PDF file `sorcerers-cave-conversion-kit-extension.pdf` into separate assets of area tiles and small cards as a first step, before adding the artifacts to the game and coding up their rules in the engine.

Asset conversion was done previously for the base kit, specified in the requirements `../2026-06-12-asset-conversion.md`. This time round, to improve the conversion process, I have included a breakdown of the attributes of the cards and any special instructions in this requirements document.

Follow existing conventions for assets. Write a plan from this requirements document on how to perform this asset conversion - refer to the previous requirements and process for best practices, noting that there were issues with card orientation that needed to be addressed after the initial conversion previously - we want to avoid those issues this time around.

All work on the extension kit should be performed in the `add-extension-kit` branch.

## Area Tiles

Area tiles, when viewing orientation in landscape, starting with page 3, each tile I'll label from top-left to bottom-right for example:

Page Layout, landscape (rotate left 90 degrees)

```
+-------+
| 1 | 2 |
| 3 | 4 |
+-------+
```

| Page | Tile Number | Exits | Special       |
|------|-------------|-------|---------------|
| 3    | 1           | NE    |               |
| 3    | 2           | NES   |               |
| 3    | 3           | NE    |               |
| 3    | 4           | NES   |               |
| 4    | 1           | NESU  |               |
| 4    | 2           | NSEW  |               |
| 4    | 3           | NESD  |               |
| 4    | 4           | NEW   |               |
| 5    | 1           | NSEW  |               |
| 5    | 2           | NSEW  |               |
| 5    | 3           | NSEW  |               |
| 5    | 4           | NSEW  |               |
| 6    | 1           | NW    |               |
| 6    | 2           | NSWU  |               |
| 6    | 3           | NSEW  |               |
| 6    | 4           | NSW   |               |
| 7    | 1           | EWS   |               |
| 7    | 2           | EWSD  |               |
| 7    | 3           | ES    |               |
| 7    | 4           | SEW   |               |
| 8    | 1           | SW    |               |
| 8    | 2           | NSEW  | The Chasm     |
| 8    | 3           | SEWU  |               |
| 8    | 4           | NSEW  | The Bell Rope |
| 9    | 1           | NSEW  | The Lair      |
| 9    | 2           | NSEW  | The Whirlpool |
| 9    | 3           | NSEW  | The Gallery   |
| 9    | 4           | NSEW  | The Well      |
| 10   | 1           | EW    |               |
| 10   | 2           | EW    |               |

### The Chasm

You may go down a level but not return this way.

### The Bell Rope

Assign one party member to pull it. Use once.

| Die Roll | Outcome                                |
|----------|----------------------------------------|
| 1        | Puller disappears                      |
| 2-3      | Bell Rings                             |
| 4-6      | Draw 2 small cards and do not withdraw |

### The Lair

Draw as usual. 

### The Whirlpool

Roll die each time party crosses the shallows. 

| Die Roll | Outcome                             |
|----------|-------------------------------------|
| 1-2      | Entire party descends to area below |
| 3-6      | No change                           |

### The Gallery

All STRANGERS found here are of STONE (except SORCERER, SPECTRE or DEMON).

### The Well

You may draw 1 SMALL CARD and not WITHDRAW.

## Small Cards

Small cards are up to 8 tiles per landscape page, labelled:

```
+---------------+
| 1 | 2 | 3 | 4 |
| 5 | 6 | 7 | 8 |
+---------------+
```

Some small cards such as Dwarf, Woman and Treasure have the same
attributes as the standard game cards, unless specified otherwise.

| Page | Card | Type     | Weight/Carry | Score | Title        | Strength | Magic |
|------|------|----------|--------------|-------|--------------|----------|-------|
| 1    | 1    | Hazard   | 25           | 20    | Crypt / Gems |          |       |
| 1    | 2    | Hazard   |              |       | Desertion    |          |       |
| 1    | 3    | artifact |              |       | Elixir       |          |       |
| 1    | 4    | Treasure | 25           | 10    | Gold         |          |       |
| 1    | 5    | Creature |              |       | Apprentice   | 2        | 7     |
| 1    | 6    | Creature |              |       | Demon        |          | 6     |
| 1    | 7    | Creature | 25           | 2     | Dwarf        | 1        |       |
| 1    | 8    | Treasure | 25           | 20    | Gems         |          |       |
| 2    | 1    | Treasure | 25           | 10    | Gold         |          |       |
| 2    | 2    | artifact |              | 5     | Holy Water   |          |       |
| 2    | 3    | Creature |              | 3     | Lion         | 3        |       |
| 2    | 4    | artifact |              | 15    |              |          |       |
| 2    | 5    | Treasure | 25           | 10    | Gold         |          |       |
| 2    | 6    | Hazard   |              |       | Harpies      |          |       | 
| 2    | 7    | artifact |              |       | Idol         |          |       |
| 2    | 8    | artifact |              | 5     | Lotus Dust   |          |       |
| 3    | 1    | Hazard   |              |       | Quarrel      |          |       | 
| 3    | 2    | artifact |              |       | Scroll       |          |       |
| 3    | 3    | Treasure | 25           | 5     | Silver       |          |       |
| 3    | 4    | artifact |              |       | Spell        |          |       |
| 3    | 5    | artifact |              | 15    | Magic Shield |          |       |
| 3    | 6    | Creature | 25           | 5     | Scholar      | 2        | 1     |
| 3    | 7    | Treasure | 25           | 5     | Silver       |          |       | 
| 3    | 8    | Treasure | 25           | 5     | Silver       |          |       |
| 4    | 1    | Creature |              | 10    | Witch        | 1        | 4     |
| 4    | 2    | Creature |              | 10    | Witch        | 1        | 4     |
| 4    | 3    | Creature | 25           | 5     | Woman        | 2        |       | 
| 4    | 5    | Creature | 25           | 5     | Thief        | 2        |       |
| 4    | 6    | Creature |              | 10    | Witch        | 1        | 4     |
| 4    | 7    | Creature |              | 2     | Wolf         |          |       |

### Crypt / Gems

You may enter at the beginning of a turn and roll a die.

| Die Roll | Outcome                                    | 
|----------|--------------------------------------------|
| 1-2      | Unavoidable TRAP. Party goes to area below |
| 3-6      | Find Gems                                  |

### Desertion

Roll a die for each ALLY in your party.

| Die Roll | Outcome                                          | 
|----------|--------------------------------------------------|
| 1-2      | The ALLY disappears with any treasure it carries | 
| 3-6      | No change                                        |

### Elixir

Any creature may drink it. Roll a die.

| Die Roll | Outcome                             | 
|----------|-------------------------------------|
| 1        | Poison Kills                        | 
| 2-3      | Nothing Happens                     | 
| 4-6      | Permanently increases strength by 2 | 

### Apprentice

Uses artifacts as a WIZARD.

Will not go to the surface.

If the SORCERER is dead, APPRENTICE is always HOSTILE.

| Die Roll | Outcome                         |
|----------|---------------------------------|
| 1-5      | Hostile                         | 
| 6        | Friendly if SORCERER isn't dead |

### Demon

Appears in the area your party just left.

Can be fought with magical power only.

### Holy Water

Reanimate creature of STONE.

Destroys MEDUSA, SPECTRE or DEMON, or weakens SORCERER or APPRENTICE by 2. One use only.

### Lion

Not affects by QUARREL. Does not cary or use any artifact.

### Magic Axe

Adds 1 to the strength of a MAN, WOMAN or HERO

Adds 3 to that of a DWARF

Also enables the bearer to fight a DEMON.

### Harpies

They take all of your party's artifacts to LAIR and disappear.

If LAIR has not appeared, leave artifacts aside until it does appear. 

If you have no artifacts, or have TALISMAN, leave this here.

### Idol

Determine value at the end of the game. 10 times the die roll.

### Lotus Dust

Enough to put one creature to sleep for 2 turns of the player who uses it. Works on MEDUSA, but not GHOULS, SPECTRES or ZOMBIES.

Sleeping creatures are protected by a CURSE.

### Quarrel

The two strongest members of your party fight one round, then your turn continues as usual.

### Scroll

On being read by any HUMAN, destroys all enemies in an area other than those with Magical Power. Any party using it is CURSED.

### Spell

The last occupied tunnel your party was in is put into the middle of the pack and replaced by the next card, face down.

Any secret doors there disappear.

### Magic Shield

When carried by a MAN, WOMAN or HERO, nullifies the opponent's magical power.

Reduces the power of SORCERER or APPRENTICE by 2.

### Scholar

Uses artifacts as a PRIEST.

### Witch

Uses artifacts as a PRIEST.

### Thief

Will steal treasure from any group of indifferent STRANGERS.

Uses artifacts as a MAN.

### Wolf

Not affected by MEDUSA, QUARREL, MUTINY or DESERTION.

Does not carry or use any artifact.



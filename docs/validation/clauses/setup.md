# Setup and scoring (Consolidated Rules V2: Making up the exploring parties, Ending and scoring the game)

> Result: **no differences**. The selection table (magic, fighting strength, carries, number in the pack, selection value) is parsed from the book and matches the engine **with the Extension Kit on** — the table lists the whole roster, so Woman and Dwarf are 4 and Ogre and Troll cost 4 and 3 (`KIT_COST_OVERRIDES`, MSW ruling); the base game keeps 3 / 3 and 5 / 4. The book's own examples (a priest and a woman; a troll and two dwarves, which only fit Troll = 4) fit the base costs.
> Scoring was checked in the pilot (`rulebookScoring.test.ts`, RC-SC-1..6, R-20 dragon-slayers fixed) and the card distribution tables in `rulebookTables.test.ts`.

| ID | Clause | Status | Tests |
|---|---|---|---|
| RC-ST-1 | Select creatures to a total value of 6 | Agrees | rulebookSetup |
| RC-ST-2 | Each creature's magic, strength, carry, stock and selection value | Agrees (kit-on table) | rulebookSetup (26) |
| RC-ST-3 | Score: all cards held on leaving the Cave; none if the party does not leave; Sorcerer +30; curse −30; Dragon-slayer +10 each | Agrees | rulebookScoring |
| RC-ST-4 | Card distribution of the small pack | Agrees | rulebookTables |

# Bug Report: 20261104-curses-bug

### DateTimeStamp: *20261104T1200*

### Scenario Code: *QOKJ*

### Scenario Description

Testing Eye Of God effects with multiple curses.

### Expected Outcome

You are cursed if the EOG leaves the party inventory.
Each curse subtracts 1 from all die rolls, and (except in fights) die rolls
can not be less than 1.

### Pass/Fail: *FAIL*

### Test Outcome

In the current implementation, you are cursed for simply passing the EOG to a different party member. Also, I suspect some non-fight die rolls are not respecting the curse.

### Tester Comments

I racked up 10 curses on my party by simply moving the EOG repeatedly between 2 party members. I then checked the die rolls on:

- Ghouls = NOT OK, game reported -5 for a Woman-Hero (not -6) and also -5 for the Dwarf (not -9). Is there an artifical limit on how low a fighting outcome can go?

- Medusa = NOT OK, one of the die rolls came out as a "2".

- Elixir = OK, consistently "1".

- Whirlpool = NOT OK, one of the die rolls came out as a "2".

- Crypt = OK, consistently "1".



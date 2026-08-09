## Scenario: 20260809-QOTO-02-Navigation by Magic Carpet on same level

- Party = Hero level 1
- Queue next chamber item = Magic Carpet
- Get Carpet, Check that Hero can't use it.
- Queue next chamber = Friendly Priest
- Give Carpet to Priest
- Priest uses magic carpet to take the party “through” a Dead end

##   Expected Outcome:

1. Get Magic Carpet
2. Hero can only only drop it or give it.
3. Priest can use to fly to any adjacent area
4. Carpet remains behind.

##   Test Outcome:

   [2] Pass

   [3] Pass (options to fly NEWSD (no U because we are on 1st level)

   [4] Fail – the carpet disappeared


#   Scenario: 20260809-QOTO-03-Navigation by Magic Carpet down

- Party = Hero level 1
- Queue next chamber item = Magic Carpet
- Give Carpet to Priest
- Priest uses magic carpet to take the party down 1 level

##   Expected Outcome:

1. Get Magic Carpet
2. Priest can use to fly down
3. Carpet remains behind.

## Test Outcome:

   [1] Pass (options to fly NEWSD (no U because we are on 1st level)

   [2] Pass – flew to level 2 below

   [3] Fail – the carpet disappeared again (but – note – as with other chambers, clicking on the
   (now empty) chamber we just left displays what was found there, even after the item or
   creature has gone elsewhere....)
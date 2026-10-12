# Bug Report: 20261012 Whirlpool / No Way Forward Bug

### Game Code: *DRNP*

### DateTimeStamp: *20261012T1719*

### Scenario Description

Start from YEDA Scenario (only exit is East).
Queue Whirlpool to the East.
Queue EW tunnel to the South (dead end).
Attempt to move South.

### Expected Outcome

On 3/4/5/6 Party wades to the ledge at South.
(from where it could attempt to wade again to the East exit.)

### Pass/Fail: *FAIL*

### Test Outcome

The party stayed put at the West ledge after discovering the dead end South.

### Tester Comments

I was attempting to create dead ends all around the Whirlpool,
to see if it would let me, but before getting to the test proper,
I noticed odd behaviour with Whirlpool.
This behaviour for Whirlpool means that you can never wade twice
across the Whirlpool W>S then S>E to reach from the West ledge to the East ledge.
When both North and South turn out to be dead ends,
the No Way Forward triggers wrongly (because there is a way forward,
its just risky....)
My guess is that the game has just not picked up on "Basically like the Viper Pit".
The Viper Pit only allows traversal of one segment at a time, but this is not
stated explicitly in the Whirlpool rules, only by implication from "basically like".
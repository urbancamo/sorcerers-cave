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

## Bug Fix Info

I fixed the Whirlpool bug and committed it as 244f8a2 on fix/whirlpool-no-way-forward, branched from main. The full engine suite passes (1213 tests), and tsc is clean for both the engine and the web app. I haven't tried it in the browser or replayed DRNP.

Behaviour now:
- Dead-end attempt: trying an adjacent doorway from a Whirlpool ledge, where the tile beyond is a dead end, still rolls the crossing d6 and costs a turn.
- Roll 3-6: the party ends up on that ledge, with the dead end revealed and the doorway closed. W→S then S→E are two separate moves.
- Roll 1-2: the party is dragged down a level, and the attempt is undone (tile returned, doorway reopened).
- Rolls on new ledges: once on the new ledge, going back out the original entry doorway now rolls too.
- No false "no way forward": the Dead End stuck check now searches from the ledge the party would reach, so a Whirlpool with dead adjacent doorways is no longer reported as stuck.

Where: the wade logic is in reduce.ts, the ledge is stored as a subLocation doorway override, and the stuck-check change is in redraw.ts. The new tests are in whirlpool-wade.test.ts, and one of them fails if the stuck-check change is removed. I added SC-10.5-17 to the engine spec and a sentence to the Whirlpool entry in the manual.

This decision 5 reversal isn't recorded in docs/requirements/2026-09-30-swap-dead-end-area-card-reimplemented-v2.md, so that doc now disagrees with the code. Viper Pit and Deep Pool are unchanged, as agreed. I haven't pushed either branch.
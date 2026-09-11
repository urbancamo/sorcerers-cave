# Save and Restore Test Scenario

We want to be able to use a test scenario as part of a bug report, to enable CLAUDE to have an accurate view of 
the game state and player actions that lead to a bug.

We need the ability to be able to save and restore a test scenario, so that the test can be replayed several times.
Each test should be assigned a unique game code, using the existing mechanism. The test mode UI should have an 
option to save and restore. The save option should present the game code once saved, and the restore option should 
have an input field for the game code.

When restoring a test a copy of the game state should be made an assigned a new code. In this way we can specify the
game code as part of a bug report.

Plan this feature out and determine if this is the correct approach, and if there
there is any other useful features that may help.

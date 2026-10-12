# Bug Report: 2026-10-12-sorcerers teleport

### Game Code: *various (see Outcomes)*

### DateTimeStamp: *20261012T1117*

### Scenario Description

 - Recruit 3 wizards, move away a few tiles.
 - Queue the Sorcerer plus some artefacts.
 - Defeat the Sorcerer.

### Expected Outcome

 - You are given options - slay or spare.
 - If you spare you may take all artefacts and teleport
 - to a revealed are of your choice.
 - Points and curses are lifted if you slay.

### Pass/Fail: *Mixed*

### Test Outcome

1. Game LZPR Options presented = PASS
2. Game LZPR Teleport works = PASS
3. Game VOEI Slay option works = PASS 
4. Game RQMQ Getting curses lifted (3 curses) = FAIL

### Tester Comments

Still had 3 curses after slaying the Sorcerer.

Superbly implemented with the text descriptions, & the player choices.
The teleport VFX are too much, though (you would need an epilepsy warning!).
The little "fireworks" VFX for defeating him are just fine, no problem, but the
whole screen whitish "flash" for the teleport is not good - especially
for someone like me with light sensitivity issues....!

Could we go with something more like:

1. A firework overlaid on the scene to indicate magic is happening.
2. Fade to black.
3. Fade up from black and you are somewhere else?


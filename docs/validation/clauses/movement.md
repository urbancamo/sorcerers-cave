# Movement, dead ends and secret doors (Consolidated Rules V2: Exploring the Cave, Starting a New Level, Secret doors)

> Result: one difference (R-31, a dead end did not use up the turn), ruled 'follow Peter' and fixed. The rest is covered by the earlier Dead End rewrite and its soak (register B-01) and existing tests.

| ID | Clause | Status | Tests |
|---|---|---|---|
| RC-MV-1 | Draw a card; a dead end is placed face down and the party stays | Agrees | rulebookMovement, map.test |
| RC-MV-2 | A dead end ends the turn (*) | Agrees since R-31 | rulebookMovement |
| RC-MV-3 | A tunnel: explore any doorway next turn; Whirlpool, Viper pit, Deep pool: token stays inside the doorway, cross next turn | Agrees | whirlpool-wade, precise-locations |
| RC-MV-4 | A revisited chamber draws no small cards but its contents must be dealt with | Agrees | chamber.test |
| RC-MV-5 | Dead End rule: put the last dead-end card back mid-pack and draw again, only when nothing else can be done | Agrees by variant `forcedRedraw`; soak B-01 | dead-end-*.test, redraw.soak |
| RC-MV-6 | Stairway down or a trap: land at the centre of the area below, one level down | Agrees | map.test, reduce.test |
| RC-MV-7 | A level-1 stairway up is an exit; once out, no return | Agrees | reduce.test (SC-6.2-1/2) |
| RC-MV-8 | Secret door: a stairway with no printed partner is concealed at the far end; the flute finds any secret door on a visible stairway | Agrees | map.test (SC-6.1-13..17), flute tests |

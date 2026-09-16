# Swap Dead End Area Card

From the [Expanded Consolidated Rules PV2026.md](../../docs/other/Expanded%20Consolidated%20Rules%20PV2026.md):

*Occasionally, it may happen that a player or players meet nothing but dead ends wherever they turn, and cannot continue
exploring. If all available doorways and stairways have been tried, including those which may be reached by
backtracking, the last area card played to make a dead end may in the same turn be put back into the middle of the pack,
and another one drawn, until a way is found. This course cannot be followed when there is any other means of continuing
the exploration, however time consuming, difficult, or dangerous.*

We need to implement this in software for the solitaire game.

Write a plan for how this could be implemented. I'd like this to be an optional feature, but not
selectable by the player. This should configurable as a game setting. As it will impact the high score table,
I'll have to decide whether this should be enabled when we finally release the game to the public.


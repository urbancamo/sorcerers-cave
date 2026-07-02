We need a log of every move made in the game, both for debugging purposes and for a potential reply.
I'm not worried if it is a complete snapshot for each player move that we can then diff, or whether it
contains a series of actions and consequences. 

Use planning mode to determine the best way of implementing this. It should satisfy the following requirements:

1. For each game, persist the entire game, every player action and consequence, in the database. The format of the log
   should be designed so that it can be used by the game engine to replay a game 'move-by-move'.
2. Add a small 'debug' or 'log' icon in the HUD that then brings up a menu
   that allows the user to download the human-readable game log or a machine-readable log for debugging purposes.
3. I suspect that this can be piggybacked off the interface between the UI and the backend. You should follow
   architectural best practices to implement this so it extends naturally as the game continues to be developed.
4. The log needs to contain enough detail to be able to replay a game from scratch, like a single-step movie player,
   with the ability to move backwards and forwards through the timeline.

Write a plan before starting this work, detailing how the plan fits the requirements.
Implement this work on a branch.
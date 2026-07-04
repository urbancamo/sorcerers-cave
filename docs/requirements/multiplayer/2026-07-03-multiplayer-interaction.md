# Introduction

We need to careful define how interactions are handled within the game between multiple parties.
Out of context is communication between parties - this can be done via the existing chat mechanism.

# Requirements

This document should fully what happens in all of these scenarios:

 - multiple parties entering the cave through the Gateway.
 - a party enters into a chamber that contains one or more other parties.
 - two or more parties decide to join forces
 - two or more parties decide to fight
 - multi-party combat dynamics
 - what happens to treasure and artifacts after multi-party combat
 - entering a chamber that contains treasure or artifacts dropped by another party
 - special chamber cards - ensure dynamics for multi-parties are consistent
 - what happens when a party is fully killed or petrified
 - what happens when a party escapes to the surface

There are other permutations to consider - for example where there are multiple parties in a chamber with strangers.
For every interaction we need to fully define the UI experience that each player experiences, where events can proceed
asynchronously and where a synchronous lock is required.

For Peter's true real-time multiplayer dungeon experience some of these interactions may be quite complex and require
multiple states.

# Tasks

Create a standalone specification for multiplayer interaction in this directory: multiplayer-interaction-specification.md.

1. Fully define each interaction that can occur between two or more parties. Categorize the interaction, describe 
   the interaction in plain English then provide detailed mechanics on how the interaction proceeds in the game engine,
   and the UI as experienced by each player. Detail where asynchronous multiplayer functionality is possible and where 
   a synchronous block is required. Think hard about the player's experience in these scenarios - we want this to be 
   an engaging experience and minimise wait delays for other players to take a turn to where absolutely required.

# Reference Documentation

 - [additional-notes-from-peter.md](./additional-notes-from-peter.md)
 - [sorcerers-cave-notes-from-peter.md](./sorcerers-cave-notes-from-peter.md)
 - [2026-06-15-multiplayer-plan.md](./2026-06-15-multiplayer-plan.html)
 - [2026-06-15-multiplayer.md](./2026-06-15-multiplayer.md)
 - [the-sorcerers-cave-and-its-sequel.md](../../../docs/other/the-sorcerers-cave-and-its-sequel.md)
 - [sorcerers-cave-rules.md](../../../docs/specs/sorcerers-cave-rules.md)

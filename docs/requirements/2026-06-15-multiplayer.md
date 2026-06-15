# Multiplayer Support in The Sorcerer's Cave

We now need to plan out how to implement multiplayer play. The official rules do flesh out some of the basics of how to play multiplayer in the board game environment. We are aiming to keep the mechanics built into the online version as close as possible to the board play.

# High Level Requirements

Plan out how to implement multiplayer, given the following goals:

1. Interpret the rules and specify exactly how multiplayer interaction works according to the rules, and identify any gaps in both rules and functionality to implement the rules.
2. Make any necessary modifications to the server database structure and functions to allow for multiple players to be assigned to the same game.
3. Each player will access the game by using the unique four letter code - this will be shared outside the game.
4. Up to four players can join a game. It's up to the game creator to decide when to start the game, however once the game is started other players cannot join.
5. Each player will join using their own browser.

# Basic Functionality

The first step is to piggyback off the save/restore functionality. When a user starts a multiplayer game we should assign it a four character code. This can be shared with other players who intent to join the same game. There can be up to four players. Each player must be assigned a unique colour, so we will need to keep track of what colors have already been assigned players for that game, and only offer available colors.

We will need to track up to four players activities in the one game. Note that party selection will be made from the same pack of cards, so even party selection must be turn based. Players will take turns according to the rules.

Write an implementation plan that describes the data and systems architecture that will be used to support multiplayer games. Start with the underlying infrastructure, creating a game, providing the game code, letting other players join the game using the code and a different browser session. The implementation plan should be a self contained HTML file detailing the steps required to read a fully multiplayer game.

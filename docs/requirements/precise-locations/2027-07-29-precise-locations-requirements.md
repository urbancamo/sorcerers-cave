# Precise Locations - Requirements

Read Peter's notes on the use of precise locations for tokens on the area cards in
this document: [precise-locations-peters-notes.md](precise-locations-peters-notes.md)

NOTE: this document is written in the perspective of playing the board game variant of
The Sorcerer's Cave, so it needs interpreting in the light of the computer implementation.

In the current implementation, when a party moves into either a chamber or a tunnel their
location is displayed in the centre of the tile. Peter argues that in order to truly implement
the game rules we must implement the precise placement of a players token in order to represent
the reality of a party moving through a cave system and entering a chamber or tunnel from that 
direction.

In order to implement this you will need to analyse the current area cards and determine the correct
placement of party markers to represent a party's location on that area card.

Possibilities are:

 - North entrance (tunnel or chamber)
 - South entrance (tunnel or chamber)
 - East entrance (tunnel or chamber)
 - West entrance (tunnel or chamber)
 - Centre of the chamber (including special significance for special chambers)

We will also need to implement precise location for any dropped treasure, where there is a
significance. The most obvious one is the DEEP POOL where parties may drop treasure in the 
North, South, East or West entrance before crossing - a marker is required to represent this treasure
(colour coded to the players party color). in the entrance into which it was dropped.

Given these notes and Peter's notes, write an implementation plan that describes how you would tackle
adding this extra level of detail. You don't need to provide code snippets - this is for a designer
signoff that the implementation details match the designers intentions. You can use an HTML document
with diagrams as required.

# Requirements - Combat Revision

`DATE: 03-OCT-2026`

## Introduction

This requirements document defines a revised combat system that more faithfully implements
the rules described in [Expanded Consolidated Rules PV2026.md](../../rules/Expanded%20Consolidated%20Rules%20PV2026.md) for the board game.

The purpose is to describe how the computer version of the game should interpret the rules
and implement them for both solitaire and multiplayer combats.

## High-Level Requirements

1. Improve stranger pairing for maximum effect during a combat round.
2. Introduce the ability of strangers to use artifacts.
3. Implement the restriction for the player having to match strangers as best they can.
4. Introduce architectural components to allow alternative stranger pairing strategies.
5. Improve the UI for players so that restrictions on party member placement when pairing
   player creatures against strangers ensures that a legal formation always results.

## Combat Round Overview

A fight is structured as follows:

 - Triggering a Fight.
 - Stranger Fight Preparations (stranger party only).

Each Round is Fought:
 - The Scroll Option.
 - Defender Prepares Their Defense.
 - Attacker Creates Engagements (Matches).
 - Deployment is Finalised.

Each Match in the Round is Fought:
 - Calculate Effective Strength per Creature. 
 - Calculate Total Effective Strength Per Side.
 - Roll Dice & Determine Results. 
 - Match is Resolved
 - Wrap Up the Round.
 - Ending a Fight.

## Improved Rule Definitions

You should consult the following documents from Peter that describe more precisely how combat should
be implemented:

 - [fighting-a-match.md](../../rules/fighting-a-match.md)
 - [each-round-is-fought.md](../../rules/each-round-is-fought.md)

## Architectural Changes

The strategy by which stranger creature pairing for a combat round is decided needs to 
be *pluggable*, that is we need to be able to support multiple alternatives. This 
is due to two reasons:

1. We will be implementing different levels of stranger ability, so that new players
   can choose an easier level, for example.
2. We will be implementing a neural-network based alternative for deciding the 
   optimal pairing. This will require an external API to be called.

## Testing

Testing stranger creature pairing strategies needs to be supported at scale, so that 
alternative strategies for selection of combinations of strangers and their artifacts, and how
they line up against alternative player party members and their artifacts, 
can be tested exhaustively to confirm the capability of alternative strategies.

## Initial Steps

Given the new rules documents and these requirements, write a technical specification in this
directory to show how we would implement this, given the current state of the front end
and server code.

Surface any questions you have, any gaps in this high-level specification, and any improvements
that you can identify.

# Thoughts about converting Sorcerer\'s Cave to digital.

As you rightly say, the key decision is whether or not to stick to the
essence of the original game, in which all players see most of what is
happening, and the game proceeds on a turn by turn basis. Unfortunately,
the consequence of the turn-based approach is that in a true multiplayer
game, most players spend most of the time passively watching someone
else play. This can make the game tedious - for this reason, I
personally have always found that solitaire or solitaire co-operative
provides the best experience. I think perhaps this is why in the boxed
game Peter D. states that the multiplayer rules are \"only a
guideline\".

I have to say however, it would be very tempting to try to create a
real-time multiplayer version. I believe this would be sympathetic to
what Peter D. intended when he wrote the \"hidden cards\" rules options:

***Hidden Cards***

*For beginners\' or co-operative play it is recommended that all cards
drawn from the small pack be shown to all the players and left face up.
In serious competitive play, however, each player should keep as much
information as possible to himself.*

*Players need keep on display in their parties only their creature cards
and any artefact which is being used. (It is wise to keep the talisman
on display so that ghouls and spectres can be passed by without
comment.) They must also show the top edges of any other treasure cards
they hold.*

*On first drawing cards from the small pack, a player need show only
hazards which affect him. If he wishes to approach strangers, the leader
must be shown. If he becomes involved in a fight with strangers, they
must all be shown. Other cards may be left in the area, face down, and
only another party which enters the area may see what they arc.*

*An area card which has been left face down may be examined only in the
normal course of exploration, even by the player who originally drew it.
A small card which has been shown to all the players in accordance with
the rules is left face up, and can be examined by any player at will.*

The above (IMHO) represents a set of compromises arrived at by Peter D.
to reflect the fact that in the fantasy reality of the "story" that the
game creates, parties would actually only have vague hints of the
presence of other exploring parties -- far off noises, odours in the
draughts from passageways, fresh footprints in the dust, etc. etc\...

I am imagining a version that plays most of the time as RTS, just
dropping into turn-based for fighting. The minimum to achieve this might
be:

1.  Each player is provided just sufficient visual clues from the map of
    where other players are or have been exploring - perhaps a series of
    simple "face down" rectangles appears on the map in real time, but
    with no detail until you actually go there.

2.  Face-down status would not distinguish between areas that have been
    reconnoitred by another player, entered and looted by another
    player, or simply face-down because it was a dead-end for that
    player when approached from one direction.

3.  Players colour-coded party "pawns" would be visible, (doubled-up
    somehow visually to indicate an active union between players).

4.  A visual/audio hint could be given that a fight is occurring in an
    area occupied by one or more other players, but again, no details.

5.  A player would thus have just enough information to go looking for
    other players to trade with, to union with, or to scrap with if they
    are so inclined (and if PvP is enabled).

6.  Only during a fight would the game drop into turn-based.

I would love to play that game\... but of course real-time would not be
true to the original physical game\...

Anyway, here are some of my thoughts which might be relevant:

**The Map View.**

Here the game in the physics simulator created a poor experience when
small cards are stacked on a tile, and when tracking vertical levels.
Secret doors could be improved in a digital game - the original allows
players to know that a secret door is present, and even to know which
other players can use it, but you yourself could not use it unless you
have traversed it from the other end (or possess a magic item) - that
never made much sense to me?

**Map Movement**

Also important on the map view/interface for available actions is the -
sometimes confusing - difference between exploring/scouting a chamber
(possibly retaining an option not to enter it at all after drawing small
cards), entering a chamber (which some draws force you to do, with \'you
may not withdraw\'), traversing (leaving via a different exit, which may
also trigger encounters), and retreating from or joining a fight.

The digital game for PvP multiplayer would have to somehow implement the
rule about not chasing parties that are running from a fight. (Simpler
in turn-based - retreating party gets a free turn etc. as per the
rules). But in RTS, some kind of restriction would be needed. Perhaps a
timer kicks in that makes the retreating party\'s pawn invisible for a
period of time, allowing them a chance to get away?

**Chambers & Doorways**

I always play a house rule for new areas whereby I place my party token
initially in the entrance doorway (for all chambers, not just e.g. Viper
Pit etc.). This is why I designed the Chamber tiles to always have steps
down into the actual chamber - not just to reinforce the difference
between passageways and chambers, but also to emphasise that a party can
be located just in the doorway. I imagine this is where they \'scout\'
the chamber, draw small cards, encounter traps and hazards, and wait
before traversing (for example) the Deep Pool, or may still choose to
withdraw without encountering strangers - versus the party token being
moved into, across or around the centre of the chamber, approaching or
surprise attacking strangers, looting, traversing, or having been drawn
into the chamber by some effect.

I therefore think of withdrawal between chambers as being visually
indicated by moving the party token from the entrance steps of one
chamber, back to the centre of the previous chamber. Although on rare
occasions you might withdraw from the Deep Pool (not wanting to lose
treasure) but you arrived via (e.g) the Viper Pit, so you end up still
on the steps/entranceway of the Pit.

What I am saying really is that the map view needs to represent party
locations *precisely* - and sometimes treasure locations precisely as
well (is the treasure on the Deep Pool island, or in one of its
Doorways? Can treasure be dropped in the Viper Pit doorway, or only in
the Pit? \...etc.

**The Party Management View.**

The physics simulator worked in a clumsy way when you are arranging lots
of equipped/carried items between characters, all the while tracking
carrying capacities. Perhaps the digital game could have something more
akin to the \"slots\" of a more traditional RPG? i.e.

Person/Creature card

- Active Weapon

- Active (displayed) Artifacts

- Belt/Pouch:

  - Carried Weapons

  - Carried Artifacts

<!-- -->

- Backpack:

  - Heavy Treasure

In multiplayer you also have parties in unions, so the party management
(and the fighting view) need to retain an indication of which party each
character belongs to.

**The Fighting View.**

Again, not good in a physics simulator. A player needs to quickly and
efficiently arrange their fighting lines against the (presumably
auto-arranged enemy lines for solitaire?), or other player\'s fighting
lines.

Because of the way Peter D. wrote the Player Interaction rules only as
guidelines, there will need to be clearer rules. For example, what
exactly was meant by the phrase \"in the background\"? In the second and
subsequent rounds of PvP fighting, uncommitted forces may attack enemy
creatures \"in the background\" ( effectively \"dragging\" uncommitted
creatures into the fight)?

One of the frustrating aspects of the game for me is the requirement to
drop all heavy treasure before a fight, and then (assuming you won)
picking it all up again and distributing it amongst the victors, as well
as any new treasure. Maybe the "backpacks" idea could help, especially
when unions are involved. When a fight is initiated, each character
automatically drops their backpack -- but that game object could retain
a link to the character that dropped it - enabling them to pick it up
again quickly if they win. Perhaps a backpack belonging to a character
that is either killed or runs away would simply burst open, spilling its
contents onto the floor -- to be redistributed by the victors.

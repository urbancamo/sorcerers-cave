# What we have now

Currently, only a single party member may carry the treasure chest, if they have enough capacity.

# What we need to implement

The rules state that two or more party members may share the load of a treasure chest. We need to implement a UI
to allow party members and weight carried to be specified, together with any engine changes to support this.

# Suggested UI

in real life or in the simulator you just arrange the cards in some suitable way, and make a mental note to yourself.
Could we perhaps give each carrying creature in the party panel a small Treasure Chest card, 
but splash "SHARED" text across those cards, and leave it to the Creature card view to show in detail 
just what portion of the weight that creature is bearing? The party panel will always show remaining capacity,
so you can still easily manage that.

# Implementation

Taking the suggested UI into account, write an implementation plan on the steps required to achieve this.
Take into account how the treasure can be dropped, and any other rules relating to heavy treasure.

You can suggest a better UI implementation if you discover one.

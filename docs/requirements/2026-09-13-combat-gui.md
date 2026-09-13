# Update Combat GUI

The display of the combat GUI is inconsistent between strangers and the player in solo play. This may be masking
a bug with the optimization of stranger configuration.

I like the players display of combatants and would like to duplicate that with the strangers.

So there for each 'pairing' there is a row: 

 primary secondary magic-user

This should be reversed on the strangers side, so it looks like this:

```
Strangers                     Player
----------------------------------------------------------
magic-user secondary primary  primary secondary magic-user
```

The magic-user is the one who is currenty in the 'behind' slot.

We are currently using terms 'gangs up' and 'lends magic' for the stranger configuration, this information can be
removed with the combat display laid out (with one match per row)  as above although I think the magic-user does need a consistent label on each.

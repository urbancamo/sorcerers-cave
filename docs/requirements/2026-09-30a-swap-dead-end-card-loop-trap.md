We need to modify the logic defined in [2026-09-30-swap-dead-end-area-card-reimplemented-v2.md](2026-09-30-swap-dead-end-area-card-reimplemented-v2.md)
to take into account the following situation:

1. Player starts at the gateway.
2. Player moves N into a NS tunnel.
3. Play moves N into chamber NEW chamber. They draw the Earthquake card that cuts off the S exit.
4. Play moves W into a WN tunnel.
5. Player moves N into a NE tunnel.
6. Player moves E into a SE tunnel.
7. Player moves S into a SW tunnel.

Note that after move 7 the SW tunnel they move into connects to the chamber from turn 3. This forms a loop with
no viable exits, even though the card drawn was valid.

Check that this scenario is taken into account in the card swap specification, and if necessary propose a revision.

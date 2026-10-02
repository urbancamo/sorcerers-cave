# Dead End Area Card Swap — The Player's Walkthrough

How the "forced redraw" rule (`FORCED_REDRAW_ENABLED`) decides whether a party is stuck, explained
as if you were playing the board game by hand. Source plan:
`docs/requirements/2026-09-13-swap-dead-end-area-card-plan.md`.

## The situation

You've just tried a doorway and drawn an area card, and it doesn't fit: there is no matching door on
your side, so it's a dead end. Normally you shrug, mark that exit as unusable, and try another. The
rule asks one question first: **is there anywhere left to go at all?**

## What you check

### 1. Put the card down and cross off the exit as usual

Lay the card face-down and cross off the exit you just tried, so this tile's remaining options are
up to date for the check below.

### 2. Look only at the tile the party is standing on

There is no backtracking. Other tiles you have visited do not matter, even if they still have
untried doors: what counts is whether *this* tile has anywhere left to go.

### 3. Look at every exit or stair on this tile that you haven't crossed off

Ask what each one points at:

| The exit points at… | Counts as an option? | Why |
| --- | --- | --- |
| A tile already on the table, and the door **connects** | **No** | It is the way you came in (or another way back out), not a way forward. Working doors are never crossed off, so counting them would leave you "not stuck" forever. |
| A tile already on the table, and the door **doesn't connect** | **Yes** | You haven't tried that door yet, and trying it is free: no turn spent, no card drawn. |
| A tile already on the table that is **permanently blocked** (an earthquake-collapsed tile, or a stairway onto the Whirlpool) | **No** | Nothing to try: it can never open. |
| **Empty space**, and the pack still has cards | **Yes** | There is a card to draw for it. |
| **Empty space**, and the pack is empty | **No** | Trying it does nothing and it never gets crossed off, so you'd otherwise think you had a way forward when you don't. |

### 4. Decide

- Found at least one option on this tile: **not stuck**. It's a normal dead end and play
  continues as usual.
- Nothing left on this tile: the party is **boxed in**.

### 5. If boxed in, undo and redraw

1. Pick the new card back up and uncross the exit you just marked off.
2. Shuffle that card back into the undrawn pile at a random position.
3. Draw again for the same doorway.
4. If the new card connects, move through. If it still fails, run the check again from step 1.
5. Stop after as many tries as there were undrawn cards when you started, and accept the dead end.

## Caveats

- **Not guaranteed.** The rejected card goes back in at a random spot, so you might draw it again
  before you've cycled through everything.
- **Residual soft-lock.** If your only remaining option is a door pointing at a tile already on the
  table that doesn't connect, there is no fresh card to swap. You just cross that door off and can
  still be stuck. The printed rule doesn't cover this case either.
- **Retreating is excluded.** A failed retreat keeps its own harsher rule (another fight round) and
  never triggers a swap.
- **Solo games only, off by default.** The rule is never player-selectable and doesn't apply to
  multiplayer.

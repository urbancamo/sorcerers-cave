# Dead-End Detection (the 'area card swap) scenario

The current implementation of dead-end detection defined in [2026-09-13-swap-dead-end-area-card-plan.md](2026-09-13-swap-dead-end-area-card-plan.md)
isn't working correctly, so we will re-implement the algorithm and replace the current implementation.

This algorithm is player-specific - it has to be run based on the players current location as an input.

So for multiplayer games, the algorithm must be run once for each player.

Unless otherwise defined this algorithm applies to both solitaire and multiplayer games.

## Clarification of the Board Game Rules

From the rules: [Expanded Consolidated Rules PV2026.md](../rules/Expanded%20Consolidated%20Rules%20PV2026.md).
When a player is manually playing the board game, there is a rule that is designed to allow them to continue
exploration when their latest move results in a dead-end, and they have no other moves available to them:

_Occasionally, it may happen that a player or players meet nothing but dead ends wherever they turn, and cannot continue
exploring. If all available doorways and stairways have been tried, including those which may be reached by
backtracking, the last area card played to make a dead end may in the same turn be put back into the middle of the pack,
and another one drawn, until a way is found. This course cannot be followed when there is any other means of continuing
the exploration, however time consuming, difficult, or dangerous._

## Definition of Terms

**Area Card**: any chamber or tunnel

**Card To Be Laid**: the potential card to be laid to complete a player move turn

**Exits**: any exit from a chamber or tunnel, North, South, East or West, Up or Down

**Viable Exit**: any exit from a chamber that isn't a dead-end

**Unexplored Exit**: a valid exit that hasn't yet been explored by the player

**Earthquake Card**: when drawn this card will require a special calculation to be performed

**Trap**: traps require special handling

**Area Card Swap**: the process of returning the drawn but not laid area card back in the pack and
trying a new area card (this may happen multiple times per turn).

## New Algorithm

The new algorithm is designed to reduce the amount of computation required on each player turn by keeping track of
the number of unexplored exits available to the player. This single value allows immediate determination if the 
player is 'stuck' and the area card swap process should be triggered.

## How to Implement

There are three new functions to implement, `moveCheck`, `viableExitsCheck` and `swapAreaCard`.

This function only fires if there are any area cards available to draw from the pack.

The algorithm needs to keep track of area cards that have been checked for viable exits everytime it is called.

The algorithm proceeds with `moveCheck` before a new area card is laid. If `swapAreaCard` returns null/empty
then the originally considered area card should be laid and the player should be informed that there are no 
remaining viable exits via a modal dialog requiring close, but allowed to continue play.

### `moveCheck` function

Parameters: area card, exit direction to check.

Only returns `true` if the `Card to be Laid` results in a valid move to a new area.

The algorithm starts with the area card that the player is currently stood on. It is only triggered if the card to be 
laid does not connect to the current card in the direction of travel the player desires. 

So for example, the player is attempting to travel `East`. They draw a tunnel card that connects `North` and `South`.
As there is no `West` entrance on the `Card to be Laid` laying this card would result in a dead-end, with no move
possible. The card is still viable at this stage, unless the `viableExitsCheck` returns `false`.

Note that `Up` and `Down` directions will always result in a card that is viable, so `moveCheck` should return `true`
if the player is attempting to move `Up` or `Down` without any further processing.

### `viableExitsCheck` function

**Parameters:** the area card to check

**Returns**: A boolean. Only returns `false` if there are no possible moves the player can make in the cave area the player has access to.

This function is called if `moveCheck` returns `false`. That is, the `Card to be Laid` won't result in a move being
triggered to the new card because the attempted move isn't valid.

The algorithm this function implements is designed to fail fast. That is, as area cards are checked that connect to the 
player's current location and a valid exit is found the algorithm ends at that point returning `true`.

This function relies on another function `areaCardViableUnexploredExits`, defined below.

This is the recursive algorithm. It should _unwind_ and return as soon as `swapAreaCard` is called.

1. Starting from the current card the player is located on, run the function `areaCardViableUnExploredExits`.
2. if the array of exits returned is empty, call `swapAreaCard` with the direction of the exit (but defined as the 
   direction of entrance to the card being checked, so for example `East` -> `West`, `Up` -> `Down`).
3. if the array of exits is non-empty, for each exit in the array recursively call the function `areaCardViableUnExploredExits`

### `areaCardViableUnexploredExits`

**Parameters:** the area card to check

**Returns:** an array of exit directions for an area card of exits that have been unexplored and are viable.

Unexplored in this context means that the player hasn't made an attempt to move from the area card in that direction.

Viable in this context means that the exit doesn't have an area card laid in the direction of the exit that is a 
dead-end.

A staircase `Up` or `Down` is a viable exit, as is a trap in the floor.

If the exit being checked leads to an area card marked as `earthquake` it isn't viable.

This function should mark the area card as checked.

### `swapAreaCard` function

**Parameters:** entrance direction

**Returns:** an area card, or null/empty if one isn't available.

This function is responsible for swapping the area card to be laid.

There should be a marker defined on each area card in the pack, initial set to `false` which indicates if the 
card has been considered for swap `swapConsidered`.

The algorithm proceeds as follows:

1. If all cards in the pack are have `swapConsidered` set to `true` return `null`.
2. A random area card is selected from the area cards in the pack where `swapConsidered` is `false`.
3. The card is marked as `swapConsidered` `true`.
4. Determine if the area card entrance direction is valid.
5. If the entrance direction is valid, return this card.
6. If the entrance direction is invalid, recursively call this function.

## Test Scenarios

The following test scenarios should be implemented to check the algorithm works correctly.

### Test Scenario 1 - Valid Swap

Create a test scenario where an area card is selected for the players next turn that results in a dead-end, the player
doesn't currently have any viable exits, but that a swapped card allows the player to proceed.

Expected Outcome: the player moves to the swapped area card. This should be marked in the logs as a swap.

### Test Scenario 2 - No remaining valid swaps

Create a test scenario where the player has explored all viable exits, the next area card selected is a dead-end,
and there are no remaining area cards in the deck that allow a player to proceed.

Expected Outcome: a warning is issued to the player, the initial area card is laid.

### Test Scenario 3 - Trap provides a viable exit

Create a test scenario where the player has explored all viable exits *except* a trap. 

Expected Outcome: This should not trigger area swap, the initially selected area card should be laid and 
the player moved into that area.

# Special Multiplayer Handling

This is to be confirmed. For multiplayer games it is possible that a player who currently has no viable exits
could become unstuck by the actions of another player.

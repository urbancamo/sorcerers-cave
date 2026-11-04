# UI Report: 20261104 - General Gameplay Testing

### Game Code: *various*

### DateTimeStamp: *20261104T1200*

### Scenario Description

General gameplay....

### Tester Comments

I like the implementation of "carried" vs "wielded". More immersion. The player manages equipment for everyone. Great!

GAME "RIUP"

[1] Encountered the Bell Rope. Help text reads "once per visit". The rules state "Once only" - which we interpret to mean once per game (which is what is implemmented, it is only the help wording that is suspect).

[2] (One for later) Also in the same popup help  - Multiplayer - text reads "Secret doors.....may use ...or if you hold the Charmed Flute". Since you have to play the Flute in order to put Dragons or Vipers to sleep, it makes sense that the Flute must be played (a different tune?) in order to reveal secret doors. But in order to make it not tedious for the player, I think (eventually) we can let the Flute reveal all secret doors on map areas that the party has visited.

[3] Strength Badges - I was under the impression that the intent of the circular strength badge at top right is to be contextual - i.e. the creature's effective strength contribution right now. So for example:
- A priest deployed in the background, the badge would change to show "2".
- A Hero in the frontline facing a Spectre without a Magic Sword, his badge would show "0".

So only when not fighting would the badge show that creature's potential maximum strength.

[4] In deployment, if an attacking player attempts to drop a magic user into the background when there are no fighters in the front line, currently the game won't let you do that, but doesn't explain why. So maybe we need some pop-up explanatory text, such as:
"There are no frontline fighters there to support..."

GAME "WEPL"

[5] Mutiny seems to be broken. I queued it with a large party and nothing happened, and the Mutiny card persists in the chamber.

[6] Desertion also broken. I queued it with dice rolls forced to "1" and nothing happened. (But it doesn't persist.)

[7] In the Inventory pane, Charmed Flute does not change its status when you are at the edge of the Viper Pit. It should change from "NOT USABLE NOW" to "USABLE NOW" and a "Play" action available. (I guess Flute Playing not implemented yet).

[8] As a general UI / game "feel" observation:
Whenever a Special Chamber, Hazard or Artefact requires a roll (single, or one for each party member), it would be nice to let the player see those rolls happen. As a general priciple, I think the player shoulds see their dice rolls as they would in the tabletop game. The player is more "involved" if they see the dice setup, understand what is riding on those rolls, and have to click a "Roll the dice" button - giving them a chance to "feel" that horrible sense of dread, before absorbing the reality of the outcome. Really I'm just aiming for drawing out the tension and the story somewhat in a D&D style...
Applies to Bell Rope, Whirlpool, Viper Pit, Desertion, Medusa, Crypt, Elixir, Treasure Chest.
Ghouls and Quarrel dice rolls are visible in the fighting interface, so they are OK.

[9] UI general behavior - When you click on a tiny card or area to get its Card View, we could implement that as a toggle (a second click on the same object tidies away its Card View). Saves having to move a mouse all the way to the far top right to close the Card View after you have read it and have no further need.











 








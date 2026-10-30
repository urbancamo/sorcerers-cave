// Play a revised fight (`variants.combatRevision`) to its end without a screen: the strangers answer through the driver, and the
// party through the same `standard` decisions, applied as ordinary actions (so everything is logged and replayable). The headless
// harness of the revised round engine (technical spec M2): tests, the lab and any CLI use it to play whole fights.
import { playOutRevised } from "./strangerDriver";
import type { PlayedFight } from "./partyPlay";
import type { GameState } from "./state";

export { partyAction, type PlayedFight } from "./partyPlay";

export function playRevisedFight(start: GameState, maxSteps = 5000): PlayedFight {
  return playOutRevised(start, maxSteps);
}

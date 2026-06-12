import { GS_PLAYING, GS_QUIT, GS_ESCAPED, type GameState } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT } from "./data/areaCards";
import type { GameAction, GameEvent } from "./actions";

/** Resolve the area the party just entered. Milestone B emits skeleton events only;
 *  chamber draws, special-area crossings and hazards arrive in Milestone C. */
function resolveArea(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];
  const dec = decodeArea(state.areas[state.partyArea]!.card);
  if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) {
    events.push({ type: "enteredSpecial", special: dec.special });
  } else if (dec.chamber) {
    events.push({ type: "drewChamber", strangers: [], treasures: [], hazards: [] });
  }
  return { state, events };
}

/** Top-level turn dispatcher (spec §4). Pure: returns a new state and the events it produced. */
export function reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (state.level === 1 && dec.stairUp) {
        return { state: { ...state, gs: GS_ESCAPED, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_ESCAPED }] };
      }
      return { state, events: [{ type: "blocked" }] };
    }

    case "move": {
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const moved = { ...res.state, turn: res.state.turn + 1 };
      return resolveArea(moved);
    }
  }
}

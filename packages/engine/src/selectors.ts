import { decodeArea } from "./decode";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN } from "./coords";
import { GS_PLAYING, type GameState } from "./state";
import type { GameAction } from "./actions";

/**
 * The actions the UI may offer in the current state (the interactive contract).
 * The UI renders controls from this list; reduce validates against the same rules.
 */
export function legalActions(state: GameState): GameAction[] {
  if (state.gs !== GS_PLAYING) return [];

  if (state.phase === "encounter") {
    const actions: GameAction[] = [{ type: "withdraw" }, { type: "attack" }];
    if (state.areas[state.partyArea]!.indiffCount < 3) actions.push({ type: "test" });
    actions.push({ type: "quit" });
    return actions;
  }
  if (state.phase === "fight") {
    const actions: GameAction[] = [{ type: "fightOn" }, { type: "retreat" }];
    for (let i = 0; i < state.strangers.length; i++) actions.push({ type: "focusTarget", idx: i });
    actions.push({ type: "quit" });
    return actions;
  }
  if (state.phase === "pickup") {
    const actions: GameAction[] = [];
    for (let ti = 0; ti < state.treasures.length; ti++) {
      for (let mi = 0; mi < state.party.length; mi++) {
        if (state.party[mi]!.status === 0 || state.party[mi]!.status === 1) {
          actions.push({ type: "takeTreasure", ti, mi });
        }
      }
    }
    actions.push({ type: "leaveTreasure" });
    return actions;
  }
  if (state.phase !== "explore") return [];

  const dec = decodeArea(state.areas[state.partyArea]!.card);
  const actions: GameAction[] = [];
  if (dec.n) actions.push({ type: "move", dir: DIR_N });
  if (dec.e) actions.push({ type: "move", dir: DIR_E });
  if (dec.s) actions.push({ type: "move", dir: DIR_S });
  if (dec.w) actions.push({ type: "move", dir: DIR_W });
  if (dec.stairDown) actions.push({ type: "move", dir: DIR_DOWN });
  if (dec.stairUp) {
    if (state.level === 1) actions.push({ type: "exitCave" });
    else actions.push({ type: "move", dir: DIR_UP });
  }
  actions.push({ type: "quit" });
  return actions;
}

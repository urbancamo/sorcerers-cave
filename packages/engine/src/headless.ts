// Play a revised fight (`variants.combatRevision`) to its end without a screen: the strangers answer through the driver, and the
// party through the same `standard` decisions, applied as ordinary actions (so everything is logged and replayable). The headless
// harness of the revised round engine (technical spec M2): tests, the lab and any CLI use it to play whole fights.
import { reduce } from "./reduce";
import { driveStrangers } from "./strangerDriver";
import { fightView, freeOf, legalMoves, legalPairs } from "./revisedRound";
import { standardCasualty, standardDeploy, standardEngage, standardRedeploy } from "./standardPairing";
import type { GameAction, GameEvent } from "./actions";
import type { GameState } from "./state";

export interface PlayedFight {
  state: GameState;
  actions: GameAction[];                       // every action applied, the strangers' included, in order
  events: GameEvent[];
  end: "won" | "lost" | "standoff" | "stuck";  // `stuck`: the fight is waiting on something this harness does not decide
}

/** What the party does when asked: the `standard` decision, from the party's side. `retreat` is never chosen (a standoff ends the harness). */
export function partyAction(state: GameState): GameAction | null {
  const fight = state.fight;
  if (!fight?.rev) return null;
  if (fight.casualtyQueue?.length) {
    const pair = fight.casualtyQueue[0]!;
    const view = fightView(state);
    return { type: "chooseCasualty", idx: standardCasualty({ view, rngSeed: 0, budget: { maxNodes: 1 }, pair: [pair[0]!, pair[1]!], side: "party" }).nominated };
  }
  const pending = fight.pending;
  if (pending?.by !== "party") return null;
  const base = { view: fightView(state), rngSeed: 0, budget: { maxNodes: 1 }, side: "party" as const };
  switch (pending.kind) {
    case "deploy": return { type: "deploy", creatures: standardDeploy({ ...base, free: freeOf(state, "party"), min: pending.min }).creatures };
    case "engage": {
      const ctx = { ...base, own: freeOf(state, "party"), foes: fight.rev.deployed.strangers.slice(), legalPairs: legalPairs(state, "party") };
      return { type: "engage", pairs: standardEngage(ctx).pairs };
    }
    case "redeploy": {
      const moves = legalMoves(state, "party");
      const ctx = { ...base, candidates: [...new Set(moves.map((m) => m.creature))], legalMoves: moves };
      return { type: "redeploy", moves: standardRedeploy(ctx).moves };
    }
    default: return null;
  }
}

export function playRevisedFight(start: GameState, maxSteps = 5000): PlayedFight {
  let state = start;
  const actions: GameAction[] = [], events: GameEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const driven = driveStrangers(state);
    for (const a of driven.applied) { actions.push(a.action); events.push(...a.events); }
    state = driven.state;
    if (!state.fight) return { state, actions, events, end: state.phase === "gameOver" ? "lost" : "won" };
    if (state.fight.rev?.standoff) return { state, actions, events, end: "standoff" };
    const action = partyAction(state);
    if (!action) return { state, actions, events, end: "stuck" };
    const r = reduce(state, action);
    if (r.events.length === 1 && (r.events[0]!.type === "blocked" || r.events[0]!.type === "planRejected")) throw new Error(`the engine refused the party's ${action.type}: ${JSON.stringify(r.events[0])}`);
    actions.push(action); events.push(...r.events);
    state = r.state;
  }
  return { state, actions, events, end: "stuck" };
}

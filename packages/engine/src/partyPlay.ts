// The party's side of a headless revised fight: the `standard` decisions, from the party's side, as ordinary actions. Separate from
// headless.ts so the stranger driver can play rollouts out without importing a module that imports the driver.
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
    case "scroll": return { type: "scroll", use: "decline" };   // the `standard` party never reads the Scroll: it costs a curse
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

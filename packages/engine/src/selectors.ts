import { decodeArea } from "./decode";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN } from "./coords";
import { GS_PLAYING, type GameState } from "./state";
import type { GameAction } from "./actions";

function living(state: GameState) {
  return state.party.map((m, idx) => ({ m, idx })).filter(({ m }) => m.status === 0 || m.status === 1);
}

/** `useArtifact` actions available in the given phase (so the UI can show "use item" controls). */
function artifactActions(state: GameState): GameAction[] {
  const has = (artifact: number, ok: (creatureId: number) => boolean) =>
    living(state).some(({ m }) => m.treasure.includes(artifact) && ok(m.creatureId));
  const actions: GameAction[] = [];

  if (state.phase === "fight") {
    if (has(8, () => true)) { // Strength Potion -> each boostable living member
      living(state).forEach(({ m, idx }) => {
        if ([0, 1, 5, 6].includes(m.creatureId)) actions.push({ type: "useArtifact", artifact: 8, target: idx });
      });
    }
  }
  if (state.phase === "fight" || state.phase === "encounter") {
    if (has(5, () => true)) { // Lotus Dust -> each stranger
      for (let i = 0; i < state.strangers.length; i++) actions.push({ type: "useArtifact", artifact: 5, target: i });
    }
  }
  if (state.phase === "explore") {
    if (has(6, (id) => id === 6 || id === 4 || id === 8)) { // Healing Balm -> each dead member
      state.party.forEach((m, idx) => { if (m.status === 3) actions.push({ type: "useArtifact", artifact: 6, target: idx }); });
    }
    if (has(9, (id) => id === 8)) { // Magic Staff -> each stoned member
      state.party.forEach((m, idx) => { if (m.status === 2) actions.push({ type: "useArtifact", artifact: 9, target: idx }); });
    }
  }
  return actions;
}

/**
 * The actions the UI may offer in the current state (the interactive contract).
 * The UI renders controls from this list; reduce validates against the same rules.
 */
export function legalActions(state: GameState): GameAction[] {
  if (state.gs !== GS_PLAYING) return [];

  if (state.phase === "encounter") {
    const actions: GameAction[] = [{ type: "withdraw" }, { type: "attack" }];
    if (state.areas[state.partyArea]!.indiffCount < 3) actions.push({ type: "test" });
    actions.push(...artifactActions(state));
    actions.push({ type: "quit" });
    return actions;
  }
  if (state.phase === "fight") {
    const actions: GameAction[] = [{ type: "fightOn" }, { type: "retreat" }];
    for (let i = 0; i < state.strangers.length; i++) actions.push({ type: "focusTarget", idx: i });
    actions.push(...artifactActions(state));
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
  actions.push(...artifactActions(state));
  actions.push({ type: "quit" });
  return actions;
}

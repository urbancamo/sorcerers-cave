import { decodeArea } from "./decode";
import { DIR_N, DIR_E, DIR_S, DIR_W, DIR_UP, DIR_DOWN, unpackCoord, packCoord } from "./coords";
import { GS_PLAYING, type GameState } from "./state";
import type { GameAction } from "./actions";
import { canCarry } from "./pickup";

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
    if (has(5, () => true)) { // Lotus Dust -> each stranger (but not a Spectre — no effect, per card)
      for (let i = 0; i < state.strangers.length; i++) {
        if (state.strangers[i] !== 9) actions.push({ type: "useArtifact", artifact: 5, target: i });
      }
    }
    // The Charmed Flute lulls Dragons passively (on chamber entry, while held) — see resolveArea —
    // so there is no explicit lull action to offer here.
  }
  if (state.phase === "explore") {
    if (has(6, (id) => id === 6 || id === 4 || id === 8)) { // Healing Balm -> each dead member
      state.party.forEach((m, idx) => { if (m.status === 3) actions.push({ type: "useArtifact", artifact: 6, target: idx }); });
    }
    if (has(9, (id) => id === 8)) { // Magic Staff -> each stoned member
      state.party.forEach((m, idx) => { if (m.status === 2) actions.push({ type: "useArtifact", artifact: 9, target: idx }); });
    }
    if (has(4, (id) => id === 4 || id === 8)) { // Magic Carpet -> teleport in each available direction
      for (const dir of [DIR_N, DIR_E, DIR_S, DIR_W, DIR_DOWN]) actions.push({ type: "useArtifact", artifact: 4, dir });
      if (state.level > 1) actions.push({ type: "useArtifact", artifact: 4, dir: DIR_UP });
    }
    if (has(12, (id) => id === 0 || id === 4 || id === 5 || id === 6 || id === 8)) { // Charmed Flute -> reveal a secret door
      const cur = state.areas[state.partyArea]!;
      const { level, x, y } = unpackCoord(cur.coord);
      const dec = decodeArea(cur.card);
      const below = state.areas.find((a) => a.coord === packCoord(level + 1, x, y));
      if (!dec.stairDown && below && decodeArea(below.card).stairUp) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_DOWN });
      const above = state.areas.find((a) => a.coord === packCoord(level - 1, x, y));
      if (!dec.stairUp && above && decodeArea(above.card).stairDown) actions.push({ type: "useArtifact", artifact: 12, dir: DIR_UP });
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
    // No retreat back up a trap the party fell through (prev is the unreachable level above).
    const actions: GameAction[] = state.fellThroughTrap ? [{ type: "attack" }] : [{ type: "withdraw" }, { type: "attack" }];
    if ((state.indiffStreak ?? 0) < 3) actions.push({ type: "test" });
    actions.push(...artifactActions(state));
    return actions; // quitting is via the HUD Quit button, not an in-menu action
  }
  if (state.phase === "fight") {
    // A pending casualty must be decided before anything else: pick which of the losing pair falls.
    const pending = state.fight?.casualtyQueue?.[0];
    if (pending) return pending.map((idx) => ({ type: "chooseCasualty", idx }));
    const actions: GameAction[] = [{ type: "fightOn" }];
    // Retreat is allowed only after at least one round has been fought, and never back up a trap (§Retreat).
    if (!state.fellThroughTrap && state.fight && state.fight.round > 1) actions.push({ type: "retreat" });
    for (let i = 0; i < state.strangers.length; i++) actions.push({ type: "focusTarget", idx: i });
    actions.push(...artifactActions(state));
    return actions; // quitting is via the HUD Quit button, not an in-menu action
  }
  if (state.phase === "pickup") {
    const actions: GameAction[] = [];
    for (let ti = 0; ti < state.treasures.length; ti++) {
      for (let mi = 0; mi < state.party.length; mi++) {
        const m = state.party[mi]!;
        // Only offer the take to living/ally members who have the spare capacity to carry it
        // (heavy treasure counts against carry weight; artifacts are weightless so always fit).
        if ((m.status === 0 || m.status === 1) && canCarry(m, state.treasures[ti]!)) {
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
  if (state.party.some((m) => (m.status === 0 || m.status === 1) && m.treasure.includes(14))) actions.push({ type: "openChest" });
  actions.push(...artifactActions(state));
  return actions; // quitting is via the HUD Quit button, not an in-menu action
}

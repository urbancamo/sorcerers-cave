import { GS_PLAYING, GS_QUIT, GS_ESCAPED, GS_DEAD, PARTY_CAP, type GameState } from "./state";
import { tryMove } from "./map";
import { decodeArea } from "./decode";
import { SPECIAL_DEEP_POOL, SPECIAL_VIPER_PIT } from "./data/areaCards";
import { enterChamber } from "./chamber";
import { applyHazards } from "./hazards";
import { takeTreasure } from "./pickup";
import { unpackCoord, packCoord } from "./coords";
import type { GameAction, GameEvent } from "./actions";
import { reactionRoll } from "./reaction";
import { resolveRound } from "./combat";
import { CREATURES } from "./data/creatures";

/** Persist the chamber working set back into the area, then return to exploring. */
function persistAndExplore(state: GameState): void {
  const area = state.areas[state.partyArea]!;
  area.contents = [
    ...state.strangers.map((id) => 100 + id),
    ...state.treasures.map((id) => 200 + id),
  ];
  state.phase = "explore";
}

/** Index of the strongest current stranger (default focus target). */
function strongestStranger(state: GameState): number {
  let best = 0;
  for (let i = 1; i < state.strangers.length; i++) {
    const a = CREATURES[state.strangers[i]!]!;
    const b = CREATURES[state.strangers[best]!]!;
    if (a.fs + a.mp > b.fs + b.mp) best = i;
  }
  return best;
}

/** Begin a fight with the given surprise (+1 party, -1 strangers). */
function startFight(state: GameState, surprise: number): GameEvent[] {
  state.fight = { surprise, round: 1, focus: strongestStranger(state) };
  state.phase = "fight";
  return [{ type: "fightStarted", surprise }];
}

/** Resolve the area just entered: special markers, then chamber draw + hazards + phase (spec §4/§7). */
function resolveArea(state: GameState): GameEvent[] {
  const events: GameEvent[] = [{ type: "moved", area: state.partyArea, level: state.level }];

  for (;;) {
    const dec = decodeArea(state.areas[state.partyArea]!.card);
    if (dec.special === SPECIAL_DEEP_POOL || dec.special === SPECIAL_VIPER_PIT) {
      events.push({ type: "enteredSpecial", special: dec.special });
      state.phase = "explore";
      return events;
    }
    if (!dec.chamber) {
      state.phase = "explore";
      return events;
    }
    events.push(...enterChamber(state));
    const { events: hzEvents, fell } = applyHazards(state);
    events.push(...hzEvents);
    if (fell) {
      relocateDown(state);
      events.push({ type: "moved", area: state.partyArea, level: state.level });
      continue;
    }
    if (state.strangers.length > 0) {
      state.phase = "encounter";
    } else if (state.treasures.length > 0) {
      state.phase = "pickup";
    } else {
      persistAndExplore(state);
    }
    return events;
  }
}

/** Move the whole party to the area directly below (same x,y), creating it if needed. */
function relocateDown(state: GameState): void {
  const { x, y, level } = unpackCoord(state.areas[state.partyArea]!.coord);
  const target = packCoord(level + 1, x, y);
  let idx = state.areas.findIndex((a) => a.coord === target);
  if (idx < 0) {
    const card = state.largeIdx < state.largePack.length ? state.largePack[state.largeIdx++]! | 32 : 31 | 32;
    state.areas.push({ card, coord: target, faceUp: true, visited: false, contents: [], flags: 0, indiffCount: 0 });
    idx = state.areas.length - 1;
  }
  state.prev2 = state.prev;
  state.prev = state.partyArea;
  state.partyArea = idx;
  state.level = level + 1;
}

export function reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] } {
  if (state.gs !== GS_PLAYING) return { state, events: [] };

  switch (action.type) {
    case "quit":
      return { state: { ...state, gs: GS_QUIT, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_QUIT }] };

    case "exitCave": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const dec = decodeArea(state.areas[state.partyArea]!.card);
      if (state.level === 1 && dec.stairUp) {
        return { state: { ...state, gs: GS_ESCAPED, phase: "gameOver" }, events: [{ type: "gameOver", gs: GS_ESCAPED }] };
      }
      return { state, events: [{ type: "blocked" }] };
    }

    case "move": {
      if (state.phase !== "explore") return { state, events: [{ type: "blocked" }] };
      const res = tryMove(state, action.dir);
      if (!res.moved) {
        return { state: res.state, events: [res.deadEnd ? { type: "deadEnd", dir: action.dir } : { type: "blocked" }] };
      }
      const next = { ...res.state, turn: res.state.turn + 1 };
      return { state: next, events: resolveArea(next) };
    }

    case "withdraw": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.areas[next.partyArea]!.contents = [
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
      ];
      next.strangers = []; next.treasures = []; next.hazards = [];
      next.partyArea = next.prev;
      next.level = unpackCoord(next.areas[next.partyArea]!.coord).level;
      next.phase = "explore";
      return { state: next, events: [{ type: "moved", area: next.partyArea, level: next.level }] };
    }

    case "takeTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      takeTreasure(next, action.ti, action.mi);
      if (next.treasures.length === 0) persistAndExplore(next);
      return { state: next, events: [] };
    }

    case "leaveTreasure": {
      if (state.phase !== "pickup") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      persistAndExplore(next);
      return { state: next, events: [] };
    }

    case "test": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const area = state.areas[state.partyArea]!;
      if (area.indiffCount >= 3) return { state, events: [{ type: "blocked" }] }; // permanently indifferent
      const next = structuredClone(state);
      const roll = reactionRoll(next);
      next.seed = roll.seed;
      const events: GameEvent[] = [{ type: "reaction", outcome: roll.outcome }];
      if (roll.outcome === "friendly") {
        const room = PARTY_CAP - next.party.length;
        const joining = next.strangers.slice(0, Math.max(0, room));
        for (const id of joining) next.party.push({ creatureId: id, status: 1, dragonKills: 0, treasure: [] });
        next.strangers = [];
        events.push({ type: "strangersJoined", count: joining.length });
        if (next.treasures.length > 0) next.phase = "pickup";
        else persistAndExplore(next);
      } else if (roll.outcome === "indifferent") {
        next.areas[next.partyArea]!.indiffCount += 1;
        // stays in the encounter phase
      } else {
        events.push(...startFight(next, -1)); // strangers gain surprise
      }
      return { state: next, events };
    }

    case "attack": {
      if (state.phase !== "encounter") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      return { state: next, events: startFight(next, 1) }; // party gains surprise
    }

    case "focusTarget": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      if (action.idx < 0 || action.idx >= state.strangers.length) return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.fight!.focus = action.idx;
      return { state: next, events: [] };
    }

    case "fightOn": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      const events = resolveRound(next);
      const partyAlive = next.party.some((m) => m.status === 0 || m.status === 1);
      if (!partyAlive) {
        next.gs = GS_DEAD;
        next.phase = "gameOver";
        next.fight = null;
        events.push({ type: "gameOver", gs: GS_DEAD });
      } else if (next.strangers.length === 0) {
        next.fight = null;
        events.push({ type: "fightWon" });
        if (next.treasures.length > 0) next.phase = "pickup";
        else persistAndExplore(next);
      }
      // else: still fighting; resolveRound already advanced the round
      return { state: next, events };
    }

    case "retreat": {
      if (state.phase !== "fight") return { state, events: [{ type: "blocked" }] };
      const next = structuredClone(state);
      next.areas[next.partyArea]!.contents = [
        ...next.strangers.map((id) => 100 + id),
        ...next.treasures.map((id) => 200 + id),
      ];
      next.strangers = []; next.treasures = []; next.hazards = [];
      next.fight = null;
      next.partyArea = next.prev;
      next.level = unpackCoord(next.areas[next.partyArea]!.coord).level;
      next.phase = "explore";
      return { state: next, events: [{ type: "moved", area: next.partyArea, level: next.level }] };
    }
  }
}

import {
  reduce, legalActions, unpackCoord, packCoord, targetCoord,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import type { CaveEngine, Area, StateSnapshot, Move, MoveEvent, Dir } from "./ports";
import { projectArea, encodeWorkingSet, areaKey, type ArtTables } from "./projection";

const DIR_TO_NUM: Record<Dir, number> = { N: 1, E: 2, S: 3, W: 4, U: 5, D: 6 };
const NUM_TO_DIR: Record<number, Dir> = { 1: "N", 2: "E", 3: "S", 4: "W", 5: "U", 6: "D" };

export interface AdapterOptions {
  /** Forward each accepted action (the seam D-3 uses to dispatch to Convex). */
  onAction?: (action: GameAction) => void;
}

export interface CaveAdapter extends CaveEngine {
  /** Replace the local mirror (D-3 reconcile from the authoritative snapshot). */
  sync(next: GameState): void;
}

export function createCaveAdapter(initial: GameState, art: ArtTables, opts: AdapterOptions = {}): CaveAdapter {
  let state = initial;

  // Live floor codes for the party's area when a chamber encounter is active; else undefined (use persisted contents).
  const liveForCurrent = (): number[] | undefined =>
    state.strangers.length || state.treasures.length || state.hazards.length ? encodeWorkingSet(state) : undefined;

  const projectAll = (): Area[] =>
    state.areas.map((pa, i) => projectArea(pa, i, state, art, i === state.partyArea ? liveForCurrent() : undefined));

  const adapter: CaveAdapter = {
    get areas() { return projectAll(); },
    get placed() {
      const m = new Map<string, Area>();
      for (const a of projectAll()) m.set(areaKey(a.level, a.col, a.row), a);
      return m;
    },
    get startLevel() { return Math.min(...state.areas.map((a) => unpackCoord(a.coord).level)); },
    get current() {
      const i = state.partyArea;
      return projectArea(state.areas[i]!, i, state, art, liveForCurrent());
    },
    state(): StateSnapshot {
      const current = adapter.current;
      return {
        level: current.level, col: current.col, row: current.row,
        turn: state.turn,
        placed: state.areas.length,
        deckLeft: state.largePack.length - state.largeIdx,
        current,
      };
    },
    openMoves(): Move[] {
      if (state.phase !== "explore") return [];
      const { level, x, y } = unpackCoord(state.areas[state.partyArea]!.coord);
      const moves: Move[] = [];
      for (const a of legalActions(state)) {
        if (a.type !== "move") continue;
        const dir = NUM_TO_DIR[a.dir]!;
        const t = unpackCoord(targetCoord(a.dir, level, x, y));
        const target = { level: t.level, col: t.x, row: t.y };
        const kind: Move["kind"] = dir === "U" || dir === "D"
          ? "stair"
          : state.areas.some((ar) => ar.coord === packCoord(target.level, target.col, target.row))
            ? "known"
            : "undrawn";
        moves.push({ dir, kind, target });
      }
      return moves;
    },
    tryMove(dir: Dir): MoveEvent {
      const before = state;
      const num = DIR_TO_NUM[dir];
      const action: GameAction = { type: "move", dir: num };
      const { state: next, events } = reduce(before, action);
      const blocked = events.some((e) => e.type === "blocked");
      const deadEnd = events.some((e) => e.type === "deadEnd");
      if (blocked || deadEnd) return deadEnd ? { moved: false, deadEnd: true } : { moved: false };
      state = next;
      opts.onAction?.(action);
      const idx = next.partyArea;
      const arrived = next.areas[idx]!;
      const grew = next.areas.length > before.areas.length;
      const area = projectArea(arrived, idx, next, art, liveForCurrent());
      const ev: MoveEvent = { moved: true, dir, area, placed: grew ? area : null };
      if (dir === "D") ev.descended = "D";
      if (dir === "U") ev.ascended = "U";
      if (events.some((e) => e.type === "drewChamber")) {
        const wasVisited = before.areas.find((a) => a.coord === arrived.coord)?.visited ?? false;
        ev.chamber = { draws: [...area.strangers, ...area.treasure, ...area.hazards], firstVisit: !wasVisited };
      }
      return ev;
    },
    sync(next: GameState) { state = next; },
  };
  return adapter;
}

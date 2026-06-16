import {
  reduce, legalActions, unpackCoord, packCoord, targetCoord, AF_DESTROYED,
  type GameState, type GameAction, type GameEvent,
} from "@sorcerers-cave/engine";
import type { CaveEngine, Area, StateSnapshot, Move, MoveEvent, Dir } from "./ports";
import { projectArea, encodeWorkingSet, areaKey, laneCards, type ArtTables } from "./projection";
import { eventNotices } from "../game/eventNotices";

const DIR_TO_NUM: Record<Dir, number> = { N: 1, E: 2, S: 3, W: 4, U: 5, D: 6 };
const NUM_TO_DIR: Record<number, Dir> = { 1: "N", 2: "E", 3: "S", 4: "W", 5: "U", 6: "D" };

export interface AdapterOptions {
  /** Forward each accepted action (the seam D-3 uses to dispatch to Convex). */
  onAction?: (action: GameAction) => void;
  /** Multiplayer turn-gate: when present and false, no moves/exits are offered or accepted. */
  canAct?: () => boolean;
}

export interface CaveAdapter extends CaveEngine {
  /** Replace the local mirror (D-3 reconcile from the authoritative snapshot). */
  sync(next: GameState): void;
}

export function createCaveAdapter(initial: GameState, art: ArtTables, opts: AdapterOptions = {}): CaveAdapter {
  let state = initial;
  const acting = () => !opts.canAct || opts.canAct(); // true unless a turn-gate says otherwise

  // Live floor codes for the party's current area = the active working set PLUS anything parked on
  // that tile's `contents`. enterChamber clears `contents` on entry, so for the current tile it only
  // holds items dropped here this visit (dropTreasure) — merge them so a just-dropped item shows
  // immediately even while an encounter/pickup working set is active. Undefined when the floor is bare.
  const liveForCurrent = (): number[] | undefined => {
    const parked = state.areas[state.partyArea]?.contents ?? [];
    const merged = [...encodeWorkingSet(state), ...parked];
    return merged.length ? merged : undefined;
  };

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
        deckTotal: state.largePack.length, // full area deck (varies by game variant / expansions)
        current,
      };
    },
    openMoves(): Move[] {
      if (state.phase !== "explore" || !acting()) return []; // not your turn → no doorways offered
      const { level, x, y } = unpackCoord(state.areas[state.partyArea]!.coord);
      const moves: Move[] = [];
      for (const a of legalActions(state)) {
        if (a.type !== "move") continue;
        const dir = NUM_TO_DIR[a.dir]!;
        const t = unpackCoord(targetCoord(a.dir, level, x, y));
        const target = { level: t.level, col: t.x, row: t.y };
        const known = state.areas.find((ar) => ar.coord === packCoord(target.level, target.col, target.row));
        // An earthquake-collapsed area is impassable — don't offer a doorway onto it.
        if (known && (known.flags & AF_DESTROYED) !== 0) continue;
        const kind: Move["kind"] = dir === "U" || dir === "D" ? "stair" : known ? "known" : "undrawn";
        moves.push({ dir, kind, target });
      }
      // The Cave exit: any level-1 up-stair offers exitCave instead of a move-up (spec §"Movement").
      // Surface it as a "U" marker so it's clickable; doMove routes it through the exit confirmation.
      if (legalActions(state).some((a) => a.type === "exitCave")) {
        moves.push({ dir: "U", kind: "exit", target: { level, col: x, row: y } });
      }
      return moves;
    },
    canExit(): boolean {
      return acting() && state.phase === "explore" && legalActions(state).some((a) => a.type === "exitCave");
    },
    exit(): void {
      if (!acting()) return;
      const action: GameAction = { type: "exitCave" };
      const { state: next } = reduce(state, action);
      state = next;
      opts.onAction?.(action);
    },
    quit(): void {
      if (!acting()) return;
      const action: GameAction = { type: "quit" };
      const { state: next } = reduce(state, action);
      state = next;
      opts.onAction?.(action);
    },
    tryMove(dir: Dir): MoveEvent {
      if (!acting()) return { moved: false }; // not your turn
      const before = state;
      const num = DIR_TO_NUM[dir];
      const action: GameAction = { type: "move", dir: num };
      const { state: next, events } = reduce(before, action);
      const blocked = events.some((e) => e.type === "blocked");
      const deadEnd = events.some((e) => e.type === "deadEnd");
      if (blocked) return { moved: false }; // no exit that way — nothing drawn or placed
      if (deadEnd) {
        // a tile may have been drawn onto the frontier; keep the placement (pruned exit + face-down tile)
        state = next;
        opts.onAction?.(action);
        const drew = next.areas.length > before.areas.length;
        const placed = drew ? projectArea(next.areas[next.areas.length - 1]!, next.areas.length - 1, next, art) : null;
        return { moved: false, deadEnd: true, placed };
      }
      state = next;
      opts.onAction?.(action);
      const idx = next.partyArea;
      const arrived = next.areas[idx]!;
      const grew = next.areas.length > before.areas.length;
      const area = projectArea(arrived, idx, next, art, liveForCurrent());
      const ev: MoveEvent = { moved: true, dir, area, placed: grew ? area : null };
      if (dir === "D") ev.descended = "D";
      if (dir === "U") ev.ascended = "U";
      if (events.some((e) => e.type === "trapSprung")) { ev.trap = "sprung"; ev.fell = true; }
      else if (events.some((e) => e.type === "trapAvoided")) ev.trap = "avoided";
      const drew = events.find((e): e is Extract<GameEvent, { type: "drewChamber" }> => e.type === "drewChamber");
      if (drew) {
        // Build the draw display from the drewChamber event (the full draw, captured BEFORE
        // hazards fire and clear themselves) — not from post-resolution state, which would
        // under-count any drawn hazard and so misreport extra-draw chambers (Tomb / Great Hall).
        const codes = [
          ...drew.strangers.map((id) => 100 + id),
          ...drew.treasures.map((id) => 200 + id),
          ...drew.hazards.map((id) => 300 + id),
        ];
        const drawn = laneCards(codes, art.cards);
        const wasVisited = before.areas.find((a) => a.coord === arrived.coord)?.visited ?? false;
        ev.chamber = { draws: [...drawn.strangers, ...drawn.treasure, ...drawn.hazards], firstVisit: !wasVisited };
      }
      // Feedback for otherwise-silent outcomes of the move (viper deaths, hazards, Deep Pool,
      // special-area effects). The renderer surfaces these; chamber/trap have their own UI.
      const notices = eventNotices(events);
      if (notices.length) ev.notices = notices;
      return ev;
    },
    sync(next: GameState) { state = next; },
  };
  return adapter;
}

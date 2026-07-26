import { decodeArea } from "./decode";
import { SPECIAL_TOMB, SPECIAL_GREAT_HALL } from "./data/areaCards";
import type { GameState } from "./state";
import type { GameEvent } from "./actions";

const MAX_STRANGERS = 8;
const MAX_TREASURE = 8;
const MAX_HAZARDS = 4;

/** Classify a small-pack / parked code into the chamber working set (400+ = a sleeping creature). */
function classify(state: GameState, code: number): void {
  if (code >= 400) {
    state.sleeping ??= [];
    if (state.sleeping.length < MAX_STRANGERS) state.sleeping.push(code - 400);
  } else if (code >= 300) {
    if (state.hazards.length < MAX_HAZARDS) state.hazards.push(code - 300);
  } else if (code >= 200) {
    if (state.treasures.length < MAX_TREASURE) state.treasures.push(code - 200);
  } else {
    if (state.strangers.length < MAX_STRANGERS) state.strangers.push(code - 100);
  }
}

/**
 * Populate the chamber working set for the party's current area (spec §7.1). Mutates `state`.
 * First visit: draw min(level,4) (+Tomb/Hall extras, cap 8) from the small pack.
 * Revisit: reload the area's persisted contents (100+cid / 200+tid).
 */
export function enterChamber(state: GameState): GameEvent[] {
  const area = state.areas[state.partyArea]!;
  const dec = decodeArea(area.card);
  state.strangers = [];
  state.treasures = [];
  state.hazards = [];
  state.sleeping = [];
  state.lulled = []; // recomputed from flute presence each entry (see resolveArea)
  state.indiffStreak = 0; // a fresh visit re-tests from scratch (only permanent indifference persists)

  if (area.visited) {
    for (const code of area.contents) classify(state, code);
  } else {
    area.visited = true;
    let draw = Math.min(state.level, 4);
    if (dec.special === SPECIAL_TOMB) draw += 1;
    if (dec.special === SPECIAL_GREAT_HALL) draw += 2;
    draw = Math.min(draw, 8);
    for (let i = 0; i < draw && state.smallIdx < state.smallPack.length; i++) {
      classify(state, state.smallPack[state.smallIdx++]!);
    }
  }
  // Clear the parked snapshot: during an active session the working set IS the truth.
  // Persist sites will write back (prepending any newly parked entries) when the party leaves.
  area.contents = [];

  return [{
    type: "drewChamber",
    strangers: [...state.strangers],
    treasures: [...state.treasures],
    hazards: [...state.hazards],
  }];
}

/**
 * Draw up to `count` more codes from the small pack into the CURRENT chamber's working set
 * (Extension kit — the Well's 1-card draw and the Bell Rope's 2-card draw, SC-EXT-7/SC-EXT-8):
 * the same classification as a fresh chamber draw (`classify`), but APPENDED onto whatever is
 * already there rather than replacing it, so it composes with an already-in-progress encounter.
 * Stops early if the small pack runs dry. Mutates `state`; emits no event of its own — the caller
 * (reduce.ts) reports the draw with its own event (`wellDraw` / `bellRoll`).
 */
export function drawSmallCards(state: GameState, count: number): void {
  for (let i = 0; i < count && state.smallIdx < state.smallPack.length; i++) {
    classify(state, state.smallPack[state.smallIdx++]!);
  }
}

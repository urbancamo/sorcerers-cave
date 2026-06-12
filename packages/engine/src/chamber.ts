import { decodeArea } from "./decode";
import { SPECIAL_TOMB, SPECIAL_GREAT_HALL } from "./data/areaCards";
import type { GameState } from "./state";
import type { GameEvent } from "./actions";

const MAX_STRANGERS = 8;
const MAX_TREASURE = 8;
const MAX_HAZARDS = 4;

/** Classify a small-pack code into the chamber working set. */
function classify(state: GameState, code: number): void {
  if (code >= 300) {
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

  return [{
    type: "drewChamber",
    strangers: [...state.strangers],
    treasures: [...state.treasures],
    hazards: [...state.hazards],
  }];
}

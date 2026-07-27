import { decodeArea } from "./decode";
import { SPECIAL_TOMB, SPECIAL_GREAT_HALL, SPECIAL_LAIR, SPECIAL_GALLERY } from "./data/areaCards";
import type { GameState } from "./state";
import type { GameEvent } from "./actions";

const MAX_STRANGERS = 8;
const MAX_TREASURE = 8;
const MAX_HAZARDS = 4;

// Extension kit (SC-EXT-13): Crypt/Gems (kit treasure 21) — a FRESH draw of this code parks as the
// crypt (`state.cryptCoord`) instead of lying on the floor; see `classify` below.
const T_CRYPT = 21;

// Extension kit (SC-EXT-10): creatures the Gallery does NOT petrify on the draw — the Sorcerer and
// Spectre arrive un-petrified with standard interaction, and so does the Demon (design US-06,
// Resolved-14) — though the Demon's OWN draw-relocation behaviour (US-13) is not implemented yet
// (that's Task 11); for now a Demon drawn here is simply exempt like any other, with no relocation.
const GALLERY_EXEMPT_CREATURES = [9, 11, 15]; // Spectre, Sorcerer, Demon

/** Load an already-classified code straight into its working-set bucket — no draw-time transforms.
 *  Used to reload PERSISTED/parked contents (a revisit, or a stash just spilled onto the Lair):
 *  400+cid = a sleeping (Lotus-slept) creature; 500+cid = a Gallery statue (SC-EXT-10) — both are
 *  inert-creature patterns, symmetric by design. Critically, a plain 100+cid code here is NEVER
 *  re-run through the Gallery petrify check (see `classify` below) — it already represents an
 *  ESTABLISHED stranger (arrived exempt, or previously woken by the Staff, SC-EXT-11), and reloading
 *  it must not turn it back to stone. */
function reload(state: GameState, code: number): void {
  if (code >= 500) {
    state.statues ??= [];
    if (state.statues.length < MAX_STRANGERS) state.statues.push(code - 500);
  } else if (code >= 400) {
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
 * Classify a code freshly drawn from the small pack (a genuinely NEW arrival) into the chamber
 * working set. Identical to `reload` for every code EXCEPT a creature (100-199) drawn in a Gallery
 * (`SPECIAL_GALLERY`, design US-06): every such arrival is stone on sight — a scenery statue
 * (500+id, `state.statues`) — except the Sorcerer/Spectre/Demon, who arrive un-petrified with
 * standard interaction (Resolved-14). This distinction applies ONLY at draw time (see `reload`).
 */
function classify(state: GameState, code: number): void {
  if (code === 200 + T_CRYPT) {
    // Extension kit (SC-EXT-13): the Crypt/Gems card doesn't lie on the floor when drawn — it PARKS
    // as "the crypt" in this chamber (design US-08). Tracked as a single coordinate on `state`
    // (mirrors `lairCoord`, SC-EXT-12) rather than a chamber-working-set bucket or a re-parked
    // content code (unlike Medusa/Ghouls, SC-7.2-10, it never re-fires automatically on reload — it
    // waits for the deliberate `enterCrypt` action, reduce.ts): there is exactly one Crypt/Gems card
    // in the kit's small pack, so this can only ever fire once per game, and since the card never
    // touches `area.contents`, a later revisit's `reload` loop never sees it — no ambiguity with the
    // ordinary floor treasure the SAME code (221) represents once `enterCrypt` resolves a "find".
    state.cryptCoord = state.areas[state.partyArea]!.coord;
    return;
  }
  if (code >= 100 && code < 200) {
    const creatureId = code - 100;
    const dec = decodeArea(state.areas[state.partyArea]!.card);
    if (dec.special === SPECIAL_GALLERY && !GALLERY_EXEMPT_CREATURES.includes(creatureId)) {
      state.statues ??= [];
      if (state.statues.length < MAX_STRANGERS) state.statues.push(creatureId);
      return;
    }
  }
  reload(state, code);
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
  // Gallery scenery (SC-EXT-10), reset and reloaded/redrawn below like `sleeping` — but ONLY when
  // entering a Gallery: `statues` must stay perpetually undefined for every non-Gallery chamber (a
  // base `AREA_CARDS` value can never decode `special===SPECIAL_GALLERY`, SC-EXT-3), so this never
  // introduces the field into a kit-off game's state and never disturbs the frozen golden snapshots
  // (SC-EXT-1 byte-identity — a bare `state.statues = []` here broke `solo-golden.test.ts`, since an
  // always-present `statues: []` key changes every state's hash even when the value is empty).
  if (dec.special === SPECIAL_GALLERY) state.statues = [];
  state.lulled = []; // recomputed from flute presence each entry (see resolveArea)
  state.indiffStreak = 0; // a fresh visit re-tests from scratch (only permanent indifference persists)

  const events: GameEvent[] = [];

  // Extension kit (SC-EXT-12): register the Lair's coord the moment its tile is placed AND entered
  // — this hook runs on every entry path (move/carpet/relocateDown all funnel through here) — and
  // spill any stash queued before the Lair existed on the map straight onto its floor. Must run
  // BEFORE the reload below, so a first-ever entry (which reloads `area.contents` regardless of
  // `visited`) picks up a stash spilled in this very call.
  if (dec.special === SPECIAL_LAIR && state.lairCoord === undefined) {
    state.lairCoord = area.coord;
    if (state.harpyStash?.length) {
      area.contents = [...area.contents, ...state.harpyStash.map((id) => 200 + id)];
      events.push({ type: "lairStash", treasureIds: state.harpyStash });
      state.harpyStash = [];
    }
  }

  // Reload any leftover parked contents (a revisit — or, for the Lair, the stash just spilled
  // above) before layering on a fresh small-pack draw for a genuinely new visit. `area.contents` is
  // always empty here for every OTHER unvisited area (nothing writes to an area's contents before
  // its first visit) — so this is a no-op for the base game and every other kit tile (SC-EXT-1).
  for (const code of area.contents) reload(state, code);
  if (!area.visited) {
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

  events.push({
    type: "drewChamber",
    strangers: [...state.strangers],
    treasures: [...state.treasures],
    hazards: [...state.hazards],
  });
  // Extension kit (SC-EXT-10): announce the stone tableau whenever this entry leaves any creature
  // petrified (design US-06 notice: "The strangers here are stone — silent, waiting.").
  if (state.statues?.length) {
    events.push({ type: "galleryStone", creatureIds: [...state.statues] });
  }

  return events;
}

/**
 * Land Harpies-stolen treasure (design US-04/US-10): straight onto the Lair's floor if it has
 * already been placed and entered (`state.lairCoord` set — see `enterChamber` above), else queued
 * in `harpyStash` until the Lair itself turns up. Exported for Task 9 (the Harpies hazard case,
 * `hazards.ts`) to call when artifacts are stolen; the caller supplies `events` to append the
 * `lairStash` notice to on immediate delivery (nothing "lands" — and so nothing is reported — when
 * merely queued). No-op for an empty list.
 *
 * Seam for Task 9: if the party is standing IN the Lair right now (mid-visit — `area.contents` is
 * not the live truth while a chamber session is active, see `enterChamber`'s comment above), items
 * delivered here land in the PARKED contents and surface on the party's NEXT entry rather than the
 * current pickup. Task 9 may want to special-case `state.partyArea === lair index` to push straight
 * into `state.treasures` instead; out of scope here.
 */
export function stashOrDeliver(state: GameState, treasureIds: readonly number[], events: GameEvent[]): void {
  if (treasureIds.length === 0) return;
  const area = state.lairCoord !== undefined ? state.areas.find((a) => a.coord === state.lairCoord) : undefined;
  if (area) {
    area.contents.push(...treasureIds.map((id) => 200 + id));
    events.push({ type: "lairStash", treasureIds: [...treasureIds] });
  } else {
    state.harpyStash = [...(state.harpyStash ?? []), ...treasureIds];
  }
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

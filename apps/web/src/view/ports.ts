/* ============================================================================
 * ports.ts — the CONTRACT between the game ENGINE and the 3D VIEW layer.
 *
 * The view (src/cave3d.js + src/reveal.js) only ever talks to the engine
 * through this surface. Implement `CaveEngine` on your real engine — or write a
 * thin adapter that wraps your engine and exposes these methods — and the
 * renderer drops in unchanged.
 *
 * Golden rule: the ENGINE owns every rule (deck, draw, move-legality, hazards,
 * combat, generation). The VIEW is a pure renderer of state + events and never
 * mutates engine state.
 *
 * The reference implementation that the prototype runs against is
 * src/cave-engine-stub.reference.js — read it as the worked example of every
 * method and return shape below.
 * ========================================================================== */

import type { Notice } from '../game/eventNotices';

export type Dir = 'N' | 'E' | 'S' | 'W' | 'U' | 'D';
export type Exits = string;                 // sorted subset of "NESW" — "ESW", "NESW", ""
export type AreaType = 'chamber' | 'tunnel';
export type CardCategory = 'creature' | 'treasure' | 'artifact' | 'hazard';

/** A small card laid in a chamber (creature / treasure / artifact / hazard). */
export interface Card {
  id: string;            // unique card id, e.g. "s01-3"
  name: string;          // "Dragon", "Charmed Flute"
  category: CardCategory;
  entityId?: string;     // your engine's canonical entity id, if any
  file: string;          // path/URL to the card-art PNG
  asleep?: boolean;      // a creature put to sleep by Lotus Dust — drawn with a sleep effect, inert
}

/** A placed tile = one "area" (chamber or tunnel) on the grid. */
export interface Area {
  // identity & placement
  tileId: string;        // which tile artwork, e.g. "s12-3"
  rot: 0 | 90 | 180 | 270; // clockwise rotation applied to BOTH art and exits
  level: number;         // 1 = top/surface level, increasing DOWNWARD
  col: number;           // grid column (east = +)
  row: number;           // grid row   (south = +)

  // topology — this is what makes corridors connect
  exits: Exits;          // open sides AFTER rotation
  type: AreaType;
  up: boolean;           // has an ascending staircase
  down: boolean;         // has a descending staircase
  special: string | null;// named-area key (e.g. "gateway", "great-hall") or null

  // presentation & state
  name: string;          // display name ("Dragon's Lair", "Tunnel")
  note?: string | null;  // optional flavour line for empty areas
  party: boolean;        // the party currently stands here
  visited: boolean;
  faceDown: boolean;     // placed but unrevealed (excluded from edge-matching)
  destroyed: boolean;    // collapsed by an earthquake — impassable, drawn as rubble
  secretDoor: number | null; // discovery order of a secret-door stair up (0 → "A"), else null

  // PERSISTENT chamber contents — the cards laid on this area's floor.
  // This is the "AC[area]" the player sees for the rest of the game.
  strangers: Card[];     // creatures
  treasure: Card[];      // treasure + artifacts
  hazards: Card[];       // hazards (resolved on entry; retained for the record)
}

/** Immutable snapshot for binding the HUD. */
export interface StateSnapshot {
  level: number; col: number; row: number;
  turn: number;
  placed: number;        // areas placed so far
  deckLeft: number;      // tiles remaining in the area deck
  current: Area;
}

/** A legal move offered from the current area. */
export interface Move {
  dir: Dir;
  kind: 'known' | 'undrawn' | 'stair' | 'exit';   // known=neighbour exists, undrawn=frontier, exit=leave the cave (level-1 up-stair)
  target: { level: number; col: number; row: number };
}

/** Cards to surface when entering (or re-entering) a chamber. */
export interface ChamberDraw {
  draws: Card[];         // cards now standing on the chamber floor
  firstVisit: boolean;   // true the first time (cards are drawn); false on return
}

/** The result of tryMove() — the view choreographs this. */
export type MoveEvent =
  | { moved: false; deadEnd?: boolean; placed?: Area | null } // placed: a tile drawn onto a dead-end frontier (party stays put)
  | {
      moved: true;
      dir: Dir;
      area: Area;              // area arrived in (now current)
      placed?: Area | null;    // non-null ONLY when a new tile was drawn & placed
      descended?: 'D';         // present when a down-staircase was taken
      ascended?: 'U';          // present when an up-staircase was taken
      fell?: boolean;          // present when a trap dropped the party a level (one-way, no climb back)
      trap?: 'sprung' | 'avoided'; // a trap fired: 'sprung' = fell, 'avoided' = a dwarf guided past it
      chamber?: ChamberDraw;   // present when the area has on-floor cards to reveal
      notices?: Notice[];      // feedback for otherwise-silent outcomes (viper deaths, hazards, Deep Pool, effects)
    };

/** The surface the view requires of the engine. */
export interface CaveEngine {
  /** All placed areas (any order). */
  readonly areas: Area[];
  /** Same areas keyed by `${level},${col},${row}` for O(1) neighbour lookup. */
  readonly placed: Map<string, Area>;
  /** Shallowest level number (the surface / entry level). */
  readonly startLevel: number;
  /** The area the party currently occupies. */
  readonly current: Area;

  /** HUD snapshot. */
  state(): StateSnapshot;

  /** Legal moves from `current` — lateral exits, stairs, and undrawn frontiers. */
  openMoves(): Move[];

  /**
   * Attempt one step in `dir`.
   * - On an UNDRAWN frontier the engine MUST draw a tile whose edges match every
   *   already-placed neighbour (so corridors always connect) and return it as
   *   `placed`.
   * - On a chamber's first visit it draws the small cards and returns them in
   *   `chamber.draws` (also persisting them onto Area.strangers/treasure/hazards).
   * Pure w.r.t. the view: the view only reads the returned event.
   */
  tryMove(dir: Dir): MoveEvent;

  /** True when the party may leave the Cave from `current` (a level-1 up-stair, spec §"Movement"). */
  canExit(): boolean;

  /** Leave the Cave (ends the game with GS_ESCAPED). Only valid when `canExit()`. */
  exit(): void;

  /** Abandon the expedition (ends the game with GS_QUIT) — the score is still tallied. */
  quit(): void;
}

/* ----------------------------------------------------------------------------
 * RevealContext — how src/reveal.js (the chamber discovery overlay) is wired.
 * reveal.js NARRATES ev.chamber (hazard banners, reaction rolls, encounter
 * choices, dice) and reports the player's single decision back via these
 * callbacks. It never mutates the engine; your engine drives the real rounds.
 * -------------------------------------------------------------------------- */
export interface RevealContext {
  party: Array<{ name: string; fs: number; mp: number; charisma: boolean }>;
  focusCard(card: Card): void;          // show a card large in the side panel
  snapToTile(area: Area): void;         // camera → overhead + isolate this level
  markStrangers(state: 'join' | 'slain'): void;
  markTreasure(state: 'take'): void;
  onResolved(area: Area): void;         // discovery beat finished
}

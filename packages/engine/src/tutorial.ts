import type { GameAction } from "./actions";
import { reduce } from "./reduce";
import { newGame } from "./setup";
import { driveStrangers } from "./strangerDriver";
import type { GameState } from "./state";

// The tutorial game (docs/requirements/tutorial, Peter's "Tutorial Game Script"): one fixed, hand-stacked kit game that
// the web client plays step by step. Both packs are stacked rather than shuffled, so the cave, its creatures and its
// treasure come up exactly as the script needs; everything else is the ordinary engine. Test Mode (no score is ever
// saved) lets the script force the two things a player cannot choose: a stranger's reaction and the fight dice.

/** W-Hero (1) and Dwarf (7): the whole 6-point budget. */
export const TUTORIAL_PICKS = [1, 7] as const;

// Area cards, by their printed exits (N=1 E=2 S=4 W=8, chamber=16, stair up=32). Any of these may be reused: the pack is stacked.
const TUNNEL_NS = 5;
const TUNNEL_NE = 3;
const TUNNEL_EW = 10;
const CHAMBER_NES = 23;
const CHAMBER_NEW = 27;
const CHAMBER_ESW = 30;
const TUNNEL_NES_UP = 39;
const TOMB_OF_KINGS = 543;
const WHIRLPOOL = 1183; // special area tile x07: a chamber with a doorway on every side

/** The large pack, in the order the script draws it: see TUTORIAL_ROUTE. */
const LARGE_PACK = [
  TUNNEL_NS, // 1. north of the Gateway: a tunnel
  CHAMBER_NES, // 2. north again: the Spectre's chamber
  TUNNEL_NE, // 3. west of the Gateway: a tunnel that turns north
  CHAMBER_ESW, // 4. north of it: the chamber with the trap
  TUNNEL_NE, // 5. west of the trap chamber: a tunnel with exits east and north
  WHIRLPOOL, // 6. north of that: the Whirlpool
  TUNNEL_EW, // 7. the party tries to wade west, falls in, and lands on level 2, in a tunnel (the tile it was about to reach is the one it lands on)
  CHAMBER_NEW, // 8. west of it: the Priest and the Magic Axe
  TUNNEL_NES_UP, // 9. north of that: a tunnel with a stair up
  TUNNEL_NS, // 10. up the stair: a level-1 tunnel with no stair down (a secret door)
  CHAMBER_ESW, // 11. back on level 2, east of the stair tunnel: the Troll and the gems
  TOMB_OF_KINGS, // 12. east again: the Tomb of Kings
];

// Small-pack codes: 100 + creature, 200 + treasure, 300 + hazard. A chamber draws min(level, 4) cards (the Tomb one more).
const SPECTRE = 109;
const TRAP = 301;
const PRIEST = 104;
const MAGIC_AXE = 217;
const TROLL = 103;
const GEMS = 202;
const EARTHQUAKE = 302;
const WITCH = 118;
const MAGIC_RING = 210;
const GOLD = 201;

const SMALL_PACK = [
  SPECTRE, // level 1: 1 card
  TRAP, // level 1: 1 card
  PRIEST, MAGIC_AXE, // level 2: 2 cards
  TROLL, GEMS, // level 2: 2 cards
  EARTHQUAKE, WITCH, MAGIC_RING, // the Tomb of Kings, level 2: 2 + 1 cards
  GOLD, GOLD, // spare, so an unexpected draw never meets an empty pack
];

/** A fresh tutorial game: kit rules and the revised combat, with both packs stacked. */
export function tutorialGame(): GameState {
  const base = newGame(2026, [...TUTORIAL_PICKS], { extensionKit: true }, true);
  return {
    ...base,
    variants: { ...base.variants, extensionKit: true, combatRevision: true },
    largePack: [...LARGE_PACK],
    largeIdx: 0,
    smallPack: [...SMALL_PACK],
    smallIdx: 0,
  };
}

const N = 1, E = 2, S = 3, W = 4, UP = 5, DOWN = 6; // the engine's direction codes (coords.ts)

/** One thing the player does in the tutorial. `before` are hidden Test Mode actions (a forced reaction, the fight dice) the tutorial
 *  applies first, so the player's own action comes out as written; `step` is Peter's step number. */
export interface TutorialBeat {
  step: number;
  play: GameAction;
  before?: GameAction[];
}

/** The player's route through the tutorial, in order, with each action tagged by its step in Peter's script. After every
 *  action the stranger driver runs (`driveStrangers`), exactly as in a real game. tutorial.test.ts replays it from `tutorialGame()`. */
export const TUTORIAL_ROUTE: TutorialBeat[] = [
  // [3] the Gateway; explore north: a tunnel
  { step: 3, play: { type: "move", dir: N } },
  // [4] a tunnel, then north again: a chamber with a Spectre
  { step: 4, play: { type: "move", dir: N } },
  // [5] a Spectre is too dangerous to fight: withdraw down the tunnel, to the Gateway, then west and north to a chamber with a trap
  //     (the Dwarf guides the party past it)
  { step: 5, play: { type: "withdraw" } },
  { step: 5, play: { type: "move", dir: S } },
  { step: 5, play: { type: "move", dir: W } },
  { step: 5, play: { type: "move", dir: N } },
  // [6] west: a tunnel with exits east and north; north again: the Whirlpool; then try to wade west through the shallows. The die is
  //     forced to 1, so the whirlpool drags the party down to level 2, onto the tile it was about to reach: a tunnel. Then west: a Priest guarding a Magic Axe
  { step: 6, play: { type: "move", dir: W } },
  { step: 6, play: { type: "move", dir: N } },
  { step: 6, before: [{ type: "testForceDie", value: 1 }], play: { type: "move", dir: W } },
  { step: 6, play: { type: "move", dir: W } },
  // [7] approach the Priest (she is friendly), take the Axe with the Woman-Hero
  { step: 7, before: [{ type: "testForceReaction", outcome: "friendly" }], play: { type: "test" } },
  { step: 7, play: { type: "takeTreasure", ti: 0, mi: 0 } },
  // [8] pass the Axe to the Dwarf and wield it; north: a tunnel with a stair up
  { step: 8, play: { type: "moveTreasure", from: 0, to: 1, idx: 0 } },
  { step: 8, play: { type: "setBorne", mi: 1, idx: 0, borne: true } },
  { step: 8, play: { type: "move", dir: N } },
  // [9] up the stair (a secret door at the far end), back down, then east: a Troll guarding gems
  { step: 9, play: { type: "move", dir: UP } },
  { step: 9, play: { type: "move", dir: DOWN } },
  { step: 9, play: { type: "move", dir: E } },
  // [10] the Troll is hostile and attacks (with surprise). Dice: party 3, Troll 4 => party Woman-Hero 4 + Dwarf 1 + Axe 3 + Priest's magic 2 + die 3 = 13 against Troll 4+1+4 = 9
  { step: 10, before: [{ type: "testForceReaction", outcome: "hostile" }, { type: "testForceDice", values: [3, 4] }], play: { type: "test" } },
  { step: 10, play: { type: "deploy", creatures: [0, 1, 2] } },
  { step: 10, play: { type: "redeploy", moves: [{ creature: 1, match: 0, back: false }, { creature: 2, match: 0, back: true }] } },
  { step: 10, play: { type: "takeTreasure", ti: 0, mi: 0 } },
  { step: 10, play: { type: "move", dir: E } }, // east: the Tomb of Kings
  // [11] the Tomb of Kings (an Earthquake, and a Witch guarding the Ring). A surprise attack with the Priest in support.
  // Dice: party 2, Witch 6 => party 4+4+2+1+2 = 13 against the Witch 5+6, plus the Ring she wields, = 12: a win by one, as Peter asked
  // (the Witch is strength 1 + magic 4, and strangers pick up the artefacts in their chamber, so she wields the Ring).
  { step: 11, before: [{ type: "testForceDice", values: [2, 6] }], play: { type: "attack" } },
  { step: 11, play: { type: "engage", pairs: [{ party: 0, stranger: 0 }], moves: [{ creature: 1, match: 0, back: false }, { creature: 2, match: 0, back: true }] } },
  // the fighters dropped the heavy gems to fight; pick them up again, and the Ring
  { step: 11, play: { type: "retakeDropped" } },
  { step: 11, play: { type: "takeTreasure", ti: 0, mi: 0 } },
];

/** The tutorial game after the player's first `cursor` route actions: how a returning player resumes. The route is deterministic
 *  (stacked packs, forced dice), so replaying it rebuilds exactly the state they left; each action is followed by the stranger driver, as live. */
export function tutorialAt(cursor: number): GameState {
  let state = tutorialGame();
  for (const beat of TUTORIAL_ROUTE.slice(0, cursor)) {
    for (const hidden of beat.before ?? []) state = reduce(state, hidden).state;
    state = driveStrangers(reduce(state, beat.play).state).state;
  }
  return state;
}

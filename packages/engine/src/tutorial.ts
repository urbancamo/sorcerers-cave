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

/** The large pack, in the order the script draws it: see TUTORIAL_ROUTE. */
const LARGE_PACK = [
  TUNNEL_NS, // 1. north of the Gateway: a tunnel
  CHAMBER_NES, // 2. north again: the Spectre's chamber
  TUNNEL_NE, // 3. west of the Gateway: a tunnel that turns north
  CHAMBER_ESW, // 4. north of it: the chamber with the trap
  TUNNEL_EW, // 5. the trap lands the party on level 2, in a tunnel
  CHAMBER_NEW, // 6. west of it: the Priest and the Magic Axe
  TUNNEL_NES_UP, // 7. north of that: a tunnel with a stair up
  TUNNEL_NS, // 8. up the stair: a level-1 tunnel with no stair down (a secret door)
  CHAMBER_ESW, // 9. back on level 2, east of the stair tunnel: the Troll and the gems
  TOMB_OF_KINGS, // 10. east again: the Tomb of Kings
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

/** A fresh tutorial game: kit rules, the trap rule and the revised combat, with both packs stacked. */
export function tutorialGame(): GameState {
  const base = newGame(2026, [...TUTORIAL_PICKS], { extensionKit: true }, true);
  return {
    ...base,
    variants: { ...base.variants, extensionKit: true, trapRules: true, combatRevision: true },
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
  { step: 5, play: { type: "withdraw" } },
  { step: 5, play: { type: "move", dir: S } },
  { step: 5, play: { type: "move", dir: W } },
  { step: 5, play: { type: "move", dir: N } },
  // [6] the Dwarf's choice at the trap: fall through it on purpose, to a tunnel on level 2; then west: a Priest guarding a Magic Axe
  { step: 6, play: { type: "fallThroughTrap" } },
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
  // [10] the Troll is hostile and attacks (with surprise). Dice: party 3, Troll 4 => party 4+4+3 = 11 against Troll 4+1+4 = 9
  { step: 10, before: [{ type: "testForceReaction", outcome: "hostile" }, { type: "testForceDice", values: [3, 4] }], play: { type: "test" } },
  { step: 10, play: { type: "deploy", creatures: [0, 1] } },
  { step: 10, play: { type: "redeploy", moves: [{ creature: 1, match: 0, back: false }] } },
  { step: 10, play: { type: "takeTreasure", ti: 0, mi: 0 } },
  { step: 10, play: { type: "move", dir: E } }, // east: the Tomb of Kings
  // [11] the Tomb of Kings (an Earthquake, and a Witch guarding the Ring). A surprise attack with the Priest in support.
  // Dice: party 1, Witch 5 => party 4+4+2+1+1 = 12 against the Witch 5+5, plus the Ring she wields, = 11. (Peter's script has her roll 6 and
  // no Ring; the stranger fight preparations rule has her pick the Ring up, so her die is 5 to keep the totals 12 vs 11.)
  { step: 11, before: [{ type: "testForceDice", values: [1, 5] }], play: { type: "attack" } },
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

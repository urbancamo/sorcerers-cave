export const GS_PLAYING = 0;
export const GS_ESCAPED = 1;
export const GS_DEAD = 2;
export const GS_QUIT = 3;

export const PARTY_CAP = 12;
export const PARTY_BUDGET = 6;
export const GATEWAY_START_COORD = 15050; // level 1, x=50, y=50

// Area-flag (PlacedArea.flags) bits.
export const AF_DESTROYED = 4; // collapsed by an earthquake — removed from play, impassable

// Interactive mode: which controls the UI shows and which actions reduce accepts.
// Milestone B uses only "explore" and "gameOver"; "encounter"/"fight"/"pickup" arrive in C.
export type GamePhase = "explore" | "encounter" | "fight" | "pickup" | "gameOver";

// Member status: 0 original, 1 ally, 2 stone, 3 dead.
export type MemberStatus = 0 | 1 | 2 | 3;

export interface PartyMember {
  creatureId: number;
  status: MemberStatus;
  dragonKills: number;
  treasure: number[]; // treasure ids carried
  potionActive?: boolean; // Strength Potion drunk this fight (+2 frontStrength until it ends)
}

export interface PlacedArea {
  card: number; // area-card value
  coord: number; // packed level*10000 + y*100 + x
  faceUp: boolean; // entered (true) vs dead-end face-down (false)
  visited: boolean; // chamber already drawn
  contents: number[]; // leftover 100+cid / 200+tid (Milestone C)
  flags: number; // AF bits (Milestone C)
  indiffCount: number; // AI permanent-indifference counter (Milestone C)
  dropped?: number[]; // heavy treasure ids left in a Deep Pool, reclaimable on return (§10.2)
  // Stair bits (32=up, 64=down) added for level connectivity on descent/carpet, NOT printed on
  // the card. They keep `card` traversable both ways but are excluded from rendering, so the tile
  // is always drawn in its printed orientation (the original game links levels with markers).
  mirroredStairs?: number;
}

// surprise: +1 party, -1 strangers, 0 none (applies to round 1 only). focus indexes `strangers`.
export interface FightState {
  surprise: number;
  round: number;
  focus: number;
}

export interface GameState {
  gs: number; // GS_*
  phase: GamePhase; // interactive mode (UI controls + valid actions)
  turn: number;
  score: number;
  curses: number;
  bonusScore: number; // banked points (e.g. Treasure Chest loot) added at scoring
  sorcererKilled: boolean;
  areas: PlacedArea[];
  partyArea: number; // index into areas
  level: number;
  prev: number; // previous area index
  prev2: number; // area two moves back (earthquake)
  party: PartyMember[];
  largePack: number[];
  largeIdx: number;
  smallPack: number[];
  smallIdx: number;
  strangers: number[]; // chamber working set (Milestone C)
  treasures: number[];
  hazards: number[];
  seed: number; // LCG state (spec §5)
  fight: FightState | null;
  // True while the party's current position was reached by a one-way trap fall: prev is the level
  // above, which is unreachable, so withdraw/retreat are disallowed. Cleared on the next move.
  fellThroughTrap?: boolean;
  // True only for the turn the party freshly enters a chamber with strangers by an unused doorway
  // or magic carpet (NOT a trap fall): the party gains the advantage of surprise if it attacks now.
  // Cleared once the party tests reaction (no longer an immediate attack) or the fight begins.
  surpriseReady?: boolean;
}

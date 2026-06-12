// Player decisions. Multiplayer will later wrap these with a playerId.
export type GameAction =
  | { type: "move"; dir: number }
  | { type: "quit" }
  | { type: "exitCave" };

// What happened — the reducer is the only producer; the UI never infers game facts.
// Chamber draws / encounters / fights / hazards are emitted in Milestone C.
export type GameEvent =
  | { type: "moved"; area: number; level: number }
  | { type: "deadEnd"; dir: number }
  | { type: "blocked" }
  | { type: "drewChamber"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "enteredSpecial"; special: number }
  | { type: "gameOver"; gs: number }
  | { type: "hazardFired"; hazard: number };

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
  | { type: "blocked" } // no exit on the card, or the large pack is exhausted
  | { type: "enteredChamber"; area: number } // skeleton: the actual draw happens in Milestone C
  | { type: "enteredSpecial"; special: number } // Deep Pool / Viper Pit (Milestone C)
  | { type: "gameOver"; gs: number };

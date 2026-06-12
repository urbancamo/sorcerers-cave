// Player decisions. Multiplayer will later wrap these with a playerId.
export type GameAction =
  | { type: "move"; dir: number }
  | { type: "quit" }
  | { type: "exitCave" }
  | { type: "withdraw" }
  | { type: "takeTreasure"; ti: number; mi: number }
  | { type: "leaveTreasure" }
  | { type: "test" }
  | { type: "attack" }
  | { type: "focusTarget"; idx: number }
  | { type: "fightOn" }
  | { type: "retreat" };

// What happened — the reducer is the only producer; the UI never infers game facts.
// Encounter-resolution and fight events arrive with combat (Milestone C-2).
export type GameEvent =
  | { type: "moved"; area: number; level: number }
  | { type: "deadEnd"; dir: number }
  | { type: "blocked" }
  | { type: "drewChamber"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "enteredSpecial"; special: number }
  | { type: "gameOver"; gs: number }
  | { type: "hazardFired"; hazard: number }
  | { type: "memberDied"; creatureId: number }
  | { type: "strangerKilled"; creatureId: number }
  | { type: "spectreSlew"; creatureId: number }
  | { type: "reaction"; outcome: "hostile" | "indifferent" | "friendly" }
  | { type: "strangersJoined"; count: number }
  | { type: "fightStarted"; surprise: number }
  | { type: "fightWon" }
  | { type: "crossedSpecial"; special: number }
  | { type: "treasureDropped"; count: number }
  | { type: "treasureReclaimed"; count: number };

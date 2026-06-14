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
  | { type: "retreat" }
  | { type: "useArtifact"; artifact: number; target?: number; dir?: number }
  | { type: "openChest" };

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
  | { type: "reaction"; outcome: "hostile" | "indifferent" | "friendly"; roll: number }
  | { type: "strangersJoined"; count: number }
  | { type: "fightStarted"; surprise: number }
  // One resolved pairing in a fight round: the party side and the enemy side, each with its
  // raw d6 (`*Roll`) and modified total (`*Total`). The UI shows both rolls side by side.
  | {
      type: "combatRoll";
      party: string;
      enemy: string;
      partyRoll: number;
      enemyRoll: number;
      partyTotal: number;
      enemyTotal: number;
      result: "partyWon" | "enemyWon" | "tie";
    }
  | { type: "fightWon" }
  | { type: "crossedSpecial"; special: number }
  | { type: "treasureDropped"; count: number }
  | { type: "treasureReclaimed"; count: number }
  | { type: "artifactUsed"; artifact: number }
  | { type: "chestOpened"; result: number }
  | { type: "rubyTaken" }
  | { type: "statueAroused" }
  | { type: "statueAttacked" }
  | { type: "wardedOff"; creatureId: number }
  | { type: "annihilated"; creatureId: number }
  | { type: "statuePowerless" }
  | { type: "deathPrevented"; creatureId: number }
  | { type: "unicornGuards"; creatureId: number }
  | { type: "unicornDeparted"; creatureId: number }
  | { type: "carpetUsed"; dir: number }
  | { type: "dragonsLulled"; count: number }
  | { type: "secretDoorRevealed"; dir: number };

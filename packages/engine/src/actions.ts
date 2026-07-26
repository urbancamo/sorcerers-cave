import type { PlanMatch } from "./state";

// Player decisions. Multiplayer will later wrap these with a playerId.
export type GameAction =
  | { type: "move"; dir: number }
  | { type: "quit" }
  | { type: "exitCave" }
  | { type: "withdraw" }
  | { type: "takeTreasure"; ti: number; mi: number }
  | { type: "leaveTreasure" }
  | { type: "retakeDropped" } // (pickup, after a win) give each fighter back the heavy treasure it dropped to fight
  // Redistribute carried treasure (spec §"keep holdings… A player may redistribute treasure"):
  | { type: "moveTreasure"; from: number; to: number; idx: number } // give party[from].treasure[idx] to party[to]
  | { type: "dropTreasure"; mi: number; idx: number }               // drop party[mi].treasure[idx] onto the floor
  // Bear (wield/wear/display) or stow a borneable item — Sword/Staff/Ring only (plan ④a). Dispatched
  // by the party panel like moveTreasure/dropTreasure; never offered via legalActions.
  | { type: "setBorne"; mi: number; idx: number; borne: boolean }
  | { type: "test" }
  | { type: "attack" }
  | { type: "resolveRound"; matches: PlanMatch[] } // resolve one round from a player-supplied pairing
  | { type: "chooseCasualty"; idx: number } // pick which of a losing pair falls (§"A Round of Fighting")
  | { type: "retreat"; dir: number } // flee a fight by any doorway/stair; a dead end means fight on
  | { type: "useArtifact"; artifact: number; target?: number; dir?: number }
  | { type: "proceed" } // decline the Medusa-pause throw: let her gaze (and the other hazards) fire
  | { type: "openChest" }
  // Extension kit (SC-EXT-5): descend the Chasm — legal only on a SPECIAL_CHASM tile, in explore or
  // encounter phase (design US-02). No dice; reuses `relocateDown` (one-way, no mirrored stair-up).
  | { type: "descendChasm" };

// What happened — the reducer is the only producer; the UI never infers game facts.
// Encounter-resolution and fight events arrive with combat (Milestone C-2).
export type GameEvent =
  | { type: "moved"; area: number; level: number }
  | { type: "deadEnd"; dir: number }
  | { type: "blocked" }
  | { type: "planRejected"; reason: string } // the submitted battle plan broke a pairing rule
  | { type: "drewChamber"; strangers: number[]; treasures: number[]; hazards: number[] }
  | { type: "enteredSpecial"; special: number }
  | { type: "gameOver"; gs: number }
  | { type: "hazardFired"; hazard: number }
  // Allies deserted (Mutiny): they revert to strangers and drop their treasure into the chamber.
  | { type: "mutinied"; deserters: number[]; treasures: number[] }
  | { type: "medusaGaze"; rolls: { creatureId: number; roll: number; petrified: boolean }[] } // a d6 per member
  | { type: "viperPit"; rolls: { creatureId: number; roll: number; died: boolean }[] } // a d6 per member crossing
  | { type: "eyeForsaken" } // the Eye of God was dropped or handed off — a curse falls on the party
  | { type: "petrifiedOut" } // Medusa's gaze turned the WHOLE party to stone — the game ends
  | { type: "trapSprung"; level: number } // party fell through a trap to `level` (no climb back)
  | { type: "trapAvoided" } // a dwarf guided the party safely past a trap
  | { type: "memberDied"; creatureId: number }
  | { type: "strangerKilled"; creatureId: number }
  | { type: "sorcererSlain" } // the Sorcerer himself has been defeated — the cave's master is no more
  | { type: "spectreSlew"; creatureId: number }
  | { type: "memberRevived"; creatureId: number } // a stoned member freed by a returning Wizard's Magic Staff
  | { type: "reaction"; outcome: "hostile" | "indifferent" | "friendly"; roll: number }
  | { type: "pacified" } // a 3rd indifferent test — the strangers are now permanently indifferent to this party
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
  // A losing pair's casualty was decided: `roll` is the d6, `gotPreference` whether 4-6 honoured the choice.
  | { type: "casualtyChosen"; creatureId: number; roll: number; gotPreference: boolean }
  | { type: "crossedSpecial"; special: number }
  | { type: "treasureDropped"; count: number }
  | { type: "treasureReclaimed"; count: number }
  | { type: "artifactUsed"; artifact: number }
  | { type: "chestOpened"; result: number }
  | { type: "rubyTaken" }
  | { type: "statueAroused" } // the Lost-Ruby statue slew the member who tried to wrest it (labels the dice overlay)
  | { type: "wardedOff"; creatureId: number }
  | { type: "ghoulsWarded" } // a party member's Talisman turned the Ghouls away (card)
  | { type: "medusaAverted" } // a Wizard's Magic Staff turned Medusa's gaze aside — no one stoned (card)
  // The Medusa pause (§Lotus Dust "Works on MEDUSA"): the party entered her lair holding Lotus Dust,
  // so the hazards are held while the player decides to throw the dust at her or proceed.
  | { type: "medusaLooms" }
  | { type: "medusaSlept"; until: number } // the dust is thrown — she sleeps while the thrower's turn <= until
  | { type: "medusaAsleep" } // entered while she sleeps — no gaze this entry
  | { type: "droppedRetaken"; count: number } // fighters reclaimed the heavy treasure they dropped to fight
  | { type: "annihilated"; creatureId: number }
  | { type: "statuePowerless" }
  | { type: "deathPrevented"; creatureId: number }
  | { type: "unicornGuards"; creatureId: number }
  | { type: "unicornDeparted"; creatureId: number }
  | { type: "carpetUsed"; dir: number }
  | { type: "dragonsLulled"; count: number }
  | { type: "vipersLulled" }
  | { type: "secretDoorRevealed"; dir: number }
  // A downed (slain or petrified) member's CARRIED items spilled onto the chamber floor — borne items
  // stay with the body (§Medusa "anything they were carrying can be taken", plan ④a / I-12).
  | { type: "itemsSpilled"; creatureId: number; items: number[] }
  // Heavy treasure cast down at a PvP declaration (§388 "left on the area card until the issue is
  // decided", spec I-9). Distinct from treasureDropped, which is the DEEP POOL sinking — reusing
  // that type made the UI announce a pool where there was only a brawl. Emitted only by multi-fight.
  | { type: "heavyDownForFight"; count: number }
  // Extension kit special-area events (design US-02/US-05, SC-EXT-5/SC-EXT-6):
  | { type: "chasmDescend" } // the party chose to climb down the Chasm — a fresh card one level down
  | { type: "whirlpoolRoll"; roll: number; dragged: boolean }; // crossing the Whirlpool's shallows: 1-2 drags the party down

/** A creature in a simulated fight. `g` is a bitmask of the fight artefacts it bears (see rules.ts), kept beside
 *  `gear` (treasure ids) so the hot path never searches an array. */
export interface Unit {
  cid: number;          // creature id (engine data/creatures.ts)
  gear: number[];       // treasure ids borne
  g: number;            // bitmask of `gear`
  dragonKills: number;  // party only
  fsBonus: number;      // party only: the Elixir's permanent +2
  potion: boolean;      // party only: a Strength Potion is active
  alive: boolean;
  role: number;         // 0 free, 1 deployed (unengaged front line), 2 engaged front line, 3 background
}

/** The rules that are still switches. Everything Peter has settled is fixed in the code and no longer a switch: the roles never
 *  change (the attacker is who started the fight), a stranger's casualty is nominated and rolled like the party's, two against two
 *  is allowed, the loadout is the Default Loadout run once, and a fight ends by his single test (Q1-Q10, 10-OCT-2026). */
export interface Rules {
  shieldWardsBackers: boolean;                    // O2: a Shield also wards stranger casters backing the match (the card)
  staffPriest: 1 | 2;                             // D3: the Staff's bonus to a Priest-class creature (settled: 2, the card)
  partyRetreatRatio: number;                      // simulated player retreats when its strength / the strangers' is below this (0 = never)
  maxRounds: number;                              // safety cap
}

/** Which side of a fight. */
export type Side = "party" | "strangers";

export interface Ctx {
  eye: boolean;
  curses: number;
  level: number;
  attacker: Side;       // who started the fight; fixed for the whole fight (definition 5)
  surprise: 0 | 1 | 2;  // the attacker's surprise-attack bonus, round 1 only (reformulated rules, Determining Surprise Attack)
  rules: Rules;
}

export interface MatchView { pf: Unit[]; pb: Unit[]; sf: Unit[]; sb: Unit[] }

export interface Scenario {
  party: Unit[];
  strangers: Unit[];
  eye: boolean;
  curses: number;
  level: number;
  attacker: Side;       // "strangers": approached and proved hostile (always +1); "party": attacked, with a route-based bonus
  surprise: 0 | 1 | 2;  // the attacker's round-1 bonus
  floor?: number[];     // fight artefacts lying in the chamber that the strangers have NOT yet been armed with (only when the loadout was deferred)
}

/** How a simulated side makes its choices (training task spec §6.1). The strangers' `GRD` is the `HEU` baseline. */
export type Style = "GRD" | "CAU" | "MAG" | "RLG";

export interface Outcome {
  end: "strangersWin" | "partyWin" | "retreat" | "stalemate" | "cap";
  rounds: number;
  partyAlive: number;
  strangersAlive: number;
  partyValueLost: number;
  strangerValueLost: number;
  r1: number;  // share of the first round's matches the strangers won (ties half)
  r2: number;  // 1 if the strangers win, the party retreats, or a stalemate leaves the strangers holding the area; 0 if the party wins; 0.5 at the round cap
  r3: number;  // value destroyed minus value lost, scaled to 0..1
}

/** One match in progress: indices into the two unit arrays. */
export interface Match { pf: number[]; pb: number[]; sf: number[]; sb: number[] }

import type { Rng } from "./rng";
/** The live state of a fight being simulated: everything needed to continue it, so a position can be cloned for a rollout. */
export interface Fight {
  P: Unit[]; S: Unit[]; matches: Match[]; ctx: Ctx; rng: Rng; round: number;
  totalP: number; totalS: number;           // the sides' starting value (points), for the reward
  pvl: number; svl: number;                 // value lost so far, by side
  r1Won: number; r1Matches: number;         // the strangers' share of round-1 matches (R1)
  end: Outcome["end"] | null;               // set when the fight is over
}

/** Optional hooks for experiments. */
export interface SimOptions {
  /** Replaces the strangers' round-1 engagement (when they attack): given the attackers, their free indices, the defenders
   *  and the deployed front line, return the one-to-one pairs [attackerIdx, defenderIdx]. Everything after round 1 plays normally.
   *  Only used when the strangers are the attacker. */
  round1Engage?: (A: Unit[], attFree: number[], D: Unit[], defDep: number[], F: Fight) => [number, number][];
  /** The style the party uses to deploy in round 1 (when the strangers attack), whatever its style is afterwards. Lets an
   *  experiment hold the observed formation fixed while varying how the party plays the later rounds. */
  round1PartyStyle?: Style;
  /** Called for every match resolved, in order. Tracing never changes the outcome. */
  trace?: (e: TraceEvent) => void;
}

/** What `trace` reports, in the order it happens. A "match" is one match as it was fought: the creatures (3-letter codes), the
 *  strength totals, the die bonuses, the dice and the result ("S" the strangers won, "P" the party won, "T" a tie, so the match
 *  persists). A "casualty" is a creature that fell (with the nominated creature and the roll when a two-creature front line lost);
 *  "saved" is a level 4+ Ring bearer who could not be killed; "stalemate" is a match neither side can win and kill in (it persists unfought); "round" is the state at the end of a round; "end" is how it finished. */
export type TraceEvent =
  | {
      type: "match";
      round: number;
      party: string[]; partyBack: string[]; strangers: string[]; strangersBack: string[];
      /** The same creatures as indices into the scenario's `party` and `strangers` arrays. */
      partyIdx: number[]; partyBackIdx: number[]; strangersIdx: number[]; strangersBackIdx: number[];
      partyStrength: number; strangerStrength: number;
      partyBonus: number; strangerBonus: number;
      partyDie: number; strangerDie: number;
      result: "S" | "P" | "T";
    }
  | { type: "casualty"; round: number; side: "party" | "strangers"; creature: string; index: number; nominated?: string; roll?: number }
  | { type: "saved"; round: number; side: "party" | "strangers"; creature: string; index: number }
  | { type: "stalemate"; round: number; party: string[]; strangers: string[] }
  | { type: "round"; round: number; partyAlive: number; strangersAlive: number }
  | { type: "end"; end: Outcome["end"]; round: number };

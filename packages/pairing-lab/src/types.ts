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

/** Every rule that is still an open question is a switch here, set to the default proposed in the questions
 *  for Peter (docs/requirements/combat/2026-10-04-questions-for-peter.md). */
export interface Rules {
  strangersAttackFirst: boolean;                  // Q1: who attacks in round 1 (default: the strangers)
  alternate: boolean;                             // Q1: the roles swap every round (default: yes)
  strangerCasualty: "nominate" | "strongest";     // Q3: a two-creature stranger front line loses (default: Peter's text)
  shieldWardsBackers: boolean;                    // O2: a Shield also wards stranger casters backing the match (the card)
  staffPriest: 1 | 2;                             // D3: the Staff's bonus to a Priest-class creature (default: 2, the card)
  partyRetreatRatio: number;                      // simulated player retreats when its strength / the strangers' is below this (0 = never)
  maxRounds: number;                              // safety cap
}

export interface Ctx {
  eye: boolean;
  curses: number;
  level: number;
  surprise: 0 | 1;      // the strangers' first-round surprise bonus
  rules: Rules;
}

export interface MatchView { pf: Unit[]; pb: Unit[]; sf: Unit[]; sb: Unit[] }

export interface Scenario {
  party: Unit[];
  strangers: Unit[];
  eye: boolean;
  curses: number;
  level: number;
  strangerSurprise: 0 | 1;
}

/** How a simulated side makes its choices (training task spec §6.1). The strangers' `GRD` is the `HEU` baseline. */
export type Style = "GRD" | "CAU" | "MAG" | "RLG";

export interface Outcome {
  end: "strangersWin" | "partyWin" | "retreat" | "cap";
  rounds: number;
  partyAlive: number;
  strangersAlive: number;
  partyValueLost: number;
  strangerValueLost: number;
  r1: number;  // share of the first round's matches the strangers won (ties half)
  r2: number;  // 1 if the strangers win the fight or the party retreats, 0 if the party wins, 0.5 at the round cap
  r3: number;  // value destroyed minus value lost, scaled to 0..1
}

/** One match in progress: indices into the two unit arrays. */
export interface Match { pf: number[]; pb: number[]; sf: number[]; sb: number[] }

import type { Rng } from "./rng";
/** The live state of a fight being simulated. */
export interface Fight { P: Unit[]; S: Unit[]; matches: Match[]; ctx: Ctx; rng: Rng; round: number }

/** Optional hooks for experiments. */
export interface SimOptions {
  /** Replaces the strangers' round-1 engagement (when they attack): given the attackers, their free indices, the defenders
   *  and the deployed front line, return the one-to-one pairs [attackerIdx, defenderIdx]. Everything after round 1 plays normally. */
  round1Engage?: (A: Unit[], attFree: number[], D: Unit[], defDep: number[], F: Fight) => [number, number][];
}

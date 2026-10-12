// Stranger strategies (docs/requirements/combat/2026-10-11-pluggable-stranger-combat.md §5.2, stage 1): the one decision the
// strangers make today — who bears which fight artefact — behind a registry, so a game can be played against a different
// strategy without the engine knowing any concrete one (P3). The pairing hooks arrive with the revised round engine (stage 4).
//
// A strategy never changes the game: it returns a plain decision, the driver (strangerDriver.ts) checks it against the engine's
// legality layer and applies it as a logged action (P5, P6).
import { defaultLoadout, type Allocation } from "./loadout";
import { randBelow } from "./rng";
import { standardCasualty, standardDeploy, standardEngage, standardRedeploy } from "./standardPairing";

/** What a strategy may know when assigning artefacts: a read-only copy of the facts, never the game state itself (P4, P8). */
export interface LoadoutContext {
  view: {
    strangers: readonly number[];           // creature ids, by stranger index
    gear: readonly (readonly number[])[];   // what each already bears
    floor: readonly number[];               // treasure ids lying in the chamber, unborne
    eyePresent: boolean;
    level: number;
    round: number;
    /** The opposing party as the strangers can see it: each living member's front-line strength and how much of it is magic. */
    party: readonly { creatureId: number; strength: number; magic: number }[];
    /** The die bonus the party has this fight (its Ring, less curses). */
    partyRollBonus: number;
  };
  /** A per-decision random stream seed, derived from the game seed without advancing it (P8). */
  rngSeed: number;
  budget: { maxNodes: number; deadlineMs?: number };
}

export interface LoadoutDecision { allocations: Allocation[] }

/** One living creature as a strategy sees it: its position in `state.party` / `state.strangers`, and its strength now. */
export interface UnitView {
  index: number; creatureId: number;
  strength: number;   // as a front-line fighter (fighting strength plus magic; the Eye and artefacts already counted)
  magic: number;      // the part of `strength` that is magical power
  caster: boolean;    // may stand in the background of a match
  points: number;
}
/** One match as a strategy sees it: positions, and each side's current total (backers included). */
export interface MatchView { pf: number[]; pb: number[]; sf: number[]; sb: number[]; partyStrength: number; strangerStrength: number }

/** The fight as the strangers can see it (revised round engine). Plain data: nothing here can change the game (P4, P8). */
export interface FightView {
  round: number; attacker: "party" | "strangers"; eyePresent: boolean; level: number;
  party: readonly UnitView[]; strangers: readonly UnitView[];   // living creatures only
  matches: readonly MatchView[];
  /** Unengaged creatures already in the front line this round. */
  deployed: { party: readonly number[]; strangers: readonly number[] };
  partyDieBonus: number; strangerDieBonus: number;
}
interface HookBase { view: FightView; rngSeed: number; budget: { maxNodes: number; deadlineMs?: number } }

/** Defender, step c: choose which of your unengaged creatures to put in the front line — at least `min`, or all of them if fewer. */
export interface DeployContext extends HookBase { free: readonly number[]; min: number }
export interface DeployDecision { creatures: number[] }
/** Attacker, step d: pair your unengaged creatures one-to-one against the defender's deployed front line, until none can be paired.
 *  `legalPairs` lists every pairing the rules allow (a Spectre cannot be paired with a fighter who has no magic, and so on). */
export interface EngageContext extends HookBase { own: readonly number[]; foes: readonly number[]; legalPairs: readonly { party: number; stranger: number }[] }
export interface EngageDecision { pairs: { party: number; stranger: number }[] }
/** Step e, either side: put unengaged creatures in a match's front line (never a third, never a new match) or a caster in its background.
 *  `legalMoves` lists every single move the rules allow; a side need not move anyone. */
export interface RedeployContext extends HookBase { candidates: readonly number[]; legalMoves: readonly { creature: number; match: number; back: boolean }[] }
export interface RedeployDecision { moves: { creature: number; match: number; back: boolean }[] }
/** A two-creature front line lost a match: nominate one of the pair. A die then decides: 4-6 and the nominated creature falls, else the other. */
export interface CasualtyContext extends HookBase { pair: readonly [number, number] }
export interface CasualtyDecision { nominated: number }

export interface StrangerStrategy {
  readonly id: string;
  /** Bumped on any behaviour change; written to every logged decision. */
  readonly version: number;
  readonly kind: "builtin" | "external";
  assignArtefacts(ctx: LoadoutContext): LoadoutDecision;
  // The pairing hooks (revised round engine only). Any a strategy leaves out are `standard`'s.
  deploy?(ctx: DeployContext): DeployDecision;
  engage?(ctx: EngageContext): EngageDecision;
  redeploy?(ctx: RedeployContext): RedeployDecision;
  chooseCasualty?(ctx: CasualtyContext): CasualtyDecision;
}

/** `standard`: Peter's default loadout (docs/rules/strangers-default-loadout-v2-20261003.md). Always present; the universal fallback. */
export const standardStrategy: StrangerStrategy = {
  id: "standard", version: 1, kind: "builtin",
  assignArtefacts(ctx) {
    let seed = ctx.rngSeed;
    const allocations = defaultLoadout({
      strangers: ctx.view.strangers, gear: ctx.view.gear, floor: ctx.view.floor, eyePresent: ctx.view.eyePresent,
      pick: (n) => { const r = randBelow(seed, n); seed = r.seed; return r.value; },
    });
    return { allocations };
  },
  // Provisional baseline (spec D7): the lab's "strongest against strongest" until it proposes a better one.
  deploy: standardDeploy, engage: standardEngage, redeploy: standardRedeploy, chooseCasualty: standardCasualty,
};

const registry = new Map<string, StrangerStrategy>([[standardStrategy.id, standardStrategy]]);

export function registerStrategy(s: StrangerStrategy): void {
  if (s.id === standardStrategy.id) throw new Error("the standard strategy cannot be replaced");
  registry.set(s.id, s);
}
/** Remove a registered strategy (tests, hot reload). `standard` cannot be removed. */
export function unregisterStrategy(id: string): void { if (id !== standardStrategy.id) registry.delete(id); }
export const hasStrategy = (id: string): boolean => registry.has(id);
export const listStrategyIds = (): string[] => [...registry.keys()];
/** A strategy by id; `standard` for anything unknown. */
export const getStrategy = (id: string): StrangerStrategy => registry.get(id) ?? standardStrategy;

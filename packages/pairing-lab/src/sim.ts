// The fight simulator: play a fight forward, fast, from a scenario (Monte Carlo spec §4.1). Pure and seeded: the same
// scenario, rules, policies and seed always give the same outcome, and the scenario is never modified.
//
// It follows Peter's reformulated fighting rules (docs/rules/fighting-rules-reformulated-20261008.md) as corrected by his
// response of 10-OCT-2026: the roles are fixed for the whole fight, and each round is steps (a) bonuses, (c) the defender
// deploys, (d) the attacker engages one-to-one, (e) either side deploys its surplus (two against two is allowed), (f) each match
// is fought, (g) wrap-up. A fight ends when neither side has a creature able to continue a match, be deployed to create a match,
// or be deployed to break a stalemate (Q2). The Scroll (step b) is not modelled.
//
// A fight is a plain `Fight` that can be cloned and continued, and the round is exposed as steps, so a search can snapshot a
// position, try a decision, and roll it forward (`cloneFight`, `resumeAfterEngage`).
import { makeRng, type Rng } from "./rng";
import { CR3 } from "./mnemonics";
import {
  POINTS, casualtyVictim, invincible, isCaster, isStalemate, matchStrength, partyDieBonus, partyHasRing, strangerDieBonus, totalOf,
} from "./rules";
import { STYLE_POLICIES, toPolicy, unitsOf, type Policy } from "./policies";
import type { Fight, Match, MatchView, Outcome, Rules, Scenario, Side, SimOptions, Style, Unit } from "./types";

export const FREE = 0, DEPLOYED = 1, ENGAGED = 2, BACK = 3;

const cloneUnit = (u: Unit): Unit => ({ ...u, gear: u.gear, alive: true, role: FREE });
const copyUnit = (u: Unit): Unit => ({ ...u });
const countAlive = (us: Unit[]): number => { let n = 0; for (const u of us) if (u.alive) n++; return n; };
const value = (us: Unit[]): number => { let v = 0; for (const u of us) v += POINTS[u.cid]!; return v; };
export const viewOf = (F: Fight, m: Match): MatchView => ({
  pf: m.pf.map((i) => F.P[i]!), pb: m.pb.map((i) => F.P[i]!), sf: m.sf.map((i) => F.S[i]!), sb: m.sb.map((i) => F.S[i]!),
});

export type Policies = Record<Side, Policy>;

/** Everything fixed at the start of a round (step a). */
export interface RoundCtx {
  round: number;
  attacker: Side;
  defender: Side;
  pBonus: number;   // die bonus on every party roll this round (Ring, curses, surprise)
  sBonus: number;   // die bonus on every stranger roll this round
  pRing: boolean;   // the Ring bonus is fixed now, so it counts even if the bearer falls this round
  sRing: boolean;
  progress: boolean;
}

export function startFight(scn: Scenario, rules: Rules, seed: number): Fight {
  const ctx = { eye: scn.eye, curses: scn.curses, level: scn.level, attacker: scn.attacker, surprise: scn.surprise, rules };
  const P = scn.party.map(cloneUnit), S = scn.strangers.map(cloneUnit);
  return { P, S, matches: [], ctx, rng: makeRng(seed), round: 0, totalP: value(P), totalS: value(S), pvl: 0, svl: 0, r1Won: 0, r1Matches: 0, end: null };
}

/** An independent copy of a fight position, with its own random stream (for rollouts; the same `rng` seed gives common random numbers). */
export function cloneFight(F: Fight, rng: Rng): Fight {
  return {
    ...F, P: F.P.map(copyUnit), S: F.S.map(copyUnit), rng,
    matches: F.matches.map((m) => ({ pf: m.pf.slice(), pb: m.pb.slice(), sf: m.sf.slice(), sb: m.sb.slice() })),
  };
}

const kill = (F: Fight, side: Side, i: number, opts?: SimOptions, detail?: { nominated: string; roll: number }): void => {
  const units = unitsOf(F, side);
  const u = units[i]!; u.alive = false; u.role = FREE;
  if (side === "party") F.pvl += POINTS[u.cid]!; else F.svl += POINTS[u.cid]!;
  opts?.trace?.({ type: "casualty", round: F.round, side, creature: CR3[u.cid] ?? "???", index: i, ...detail });
};

const indicesWhere = (us: Unit[], f: (u: Unit) => boolean): number[] => { const out: number[] = []; for (let i = 0; i < us.length; i++) if (us[i]!.alive && f(us[i]!)) out.push(i); return out; };

/** Step (a): the round's bonuses, fixed for the whole round. */
export function beginRound(F: Fight): RoundCtx {
  const { P, S, ctx } = F;
  F.round++;
  return {
    round: F.round, attacker: ctx.attacker, defender: ctx.attacker === "party" ? "strangers" : "party",
    pBonus: partyDieBonus(P, ctx, F.round), sBonus: strangerDieBonus(S, ctx, F.round),
    pRing: partyHasRing(P, ctx), sRing: partyHasRing(S, ctx), progress: false,
  };
}

/** Step (c): the defender deploys at least as many unengaged creatures as the attacker has (all of them if it has fewer). */
export function stepDeploy(F: Fight, rc: RoundCtx, pol: Policies, opts?: SimOptions): void {
  const A = unitsOf(F, rc.attacker), D = unitsOf(F, rc.defender);
  const attUnengaged = indicesWhere(A, (u) => u.role === FREE).length;
  const defFree = indicesWhere(D, (u) => u.role === FREE);
  if (attUnengaged === 0 || defFree.length === 0) return;
  const min = Math.min(defFree.length, attUnengaged);
  const policy = rc.round === 1 && rc.attacker === "strangers" && opts?.round1PartyStyle ? STYLE_POLICIES[opts.round1PartyStyle] : pol[rc.defender];
  const chosen = policy.deploy(F, rc.defender, defFree, min);
  let deployed = 0;
  for (const i of chosen) if (D[i] && D[i]!.alive && D[i]!.role === FREE) { D[i]!.role = DEPLOYED; deployed++; }
  // legality: a policy may not deploy fewer than the minimum; top up with the strongest
  if (deployed < min) {
    const rest = defFree.filter((i) => D[i]!.role === FREE).sort((a, b) => totalOf(D[b]!, F.ctx) - totalOf(D[a]!, F.ctx));
    for (const i of rest) { if (deployed >= min) break; D[i]!.role = DEPLOYED; deployed++; }
  }
}

/** Step (d): the attacker pairs its unengaged creatures one-to-one against the defender's unengaged front line, as many as it can. */
export function stepEngage(F: Fight, rc: RoundCtx, pol: Policies, opts?: SimOptions, forced?: [number, number][]): void {
  const A = unitsOf(F, rc.attacker), D = unitsOf(F, rc.defender);
  const attFree = indicesWhere(A, (u) => u.role === FREE), defDep = indicesWhere(D, (u) => u.role === DEPLOYED);
  if (attFree.length === 0 || defDep.length === 0) return;
  const asked = forced ?? (rc.round === 1 && rc.attacker === "strangers" && opts?.round1Engage
    ? opts.round1Engage(A, attFree, D, defDep, F)
    : pol[rc.attacker].engage(F, rc.attacker, attFree, defDep));
  const pairs: [number, number][] = [];
  const usedA = new Set<number>(), usedD = new Set<number>();
  const take = (a: number, d: number): void => {
    if (!A[a] || !D[d] || usedA.has(a) || usedD.has(d) || A[a]!.role !== FREE || D[d]!.role !== DEPLOYED) return;
    usedA.add(a); usedD.add(d); pairs.push([a, d]);
  };
  for (const [a, d] of asked) take(a, d);
  // legality: pair until the defender's front line is all engaged or the attacker has no one left — leftover pairs by strength
  const restA = attFree.filter((i) => !usedA.has(i)).sort((x, y) => totalOf(A[y]!, F.ctx) - totalOf(A[x]!, F.ctx));
  const restD = defDep.filter((i) => !usedD.has(i)).sort((x, y) => totalOf(D[y]!, F.ctx) - totalOf(D[x]!, F.ctx));
  for (let k = 0; k < Math.min(restA.length, restD.length); k++) take(restA[k]!, restD[k]!);
  for (const [a, d] of pairs) {
    A[a]!.role = ENGAGED; D[d]!.role = ENGAGED;
    F.matches.push(rc.attacker === "strangers" ? { sf: [a], pf: [d], pb: [], sb: [] } : { pf: [a], sf: [d], pb: [], sb: [] });
    rc.progress = true;
  }
}

/** Step (e): whichever side still has unengaged creatures may deploy them — as a match's second front-line creature (even
 *  into a 1v2, making a 2v2), or a caster into its background. The number of matches does not change, and a side need not deploy. */
export function stepSurplus(F: Fight, rc: RoundCtx, pol: Policies): void {
  if (F.matches.length === 0) return;
  for (const side of [rc.attacker, rc.defender] as Side[]) {
    const U = unitsOf(F, side);
    const cand = indicesWhere(U, (u) => u.role === FREE || u.role === DEPLOYED);
    if (cand.length === 0) continue;
    for (const mv of pol[side].surplus(F, side, cand)) {
      const u = U[mv.u], m = F.matches[mv.m];
      if (!u || !m || !u.alive || u.role === ENGAGED || u.role === BACK) continue;
      const own = side === "party" ? m.pf : m.sf, back = side === "party" ? m.pb : m.sb;
      if (mv.back) { if (own.length === 0 || !isCaster(u)) continue; u.role = BACK; back.push(mv.u); rc.progress = true; }
      else { if (own.length >= 2) continue; u.role = ENGAGED; own.push(mv.u); rc.progress = true; }
    }
  }
}

/** Step (f): every match is fought. */
export function stepFight(F: Fight, rc: RoundCtx, pol: Policies, opts?: SimOptions): void {
  const { P, S, ctx } = F;
  for (const m of F.matches) {
    if (m.pf.length === 0 || m.sf.length === 0) continue;
    const view = viewOf(F, m);
    const str = matchStrength(view, ctx);
    if (isStalemate(str, rc.pBonus, rc.sBonus, view, ctx)) {
      opts?.trace?.({ type: "stalemate", round: rc.round, party: m.pf.map((i) => CR3[P[i]!.cid] ?? "???"), strangers: m.sf.map((i) => CR3[S[i]!.cid] ?? "???") });
      continue;                                              // neither side can beat the other on any roll: the match persists unfought
    }
    const pDie = F.rng.die(), sDie = F.rng.die();
    const tp = str.party + pDie + rc.pBonus, ts = str.strangers + sDie + rc.sBonus;
    opts?.trace?.({
      type: "match", round: rc.round,
      party: m.pf.map((i) => CR3[P[i]!.cid] ?? "???"), partyBack: m.pb.map((i) => CR3[P[i]!.cid] ?? "???"),
      strangers: m.sf.map((i) => CR3[S[i]!.cid] ?? "???"), strangersBack: m.sb.map((i) => CR3[S[i]!.cid] ?? "???"),
      partyIdx: m.pf.slice(), partyBackIdx: m.pb.slice(), strangersIdx: m.sf.slice(), strangersBackIdx: m.sb.slice(),
      partyStrength: str.party, strangerStrength: str.strangers, partyBonus: rc.pBonus, strangerBonus: rc.sBonus,
      partyDie: pDie, strangerDie: sDie, result: ts > tp ? "S" : tp > ts ? "P" : "T",
    });
    rc.progress = true;
    if (rc.round === 1) { F.r1Matches++; F.r1Won += ts > tp ? 1 : ts === tp ? 0.5 : 0; }
    if (ts === tp) continue;                                  // a tie is unresolved: the match persists
    const strangersWon = ts > tp;
    const loser: Side = strangersWon ? "party" : "strangers";
    const front = strangersWon ? m.pf : m.sf, units = strangersWon ? P : S;
    if (front.length === 1) {
      const i = front[0]!;
      if (strangersWon && invincible(units[i]!, ctx)) { opts?.trace?.({ type: "saved", round: rc.round, side: "party", creature: CR3[units[i]!.cid] ?? "???", index: i }); continue; }   // a level 4+ Ring bearer cannot be killed
      kill(F, loser, i, opts);
      front.length = 0;
    } else if (front.length === 2) {
      const mortal = strangersWon ? front.filter((i) => !invincible(units[i]!, ctx)) : front.slice();
      if (mortal.length === 0) { opts?.trace?.({ type: "saved", round: rc.round, side: "party", creature: CR3[units[front[0]!]!.cid] ?? "???", index: front[0]! }); continue; }
      let victim: number;
      let detail: { nominated: string; roll: number } | undefined;
      if (mortal.length === 1) victim = mortal[0]!;
      else {
        const nominated = pol[loser].nominate(F, loser, mortal[0]!, mortal[1]!);
        const other = nominated === mortal[0]! ? mortal[1]! : mortal[0]!;
        const roll = F.rng.die();
        victim = casualtyVictim(nominated, other, roll, (strangersWon ? rc.pRing : rc.sRing) ? 1 : 0);
        detail = { nominated: CR3[units[nominated]!.cid] ?? "???", roll };
      }
      kill(F, loser, victim, opts, detail);
      const at = front.indexOf(victim);
      if (at >= 0) front.splice(at, 1);
    }
  }
  opts?.trace?.({ type: "round", round: rc.round, partyAlive: countAlive(P), strangersAlive: countAlive(S) });
}

/** Can anything in this position still happen? Peter's Q2 test, read as: a match that can still be decided, or two sides each
 *  with an unengaged creature (so a new match can be made), or an unengaged creature that has a place in a stalemated match. */
function canContinue(F: Fight, round: number): boolean {
  const { P, S, ctx } = F;
  const pFree = indicesWhere(P, (u) => u.role === FREE), sFree = indicesWhere(S, (u) => u.role === FREE);
  const pB = partyDieBonus(P, ctx, round + 1), sB = strangerDieBonus(S, ctx, round + 1);
  const stalemated: Match[] = [];
  for (const m of F.matches) {
    const view = viewOf(F, m);
    if (isStalemate(matchStrength(view, ctx), pB, sB, view, ctx)) stalemated.push(m); else return true;   // a match that can still be decided
  }
  if (pFree.length && sFree.length) return true;                                                            // a new match can be created
  const hasRoom = (m: Match, free: number[], us: Unit[], front: number[]): boolean =>
    free.length > 0 && (front.length < 2 || (front.length > 0 && free.some((i) => isCaster(us[i]!))));
  return stalemated.some((m) => hasRoom(m, pFree, P, m.pf) || hasRoom(m, sFree, S, m.sf));                 // a creature that could break a stalemate
}

/** Step (g): wrap up the round, then decide whether the fight is over. */
export function stepWrap(F: Fight, rc: RoundCtx): void {
  const { P, S, ctx } = F;
  if (countAlive(P) === 0) { F.end = "strangersWin"; return; }
  if (countAlive(S) === 0) { F.end = "partyWin"; return; }

  // matches with an empty front line dissolve; background and deployed creatures become unengaged
  const keep: Match[] = [];
  for (const m of F.matches) {
    if (m.pf.length === 0 || m.sf.length === 0) {
      for (const i of m.pf) if (P[i]!.alive) P[i]!.role = FREE;
      for (const i of m.sf) if (S[i]!.alive) S[i]!.role = FREE;
      for (const i of m.pb) if (P[i]!.alive) P[i]!.role = FREE;
      for (const i of m.sb) if (S[i]!.alive) S[i]!.role = FREE;
    } else {
      for (const i of m.pb) P[i]!.role = FREE;
      for (const i of m.sb) S[i]!.role = FREE;
      m.pb = []; m.sb = [];
      keep.push(m);
    }
  }
  F.matches = keep;
  for (const u of P) if (u.alive && u.role === DEPLOYED) u.role = FREE;
  for (const u of S) if (u.alive && u.role === DEPLOYED) u.role = FREE;

  // the simulated player may retreat once it is clearly outmatched (the strangers never retreat)
  if (ctx.rules.partyRetreatRatio > 0) {
    let ps = 0, ss = 0;
    for (const u of P) if (u.alive) ps += totalOf(u, ctx);
    for (const u of S) if (u.alive) ss += totalOf(u, ctx);
    if (ss > 0 && ps / ss < ctx.rules.partyRetreatRatio) { F.end = "retreat"; return; }
  }

  // Peter Q2: over when neither side has any creature able to continue a match, create a match, or break a stalemate. A round in
  // which nothing at all happened (a side declined every deployment) cannot change anything either, so the standoff ends it.
  if (!canContinue(F, rc.round) || !rc.progress) { F.end = "stalemate"; return; }
  if (rc.round >= ctx.rules.maxRounds) F.end = "cap";
}

/** Steps (e) to (g) only: continue a round after the attacker has engaged. A search clones the position mid-round, applies a
 *  candidate pairing with `stepEngage(..., forced)`, and calls this. */
export function resumeAfterEngage(F: Fight, rc: RoundCtx, pol: Policies, opts?: SimOptions): void {
  stepSurplus(F, rc, pol);
  stepFight(F, rc, pol, opts);
  stepWrap(F, rc);
}

/** One whole round: steps (a) to (g). Sets `F.end` when the fight is over. */
export function playRound(F: Fight, pol: Policies, opts?: SimOptions): void {
  const rc = beginRound(F);
  stepDeploy(F, rc, pol, opts);
  stepEngage(F, rc, pol, opts);
  resumeAfterEngage(F, rc, pol, opts);
}

/** Play a position to the end with the given policies. */
export function playOut(F: Fight, pol: Policies, opts?: SimOptions): void {
  while (!F.end) playRound(F, pol, opts);
}

export function outcomeOf(F: Fight): Outcome {
  const end = F.end ?? "cap";
  const r2 = end === "strangersWin" || end === "retreat" || end === "stalemate" ? 1 : end === "partyWin" ? 0 : 0.5;
  const tot = F.totalP + F.totalS;
  return {
    end, rounds: Math.max(1, F.round), partyAlive: countAlive(F.P), strangersAlive: countAlive(F.S),
    partyValueLost: F.pvl, strangerValueLost: F.svl,
    r1: F.r1Matches ? F.r1Won / F.r1Matches : 0, r2, r3: tot ? 0.5 + (0.5 * (F.pvl - F.svl)) / tot : 0.5,
  };
}

export function simulate(scn: Scenario, rules: Rules, partyStyle: Style | Policy, strangerStyle: Style | Policy, seed: number, opts?: SimOptions): Outcome {
  const F = startFight(scn, rules, seed);
  playOut(F, { party: toPolicy(partyStyle), strangers: toPolicy(strangerStyle) }, opts);
  opts?.trace?.({ type: "end", end: F.end ?? "cap", round: Math.max(1, F.round) });
  return outcomeOf(F);
}

// The fight simulator: play a fight forward, fast, from a scenario (Monte Carlo spec §4.1). Pure and seeded: the same
// scenario, rules, styles and seed always give the same outcome, and the scenario is never modified.
import { makeRng } from "./rng";
import {
  POINTS, casualtyVictim, invincible, matchStrength, partyDieBonus, partyHasRing, strangerDieBonus, totalOf,
} from "./rules";
import { deploy, engage, nominateOwn, nominateStranger, redeploy } from "./policies";
import type { Ctx, Fight, Match, MatchView, Outcome, Rules, Scenario, SimOptions, Style, Unit } from "./types";

const FREE = 0, DEPLOYED = 1, ENGAGED = 2, BACK = 3;

const cloneUnit = (u: Unit): Unit => ({ ...u, gear: u.gear, alive: true, role: FREE });
const countAlive = (us: Unit[]): number => { let n = 0; for (const u of us) if (u.alive) n++; return n; };
const value = (us: Unit[]): number => { let v = 0; for (const u of us) v += POINTS[u.cid]!; return v; };
const view = (F: Fight, m: Match): MatchView => ({
  pf: m.pf.map((i) => F.P[i]!), pb: m.pb.map((i) => F.P[i]!), sf: m.sf.map((i) => F.S[i]!), sb: m.sb.map((i) => F.S[i]!),
});

export function simulate(scn: Scenario, rules: Rules, partyStyle: Style, strangerStyle: Style, seed: number, opts?: SimOptions): Outcome {
  const ctx: Ctx = { eye: scn.eye, curses: scn.curses, level: scn.level, surprise: scn.strangerSurprise, rules };
  const F: Fight = { P: scn.party.map(cloneUnit), S: scn.strangers.map(cloneUnit), matches: [], ctx, rng: makeRng(seed), round: 0 };
  const { P, S } = F;
  const totalP = value(P), totalS = value(S);
  let pvl = 0, svl = 0, r1Won = 0, r1Matches = 0;
  let end: Outcome["end"] = "cap";

  const kill = (units: Unit[], i: number, party: boolean): void => {
    const u = units[i]!; u.alive = false; u.role = FREE;
    if (party) pvl += POINTS[u.cid]!; else svl += POINTS[u.cid]!;
  };

  for (let round = 1; round <= rules.maxRounds; round++) {
    F.round = round;
    const strAtt = rules.alternate ? (round % 2 === 1) === rules.strangersAttackFirst : rules.strangersAttackFirst;
    const A = strAtt ? S : P, D = strAtt ? P : S;
    const aStyle = strAtt ? strangerStyle : partyStyle, dStyle = strAtt ? partyStyle : strangerStyle;

    // (b) the defender deploys at least as many creatures as the attacker has unengaged
    let attUnengaged = 0;
    const defFree: number[] = [];
    for (let i = 0; i < A.length; i++) if (A[i]!.alive && A[i]!.role !== ENGAGED) attUnengaged++;
    for (let i = 0; i < D.length; i++) if (D[i]!.alive && D[i]!.role === FREE) defFree.push(i);
    const min = Math.min(defFree.length, attUnengaged);
    if (min > 0) for (const i of deploy(dStyle, D, defFree, min, F)) D[i]!.role = DEPLOYED;

    // (c) the attacker pairs its unengaged creatures one-to-one against the defender's front line
    const attFree: number[] = [], defDep: number[] = [];
    for (let i = 0; i < A.length; i++) if (A[i]!.alive && A[i]!.role === FREE) attFree.push(i);
    for (let i = 0; i < D.length; i++) if (D[i]!.alive && D[i]!.role === DEPLOYED) defDep.push(i);
    const pairs = round === 1 && strAtt && opts?.round1Engage ? opts.round1Engage(A, attFree, D, defDep, F) : engage(aStyle, A, attFree, D, defDep, F);
    for (const [a, d] of pairs) {
      A[a]!.role = ENGAGED; D[d]!.role = ENGAGED;
      F.matches.push(strAtt ? { sf: [a], pf: [d], pb: [], sb: [] } : { pf: [a], sf: [d], pb: [], sb: [] });
    }

    // (d) the larger side redeploys its unengaged creatures: join a match as the second front-liner, or back it
    const aliveP = countAlive(P), aliveS = countAlive(S);
    if (aliveP !== aliveS && F.matches.length > 0) {
      const partyLarger = aliveP > aliveS;
      const L = partyLarger ? P : S;
      const cand: number[] = [];
      for (let i = 0; i < L.length; i++) if (L[i]!.alive && L[i]!.role !== ENGAGED && L[i]!.role !== BACK) cand.push(i);
      if (cand.length) {
        for (const mv of redeploy(partyLarger ? partyStyle : strangerStyle, L, cand, F, partyLarger)) {
          const u = L[mv.u]!;
          const m = F.matches[mv.m];
          if (!m || !u.alive || u.role === ENGAGED || u.role === BACK) continue;
          const own = partyLarger ? m.pf : m.sf, opp = partyLarger ? m.sf : m.pf, back = partyLarger ? m.pb : m.sb;
          if (mv.back) { if (own.length === 0) continue; u.role = BACK; back.push(mv.u); }
          else { if (own.length >= 2 || opp.length > 1) continue; u.role = ENGAGED; own.push(mv.u); }
        }
      }
    }

    if (F.matches.length === 0) break;   // nobody left to engage (cannot normally happen with both sides alive)

    // (e) each match is fought: one die a side; the Ring bonus counts even if its bearer falls this round
    const pBonus = partyDieBonus(P, ctx), sBonus = strangerDieBonus(S, ctx, round);
    const pRing = partyHasRing(P, ctx), sRing = partyHasRing(S, ctx);
    for (const m of F.matches) {
      if (m.pf.length === 0 || m.sf.length === 0) continue;
      const str = matchStrength(view(F, m), ctx);
      const tp = str.party + F.rng.die() + pBonus, ts = str.strangers + F.rng.die() + sBonus;
      if (round === 1) { r1Matches++; r1Won += ts > tp ? 1 : ts === tp ? 0.5 : 0; }
      if (ts === tp) continue;                                  // a tie is unresolved: the match persists
      const strangersWon = ts > tp;
      const front = strangersWon ? m.pf : m.sf, units = strangersWon ? P : S;
      if (front.length === 1) {
        const i = front[0]!;
        if (strangersWon && invincible(units[i]!, ctx)) continue;     // a level 4+ Ring bearer cannot be killed
        kill(units, i, strangersWon);
        front.length = 0;
      } else if (front.length === 2) {
        const mortal = strangersWon ? front.filter((i) => !invincible(units[i]!, ctx)) : front.slice();
        if (mortal.length === 0) continue;
        let victim: number;
        if (mortal.length === 1) victim = mortal[0]!;
        else if (!strangersWon && rules.strangerCasualty === "strongest") {
          victim = totalOf(units[mortal[0]!]!, ctx) >= totalOf(units[mortal[1]!]!, ctx) ? mortal[0]! : mortal[1]!;
        } else {
          const nominated = strangersWon ? nominateOwn(units, mortal[0]!, mortal[1]!, F) : nominateStranger(units, mortal[0]!, mortal[1]!, F);
          const other = nominated === mortal[0]! ? mortal[1]! : mortal[0]!;
          victim = casualtyVictim(strangersWon ? "party" : "strangers", nominated, other, F.rng.die(), (strangersWon ? pRing : sRing) ? 1 : 0);
        }
        kill(units, victim, strangersWon);
        const at = front.indexOf(victim);
        if (at >= 0) front.splice(at, 1);
      }
    }

    // is the fight over?
    if (countAlive(P) === 0) { end = "strangersWin"; break; }
    if (countAlive(S) === 0) { end = "partyWin"; break; }

    // (f) wrap up: matches with an empty front line dissolve, background and deployed creatures become unengaged
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
    if (rules.partyRetreatRatio > 0) {
      let ps = 0, ss = 0;
      for (const u of P) if (u.alive) ps += totalOf(u, ctx);
      for (const u of S) if (u.alive) ss += totalOf(u, ctx);
      if (ss > 0 && ps / ss < rules.partyRetreatRatio) { end = "retreat"; break; }
    }
  }

  const rounds = Math.max(1, F.round);
  const r2 = end === "strangersWin" || end === "retreat" ? 1 : end === "partyWin" ? 0 : 0.5;
  const tot = totalP + totalS;
  return {
    end, rounds, partyAlive: countAlive(P), strangersAlive: countAlive(S), partyValueLost: pvl, strangerValueLost: svl,
    r1: r1Matches ? r1Won / r1Matches : 0, r2, r3: tot ? 0.5 + (0.5 * (pvl - svl)) / tot : 0.5,
  };
}

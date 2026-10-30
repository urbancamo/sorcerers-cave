// How a simulated side chooses (training task spec §6.1). A `Policy` is the lab's plug-in point and mirrors Peter's Fight
// Plan, "a library of procedures called whenever a decision is needed that a human player would make" (reformulated rules,
// "Strangers making a fight plan"): Dumb/Smart Deployment, and Choosing the Casualty. Both sides use the same four built-in
// styles; the strangers' `GRD` is the `HEU` baseline (strongest against strongest). Any object with the four methods can be
// passed to `simulate` in place of a style, which is how a search or a learned strategy plugs in.
import { POINTS, isCaster, matchStrength, totalOf } from "./rules";
import type { Fight, MatchView, Side, Style, Unit } from "./types";

export interface Move { u: number; m: number; back: boolean }

export interface Policy {
  readonly id: string;
  /** Step c, the defender: which unengaged creatures deploy to the front line (at least `min`; all of them if there are fewer). */
  deploy(F: Fight, side: Side, free: number[], min: number): number[];
  /** Step d, the attacker: pair its unengaged creatures one-to-one against the defender's unengaged front line.
   *  Returns pairs [ownIndex, opponentIndex]. */
  engage(F: Fight, side: Side, ownFree: number[], oppDeployed: number[]): [number, number][];
  /** Step e: where a side's surplus (unengaged) creatures go. A fighter joins a match as its second front-line creature; a
   *  caster may instead back a match. No move may add a match, and a side is not obliged to deploy anything. */
  surplus(F: Fight, side: Side, cand: number[]): Move[];
  /** The casualty nomination when this side's two-creature front line loses a match: the index of the creature nominated. */
  nominate(F: Fight, side: Side, a: number, b: number): number;
}

export const unitsOf = (F: Fight, side: Side): Unit[] => (side === "party" ? F.P : F.S);
export const oppOf = (F: Fight, side: Side): Unit[] => (side === "party" ? F.S : F.P);

const byTotalDesc = (units: Unit[], F: Fight) => (a: number, b: number) => totalOf(units[b]!, F.ctx) - totalOf(units[a]!, F.ctx);

function deploy(style: Style, units: Unit[], free: number[], min: number, F: Fight): number[] {
  const f = free.slice();
  switch (style) {
    case "GRD": return f.sort(byTotalDesc(units, F)).slice(0, min);
    case "CAU":
      return f.sort((a, b) => POINTS[units[a]!.cid]! - POINTS[units[b]!.cid]! || totalOf(units[a]!, F.ctx) - totalOf(units[b]!, F.ctx)).slice(0, min);
    case "MAG":
      return f.sort((a, b) => Number(isCaster(units[a]!)) - Number(isCaster(units[b]!)) || totalOf(units[b]!, F.ctx) - totalOf(units[a]!, F.ctx)).slice(0, min);
    case "RLG": { F.rng.shuffle(f); return f.slice(0, min + F.rng.int(f.length - min + 1)); }
  }
}

function engage(style: Style, att: Unit[], attFree: number[], def: Unit[], defDep: number[], F: Fight): [number, number][] {
  const a = attFree.slice(), d = defDep.slice();
  if (style === "RLG") { F.rng.shuffle(a); F.rng.shuffle(d); }
  else { a.sort(byTotalDesc(att, F)); d.sort(byTotalDesc(def, F)); }
  const n = Math.min(a.length, d.length), out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([a[i]!, d[i]!]);
  return out;
}

function surplus(style: Style, units: Unit[], cand: number[], F: Fight, isParty: boolean): Move[] {
  if (style === "CAU" || F.matches.length === 0) return [];
  const own = (m: Fight["matches"][number]) => (isParty ? m.pf : m.sf);
  const ownFront = F.matches.map((m) => own(m).length);
  const view = (m: Fight["matches"][number]): MatchView => ({
    pf: m.pf.map((i) => F.P[i]!), pb: m.pb.map((i) => F.P[i]!), sf: m.sf.map((i) => F.S[i]!), sb: m.sb.map((i) => F.S[i]!),
  });
  const deficit = F.matches.map((m) => { const s = matchStrength(view(m), F.ctx); return isParty ? s.strangers - s.party : s.party - s.strangers; });
  const ownStr = F.matches.map((m) => { const s = matchStrength(view(m), F.ctx); return isParty ? s.party : s.strangers; });
  const rankByOwn = F.matches.map((_, i) => i).sort((x, y) => ownStr[y]! - ownStr[x]!);
  // Peter Q1: a creature may join any match that has fewer than two of its own side in front — including a 1v2 match, which
  // makes a 2v2. (The old rule also required the opponent to have only one in front.)
  const joinable = (i: number) => ownFront[i]! < 2;

  const c = cand.slice();
  if (style === "RLG") F.rng.shuffle(c); else c.sort(byTotalDesc(units, F));
  const moves: Move[] = [];
  let rr = 0;
  for (const u of c) {
    const caster = isCaster(units[u]!);
    if (style === "RLG") {
      const r = F.rng.int(3);
      if (r === 0) continue;
      if (caster && r === 1) { moves.push({ u, m: F.rng.int(F.matches.length), back: true }); continue; }
      const js = F.matches.map((_, i) => i).filter(joinable);
      if (js.length) { const m = js[F.rng.int(js.length)]!; ownFront[m]!++; moves.push({ u, m, back: false }); }
      continue;
    }
    if (caster) { moves.push({ u, m: style === "MAG" ? rankByOwn[rr++ % rankByOwn.length]! : rankByOwn[0]!, back: true }); continue; }
    let best = -1;
    for (let i = 0; i < F.matches.length; i++) if (joinable(i) && (best < 0 || deficit[i]! > deficit[best]!)) best = i;
    if (best >= 0) { ownFront[best]!++; deficit[best]! -= totalOf(units[u]!, F.ctx); moves.push({ u, m: best, back: false }); }
  }
  return moves;
}

/** Which of two creatures the party nominates to be the casualty: the cheaper, then the weaker. */
export function nominateOwn(units: Unit[], a: number, b: number, F: Fight): number {
  const pa = POINTS[units[a]!.cid]!, pb = POINTS[units[b]!.cid]!;
  if (pa !== pb) return pa < pb ? a : b;
  return totalOf(units[a]!, F.ctx) <= totalOf(units[b]!, F.ctx) ? a : b;
}

/** Which of two strangers the strangers nominate by default (review B3): the weaker by strength, and a tie at random. */
export function nominateStranger(units: Unit[], a: number, b: number, F: Fight): number {
  const ta = totalOf(units[a]!, F.ctx), tb = totalOf(units[b]!, F.ctx);
  if (ta !== tb) return ta < tb ? a : b;
  return F.rng.next() < 0.5 ? a : b;
}

/** A built-in style as a `Policy`. */
export function stylePolicy(style: Style): Policy {
  return {
    id: style,
    deploy: (F, side, free, min) => deploy(style, unitsOf(F, side), free, min, F),
    engage: (F, side, ownFree, oppDeployed) => engage(style, unitsOf(F, side), ownFree, oppOf(F, side), oppDeployed, F),
    surplus: (F, side, cand) => surplus(style, unitsOf(F, side), cand, F, side === "party"),
    nominate: (F, side, a, b) => (side === "party" ? nominateOwn(unitsOf(F, side), a, b, F) : nominateStranger(unitsOf(F, side), a, b, F)),
  };
}

export const STYLE_POLICIES: Record<Style, Policy> = { GRD: stylePolicy("GRD"), CAU: stylePolicy("CAU"), MAG: stylePolicy("MAG"), RLG: stylePolicy("RLG") };

/** A style code or a policy, as a policy. */
export const toPolicy = (p: Style | Policy): Policy => (typeof p === "string" ? STYLE_POLICIES[p] : p);

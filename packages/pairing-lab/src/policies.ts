// How a simulated side chooses (training task spec §6.1). Both sides use the same four styles; the strangers' GRD is the
// `HEU` baseline (strongest against strongest).
import { POINTS, isCaster, matchStrength, totalOf } from "./rules";
import type { Fight, MatchView, Style, Unit } from "./types";

export interface Move { u: number; m: number; back: boolean }

const byTotalDesc = (units: Unit[], F: Fight) => (a: number, b: number) => totalOf(units[b]!, F.ctx) - totalOf(units[a]!, F.ctx);

/** Defender, step (b): which unengaged creatures deploy to the front line (at least `min`). */
export function deploy(style: Style, units: Unit[], free: number[], min: number, F: Fight): number[] {
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

/** Attacker, step (c): pair its unengaged creatures one-to-one against the defender's deployed front line. */
export function engage(style: Style, att: Unit[], attFree: number[], def: Unit[], defDep: number[], F: Fight): [number, number][] {
  const a = attFree.slice(), d = defDep.slice();
  if (style === "RLG") { F.rng.shuffle(a); F.rng.shuffle(d); }
  else { a.sort(byTotalDesc(att, F)); d.sort(byTotalDesc(def, F)); }
  const n = Math.min(a.length, d.length), out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([a[i]!, d[i]!]);
  return out;
}

/** The larger side, step (d): unengaged creatures join a match as the second front-line creature, or (casters) back it. */
export function redeploy(style: Style, units: Unit[], cand: number[], F: Fight, isParty: boolean): Move[] {
  if (style === "CAU" || F.matches.length === 0) return [];
  const own = (m: Fight["matches"][number]) => (isParty ? m.pf : m.sf);
  const opp = (m: Fight["matches"][number]) => (isParty ? m.sf : m.pf);
  const ownFront = F.matches.map((m) => own(m).length);
  const oppFront = F.matches.map((m) => opp(m).length);
  const view = (m: Fight["matches"][number]): MatchView => ({
    pf: m.pf.map((i) => F.P[i]!), pb: m.pb.map((i) => F.P[i]!), sf: m.sf.map((i) => F.S[i]!), sb: m.sb.map((i) => F.S[i]!),
  });
  const deficit = F.matches.map((m) => { const s = matchStrength(view(m), F.ctx); return isParty ? s.strangers - s.party : s.party - s.strangers; });
  const ownStr = F.matches.map((m) => { const s = matchStrength(view(m), F.ctx); return isParty ? s.party : s.strangers; });
  const rankByOwn = F.matches.map((_, i) => i).sort((x, y) => ownStr[y]! - ownStr[x]!);
  const joinable = (i: number) => ownFront[i]! < 2 && oppFront[i]! <= 1;

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

/** Which of two strangers the winning player nominates: the weaker (so that, as written, the stronger dies on 4-6). */
export function nominateStranger(units: Unit[], a: number, b: number, F: Fight): number {
  return totalOf(units[a]!, F.ctx) <= totalOf(units[b]!, F.ctx) ? a : b;
}

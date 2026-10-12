// `standard`'s pairing decisions for the revised round engine (pluggable stranger combat spec D7): the lab's "strongest against
// strongest" heuristic, provisional until the lab proposes a better baseline. Written against the plain-data views only, so the
// same code serves either side and cannot reach into the game.
import type { CasualtyContext, CasualtyDecision, DeployContext, DeployDecision, EngageContext, EngageDecision, MatchView, RedeployContext, RedeployDecision, UnitView } from "./strategy";

type Side = "party" | "strangers";

/** The creatures of `side` in the view, by position. */
const unitsBy = (ctx: { view: { party: readonly UnitView[]; strangers: readonly UnitView[] } }, side: Side): Map<number, UnitView> =>
  new Map((side === "party" ? ctx.view.party : ctx.view.strangers).map((u) => [u.index, u]));

const byStrength = (m: Map<number, UnitView>) => (a: number, b: number): number => m.get(b)!.strength - m.get(a)!.strength || a - b;

/** Which side is deciding: a decision context does not say, but the view of what is free does — the caller passes it in `side`. */
export interface Deciding { side: Side }

export function standardDeploy(ctx: DeployContext & Partial<Deciding>): DeployDecision {
  const own = unitsBy(ctx, ctx.side ?? "strangers");
  return { creatures: ctx.free.slice().sort(byStrength(own)).slice(0, ctx.min) };
}

export function standardEngage(ctx: EngageContext & Partial<Deciding>): EngageDecision {
  const side = ctx.side ?? "strangers";
  const mine = unitsBy(ctx, side), theirs = unitsBy(ctx, side === "party" ? "strangers" : "party");
  const own = (p: { party: number; stranger: number }): number => (side === "party" ? p.party : p.stranger);
  const foe = (p: { party: number; stranger: number }): number => (side === "party" ? p.stranger : p.party);
  const usedOwn = new Set<number>(), usedFoe = new Set<number>(), pairs: EngageDecision["pairs"] = [];
  for (const a of ctx.own.slice().sort(byStrength(mine))) {
    const options = ctx.legalPairs.filter((p) => own(p) === a && !usedFoe.has(foe(p))).sort((x, y) => theirs.get(foe(y))!.strength - theirs.get(foe(x))!.strength || foe(x) - foe(y));
    if (!options.length || usedOwn.has(a)) continue;
    usedOwn.add(a); usedFoe.add(foe(options[0]!)); pairs.push(options[0]!);
  }
  return { pairs };
}

/** Surplus (step e), as the lab's GRD: a fighter joins the match its side is furthest behind in; a caster backs its side's strongest match. */
export function standardRedeploy(ctx: RedeployContext & Partial<Deciding>): RedeployDecision {
  const side = ctx.side ?? "strangers";
  const mine = unitsBy(ctx, side);
  const ownStrength = (m: MatchView): number => (side === "party" ? m.partyStrength : m.strangerStrength);
  const deficit = ctx.view.matches.map((m) => (side === "party" ? m.strangerStrength - m.partyStrength : m.partyStrength - m.strangerStrength));
  const strongest = ctx.view.matches.map((_, i) => i).sort((x, y) => ownStrength(ctx.view.matches[y]!) - ownStrength(ctx.view.matches[x]!) || x - y);
  const front = ctx.view.matches.map((m) => (side === "party" ? m.pf : m.sf).length);
  const moves: RedeployDecision["moves"] = [];
  for (const c of ctx.candidates.slice().sort(byStrength(mine))) {
    const legal = ctx.legalMoves.filter((mv) => mv.creature === c);
    if (mine.get(c)!.caster) {
      const back = strongest.map((m) => legal.find((mv) => mv.back && mv.match === m)).find((mv) => mv !== undefined);
      if (back) moves.push(back);
      continue;
    }
    let best: (typeof legal)[number] | undefined;
    for (const mv of legal) if (!mv.back && front[mv.match]! < 2 && (!best || deficit[mv.match]! > deficit[best.match]!)) best = mv;
    if (best) { front[best.match]!++; deficit[best.match]! -= mine.get(c)!.strength; moves.push(best); }
  }
  return { moves };
}

/** Nominate the weaker of the pair; on a tie, the cheaper, then the lower position. */
export function standardCasualty(ctx: CasualtyContext & Partial<Deciding>): CasualtyDecision {
  const own = unitsBy(ctx, ctx.side ?? "strangers");
  const [a, b] = ctx.pair, ua = own.get(a)!, ub = own.get(b)!;
  if (ua.strength !== ub.strength) return { nominated: ua.strength < ub.strength ? a : b };
  if (ua.points !== ub.points) return { nominated: ua.points < ub.points ? a : b };
  return { nominated: Math.min(a, b) };
}

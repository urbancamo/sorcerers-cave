// Smart Loadout (Peter's Fight Plan, "Smart Loadout procedure"; pluggable stranger combat spec, stage 3): rather than follow a
// fixed preference list, try every way of giving the artefacts on the floor to the strangers who can bear them, score each by
// the exact expected result of the first round against the party as the strangers can see it, and keep the best.
//
// The score is a model, not the whole fight: strongest stranger against strongest party member, one match each, and the value
// the strangers can expect to destroy minus the value they can expect to lose (each creature's points). It uses the exact
// strength arithmetic (capability table: Sword, Axe, Staff bonuses; the Shield blunting the magic it faces; the Ring's +1 on
// every die and its invulnerability from level 4), and the exact odds of two d6. `standard`'s allocation is always scored first
// and kept unless something scores strictly higher, so this strategy never departs from the default for a worse result, and a
// budget that runs out returns the best found so far (P10).
import { ALL_CREATURES as CREATURES } from "./data/creatures";
import { axeBonus, ringEligible, shieldEligible, staffBonus, swordBonus } from "./capabilities";
import { LOADOUT_ARTIFACTS, canBearArtifact, type Allocation } from "./loadout";
import { standardStrategy, type LoadoutContext, type LoadoutDecision, type StrangerStrategy } from "./strategy";

const T_SWORD = 3, T_STAFF = 9, T_RING = 10, T_AXE = 17, T_SHIELD = 20;

/** The chance that a side with strength `a` beats one with `b`, each adding a d6 (a tie is no win for either). */
export function winChance(a: number, b: number): number {
  let wins = 0;
  for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) if (a + x > b + y) wins++;
  return wins / 36;
}

type View = LoadoutContext["view"];

/** The expected value the strangers destroy minus the value they lose in round one, for this allocation. Higher is better for them. */
export function scoreAllocation(view: View, allocations: readonly Allocation[]): number {
  const gear = view.gear.map((g) => g.slice());
  for (const { artifact, stranger } of allocations) gear[stranger]!.push(artifact);
  const has = (i: number, t: number) => gear[i]!.includes(t);

  const strangers = view.strangers.map((cid, i) => {
    const c = CREATURES[cid]!;
    return {
      cid, points: c.points,
      fs: c.fs + (has(i, T_SWORD) ? swordBonus(cid) : 0) + (has(i, T_AXE) ? axeBonus(cid) : 0),
      mp: c.mp + (has(i, T_STAFF) ? staffBonus(cid) : 0),
      shield: has(i, T_SHIELD) && shieldEligible(cid),
      ring: has(i, T_RING) && ringEligible(cid),
    };
  });
  const sRoll = strangers.some((s) => s.ring) ? 1 : 0;
  const strangerOrder = strangers.map((s, i) => i).sort((a, b) => strangers[b]!.fs + strangers[b]!.mp - strangers[a]!.fs - strangers[a]!.mp);
  const partyOrder = view.party.map((_, i) => i).sort((a, b) => view.party[b]!.strength - view.party[a]!.strength);

  let score = 0;
  for (let k = 0; k < Math.min(strangerOrder.length, partyOrder.length); k++) {
    const s = strangers[strangerOrder[k]!]!, p = view.party[partyOrder[k]!]!;
    const pStrength = s.shield ? p.strength - p.magic : p.strength;
    const sStrength = s.fs + s.mp + sRoll;
    const pStrengthRolled = pStrength + view.partyRollBonus;
    const sWins = winChance(sStrength, pStrengthRolled);
    const pWins = view.level >= 4 && s.ring ? 0 : winChance(pStrengthRolled, sStrength);   // a level 4+ Ring bearer cannot be killed
    score += CREATURES[p.creatureId]!.points * sWins - s.points * pWins;
  }
  return score;
}

export const smartStrategy: StrangerStrategy = {
  id: "smart", version: 1, kind: "builtin",
  assignArtefacts(ctx: LoadoutContext): LoadoutDecision {
    const std = standardStrategy.assignArtefacts(ctx);
    const v = ctx.view;
    if (v.eyePresent || v.party.length === 0) return std;

    // One decision per artefact copy on the floor, in the loadout's own order: a bearer who can bear it, or nobody.
    const items: number[] = [];
    for (const a of LOADOUT_ARTIFACTS) for (const t of v.floor) if (t === a) items.push(a);
    if (items.length === 0) return std;

    let best: Allocation[] = std.allocations, bestScore = scoreAllocation(v, best);
    let nodes = 0;
    const chosen: Allocation[] = [];
    const walk = (k: number): void => {
      if (nodes++ >= ctx.budget.maxNodes) return;
      if (k === items.length) {
        const sc = scoreAllocation(v, chosen);
        if (sc > bestScore + 1e-9) { best = chosen.map((a) => ({ ...a })); bestScore = sc; }
        return;
      }
      const artifact = items[k]!;
      walk(k + 1);   // nobody takes it
      for (let i = 0; i < v.strangers.length; i++) {
        if (!canBearArtifact(artifact, v.strangers[i]!)) continue;
        if (v.gear[i]!.includes(artifact) || chosen.some((c) => c.stranger === i && c.artifact === artifact)) continue;
        chosen.push({ artifact, stranger: i });
        walk(k + 1);
        chosen.pop();
      }
    };
    walk(0);
    return { allocations: best };
  },
};

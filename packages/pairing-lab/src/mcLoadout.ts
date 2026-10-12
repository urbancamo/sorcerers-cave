// A lab-only upper-bound search for the loadout: score every candidate allocation by actually playing the fight out, many
// times, and keep the best. It needs the whole scenario (who attacks, the surprise, the party's gear), which the game's
// strategies are not given, so it can only live here. Its purpose is to find out how much headroom a loadout has at all: if
// even this cannot beat Peter's default, no cheaper model of the fight will.
import { canBearArtifact, LOADOUT_ARTIFACTS, defaultLoadout } from "@sorcerers-cave/engine";
import { DEFAULT_RULES, unit } from "./rules";
import { armStrangers, type LoadoutFn } from "./scenario";
import { simulate } from "./sim";
import type { Scenario, Style } from "./types";

type Alloc = { artifact: number; stranger: number }[];

export function mcLoadout(o: { rollouts?: number; maxCandidates?: number; opponents?: readonly Style[] } = {}): LoadoutFn {
  const R = o.rollouts ?? 40, cap = o.maxCandidates ?? 300, opponents = o.opponents ?? (["GRD", "CAU", "MAG", "RLG"] as const);
  return ({ strangers, floor, eye, scenario }) => {
    const base = defaultLoadout({ strangers: strangers.map((u) => u.cid), gear: strangers.map(() => []), floor, eyePresent: eye, pick: () => 0 });
    if (eye || !scenario) return base;
    const items: number[] = [];
    for (const a of LOADOUT_ARTIFACTS) for (const t of floor) if (t === a) items.push(a);

    const cands: Alloc[] = [];
    const chosen: Alloc = [];
    const walk = (k: number): void => {
      if (cands.length >= cap) return;
      if (k === items.length) { cands.push(chosen.map((c) => ({ ...c }))); return; }
      walk(k + 1);
      for (let i = 0; i < strangers.length; i++) {
        if (!canBearArtifact(items[k]!, strangers[i]!.cid) || chosen.some((c) => c.stranger === i && c.artifact === items[k])) continue;
        chosen.push({ artifact: items[k]!, stranger: i });
        walk(k + 1);
        chosen.pop();
      }
    };
    walk(0);
    if (!cands.some((c) => JSON.stringify(c) === JSON.stringify(base))) cands.unshift(base);

    const bare: Scenario = { ...scenario, strangers: strangers.map((u) => ({ ...u, gear: [], g: unit(u.cid, []).g })) };
    const score = (c: Alloc): number => {
      const armed = armStrangers({ ...bare, floor }, () => c);
      let sum = 0;
      for (let j = 0; j < R; j++) sum += simulate(armed, DEFAULT_RULES, opponents[j % opponents.length]!, "GRD", 7001 + j).r3;
      return sum / R;
    };
    let best = base, bestScore = score(base);
    for (const c of cands) { if (c === base) continue; const s = score(c); if (s > bestScore + 1e-9) { best = c; bestScore = s; } }
    return best;
  };
}

// A tournament: stranger policies against party styles on the same strength-matched fights, scored by reward R3 (value destroyed
// minus value lost, as a fraction of everything in the fight) with the win rate R2 alongside. Every policy plays every scenario
// with the same seed, so the comparison with the baseline is paired and its confidence interval is tight.
import { DEFAULT_RULES } from "./rules";
import { balancedScenario } from "./scenario";
import { simulate } from "./sim";
import { toPolicy, type Policy } from "./policies";
import type { Rules, Style } from "./types";

export interface TournamentOptions {
  readonly strangers: readonly (Style | Policy)[];      // the first is the baseline
  readonly partyStyles: readonly Style[];
  readonly deck: "base" | "kit";
  readonly scenarios: number;
  readonly firstSeed?: number;
  readonly rules?: Rules;
  readonly sizeBands?: readonly [number, number][];     // by number of strangers, inclusive
}

export interface Stat { n: number; r3: number; r2: number; diffR3: number; diffCI: number; diffR2: number }
export interface Row { policy: string; band: string; party: string; stat: Stat }

const idOf = (p: Style | Policy) => (typeof p === "string" ? p : p.id);

export function runTournament(o: TournamentOptions): Row[] {
  const bands = o.sizeBands ?? [[1, 20]];
  const rules = o.rules ?? DEFAULT_RULES;
  const pols = o.strangers.map(toPolicy);
  const rows: Row[] = [];
  for (const [lo, hi] of bands) {
    for (const party of [...o.partyStyles, "ALL" as const]) {
      const r3 = pols.map(() => [] as number[]), r2 = pols.map(() => [] as number[]);
      for (let seed = (o.firstSeed ?? 1), done = 0; done < o.scenarios; seed++) {
        const s = balancedScenario(seed, o.deck, { maxStrangers: hi });
        if (s.strangers.length < lo) continue;
        const ps = party === "ALL" ? o.partyStyles[done % o.partyStyles.length]! : party;
        pols.forEach((p, i) => { const out = simulate(s, rules, ps, p, seed); r3[i]!.push(out.r3); r2[i]!.push(out.r2); });
        done++;
      }
      pols.forEach((p, i) => {
        const n = r3[i]!.length, mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        const d = r3[i]!.map((v, k) => v - r3[0]![k]!), dm = mean(d);
        const sd = Math.sqrt(d.reduce((a, v) => a + (v - dm) ** 2, 0) / Math.max(1, n - 1));
        rows.push({ policy: idOf(o.strangers[i]!), band: `${lo}-${hi}`, party, stat: { n, r3: mean(r3[i]!), r2: mean(r2[i]!), diffR3: dm, diffCI: 1.96 * sd / Math.sqrt(n), diffR2: mean(r2[i]!) - mean(r2[0]!) } });
      });
    }
  }
  return rows;
}

export function formatTournament(rows: Row[]): string {
  const head = "BAND   PARTY  POLICY       N      R3     dR3   +-95%     R2    dR2";
  const lines = rows.map((r) => `${r.band.padEnd(6)} ${r.party.padEnd(6)} ${r.policy.padEnd(10)} ${String(r.stat.n).padStart(6)} ${r.stat.r3.toFixed(3).padStart(7)} ${r.stat.diffR3.toFixed(3).padStart(7)} ${r.stat.diffCI.toFixed(3).padStart(7)} ${r.stat.r2.toFixed(3).padStart(6)} ${r.stat.diffR2.toFixed(3).padStart(6)}`);
  return [head, ...lines].join("\n");
}

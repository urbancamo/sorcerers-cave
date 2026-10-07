// Sensitivity experiment (findings report, section 5): how stable is the best first-round pairing across assumptions?
// Slow, so it only runs with SENS=1.  SENS=1 [FIXED_FORMATION=1] [MIX=1] [SENS_K=3] [SENS_N3=400 SENS_N4=250] [SENS_R=500] npx vitest run src/sensitivity.test.ts
import { it } from "vitest";
import { simulate } from "./sim";
import { balancedScenario } from "./scenario";
import { DEFAULT_RULES, totalOf } from "./rules";
import type { Rules, Scenario, Style } from "./types";

const R = Number(process.env.SENS_R ?? 500);
const N: Record<number, number> = { 3: Number(process.env.SENS_N3 ?? 400), 4: Number(process.env.SENS_N4 ?? 250) };
const perms = (n: number): number[][] => n <= 1 ? [[0]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
const PERMS: Record<number, number[][]> = { 3: perms(3), 4: perms(4) };

interface Assumption { name: string; rules: Rules; ps: Style; ss: Style; d1: number; mix?: boolean }
const STYLES: Style[] = ["GRD", "CAU", "MAG", "RLG"];
const d = DEFAULT_RULES;
const AS_ALL: Assumption[] = [
  { name: "base", rules: d, ps: "GRD", ss: "GRD", d1: 1000 },
  { name: "base*", rules: d, ps: "GRD", ss: "GRD", d1: 5000 },        // same assumption, different selection dice: the noise control
  { name: "pCAU", rules: d, ps: "CAU", ss: "GRD", d1: 1000 },
  { name: "pMAG", rules: d, ps: "MAG", ss: "GRD", d1: 1000 },
  { name: "pRLG", rules: d, ps: "RLG", ss: "GRD", d1: 1000 },
  { name: "ret0", rules: { ...d, partyRetreatRatio: 0 }, ps: "GRD", ss: "GRD", d1: 1000 },
  { name: "ret.8", rules: { ...d, partyRetreatRatio: 0.8 }, ps: "GRD", ss: "GRD", d1: 1000 },
  { name: "sRLG", rules: d, ps: "GRD", ss: "RLG", d1: 1000 },          // the strangers play the rest of the fight at random
];
const AS: Assumption[] = process.env.MIX
  ? [AS_ALL[0]!, AS_ALL[1]!, AS_ALL[2]!, AS_ALL[4]!, { name: "mix", rules: d, ps: "GRD", ss: "GRD", d1: 1000, mix: true }, { name: "mix*", rules: d, ps: "GRD", ss: "GRD", d1: 5000, mix: true }, AS_ALL[5]!, AS_ALL[6]!]
  : AS_ALL;
const NA = AS.length;

const spearman = (a: number[], b: number[]): number => {
  const rank = (x: number[]) => x.map((v, i) => { let lt = 0, eq = 0; x.forEach((w, j) => { if (w < v) lt++; else if (w === v && j !== i) eq++; }); return lt + eq / 2; });
  const ra = rank(a), rb = rank(b), n = a.length, ma = ra.reduce((p, c) => p + c, 0) / n, mb = rb.reduce((p, c) => p + c, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i]! - ma) * (rb[i]! - mb); da += (ra[i]! - ma) ** 2; db += (rb[i]! - mb) ** 2; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
};

function evalPerm(s: Scenario, k: number, a: Assumption, perm: number[], seed0: number) {
  const c = { eye: s.eye, curses: s.curses, level: s.level, surprise: s.strangerSurprise, rules: a.rules };
  const opts = {
    round1PartyStyle: (process.env.FIXED_FORMATION ? "GRD" : undefined) as Style | undefined,
    round1Engage: (A: any[], af: number[], D: any[], dd: number[]) => {
      const aa = af.slice().sort((x, y) => totalOf(A[y], c) - totalOf(A[x], c));
      const dds = dd.slice().sort((x, y) => totalOf(D[y], c) - totalOf(D[x], c));
      return aa.map((ai, i) => [ai, dds[perm[i]!]!] as [number, number]);
    },
  };
  let r3 = 0, sw = 0;
  for (let j = 0; j < R; j++) { const o = simulate(s, a.rules, a.mix ? STYLES[(seed0 + j) % 4]! : a.ps, a.ss, seed0 + j, opts); r3 += o.r3; if (o.end === "strangersWin") sw++; }
  return { r3: r3 / R, sw: sw / R };
}

it.skipIf(!process.env.SENS)("how stable is the best first-round pairing across assumptions?", () => {
  for (const k of (process.env.SENS_K ? [Number(process.env.SENS_K)] : [3, 4])) {
    const scs: Scenario[] = [];
    for (let seed = 1; scs.length < N[k]! && seed < 1_000_000; seed++) { const s = balancedScenario(seed, "base"); if (s.strangers.length === k && s.party.length >= k) scs.push(s); }
    const cands = PERMS[k]!, identity = cands.findIndex((p) => p.every((v, i) => v === i));
    const regR3 = Array.from({ length: NA }, () => new Array(NA).fill(0));
    const regSw = Array.from({ length: NA }, () => new Array(NA).fill(0));
    const agree = Array.from({ length: NA }, () => new Array(NA).fill(0));
    const rho = Array.from({ length: NA }, () => new Array(NA).fill(0));
    const heuR3 = new Array(NA).fill(0), heuSw = new Array(NA).fill(0);
    for (const s of scs) {
      const D1 = AS.map((a) => cands.map((p) => evalPerm(s, k, a, p, a.d1)));
      const best = D1.map((v) => v.reduce((b, x, i) => (x.r3 > v[b]!.r3 ? i : b), 0));
      for (let y = 0; y < NA; y++) {
        const memo = new Map<number, { r3: number; sw: number }>();
        const D2 = (i: number) => { if (!memo.has(i)) memo.set(i, evalPerm(s, k, AS[y]!, cands[i]!, 900000)); return memo.get(i)!; };
        const ref = D2(best[y]!);
        heuR3[y] += ref.r3 - D2(identity).r3; heuSw[y] += ref.sw - D2(identity).sw;
        for (let x = 0; x < NA; x++) {
          const ch = D2(best[x]!);
          regR3[x]![y] += ref.r3 - ch.r3; regSw[x]![y] += ref.sw - ch.sw;
          if (best[x] === best[y]) agree[x]![y]++;
          rho[x]![y] += spearman(D1[x]!.map((v) => v.r3), D1[y]!.map((v) => v.r3));
        }
      }
    }
    const n = scs.length, names = AS.map((a) => a.name.padStart(6));
    const mat = (title: string, m: number[][], scale: number, dp: number, suffix = "") => {
      console.log(`\n${title}`); console.log("   chosen under \\ judged under".padEnd(30) + names.join(" "));
      for (let x = 0; x < NA; x++) console.log(AS[x]!.name.padStart(28) + "  " + m[x]!.map((v) => ((v / n) * scale).toFixed(dp).padStart(6)).join(" ") + suffix);
    };
    console.log(`\n==================== ${k} strangers: ${n} balanced base-deck fights, ${cands.length} first-round pairings each, ${R} fights per pairing per assumption ====================`);
    console.log("(first row/column base* repeats 'base' on different selection dice: that is the pure dice-noise control)");
    mat("REGRET in whole-fight value R3 (x1000): how much worse is the pairing chosen under one assumption when the world is another? 0 = no loss", regR3, 1000, 1);
    mat("REGRET in the strangers' win rate, percentage points", regSw, 100, 2);
    mat("SAME PAIRING chosen under both assumptions (% of fights)", agree, 100, 0, "");
    mat("RANK CORRELATION of the candidate values across the two assumptions (1 = same ordering)", rho, 1, 2);
    console.log("\nFor scale: gain of the best pairing over HEU (strongest v strongest), per assumption");
    console.log("   R3 x1000:   " + AS.map((a, y) => `${a.name} ${((heuR3[y] / n) * 1000).toFixed(1)}`).join("   "));
    console.log("   win-rate pp: " + AS.map((a, y) => `${a.name} ${((heuSw[y] / n) * 100).toFixed(2)}`).join("   "));
  }
}, 3_000_000);

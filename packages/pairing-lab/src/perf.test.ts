// Speed measurement for the simulator. Slow, so it only runs with PERF=1:  pnpm --filter @sorcerers-cave/pairing-lab bench
import { describe, it } from "vitest";
import { simulate } from "./sim";
import { balancedScenario, randomScenario } from "./scenario";
import { DEFAULT_RULES } from "./rules";
import type { Scenario, Style } from "./types";

const N = Number(process.env.PERF_N ?? 20000);

function run(label: string, deck: "base" | "kit", party: Style, scenarios: number, filter?: (k: number) => boolean, make: (seed: number, deck: "base" | "kit") => Scenario = randomScenario) {
  const scs: Scenario[] = [];
  for (let i = 1; scs.length < scenarios; i++) { const s = make(i, deck); if (!filter || filter(s.strangers.length)) scs.push(s); }
  const meanParty = scs.reduce((a, s) => a + s.party.length, 0) / scs.length, meanStr = scs.reduce((a, s) => a + s.strangers.length, 0) / scs.length;
  // warm-up so the JIT is hot
  for (let i = 0; i < 2000; i++) simulate(scs[i % scs.length]!, DEFAULT_RULES, party, "GRD", i);
  let rounds = 0, strangersWin = 0, partyWin = 0, retreat = 0, cap = 0;
  const t0 = performance.now();
  for (let i = 0; i < scs.length; i++) {
    const o = simulate(scs[i]!, DEFAULT_RULES, party, "GRD", i + 1);
    rounds += o.rounds;
    if (o.end === "strangersWin") strangersWin++; else if (o.end === "partyWin") partyWin++; else if (o.end === "retreat") retreat++; else cap++;
  }
  const ms = performance.now() - t0;
  const n = scs.length;
  const pct = (x: number) => ((100 * x) / n).toFixed(1).padStart(5);
  console.log(
    `${label.padEnd(30)} ${String(n).padStart(6)} fights  party ${meanParty.toFixed(1).padStart(4)} v ${meanStr.toFixed(1).padStart(4)}  ${(n / (ms / 1000)).toFixed(0).padStart(8)} fights/s  ` +
    `${((rounds / ms) * 1000).toFixed(0).padStart(8)} rounds/s  ${(ms / n * 1000).toFixed(1).padStart(7)} us/fight  ` +
    `rounds/fight ${(rounds / n).toFixed(2)}  strangers ${pct(strangersWin)}%  party ${pct(partyWin)}%  retreat ${pct(retreat)}%  cap ${pct(cap)}%`,
  );
}

describe.skipIf(!process.env.PERF)("simulator speed", () => {
  it("measures fights per second", () => {
    console.log("\nSimulator speed (HEU/GRD strangers against each party policy; rules at their defaults)");
    for (const deck of ["base", "kit"] as const) {
      for (const p of ["GRD", "CAU", "MAG", "RLG"] as const) run(`${deck} / party ${p}`, deck, p, N);
    }
    run("base / small fights (k<=3)", "base", "GRD", N, (k) => k <= 3);
    run("base / large fights (k>=5)", "base", "GRD", N, (k) => k >= 5);
    console.log("\nBalanced (strength-matched) fights by number of strangers, up to the game's ceilings");
    for (const deck of ["base", "kit"] as const) {
      for (const [lo, hi] of [[1, 3], [4, 6], [7, 12], [13, 20]] as const) run(`${deck} balanced, ${lo}-${hi} strangers`, deck, "GRD", Math.min(N, 10000), (k) => k >= lo && k <= hi, balancedScenario);
    }
  });
});

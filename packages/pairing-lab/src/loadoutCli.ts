// pnpm --filter @sorcerers-cave/pairing-lab loadout [scenarios] [deck] [strangerOdds]
// Compares, on identical fights: Peter's default loadout (standard), the engine's Smart Loadout, and a lab-only search that
// plays every candidate allocation out (an upper bound on what any loadout rule could gain).
import { smartStrategy, standardStrategy } from "@sorcerers-cave/engine";
import { compareLoadouts } from "./loadoutBench";
import { mcLoadout } from "./mcLoadout";

const scenarios = Number(process.argv[2] ?? 3000), deck = (process.argv[3] ?? "kit") as "base" | "kit", odds = Number(process.argv[4] ?? 0.9);
const challengers = [["smart", smartStrategy], ["search", mcLoadout()]] as const;
const f = (x: number) => x.toFixed(4).padStart(8);
for (const [name, b] of challengers) {
  for (const band of [[1, 3], [4, 6], [7, 12], [13, 20]] as [number, number][]) {
    const r = compareLoadouts({ a: standardStrategy, b, scenarios: name === "search" ? Math.min(scenarios, 600) : scenarios, deck, strangerOdds: odds, strangers: band });
    console.log(`${name.padEnd(6)} ${deck} ${String(band[0]).padStart(2)}-${String(band[1]).padEnd(2)} n=${r.n}  differed ${((100 * r.differed) / r.n).toFixed(0).padStart(3)}%  R3 std ${f(r.r3A)}  d ${f(r.diffR3)} +-${r.diffCI.toFixed(4)}  dR2 ${f(r.diffR2)}  | where differed n=${r.onDiffered.n}: dR3 ${f(r.onDiffered.diffR3)} +-${r.onDiffered.diffCI.toFixed(4)}`);
  }
}

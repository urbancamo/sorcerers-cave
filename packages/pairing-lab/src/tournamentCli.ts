// pnpm --filter @sorcerers-cave/pairing-lab tournament [scenarios] [deck]
import { mcPolicy } from "./search";
import { formatTournament, runTournament } from "./tournament";

const scenarios = Number(process.argv[2] ?? 400), deck = (process.argv[3] ?? "base") as "base" | "kit";
const rows = runTournament({
  strangers: ["GRD", "CAU", "RLG", mcPolicy({ candidates: 8, rollouts: 16 }), mcPolicy({ candidates: 16, rollouts: 48 })],
  partyStyles: ["GRD", "CAU", "MAG", "RLG"], deck, scenarios, sizeBands: [[1, 3], [4, 6], [7, 12], [13, 20]],
});
console.log(formatTournament(rows));

// pnpm --filter @sorcerers-cave/pairing-lab levels [scenarios] [deck] [strangerOdds]
// Calibration report for the stranger difficulty levels: each level on the same fights, by size of stranger group.
import { calibrate, formatCalibration } from "./levelBench";

const scenarios = Number(process.argv[2] ?? 300), deck = (process.argv[3] ?? "kit") as "base" | "kit", odds = Number(process.argv[4] ?? 0.5);
console.log(formatCalibration(calibrate({
  levels: ["standard", "novice", "expert", "smart"], scenarios, deck, strangerOdds: odds, bands: [[1, 3], [4, 6], [7, 12], [13, 20]],
})));

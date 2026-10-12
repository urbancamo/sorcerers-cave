import { describe, it, expect } from "vitest";
import { calibrate } from "./levelBench";

// The calibration harness itself: small, fast, and the legality half of stage 5's exit criterion on lab-shaped fights.
describe("level calibration", () => {
  it("plays every level on identical fights with no fallback and no stuck fight", () => {
    const rows = calibrate({ levels: ["standard", "novice", "expert", "smart"], scenarios: 25, deck: "kit", bands: [[1, 3], [4, 6]] });
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r.n).toBe(25);
      expect(r.fallbacks, `${r.level} ${r.band}`).toBe(0);
      expect(r.stuck).toBe(0);
    }
    for (const r of rows.filter((x) => x.level === "standard")) expect(r.dR3).toBe(0);
  });
});

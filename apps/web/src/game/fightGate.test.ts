import { describe, it, expect } from "vitest";
import { showFightSurface } from "./fightGate";

describe("showFightSurface", () => {
  it("never renders outside the fight phase", () => {
    expect(showFightSurface(false, false, false)).toBe(false);
    expect(showFightSurface(false, true, true)).toBe(false);
  });

  it("defers the INITIAL mount while a roll-producing dispatch is in flight", () => {
    // The hostile-reaction race: state says fight, but the reaction roll hasn't arrived yet.
    expect(showFightSurface(true, true, false)).toBe(false);
    // Roll landed (pending cleared): mount — overlay commits on top in the same frame.
    expect(showFightSurface(true, false, false)).toBe(true);
  });

  it("keeps an already-visible fight mounted through mid-fight dispatches", () => {
    // resolve-round / retreat also flow through dispatchWithRolls; the surface must not flicker.
    expect(showFightSurface(true, true, true)).toBe(true);
  });
});

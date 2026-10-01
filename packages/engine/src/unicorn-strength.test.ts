import { describe, it, expect } from "vitest";
import { frontStrength, casterMP, isCaster } from "./combat";
import { CREATURES } from "./data/creatures";
import type { PartyMember } from "./state";

// Rules, Unicorn card: "STR 4" with no magic — plain (non-magical) fighting strength only.
describe("Unicorn strength", () => {
  const unicorn: PartyMember = { creatureId: 13, status: 1, dragonKills: 0, treasure: [] };

  it("is fighting strength 4, magical power 0", () => {
    expect(CREATURES[13]).toMatchObject({ name: "Unicorn", fs: 4, mp: 0 });
  });

  it("fights in the front line as a 4 and is never a caster", () => {
    expect(frontStrength(unicorn)).toBe(4);
    expect(isCaster(unicorn)).toBe(false);
    expect(casterMP(unicorn)).toBe(0);
  });
});

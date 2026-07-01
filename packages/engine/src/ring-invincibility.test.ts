import { describe, it, expect } from "vitest";
import { applyHazards } from "./hazards";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
import { packCoord } from "./coords";
import { HAZARD_GHOULS } from "./data/hazards";

// The Ring makes its bearer immune to a killing die-roll at level >= 4 (negated by an active Eye).
// This must hold for EVERY combat die-roll, not just the stranger-fight matches — including the Ghouls
// hazard and the Lost-Ruby statue wrestle. (§Ring / SC-11-25)
const RING = 10;
const man = (treasure: number[] = []) => ({ creatureId: 5, status: 0 as const, dragonKills: 0, treasure }); // Man (a legal Ring-wearer)

describe("Ring invincibility extends to the Ghouls hazard (§7.2 / SC-11-25)", () => {
  // A seed at which the Ghouls slay a lone (unringed) Man. Rolls don't depend on level or the Ring
  // (weightless, not counted in frontStrength), so the same seed is lethal with or without the Ring.
  const seedWhereGhoulsSlay = (): number => {
    for (let s = 1; s <= 2000; s++) {
      const ctrl = makeState({ party: [man()], hazards: [HAZARD_GHOULS], treasures: [], seed: s, level: 4 });
      applyHazards(ctrl);
      if (ctrl.party[0]!.status === 3) return s;
    }
    throw new Error("no lethal Ghouls seed found in range");
  };

  it("a Ring-bearer at level >= 4 is NOT slain by the Ghouls (deathPrevented)", () => {
    const seed = seedWhereGhoulsSlay();
    // control: without the Ring, this seed kills the member
    const noRing = makeState({ party: [man()], hazards: [HAZARD_GHOULS], treasures: [], seed, level: 4 });
    applyHazards(noRing);
    expect(noRing.party[0]!.status).toBe(3);
    // with the Ring at level 4, the same losing roll must be shrugged off
    const withRing = makeState({ party: [man([RING])], hazards: [HAZARD_GHOULS], treasures: [], seed, level: 4 });
    const { events } = applyHazards(withRing);
    expect(withRing.party[0]!.status).toBe(0); // survives
    expect(events).toContainEqual({ type: "deathPrevented", creatureId: 5 });
  });

  it("below level 4 the Ring does NOT protect against the Ghouls (level-gated)", () => {
    const seed = seedWhereGhoulsSlay();
    const withRing = makeState({ party: [man([RING])], hazards: [HAZARD_GHOULS], treasures: [], seed, level: 3 });
    applyHazards(withRing);
    expect(withRing.party[0]!.status).toBe(3);
  });
});

describe("Ring invincibility extends to the Lost-Ruby statue (§16 / SC-11-25)", () => {
  const area = () => ({ card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 });
  const takeRuby = (party: ReturnType<typeof man>[], seed: number, level: number) =>
    reduce(makeState({ phase: "pickup", areas: [area()], treasures: [11], party, seed, level }), { type: "takeTreasure", ti: 0, mi: 0 });

  // A seed where the strength-8 statue slays a lone (unringed) Man wrestler.
  const seedWhereStatueSlays = (): number => {
    for (let s = 1; s <= 2000; s++) {
      const { state } = takeRuby([man()], s, 4);
      if (state.party[0]!.status === 3) return s;
    }
    throw new Error("no lethal statue seed found in range");
  };

  it("a Ring-bearer at level >= 4 survives a lost statue wrestle (deathPrevented; ruby stays)", () => {
    const seed = seedWhereStatueSlays();
    // control: without the Ring the wrestler is slain and the ruby stays in place
    const noRing = takeRuby([man()], seed, 4);
    expect(noRing.state.party[0]!.status).toBe(3);
    expect(noRing.state.treasures).toEqual([11]);
    // with the Ring at level 4 the wrestler survives the same losing roll; the ruby is still not taken
    const withRing = takeRuby([man([RING])], seed, 4);
    expect([0, 1]).toContain(withRing.state.party[0]!.status); // survives
    expect(withRing.state.treasures).toEqual([11]); // wrestle lost → ruby left in place, attemptable again
    expect(withRing.state.party[0]!.treasure).not.toContain(11);
    expect(withRing.events).toContainEqual({ type: "deathPrevented", creatureId: 5 });
    expect(withRing.events.some((e) => e.type === "memberDied")).toBe(false);
  });

  it("below level 4 the Ring does NOT protect against the statue (level-gated)", () => {
    const seed = seedWhereStatueSlays(); // rolls are level-independent, so this seed is lethal at level 3 too
    const withRing = takeRuby([man([RING])], seed, 3);
    expect(withRing.state.party[0]!.status).toBe(3); // level 3: slain despite holding the Ring
    expect(withRing.state.treasures).toEqual([11]); // ruby left in place
    expect(withRing.events.some((e) => e.type === "memberDied")).toBe(true);
    expect(withRing.events.some((e) => e.type === "deathPrevented")).toBe(false);
  });
});

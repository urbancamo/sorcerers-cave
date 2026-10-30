import { describe, it, expect } from "vitest";
import { smartStrategy, scoreAllocation, winChance } from "./smartLoadout";
import { standardStrategy, getStrategy, type LoadoutContext } from "./strategy";
import { loadoutViolation } from "./strangerEquip";
import { driveStrangers } from "./strangerDriver";
import { reduce } from "./reduce";
import { makeState } from "./testkit";
// a tiny seeded generator, local to the test
function makeRng(seed: number) { let a = seed >>> 0 || 1; const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { next, int: (n: number) => (next() * n) | 0 }; }
import type { PartyMember } from "./state";

const HERO = 0, OGRE = 2, MAN = 5, DWARF = 7, WIZARD = 8, PRIEST = 4, SORCERER = 11;
const SWORD = 3, STAFF = 9, RING = 10, AXE = 17, SHIELD = 20;
const ctx = (over: Partial<LoadoutContext["view"]> & { rngSeed?: number; budget?: LoadoutContext["budget"] } = {}): LoadoutContext => ({
  view: {
    strangers: [HERO, MAN, OGRE], gear: [[], [], []], floor: [SWORD], eyePresent: false, level: 1, round: 1,
    party: [{ creatureId: HERO, strength: 5, magic: 0 }, { creatureId: MAN, strength: 3, magic: 0 }], partyRollBonus: 0, ...over,
  },
  rngSeed: over.rngSeed ?? 1, budget: over.budget ?? { maxNodes: 20000 },
});

describe("winChance (two d6 plus a strength each)", () => {
  it("is a half for equal strengths and symmetric, and a 5 point lead is near-certain only at the edge", () => {
    expect(winChance(5, 5)).toBeCloseTo((36 - 6) / 2 / 36, 6);
    expect(winChance(5, 5) + winChance(5, 5) + (6 / 36)).toBeCloseTo(1, 6);
    expect(winChance(12, 5)).toBe(1);
    expect(winChance(5, 11)).toBe(0);
    expect(winChance(6, 5)).toBeGreaterThan(winChance(5, 5));
  });
});

describe("the smart loadout", () => {
  it("is registered-ready: kind builtin, id smart, versioned", () => {
    expect(smartStrategy).toMatchObject({ id: "smart", kind: "builtin" });
    expect(smartStrategy.version).toBeGreaterThanOrEqual(1);
  });

  it("with nothing to decide, or under the Eye, it does what standard does", () => {
    expect(smartStrategy.assignArtefacts(ctx({ floor: [] }))).toEqual({ allocations: [] });
    expect(smartStrategy.assignArtefacts(ctx({ eyePresent: true }))).toEqual({ allocations: [] });
  });

  it("with no visible party it falls back to standard's allocation", () => {
    const c = ctx({ party: [] });
    expect(smartStrategy.assignArtefacts(c)).toEqual(standardStrategy.assignArtefacts(c));
  });

  it("is deterministic and never mutates its context (P9)", () => {
    const c = ctx({ strangers: [MAN, MAN, DWARF, WIZARD], gear: [[], [], [], []], floor: [SWORD, AXE, STAFF, SHIELD, RING] });
    const before = JSON.stringify(c);
    expect(smartStrategy.assignArtefacts(c)).toEqual(smartStrategy.assignArtefacts(c));
    expect(JSON.stringify(c)).toBe(before);
  });

  it("scores its choice at least as high as standard's, on a corpus of random fights", () => {
    const rng = makeRng(7);
    const types = [HERO, 1, OGRE, 3, PRIEST, MAN, 6, DWARF, WIZARD, SORCERER, 14, 17, 18, 19];
    const floors = [SWORD, AXE, STAFF, SHIELD, RING];
    let differed = 0, total = 0, better = 0;
    for (let i = 0; i < 400; i++) {
      const n = 1 + rng.int(5), m = 1 + rng.int(6);
      const strangers = Array.from({ length: n }, () => types[rng.int(types.length)]!);
      const party = Array.from({ length: m }, () => { const c = types[rng.int(types.length)]!; const mp = [PRIEST, WIZARD, SORCERER, 14, 17, 18].includes(c) ? 3 + rng.int(4) : 0; return { creatureId: c, strength: 2 + rng.int(6) + mp, magic: mp }; });
      const floor = floors.filter(() => rng.next() < 0.5);
      const c = ctx({ strangers, gear: strangers.map(() => []), floor, party, level: 1 + rng.int(6), partyRollBonus: rng.int(3) - 1, rngSeed: i + 1 });
      const std = standardStrategy.assignArtefacts(c).allocations, smart = smartStrategy.assignArtefacts(c).allocations;
      const s0 = scoreAllocation(c.view, std), s1 = scoreAllocation(c.view, smart);
      expect(s1).toBeGreaterThanOrEqual(s0 - 1e-9);
      total++; if (JSON.stringify(std) !== JSON.stringify(smart)) differed++; if (s1 > s0 + 1e-9) better++;
    }
    expect(differed).toBeGreaterThan(0);          // otherwise it is just standard under another name
    expect(better).toBe(differed);                // and it only ever departs from standard to score higher
    expect(total).toBe(400);
  });

  it("every allocation it returns is legal for the engine (no fallbacks)", () => {
    const rng = makeRng(11);
    for (let i = 0; i < 200; i++) {
      const strangers = Array.from({ length: 1 + rng.int(5) }, () => [HERO, MAN, DWARF, WIZARD, PRIEST, OGRE, SORCERER][rng.int(7)]!);
      const floor = [SWORD, AXE, STAFF, SHIELD, RING].filter(() => rng.next() < 0.6);
      const state = makeState({ phase: "fight", strangers, treasures: floor, party: [{ creatureId: HERO, status: 0, dragonKills: 0, treasure: [] } as PartyMember], fight: { surprise: 0, round: 1, focus: 0 } });
      const { allocations } = smartStrategy.assignArtefacts(ctx({ strangers, gear: strangers.map(() => []), floor, rngSeed: i + 1 }));
      expect(loadoutViolation(state, allocations)).toBeNull();
    }
  });

  it("respects its budget: a tiny budget still returns a legal answer no worse than standard's", () => {
    const c = ctx({ strangers: [MAN, MAN, DWARF, WIZARD, HERO], gear: [[], [], [], [], []], floor: [SWORD, AXE, STAFF, SHIELD, RING], budget: { maxNodes: 3 } });
    const { allocations } = smartStrategy.assignArtefacts(c);
    expect(scoreAllocation(c.view, allocations)).toBeGreaterThanOrEqual(scoreAllocation(c.view, standardStrategy.assignArtefacts(c).allocations) - 1e-9);
  });

  it("puts the Shield where it blunts the party's magic: a lone Wizard facing the stranger who would otherwise not bear it", () => {
    // two Men and a Hero; the party is one Wizard (strength 7 of which 5 is magic) and the Shield is the only artefact
    const c = ctx({ strangers: [HERO, MAN], gear: [[], []], floor: [SHIELD], party: [{ creatureId: WIZARD, strength: 7, magic: 5 }] });
    const { allocations } = smartStrategy.assignArtefacts(c);
    // the Wizard pairs with the strongest stranger, the Hero: the Shield belongs on the Hero
    expect(allocations).toEqual([{ artifact: SHIELD, stranger: 0 }]);
  });
});

describe("as a registered strategy", () => {
  it("a game configured with it is decided by the driver, legally, with no fallback", () => {
    const g = makeState({
      phase: "encounter", strangers: [HERO, MAN], treasures: [SWORD, SHIELD],
      party: [{ creatureId: WIZARD, status: 0, dragonKills: 0, treasure: [] }, { creatureId: MAN, status: 0, dragonKills: 0, treasure: [] }],
      variants: { strangerLevel: "smart" },
    });
    const waiting = reduce(g, { type: "attack" }).state;
    const { state, applied } = driveStrangers(waiting);
    expect(getStrategy("smart").id).toBe("smart");
    expect(applied[0]!.action).toMatchObject({ strategyId: "smart" });
    expect((applied[0]!.action as { fallback?: unknown }).fallback).toBeUndefined();
    expect(state.fight!.pending).toBeUndefined();
  });
  it("the driver tells the strategy what the party looks like (visible strength only)", () => {
    let seen: LoadoutContext["view"]["party"] | undefined;
    // use a throwaway registered strategy to capture the view
    const g = makeState({
      phase: "encounter", strangers: [HERO], treasures: [SWORD],
      party: [{ creatureId: WIZARD, status: 1, dragonKills: 0, treasure: [STAFF] }, { creatureId: MAN, status: 3, dragonKills: 0, treasure: [] }],
      variants: { strangerLevel: "capture" },
    });
    return import("./strategy").then(({ registerStrategy, unregisterStrategy }) => {
      registerStrategy({ id: "capture", version: 1, kind: "builtin", assignArtefacts: (c) => { seen = c.view.party; return { allocations: [] }; } });
      try { driveStrangers(reduce(g, { type: "attack" }).state); } finally { unregisterStrategy("capture"); }
      expect(seen).toEqual([{ creatureId: WIZARD, strength: 9, magic: 7 }]);   // living members only: Wizard fs 2 + magic 5 + Staff 2, of which 7 is magic
    });
  });
});

import { describe, it, expect } from "vitest";
import { randomScenario, balancedScenario, MAX_PARTY, MAX_STRANGERS } from "./scenario";
import { DEFAULT_RULES, T, totalOf } from "./rules";

const KIT_ONLY_CREATURES = [14, 15, 16, 17, 18, 19, 20];
const BASE_COPIES: Record<number, number> = { 0: 1, 1: 1, 2: 3, 3: 3, 4: 3, 5: 6, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3, 11: 1, 12: 3, 13: 1 };
const KIT_COPIES: Record<number, number> = { ...BASE_COPIES, 6: 4, 7: 4, 14: 1, 15: 1, 16: 1, 17: 1, 18: 3, 19: 1, 20: 1 };

const count = (ids: number[]) => ids.reduce<Record<number, number>>((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {});

describe("randomScenario", () => {
  it("is deterministic for a seed and differs between seeds", () => {
    expect(randomScenario(5, "base")).toEqual(randomScenario(5, "base"));
    expect(JSON.stringify(randomScenario(5, "base"))).not.toBe(JSON.stringify(randomScenario(6, "base")));
  });
  for (const deck of ["base", "kit"] as const) {
    it(`${deck}: never uses more copies of a creature than the deck holds, and respects the exclusions`, () => {
      const caps = deck === "base" ? BASE_COPIES : KIT_COPIES;
      for (let seed = 1; seed <= 2000; seed++) {
        const s = randomScenario(seed, deck);
        const c = count([...s.party, ...s.strangers].map((u) => u.cid));
        for (const [id, n] of Object.entries(c)) expect(n).toBeLessThanOrEqual(caps[Number(id)] ?? 0);
        expect(s.strangers.length).toBeGreaterThanOrEqual(1);
        expect(s.strangers.length).toBeLessThanOrEqual(6);
        expect(s.party.length).toBeGreaterThanOrEqual(s.strangers.length);
        expect(s.party.length).toBeLessThanOrEqual(14);
        for (const u of s.strangers) { expect(u.cid).not.toBe(9); expect(u.cid).not.toBe(15); } // no Spectre, no Demon
        for (const u of s.party) { expect([9, 10, 11, 15]).not.toContain(u.cid); }             // never allies
        if (deck === "base") for (const u of [...s.party, ...s.strangers]) expect(KIT_ONLY_CREATURES).not.toContain(u.cid);
      }
    });
    it(`${deck}: each artefact exists at most once, and base games have no Axe or Shield`, () => {
      for (let seed = 1; seed <= 2000; seed++) {
        const s = randomScenario(seed, deck);
        const gear = [...s.party, ...s.strangers].flatMap((u) => u.gear);
        for (const t of [T.SWORD, T.STAFF, T.RING, T.AXE, T.SHIELD]) expect(gear.filter((g) => g === t).length).toBeLessThanOrEqual(1);
        if (deck === "base") { expect(gear).not.toContain(T.AXE); expect(gear).not.toContain(T.SHIELD); }
      }
    });
  }
  it("covers a spread of fights (1-4 strangers common, sometimes more)", () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 3000; seed++) sizes.add(randomScenario(seed, "base").strangers.length);
    for (const k of [1, 2, 3, 4]) expect(sizes.has(k)).toBe(true);
  });
});

describe("randomScenario with explicit sizes", () => {
  const caps = (deck: "base" | "kit") => (deck === "base" ? BASE_COPIES : KIT_COPIES);
  for (const [deck, k, m] of [["base", 6, 24], ["base", 4, 26], ["kit", 6, 34], ["kit", 10, 28]] as const) {
    it(`${deck}: ${k} strangers and a party of ${m} stay within the deck`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const s = randomScenario(seed, deck, { strangers: k, party: m });
        expect(s.strangers.length).toBe(k);
        expect(s.party.length).toBe(m);
        const c = count([...s.party, ...s.strangers].map((u) => u.cid));
        for (const [id, n] of Object.entries(c)) expect(n).toBeLessThanOrEqual(caps(deck)[Number(id)] ?? 0);
        for (const u of s.party) expect([9, 10, 11, 15]).not.toContain(u.cid);
      }
    });
  }
  it("the default size limits are unchanged", () => {
    for (let seed = 1; seed <= 500; seed++) expect(randomScenario(seed, "base").party.length).toBeLessThanOrEqual(14);
  });
});

describe("size limits", () => {
  it("the game's ceilings: 30 allies in the base deck, 40 with the kit, and up to 20 strangers (a Mutiny)", () => {
    expect(MAX_PARTY).toEqual({ base: 30, kit: 40 });
    expect(MAX_STRANGERS).toBe(20);
  });
  it("accepts the largest sizes and refuses more strangers than the limit", () => {
    expect(randomScenario(1, "base", { strangers: 20 }).strangers.length).toBe(20);
    expect(() => randomScenario(1, "base", { strangers: 21 })).toThrow(RangeError);
    expect(() => randomScenario(1, "base", { strangers: 0 })).toThrow(RangeError);
  });
  it("caps the party at what the deck still holds (never more than the allies available)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = randomScenario(seed, "base", { strangers: 4, party: 99 });
      expect(b.party.length).toBeLessThanOrEqual(30);
      expect(b.party.length).toBeGreaterThanOrEqual(26);   // 30 allies minus at most the 4 strangers who are allyable types
      const k = randomScenario(seed, "kit", { strangers: 4, party: 99 });
      expect(k.party.length).toBeLessThanOrEqual(40);
      expect(k.party.length).toBeGreaterThanOrEqual(36);
    }
  });
});

describe("balancedScenario (strength-matched fights of any size)", () => {
  const ctxOf = (s: ReturnType<typeof balancedScenario>) => ({ eye: s.eye, curses: s.curses, level: s.level, surprise: s.strangerSurprise, rules: DEFAULT_RULES });
  const ratio = (s: ReturnType<typeof balancedScenario>) => {
    const c = ctxOf(s);
    return s.party.reduce((a, u) => a + totalOf(u, c), 0) / s.strangers.reduce((a, u) => a + totalOf(u, c), 0);
  };
  it("is deterministic for a seed", () => {
    expect(balancedScenario(11, "base")).toEqual(balancedScenario(11, "base"));
    expect(JSON.stringify(balancedScenario(11, "base"))).not.toBe(JSON.stringify(balancedScenario(12, "base")));
  });
  for (const deck of ["base", "kit"] as const) {
    it(`${deck}: the party's total strength is within the band of the strangers', and the deck is respected`, () => {
      const caps = deck === "base" ? BASE_COPIES : KIT_COPIES;
      for (let seed = 1; seed <= 2000; seed++) {
        const s = balancedScenario(seed, deck);
        const r = ratio(s);
        expect(r).toBeGreaterThanOrEqual(0.7); expect(r).toBeLessThanOrEqual(1.4);
        expect(s.strangers.length).toBeGreaterThanOrEqual(1); expect(s.strangers.length).toBeLessThanOrEqual(MAX_STRANGERS);
        expect(s.party.length).toBeGreaterThanOrEqual(1); expect(s.party.length).toBeLessThanOrEqual(MAX_PARTY[deck]);
        const c = count([...s.party, ...s.strangers].map((u) => u.cid));
        for (const [id, n] of Object.entries(c)) expect(n).toBeLessThanOrEqual(caps[Number(id)] ?? 0);
        for (const u of s.strangers) expect([9, 15]).not.toContain(u.cid);
        for (const u of s.party) expect([9, 10, 11, 15]).not.toContain(u.cid);
      }
    });
    it(`${deck}: covers small and large fights, including parties of 20+ and 10+ strangers`, () => {
      let maxParty = 0, maxStr = 0;
      for (let seed = 1; seed <= 6000; seed++) { const s = balancedScenario(seed, deck); maxParty = Math.max(maxParty, s.party.length); maxStr = Math.max(maxStr, s.strangers.length); }
      expect(maxParty).toBeGreaterThanOrEqual(20);
      expect(maxStr).toBeGreaterThanOrEqual(10);
    });
  }
  it("honours a narrower band and a smaller stranger limit", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const s = balancedScenario(seed, "base", { band: [0.9, 1.1], maxStrangers: 4 });
      const r = ratio(s);
      expect(r).toBeGreaterThanOrEqual(0.9); expect(r).toBeLessThanOrEqual(1.1);
      expect(s.strangers.length).toBeLessThanOrEqual(4);
    }
  });
});

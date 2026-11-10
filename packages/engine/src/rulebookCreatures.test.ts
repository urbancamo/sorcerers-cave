import { describe, it, expect } from "vitest";
// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { ALL_CREATURES } from "./data/creatures";
import { findLeader } from "./reaction";

/**
 * Creatures and strangers, checked against the Consolidated Rules V2: the creature headings
 * ("### Giant. STR 7. CAP 150 kg. 7 vp. Reacts: 1-3 Hostile. 4-5 Indifferent. 6 Friendly.") and the leader priority list
 * (§Encountering Strangers). The ORACLE is the rulebook text. Known differences are in DIFFERENCES / `it.fails` and the
 * rulings register. Clause list: docs/validation/clauses/creatures.md.
 */
const text = readFileSync("../../docs/rules/Expanded Consolidated Rules PV2026 V3.md", "utf8");
const NAME: Record<string, string> = { "Woman Hero": "W-Hero", "The Sorcerer": "Sorcerer", Sybil: "Sibyl" };

interface Book { name: string; str: number; mag?: number; cap?: number; vp?: number; hostile: number; indiff: number; friendly: number }

/** "1-5 Hostile 6 Friendly" -> highest roll of each band (0 when a band is absent). */
function bands(s: string): { hostile: number; indiff: number; friendly: number } {
  const out = { hostile: 0, indiff: 0, friendly: 0 };
  for (const m of s.matchAll(/(\d)(?:-(\d))?\s+(Hostile|Indifferent|Friendly)/g)) {
    const hi = Number(m[2] ?? m[1]);
    out[m[3] === "Hostile" ? "hostile" : m[3] === "Indifferent" ? "indiff" : "friendly"] = hi;
  }
  return out;
}

const book: Book[] = [];
for (const m of text.matchAll(/^### (.+?)\. STR (\d+)(?: \(([^)]*)\))?\.(.*)$/gm)) {
  const rest = m[4]!;
  const reacts = /Reacts:\s*([^“\n]*)/.exec(rest)?.[1] ?? "";
  const mag = /MAG (\d+)/.exec(m[3] ?? "")?.[1];
  book.push({
    name: NAME[m[1]!] ?? m[1]!, str: Number(m[2]), mag: mag ? Number(mag) : undefined,
    cap: /CAP (\d+)/.exec(rest) ? Number(/CAP (\d+)/.exec(rest)![1]) : undefined,
    vp: /(\d+)\s*vp/.exec(rest) ? Number(/(\d+)\s*vp/.exec(rest)![1]) : undefined,
    ...bands(reacts),
  });
}
const engine = (name: string) => ALL_CREATURES.find((c) => c.name === name);

describe("creature headings", () => {
  it("the parser found the book's creatures", () => { expect(book.length).toBeGreaterThanOrEqual(20); });
  for (const b of book) {
    const c = engine(b.name);
    if (!c) continue;
    it(`${b.name}: strength, magic, capacity, points`, () => {
      expect(c.fs + c.mp).toBe(b.str);
      if (b.mag !== undefined) expect(c.mp).toBe(b.mag);
      if (b.cap !== undefined) expect(c.carry).toBe(b.cap);
      if (b.vp !== undefined) expect(c.points).toBe(b.vp);
    });
  }
});

describe("reaction tables (book roll bands vs the engine's hostileMax / indiffMax)", () => {
  for (const b of book) {
    const c = engine(b.name);
    if (!c || c.hostileMax === null) continue;
    if (b.hostile + b.indiff + b.friendly === 0) continue; // no table printed on the heading (Priest, Unicorn)
    it(`${b.name}`, () => {
      expect(c.hostileMax).toBe(b.hostile);
      const lastNonFriendly = b.friendly > 0 ? Math.max(b.hostile, b.indiff) : 6;
      expect(c.indiffMax).toBe(lastNonFriendly);
    });
  }
});

describe("leader priority (§Encountering Strangers)", () => {
  // Highest first; creatures on the same line are equal.
  const ORDER = [["Sorcerer"], ["Apprentice"], ["Demon", "Spectre"], ["Dragon"], ["Wizard"], ["Hero", "W-Hero"], ["Priest"], ["Witch"], ["Man"], ["Woman"],
    ["Scholar"], ["Thief"], ["Giant"], ["Ogre"], ["Troll"], ["Lion"], ["Wolf"], ["Dwarf"]];
  const names = ORDER.flat();
  const rank = (n: string) => ORDER.findIndex((l) => l.includes(n));
  const id = (n: string) => engine(n)!.id;
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (rank(names[i]!) < rank(names[j]!)) pairs.push([names[i]!, names[j]!]);
  it("the list is complete", () => { expect(names.length).toBe(20); });
  // For each ordered pair, the higher-ranked creature leads whichever way the group is drawn.
  const failing = pairs.filter(([hi, lo]) => findLeader([id(lo), id(hi)]) !== 1 || findLeader([id(hi), id(lo)]) !== 0);
  // R-32 (follow Peter): every creature has its own rank, so the leader never depends on draw order.
  it("R-32: the engine orders every pair as the book's priority list does", () => {
    expect(failing.map(([a, b]) => `${a}>${b}`)).toEqual([]);
  });
});

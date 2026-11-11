// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CREATURES } from "./data/creatures";
import { ALL_TREASURES } from "./data/treasures";

// Engine rules validation, pilot (docs/requirements/engine-rules-validation/plan.md). The ORACLE here is the rulebook, not the engine:
// the creature and treasure card entries of Peter's Expanded Consolidated Rules PV2026 V3 are parsed from its markdown and compared with
// `data/creatures.ts` and `data/treasures.ts`. The engine spec's SC rows were written from the code, so they cannot catch a table typo
// (the Dragon table, card 41, the Idol's weight were all found late that way); this does.
//
// Where the engine departs from the book on purpose, the departure is listed in DEVIATIONS below with its reason, so a NEW difference
// fails the test and a documented one cannot be mistaken for a bug.
const RULES = "../../docs/rules/Expanded Consolidated Rules PV2026 V3.md";
const text: string = readFileSync(RULES, "utf8");
const section = (from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to));
const headings = (body: string) => body.split("\n").filter((l) => l.startsWith("### "));

/** Rulebook name -> engine name, where they are spelt differently. */
const CREATURE_NAME: Record<string, string> = { "Woman Hero": "W-Hero", Sybil: "Sibyl", "The Sorcerer": "Sorcerer" };

interface BookCreature { name: string; str: number; phy?: number; mag?: number; cap?: number; vp?: number; bands?: { lo: number; hi: number; kind: string }[] }
function parseCreature(line: string): BookCreature {
  const rest = line.slice(4);
  const name = rest.slice(0, rest.indexOf(". ")).trim();
  const num = (re: RegExp) => { const m = rest.match(re); return m ? Number(m[1]) : undefined; };
  const reacts = rest.match(/Reacts: (.*)$/);
  const bands = reacts
    ? [...reacts[1]!.matchAll(/(\d)(?:-(\d))?\s+(Hostile|Indifferent|Friendly)/g)].map((m) => ({ lo: Number(m[1]), hi: Number(m[2] ?? m[1]), kind: m[3]! }))
    : undefined;
  return { name, str: num(/STR (\d+)/)!, phy: num(/PHY (\d+)/), mag: num(/MAG (\d+)/), cap: num(/CAP (\d+) ?kg/), vp: num(/(\d+) ?vp/), bands };
}

const creatures = headings(section("## Creature Cards", "## PLAYER INTERACTION")).map(parseCreature);

/** Engine reaction thresholds from the book's bands: hostileMax = highest roll that is hostile; indiffMax = highest that is hostile or indifferent. */
const thresholds = (bands: NonNullable<BookCreature["bands"]>) => {
  let hostile = 0, indiff = 0;
  for (const b of bands) {
    if (b.kind === "Hostile") hostile = Math.max(hostile, b.hi);
    if (b.kind !== "Friendly") indiff = Math.max(indiff, b.hi);
  }
  return { hostileMax: hostile, indiffMax: Math.max(indiff, hostile) };
};

/** Documented differences between the engine's creature table and the book. key = "<name>.<field>" */
const CREATURE_DEVIATIONS: Record<string, string> = {
  "Apprentice.reaction": "the book's '1-5 Hostile 6 Friendly' holds only while the Sorcerer lives; the engine's table is the base band, the rest is code (US-14).",
};

/** MISMATCHES the table diff found and has not yet been fixed: none. (Pilot, 2026-11-06: the kit creatures' reaction bands came from the original
 *  kit design's "†" assumptions; the Consolidated Rules V2 prints them. Ruled "follow the book" by MSW and fixed in `data/creatures.ts`, register
 *  R-02..R-06.) A creature listed here is tested with `it.fails`, so it turns red the moment someone fixes the engine. */
const KNOWN_MISMATCH: Record<string, string> = {};

describe("rulebook tables: creature cards (Consolidated Rules V2 'Creature Cards')", () => {
  it("parses the creature entries it is checking (guards the parser itself)", () => {
    expect(creatures.length).toBeGreaterThanOrEqual(22);
    expect(creatures.every((c) => Number.isFinite(c.str) || c.name === "Sybil")).toBe(true);
  });

  for (const c of creatures) {
    const engine = ALL_CREATURES.find((e) => e.name === (CREATURE_NAME[c.name] ?? c.name));
    const known = KNOWN_MISMATCH[c.name];
    (known ? it.fails : it)(`${c.name}: strength, magic, capacity, points and reactions equal the book's${known ? ` — KNOWN MISMATCH: ${known}` : ""}`, () => {
      expect(engine, `${c.name} is in the engine's creature table`).toBeDefined();
      const e = engine!;
      if (Number.isFinite(c.str)) expect(e.fs + e.mp, `${c.name} STR`).toBe(c.str);
      if (c.phy !== undefined) expect(e.fs, `${c.name} PHY`).toBe(c.phy);
      if (c.mag !== undefined) expect(e.mp, `${c.name} MAG`).toBe(c.mag);
      if (c.cap !== undefined) expect(e.carry, `${c.name} CAP`).toBe(c.cap);
      if (c.vp !== undefined) expect(e.points, `${c.name} vp`).toBe(c.vp);
      if (c.bands && !CREATURE_DEVIATIONS[`${c.name}.reaction`]) {
        expect({ hostileMax: e.hostileMax, indiffMax: e.indiffMax }, `${c.name} reaction`).toEqual(thresholds(c.bands));
      }
    });
  }

  it("lists every documented deviation and known mismatch only for a creature the book really has", () => {
    for (const key of [...Object.keys(CREATURE_DEVIATIONS).map((k) => k.split(".")[0]!), ...Object.keys(KNOWN_MISMATCH)]) expect(creatures.some((c) => c.name === key)).toBe(true);
  });
});

// ---- treasure cards ----
interface BookTreasure { name: string; weight: number; vp: number[] }
function parseTreasure(line: string): BookTreasure {
  const rest = line.slice(4);
  const stop = rest.search(/\.(?:\s|$)/);
  const name = (stop < 0 ? rest : rest.slice(0, stop)).trim();
  const wgt = rest.match(/(\d+) ?kg/);
  const vp = rest.match(/(\d+(?:\/\d+)*) ?vp/i);
  return { name, weight: wgt ? Number(wgt[1]) : 0, vp: vp ? vp[1]!.split("/").map(Number) : [] };
}
const TREASURE_NAME: Record<string, string> = { "Magic staff": "Magic Staff" };
const treasures = headings(section("## Treasure Cards", "## Creature Cards")).concat(headings(section("## Strength potion.", "### Talisman"))).map(parseTreasure);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z/]/g, "");

describe("rulebook tables: treasure cards (Consolidated Rules V2 'Treasure Cards')", () => {
  it("parses the treasure entries it is checking", () => {
    expect(treasures.length).toBeGreaterThanOrEqual(21);
  });

  for (const t of treasures) {
    const engine = ALL_TREASURES.find((e) => norm(e.name) === norm(TREASURE_NAME[t.name] ?? t.name));
    it(`${t.name}: weight${t.vp.length === 1 ? " and points" : ""} equal the book's`, () => {
      expect(engine, `${t.name} is in the engine's treasure table`).toBeDefined();
      expect(engine!.weight, `${t.name} weight`).toBe(t.weight);
      // A single printed value is the card's score; several ('0/20/40/80') are dice- or contents-dependent, scored by code.
      if (t.vp.length === 1) expect(engine!.points, `${t.name} vp`).toBe(t.vp[0]);
    });
  }
});

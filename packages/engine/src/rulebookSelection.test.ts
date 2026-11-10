// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CREATURES, selectionCost, startingStock } from "./data/creatures";
import { PARTY_BUDGET } from "./state";
import { smallPackExtension, smallPackSibyl, smallPackTemplate } from "./data/smallPack";

// Engine rules validation, pilot (docs/requirements/engine-rules-validation/plan.md): the party-selection table ("Making up the exploring
// parties") and the creature card distribution ("CREATURES - by STR, VP - CARD DISTRIBUTION") of Consolidated Rules V2, parsed from the
// markdown and compared with the engine. The book is the oracle.
const text: string = readFileSync("../../docs/rules/Expanded Consolidated Rules PV2026 V3.md", "utf8");
const rowsOf = (from: string, to: string): string[][] => {
  const a = text.indexOf(from), b = text.indexOf(to, a + 1);
  return text.slice(a, b).split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|--") && !/^\|\s*(Type|Creature)\s/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
};
const NAME: Record<string, string> = { "Woman Hero": "W-Hero", Sybil: "Sibyl" };
const idOf = (name: string): number => {
  const c = ALL_CREATURES.find((e) => e.name === (NAME[name] ?? name));
  if (!c) throw new Error(`no engine creature named ${name}`);
  return c.id;
};

describe("rulebook tables: party selection ('Making up the exploring parties')", () => {
  const rows = rowsOf("| Type       | Magical", "The composition of the exploring parties");
  it("parses the 13 selectable creatures, and the budget is the book's 6", () => {
    expect(rows).toHaveLength(13);
    expect(text).toContain("total selection\nvalue of 6");
    expect(PARTY_BUDGET).toBe(6);
  });
  for (const r of rows) {
    it(`${r[0]}: selection value ${r[6]} and ${r[4]} in the pack (Extension Kit on)`, () => {
      const id = idOf(r[0]!);
      expect(selectionCost(id, { extensionKit: true }), `${r[0]} selection value`).toBe(Number(r[6]));
      expect(startingStock({ extensionKit: true })[id], `${r[0]} number available`).toBe(Number(r[4]));
    });
  }
});

describe("rulebook tables: creature card distribution", () => {
  const rows = rowsOf("| Creature   | STR", "| TREASURE");
  const count = (cards: number[], id: number) => cards.filter((c) => c === 100 + id).length;
  const base = smallPackTemplate(), kit = base.concat(smallPackExtension());
  it("parses the creature distribution table", () => expect(rows.length).toBeGreaterThanOrEqual(22));
  // Register R-18 / R-19 (MSW, 2026-11-06): the book's distribution table differs from the engine's small pack for these two, and the engine
  // is right. Each is pinned to the engine's own counts so a NEW difference still fails.
  const DEVIATION: Record<string, { base: number; kit: number; why: string }> = {
    Demon: { base: 0, kit: 1, why: "the Demon is Extension Kit only; the table's base-game 1 is wrong (R-18)" },
    "Woman Hero": { base: 1, kit: 0, why: "the Woman Hero is in the base game; the table's kit-only entry is wrong (R-19)" },
  };
  for (const r of rows) {
    const name = r[0]!;
    if (name === "Sybil") continue; // checked below
    const dev = DEVIATION[name];
    it(`${name}: ${dev ? `${dev.base} in the base pack, ${dev.kit} more with the kit — DOCUMENTED DEVIATION: ${dev.why}` : `${r[6] || 0} in the base pack, ${r[7] || 0} more with the Extension Kit`}`, () => {
      const id = idOf(name);
      expect(count(base, id), `${name} in the base small pack`).toBe(dev ? dev.base : Number(r[6] || 0));
      expect(count(kit, id) - count(base, id), `${name} added by the kit`).toBe(dev ? dev.kit : Number(r[7] || 0));
    });
  }
  // The Sybil is a special card of the base game that is played only if the player opts in (the Sibyl variant), so it sits in an add-on, not the default pack.
  it("Sibyl: one card, in the Sibyl add-on", () => {
    expect(smallPackSibyl().filter((c) => c === 100 + idOf("Sybil")).length).toBe(1);
  });
});

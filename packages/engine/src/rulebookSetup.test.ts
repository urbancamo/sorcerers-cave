// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { ALL_CREATURES } from "./data/creatures";
import { validatePicks } from "./setup";
import { PARTY_BUDGET } from "./state";
import { selectionCost, startingStock } from "./data/creatures";

/**
 * Making up the exploring parties, checked against the Consolidated Rules V2 selection table (§Making up the exploring
 * parties). The ORACLE is the rulebook's table, parsed here. Clause list: docs/validation/clauses/setup.md.
 */
// @ts-ignore
const text: string = readFileSync("../../docs/rules/Expanded Consolidated Rules PV2026 V2.md", "utf8");
const start = text.indexOf("| Type       | Magical");
const lines = text.slice(start).split("\n").slice(2);
const rows = lines.slice(0, lines.findIndex((l) => !l.startsWith("|"))).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
const n = (c: string) => (c === "-" ? 0 : Number(c));
const NAME: Record<string, string> = { "Woman Hero": "W-Hero" };
// The table lists every creature, kit included, so it is compared with the kit-on stock and costs.
const KIT = { extensionKit: true };
const stock = (id: number) => startingStock(KIT)[id];

describe("selection table", () => {
  it("parses 13 rows", () => { expect(rows.length).toBe(13); });
  for (const r of rows) {
    const name = NAME[r[0]!] ?? r[0]!;
    const c = ALL_CREATURES.find((x) => x.name === name)!;
    it(`${name}: magic, fighting strength, carries, number in the pack`, () => {
      expect(c.mp).toBe(n(r[1]!));
      expect(c.fs).toBe(n(r[2]!));
      expect(c.carry).toBe(n(r[3]!));
      expect(stock(c.id)).toBe(n(r[4]!));
    });
    it(`${name}: selection value ${r[6]}`, () => { expect(selectionCost(c.id, KIT)).toBe(n(r[6]!)); });
  }
  it("the budget is 6", () => { expect(PARTY_BUDGET).toBe(6); });
  it("the book's own examples fit the budget under the engine's costs", () => {
    expect(validatePicks([4, 6], { extensionKit: false })).toBeTruthy(); // a priest and a woman
    expect(validatePicks([3, 7, 7], { extensionKit: false })).toBeTruthy(); // a troll and two dwarves
  });
});

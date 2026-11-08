// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CREATURES } from "./data/creatures";
import { canUseArtifact, eyeActive, hasLivingHuman } from "./effects";
import { swordBonus, axeBonus, staffBonus, shieldEligible, ringEligible } from "./capabilities";
import { makeState, inUseGear } from "./testkit";
import { reduce } from "./reduce";
import { rollDie } from "./rng";
import { activeCurses, ringInvincible, talismanWardsSpectres } from "./effects";
import { packCoord } from "./coords";
import { legalActions } from "./selectors";

// Engine rules validation, artefacts and curses (docs/validation/clauses/artefacts.md). The ORACLE is the rulebook's own table
// "ARTEFACTS - WHO CAN USE?" (Addendum), parsed from the markdown and compared with what the engine lets each creature do.
// Every cell of the ally columns is checked; the stranger columns are checked for the five items the engine can give a stranger
// (Sword, Staff, Ring, Axe, Shield). A cell where the engine differs from the book is listed in DIFFERENCES with its register entry; it
// is asserted to STILL differ, so it turns red the moment someone changes the engine and the entry must be revisited.
const text: string = readFileSync("../../docs/rules/Expanded Consolidated Rules PV2026 V2.md", "utf8");
const tbl = text.slice(text.indexOf("### ARTEFACTS – WHO CAN USE?"), text.indexOf("**NOTES**"));
const rows = [...tbl.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1]!.replace(/<\/?b>/g, "").trim()));
const columns = rows[2]!.slice(1).map((c) => c.replace(/\(#\d\)/g, "").split("<br>").map((s) => s.trim()).filter(Boolean));
const cid = (name: string) => ALL_CREATURES.find((c) => c.name === name)!.id;
const mem = (creatureId: number, treasure: number[]) => ({ creatureId, status: 1 as const, dragonKills: 0, treasure });
const has = (actions: { type: string; artifact?: number }[], artifact: number) => actions.some((a) => a.type === "useArtifact" && a.artifact === artifact);

/** What the engine lets a creature of this id do with the artefact, as the table means it. */
const probe: Record<string, (c: number) => boolean> = {
  "Charmed Flute": (c) => canUseArtifact(c, 12),
  "Eye of God": (c) => eyeActive(makeState({ party: [mem(c, [13])] })),
  "Magic Carpet": (c) => canUseArtifact(c, 4),
  "Magic Staff": (c) => staffBonus(c) > 0 || canUseArtifact(c, 9),
  "Magic Sword": (c) => swordBonus(c) > 0,
  "Strength Potion": (c) => has(legalActions(makeState({ phase: "fight", strangers: [2], fight: { surprise: -1, round: 1, focus: 0 } as never, party: [mem(c, [8])] })), 8),
  "Talisman": (c) => makeState({ party: [mem(c, [7])] }).party[0]!.treasure.includes(7), // passive: the engine ties it to no creature
  "The Ring": (c) => ringEligible(c),
  "Elixir (#3)": (c) => has(legalActions(makeState({ party: [mem(c, [15])] })), 15),
  "Holy Water": (c) => canUseArtifact(c, 16),
  "Lotus Dust": (c) => canUseArtifact(c, 5),
  "Magic Axe": (c) => axeBonus(c) > 0,
  "Magic Shield": (c) => shieldEligible(c),
  "Scroll": (c) => hasLivingHuman(makeState({ party: [mem(c, [19])] })),
};
const STRANGER_ITEMS = new Set(["Magic Sword", "Magic Staff", "The Ring", "Magic Axe", "Magic Shield"]);

/** Cells where the engine differs from the book. key = "<artefact>|<ally|stranger>|<creature>". */
const DIFFERENCES: Record<string, string> = {
  "Eye of God|ally|Ogre": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Eye of God|ally|Troll": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Eye of God|ally|Lion": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Eye of God|ally|Wolf": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Eye of God|ally|Dwarf": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Magic Sword|ally|Priest": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|ally|Witch": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|ally|Scholar": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|ally|Wizard": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|ally|Apprentice": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|stranger|Priest": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|stranger|Witch": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|stranger|Scholar": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|stranger|Wizard": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|stranger|Apprentice": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Sword|stranger|Sorcerer": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Strength Potion|ally|Priest": "R-23 (ruled: add the Thief, done; the priests stay out as the card): the book table lets the Priest class use it",
  "Strength Potion|ally|Witch": "R-23 (ruled: add the Thief, done; the priests stay out as the card): the book table lets the Priest class use it",
  "Strength Potion|ally|Scholar": "R-23 (ruled: add the Thief, done; the priests stay out as the card): the book table lets the Priest class use it",
  "Strength Potion|ally|Wizard": "R-23 (ruled: add the Thief, done; the priests stay out as the card): the book table lets the Priest class use it",
  "Strength Potion|ally|Apprentice": "R-23 (ruled: add the Thief, done; the priests stay out as the card): the book table lets the Priest class use it",
  "Talisman|ally|Ogre": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Talisman|ally|Troll": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Talisman|ally|Lion": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Talisman|ally|Wolf": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "Talisman|ally|Dwarf": "R-21 (ruled keep, MSW 2026-11-08): any holder counts; the book table says only Human and Priest creatures",
  "The Ring|ally|Dwarf": "R-24 (ruled keep, a table typo): the table leaves the allied Dwarf blank, the card and the stranger column allow it",
  "Magic Axe|ally|Priest": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|ally|Witch": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|ally|Scholar": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|ally|Wizard": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|ally|Apprentice": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|stranger|Priest": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|stranger|Witch": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|stranger|Scholar": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|stranger|Wizard": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|stranger|Apprentice": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
  "Magic Axe|stranger|Sorcerer": "R-22 (ruled keep): the book table lets the Priest class use it; the card gives them no bonus and the engine none",
};

interface Cell { key: string; artefact: string; role: string; creature: string; book: boolean }
const cells: Cell[] = [];
for (const r of rows.slice(3)) {
  r.slice(1).forEach((cell, col) => {
    const role = col < 4 ? "ally" : "stranger";
    if (role === "stranger" && !STRANGER_ITEMS.has(r[0]!)) return;
    for (const creature of columns[col]!) cells.push({ key: `${r[0]}|${role}|${creature}`, artefact: r[0]!, role, creature, book: /YES/.test(cell) });
  });
}

describe("rulebook table: ARTEFACTS - WHO CAN USE?", () => {
  it("parses the table it is checking (guards the parser itself)", () => {
    expect(rows.length).toBe(17);
    expect(Object.keys(probe).every((a) => rows.some((r) => r[0] === a))).toBe(true);
    expect(cells.length).toBeGreaterThan(150);
  });

  for (const c of cells) {
    const known = DIFFERENCES[c.key];
    const engine = (): boolean => probe[c.artefact]!(cid(c.creature));
    (known ? it.fails : it)(`${c.artefact}: ${c.role} ${c.creature} ${c.book ? "can" : "cannot"} use it${known ? ` — KNOWN DIFFERENCE: ${known}` : ""}`, () => {
      expect(engine(), `${c.key}`).toBe(c.book);
    });
  }

  it("lists a known difference only for a cell the book really has", () => {
    for (const k of Object.keys(DIFFERENCES)) expect(cells.some((c) => c.key === k), k).toBe(true);
  });
});

// ---- card texts: the numbers on the artefact cards (Consolidated Rules V2, Treasure Cards and Curse) ----
const area = { card: 31, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [] as number[], flags: 0, indiffCount: 0 };
const worn = (creatureId: number, treasure: number[]) => ({ creatureId, status: 0 as const, dragonKills: 0, treasure, borne: inUseGear(treasure) });
const seedFor = (v: number): number => { for (let seed = 1; seed < 100000; seed++) if (rollDie(seed).value === v) return seed; throw new Error("no seed"); };

describe("rulebook cards: the Elixir (1 poison kills, 2-3 nothing, 4-6 +2 strength)", () => {
  for (const [roll, status, bonus] of [[1, 3, 0], [2, 0, 0], [3, 0, 0], [4, 0, 2], [5, 0, 2], [6, 0, 2]] as const) {
    it(`a ${roll} ${roll === 1 ? "kills the drinker" : roll < 4 ? "does nothing" : "adds 2 to strength for good"}`, () => {
      const s = makeState({ phase: "explore", areas: [area], party: [worn(0, [15])], seed: seedFor(roll) });
      const r = reduce(s, { type: "useArtifact", artifact: 15, target: 0 });
      expect(r.state.party[0]!.status).toBe(status);
      expect(r.state.party[0]!.fsBonus ?? 0).toBe(bonus);
    });
  }
});

describe("rulebook cards: the Treasure Chest (1 curse, 2 Spectre, 3 sand, 4 silver 20, 5 gold 40, 6 gems 80)", () => {
  const open = (roll: number) => reduce(makeState({ phase: "explore", areas: [area], party: [worn(2, [14])], seed: seedFor(roll) }), { type: "openChest" } as never).state;
  it("1: a curse", () => expect(open(1).curses).toBe(1));
  it("2: a Spectre attacks", () => expect(open(2).strangers).toContain(9));
  it("3: sand, nothing", () => { const s = open(3); expect([s.curses, s.bonusScore, s.strangers.length]).toEqual([0, 0, 0]); });
  it("4: silver, 20 points", () => expect(open(4).bonusScore).toBe(20));
  it("5: gold, 40 points", () => expect(open(5).bonusScore).toBe(40));
  it("6: gems, 80 points", () => expect(open(6).bonusScore).toBe(80));
});

describe("rulebook: curses (subtract one from all die rolls, cumulative, none once the Sorcerer is dead)", () => {
  it("each curse counts, and they add up", () => {
    expect(activeCurses(makeState({ curses: 1 }))).toBe(1);
    expect(activeCurses(makeState({ curses: 3 }))).toBe(3);
  });
  it("a curse has no effect if the Sorcerer is dead", () => expect(activeCurses(makeState({ curses: 2, sorcererKilled: true }))).toBe(0));
});

describe("rulebook cards: the Ring and the Talisman act from the fourth level", () => {
  it("the Ring makes its wearer invincible on level 4 or deeper, not above", () => {
    const m = worn(0, [10]);
    expect(ringInvincible(m, makeState({ level: 3, party: [m] }))).toBe(false);
    expect(ringInvincible(m, makeState({ level: 4, party: [m] }))).toBe(true);
  });
  it("the Talisman wards off Spectres on level 4 or deeper, not above", () => {
    const m = worn(0, [7]);
    expect(talismanWardsSpectres(makeState({ level: 3, party: [m] }))).toBe(false);
    expect(talismanWardsSpectres(makeState({ level: 4, party: [m] }))).toBe(true);
  });
});

describe("rulebook cards: the Magic Staff (the book says +2 for a Priest or Wizard; the card +1 and +2)", () => {
  it("a Wizard gains 2", () => expect(staffBonus(cid("Wizard"))).toBe(2));
  // R-25 (MSW 2026-11-08): the printed card gives the Priest +1 and the Wizard +2; the rulebook's one-line summary ("by 2") is not followed.
  it("a Priest gains 1 — the printed card, ruled R-25 (the book's summary says 2)", () => expect(staffBonus(cid("Priest"))).toBe(1));
});

describe("R-23: the Thief drinks the Strength Potion as a Man", () => {
  it("is offered to a Thief in a fight, and adds 2", () => {
    const s = makeState({ phase: "fight", strangers: [2], fight: { surprise: -1, round: 1, focus: 0 } as never, party: [mem(19, [8]), mem(7, [])] });
    expect(has(legalActions(s), 8)).toBe(true);
    const r = reduce(s, { type: "useArtifact", artifact: 8, target: 0 });
    expect(r.state.party[0]!.potionActive).toBe(true);
  });
});

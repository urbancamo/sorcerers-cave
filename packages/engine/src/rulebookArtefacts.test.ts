// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CREATURES } from "./data/creatures";
import { canUseArtifact, eyeActive } from "./effects";
import { swordBonus, axeBonus, staffBonus, shieldEligible, ringEligible } from "./capabilities";
import { makeState, inUseGear } from "./testkit";
import { reduce } from "./reduce";
import { rollDie } from "./rng";
import { activeCurses, ringInvincible, talismanWardsSpectres, annihilateWithEye } from "./effects";
import { casterMP, frontStrength } from "./combat";
import { packCoord } from "./coords";
import { legalActions } from "./selectors";

// Engine rules validation, artefacts and curses (docs/validation/clauses/artefacts.md). The ORACLE is the rulebook's own pair of tables
// "WHO CAN USE ARTEFACTS - ALLIES / STRANGERS" (Peter's Appendices 20261006, Addendum of the rules file), parsed from the markdown and
// compared with what the engine lets each creature do. Every cell of the ally table is checked; the stranger table is checked for the
// five items the engine can give a stranger (Sword, Staff, Ring, Axe, Shield). A cell where the engine differs from the book is listed in
// DIFFERENCES with its register entry; it is asserted to STILL differ, so it turns red the moment someone changes the engine and the entry
// must be revisited. (MSW 2026-11-10: the Eye of God, the Scroll and the Talisman are for humans and magic users only, so the engine now
// agrees with the book everywhere; the Elixir is "any creature" by house rule #3, which the table shows.)
const text: string = readFileSync("../../docs/rules/Expanded Consolidated Rules PV2026 V3.md", "utf8");
/** A markdown table under `heading`: its header names (marker notes like "(#4)" removed) and its rows (item, then one cell per creature). */
function table(heading: string): { names: string[]; rows: string[][] } {
  const lines = text.slice(text.indexOf(heading)).split("\n").slice(1);
  const body: string[][] = [];
  let started = false;
  for (const l of lines) {
    if (!l.startsWith("|")) { if (started) break; continue; }
    started = true;
    body.push(l.split("|").slice(1, -1).map((c) => c.trim()));
  }
  const [head, , ...rows] = body;
  return { names: head!.slice(1).map((n) => n.replace(/\(#\d\)/g, "").trim()), rows: rows.map((r) => [r[0]!.replace(/\(#\d\)/g, "").trim(), ...r.slice(1)]) };
}
const allies = table("### WHO CAN USE ARTEFACTS - ALLIES"), strangersTbl = table("### WHO CAN USE ARTEFACTS - STRANGERS");
const rows = allies.rows;
const ENGINE_NAME: Record<string, string> = { "Woman-Hero": "W-Hero" };
const cid = (name: string) => ALL_CREATURES.find((c) => c.name === (ENGINE_NAME[name] ?? name))!.id;
const mem = (creatureId: number, treasure: number[]) => ({ creatureId, status: 1 as const, dragonKills: 0, treasure });
const has = (actions: { type: string; artifact?: number }[], artifact: number) => actions.some((a) => a.type === "useArtifact" && a.artifact === artifact);

/** What the engine lets a creature of this id do with the artefact, as the table means it. */
const probe: Record<string, (c: number) => boolean> = {
  "Charmed Flute": (c) => canUseArtifact(c, 12),
  "Eye of God": (c) => eyeActive(makeState({ party: [mem(c, [13])] })),
  "Healing Balm": (c) => canUseArtifact(c, 6),
  "Magic Carpet": (c) => canUseArtifact(c, 4),
  "Magic Staff": (c) => staffBonus(c) > 0 || canUseArtifact(c, 9),
  "Magic Sword": (c) => swordBonus(c) > 0,
  "Strength Potion": (c) => has(legalActions(makeState({ phase: "fight", strangers: [2], fight: { surprise: -1, round: 1, focus: 0 } as never, party: [mem(c, [8])] })), 8),
  "Talisman": (c) => talismanWardsSpectres(makeState({ level: 4, party: [{ ...mem(c, [7]), borne: [7] }] })),
  "The Ring": (c) => ringEligible(c),
  "Elixir": (c) => has(legalActions(makeState({ party: [mem(c, [15])] })), 15),
  "Holy Water": (c) => canUseArtifact(c, 16),
  "Lotus Dust": (c) => canUseArtifact(c, 5),
  "Magic Axe": (c) => axeBonus(c) > 0,
  "Magic Shield": (c) => shieldEligible(c),
  "Scroll": (c) => canUseArtifact(c, 19),
};
const STRANGER_ITEMS = new Set(["Magic Sword", "Magic Staff", "The Ring", "Magic Axe", "Magic Shield"]);

/** Cells where the engine differs from the book. key = "<artefact>|<ally|stranger>|<creature>". None at present. */
const DIFFERENCES: Record<string, string> = {};

interface Cell { key: string; artefact: string; role: string; creature: string; book: boolean }
const cells: Cell[] = [];
for (const [role, t] of [["ally", allies], ["stranger", strangersTbl]] as const) {
  for (const r of t.rows) {
    if (role === "stranger" && !STRANGER_ITEMS.has(r[0]!)) continue;
    r.slice(1).forEach((cell, col) => cells.push({ key: `${r[0]}|${role}|${t.names[col]}`, artefact: r[0]!, role, creature: t.names[col]!, book: /^y$/i.test(cell) }));
  }
}

describe("rulebook table: WHO CAN USE ARTEFACTS (allies and strangers)", () => {
  it("parses the tables it is checking (guards the parser itself)", () => {
    expect(allies.names.length).toBe(17);
    expect(strangersTbl.names.length).toBe(18);
    expect(rows.length).toBe(15);
    expect(Object.keys(probe).every((a) => rows.some((r) => r[0] === a))).toBe(true);
    expect(cells.length).toBeGreaterThan(300);
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

// ---- the Eye of God, Healing Balm, Magic Carpet, Lotus Dust, Scroll: the card texts ----
describe("rulebook cards: the Eye of God (powerless magic and artefacts, annihilates Spectres, must be kept)", () => {
  it("annihilates a Spectre", () => {
    const st = makeState({ strangers: [9], party: [worn(0, [13])] });
    annihilateWithEye(st);
    expect(st.strangers).toEqual([]);
  });
  it("makes a Wizard's Staff magic powerless, but he keeps his fighting strength", () => {
    const st = makeState({ strangers: [2], party: [worn(8, [9]), worn(0, [13])] });
    expect(casterMP(st.party[0]!, st)).toBe(0);
    expect(frontStrength(st.party[0]!, st)).toBe(2); // Wizard PHY 2
  });
  it("makes the Magic Sword powerless", () => {
    const st = makeState({ party: [worn(0, [3, 13])] });
    expect(frontStrength(st.party[0]!, st)).toBe(5); // Hero 5, no +2
  });
  it("dropping it is a curse", () => {
    const st = makeState({ phase: "explore", areas: [area], party: [worn(0, [13]), worn(5, [])] });
    expect(reduce(st, { type: "dropTreasure", mi: 0, idx: 0 } as never).state.curses).toBe(1);
  });
});

describe("rulebook cards: the Healing Balm (Wizard, Priest or Woman; just killed; not in a fight; one cure)", () => {
  const dead = (o = {}) => worn(5, []) && { creatureId: 5, status: 3 as const, dragonKills: 0, treasure: [], diedTurn: 1, diedArea: 0, ...o };
  it("a Wizard restores a creature just killed, and the balm is used up", () => {
    const r = reduce(makeState({ phase: "explore", areas: [area], party: [worn(8, [6]), dead()] }), { type: "useArtifact", artifact: 6, target: 1 });
    expect(r.state.party[1]!.status).toBe(0);
    expect(r.state.party[0]!.treasure).not.toContain(6);
  });
  it("a Man cannot administer it", () => {
    const r = reduce(makeState({ phase: "explore", areas: [area], party: [worn(5, [6]), dead({ creatureId: 2 })] }), { type: "useArtifact", artifact: 6, target: 1 });
    expect(r.state.party[1]!.status).toBe(3);
  });
  it("it cannot be used in a fight", () => {
    const r = reduce(makeState({ phase: "fight", fight: { surprise: 0, round: 1, focus: 0 } as never, strangers: [2], areas: [area], party: [worn(8, [6]), dead()] }), { type: "useArtifact", artifact: 6, target: 1 });
    expect(r.state.party[1]!.status).toBe(3);
  });
});

describe("rulebook cards: the Magic Carpet (a Priest or Wizard moves the party to an adjacent area; the carpet stays behind)", () => {
  it("moves the party one area east, and leaves the carpet where it was used", () => {
    const r = reduce(makeState({ phase: "explore", areas: [area], party: [worn(4, [4])] }), { type: "useArtifact", artifact: 4, dir: 2 } as never);
    expect(r.state.areas.length).toBe(2);                          // a new tile drawn for the destination
    expect(r.state.party[0]!.treasure).not.toContain(4);           // no longer carried
    expect(r.state.areas[0]!.contents).toContain(200 + 4);         // left in the area it was used in
  });
});

describe("rulebook cards: Lotus Dust works on Medusa and creatures, but not on Spectres", () => {
  it("is offered against a Dragon and not against a Spectre", () => {
    const st = makeState({ phase: "encounter", areas: [area], strangers: [10, 9], party: [worn(5, [5])] });
    const targets = legalActions(st).filter((a) => a.type === "useArtifact" && a.artifact === 5).map((a) => (a as { target: number }).target);
    expect(targets).toEqual([0]);
  });
});

describe("rulebook cards: the Scroll (attacking only; cannot be used twice in one area)", () => {
  // R-26 (MSW 2026-11-08): leave the classic combat as it is. Any party may read the Scroll there, and it is used up; the revised combat follows
  // the book (attacker only, kept, once per area). This test pins the classic behaviour so a change is noticed.
  it("classic combat: the Scroll is used up when read (ruled: leave, R-26)", () => {
    const st = makeState({ phase: "encounter", areas: [area], strangers: [2], party: [worn(0, [19])] });
    expect(reduce(st, { type: "useArtifact", artifact: 19 }).state.party[0]!.treasure).not.toContain(19);
  });
});

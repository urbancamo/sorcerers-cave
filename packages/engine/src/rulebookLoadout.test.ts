// @ts-ignore node types are not installed in this package; this test only ever runs under node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CREATURES } from "./data/creatures";
import { defaultLoadout } from "./loadout";

// Engine rules validation, revised combat (register R-27: Peter's reformulated rules are the oracle). The DEFAULT LOADOUT procedure of
// docs/rules/fighting-rules-reformulated-20261014.md is parsed from the markdown, so the preference lists tested are the book's own text.
const text: string = readFileSync("../../docs/rules/fighting-rules-reformulated-20261014.md", "utf8");
const proc = text.slice(text.indexOf("## PROCEDURE: DEFAULT LOADOUT"), text.indexOf("**END OF PROCEDURE: DEFAULT LOADOUT**"));
const NAME: Record<string, string> = { "Woman-Hero": "W-Hero" };
const id = (n: string) => ALL_CREATURES.find((c) => c.name === (NAME[n] ?? n))!.id;
const T = { sword: 3, axe: 17, staff: 9, shield: 20, ring: 10 };

interface Rank { creature: number; name: string; gear: number[] }
/** The numbered preference list after "**[Step n]** IF (the <artefact> is present)". */
function list(artefact: string): Rank[] {
  const at = proc.indexOf(`IF (the ${artefact} is present)`);
  const block = proc.slice(at, proc.indexOf("If two creatures are equally eligible", at));
  return [...block.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => {
    const line = m[1]!.trim();
    const name = line.replace(/ (not )?bearing.*$/, "").trim();
    const gear = /not bearing/.test(line) ? [] : /bearing either Magic Sword or Magic Axe/.test(line) ? [T.sword] : [];
    return { creature: id(name), name: line, gear };
  });
}
const alloc = (artifact: number, strangers: number[], gear: number[][] = strangers.map(() => [])) =>
  defaultLoadout({ strangers, gear, floor: [artifact], eyePresent: false, pick: () => 0 });

describe("rulebook: the default loadout (Fight Plan, Procedure: Default Loadout)", () => {
  it("parses the preference lists it is checking (guards the parser)", () => {
    expect(list("Magic Sword").map((r) => r.creature)).toEqual([0, 1, 5, 6, 19]);
    expect(list("Magic Axe")).toHaveLength(6);
    expect(list("Magic Staff")).toHaveLength(6);
    expect(list("Magic Shield")).toHaveLength(10);
  });

  for (const [artefact, tid] of [["Magic Sword", T.sword], ["Magic Axe", T.axe], ["Magic Staff", T.staff], ["Magic Shield", T.shield]] as const) {
    const ranks = list(artefact);
    for (let i = 0; i < ranks.length; i++) for (let j = i + 1; j < ranks.length; j++) {
      const a = ranks[i]!, b = ranks[j]!;
      if (a.creature === b.creature && JSON.stringify(a.gear) === JSON.stringify(b.gear)) continue;
      it(`${artefact}: "${a.name}" is preferred to "${b.name}"`, () => {
        // the less preferred is listed first, so that listing order cannot explain the result
        const out = alloc(tid, [b.creature, a.creature], [b.gear, a.gear]);
        expect(out).toEqual([{ artifact: tid, stranger: 1 }]);
      });
    }
  }

  it("The Ring goes to the highest adjusted strength: a Dwarf with the Axe (1+3) beats a Man (3)", () => {
    const out = alloc(T.ring, [id("Man"), id("Dwarf")], [[], [T.axe]]);
    expect(out).toEqual([{ artifact: T.ring, stranger: 1 }]);
  });
  it("equal adjusted strength: the Ring's tie list puts the Man before the Scholar", () => {
    expect(alloc(T.ring, [id("Scholar"), id("Man")])).toEqual([{ artifact: T.ring, stranger: 1 }]);
  });
  it("with the Eye of God present no artefact is allocated", () => {
    expect(defaultLoadout({ strangers: [id("Hero")], gear: [[]], floor: [T.sword], eyePresent: true, pick: () => 0 })).toEqual([]);
  });
  it("an artefact nobody can bear stays on the floor", () => {
    expect(alloc(T.sword, [id("Ogre"), id("Troll")])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { ALL_CREATURES } from "@sorcerers-cave/engine";
import { CHARACTERS, castFor, characterProblems, defaultCharacters, namesFor, parseCharacters, renderCharacters, startingParty } from "./storyCharacters";

const names = ALL_CREATURES.map((c) => c.name).filter((n) => n !== "Lost Ruby Statue");
const digest = "Starting party: Hero, Dwarf and Dwarf.\nOutcome: escaped.\nAt the exit: Hero; Dwarf; Dwarf; Ogre; Giant.\n";

describe("story characters", () => {
  it("has an entry for every creature the game lets a player pick, each with an explorer pool", () => {
    const pickable = ["Hero", "W-Hero", "Ogre", "Troll", "Priest", "Man", "Woman", "Dwarf", "Lion", "Scholar", "Witch", "Thief", "Wolf"];
    for (const n of pickable) expect(CHARACTERS[n]?.explorer?.length, n).toBeGreaterThan(0);
  });
  it("only names creatures that exist, with a general line and names", () => {
    expect(characterProblems(renderCharacters(), names)).toEqual([]);
  });
  it("round-trips through the editable text", () => {
    const { bundle, problems } = parseCharacters(renderCharacters());
    expect(problems).toEqual([]);
    expect(bundle.characters).toEqual(defaultCharacters().characters);
    expect(bundle.pairings).toEqual(defaultCharacters().pairings);
  });
  it("reports an unknown class, field and empty names", () => {
    expect(characterProblems("## header\nh\n## Gnome\ngeneral: x\nnames: a", names)).toEqual([expect.stringContaining("Gnome")]);
    expect(parseCharacters("## header\nh\n## Dwarf\nmood: sad").problems[0]).toContain("unknown field");
    expect(characterProblems("## header\nh\n## Dwarf\ngeneral: x", names)).toContain("Dwarf has no names.");
  });
  it("gives two Dwarfs two different names, the same ones every time for a game", () => {
    const a = namesFor("hs1", "Dwarf", CHARACTERS.Dwarf!.names, 2);
    expect(new Set(a).size).toBe(2);
    expect(namesFor("hs1", "Dwarf", CHARACTERS.Dwarf!.names, 2)).toEqual(a);
  });
  it("falls back to ordinals when a pool runs out", () => {
    expect(namesFor("k", "Dwarf", ["Brann"], 2)).toEqual(["Brann", "the second dwarf"]);
  });
  it("reads the starting party with multiples", () => {
    expect(startingParty(digest, names)).toEqual([["Hero", 1], ["Dwarf", 2]]);
  });
  it("casts the starting party by name, others briefly, and pairings that apply", () => {
    const cast = castFor(digest, "hs1");
    for (const n of namesFor("hs1", "Dwarf", CHARACTERS.Dwarf!.names, 2)) expect(cast).toContain(n);
    expect(cast).toContain("As an explorer, why they went down");
    expect(cast).toMatch(/An? ogre may be called/);
    expect(cast).toMatch(/Giant|A giant may be called/);
    expect(cast).toContain("Dwarf and Ogre");
    expect(castFor(digest, "hs1")).toBe(castFor(digest, "hs1"));
  });
  it("calls the woman hero the heroine and says nothing when no creature is named", () => {
    expect(castFor("Starting party: W-Hero.\n", "k")).toContain("the heroine");
    expect(castFor("Nothing here.", "k")).toBe("");
  });
  it("uses edited text when given", () => {
    const text = renderCharacters().replace(/Brann \| /, "Zed | ").replace(/names: Zed.*\n/, "names: Zed\n");
    expect(castFor("Starting party: Dwarf.\n", "k", text)).toContain("Zed, the dwarf");
  });
});

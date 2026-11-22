import { describe, it, expect } from "vitest";
import { ALL_CREATURES, ALL_TREASURES } from "@sorcerers-cave/engine";
import { BIBLE_HEADER, CREATURE_LORE, PLACE_LORE, TREASURE_LORE, bibleFor } from "./storyBible";
import { plannerUserMessage, writerUserMessage, pickVoice } from "./storyPrompt";

describe("bibleFor", () => {
  it("gives only the entries for what is in the digest, under the header", () => {
    const text = bibleFor("Starting party: Hero and Dwarf.\n1. A chamber with a Dragon holding Magic Staff.\n2. The party came to a pit of vipers.");
    expect(text).toContain(BIBLE_HEADER);
    expect(text).toContain("- Dragon:");
    expect(text).toContain("- Dwarf:");
    expect(text).toContain("- Hero:");
    expect(text).toContain("- Magic Staff:");
    expect(text).toContain("viper pit");
    expect(text).not.toContain("- Ogre:");
    expect(text).not.toContain("- Magic Sword:");
  });

  it("matches a plural and an article-led name, but not Hero inside W-Hero, nor the Gallery's statues as the Ruby's Statue", () => {
    const t = bibleFor("1. A chamber with 2 Dwarfs and a Woman.\n2. A W-Hero joined the party.\n3. The party came to a gallery of statues.");
    expect(t).toContain("- Dwarf:");
    expect(t).toContain("- W-Hero:");
    expect(t).not.toContain("- Hero:");
    expect(t).not.toContain("- Statue:");
    expect(bibleFor("1. The statue guarding the Ruby came alive and was wrestled.")).toContain("- Statue:");
  });

  it("has no stray backslashes (a line continuation must not survive into the prompt)", () => {
    expect(BIBLE_HEADER).not.toContain("\\");
    expect(bibleFor("a Dragon, a Dwarf, a pit of vipers")).not.toContain("\\");
  });

  it("is empty when nothing in the digest has an entry", () => {
    expect(bibleFor("Nothing of note.")).toBe("");
  });

  it("covers every creature and artefact the digest can name, so no run is left without lore", () => {
    const creatureNames = ALL_CREATURES.map((c) => c.name).filter((n) => n !== "Lost Ruby Statue");
    expect(creatureNames.filter((n) => !(n in CREATURE_LORE))).toEqual([]);
    const plain = new Set(["Silver", "Gold", "Gems", "Crypt/Gems"]);
    expect(ALL_TREASURES.map((t) => t.name).filter((n) => !plain.has(n) && !(n in TREASURE_LORE))).toEqual([]);
    expect(PLACE_LORE.length).toBeGreaterThan(10);
  });

  it("never states a statistic or a rule, and always tells the writer what to call an artefact", () => {
    for (const t of [...Object.values(CREATURE_LORE), ...Object.values(TREASURE_LORE), ...PLACE_LORE.map((p) => p.text)]) {
      expect(t).not.toMatch(/\bstrength\b|\bdice\b|\broll\b|\bhit points\b|\bscore\b|\blevel\b/i);
    }
    for (const [name, t] of Object.entries(TREASURE_LORE)) if (!["Treasure Chest", "Idol", "Lost Ruby"].includes(name)) expect(t).toMatch(/^Call it /);
  });
});

describe("the bible in the prompts", () => {
  const voice = pickVoice("k97abc");
  it("reaches the planner and the writer, after the record", () => {
    expect(plannerUserMessage("THE DIGEST", voice, "THE BIBLE")).toMatch(/THE DIGEST[\s\S]*THE BIBLE[\s\S]*Write the plan now/);
    expect(writerUserMessage("THE DIGEST", voice, "A PLAN", "THE BIBLE")).toMatch(/THE DIGEST[\s\S]*THE BIBLE[\s\S]*THE VOICE[\s\S]*A PLAN/);
    expect(writerUserMessage("THE DIGEST", voice, "A PLAN")).not.toContain("THE WORLD");
  });
});

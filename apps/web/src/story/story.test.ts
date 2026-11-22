import { describe, it, expect } from "vitest";
import { parseMarkdown, spans, plainText } from "./markdown";
import { postMaterial, fullStoryMarkdown, type PostMaterialFacts } from "./postMaterial";
import { buildStoryPdf, pdfFilename } from "./storyPdf";

const facts: PostMaterialFacts = { playerName: "Mark", gameCode: "WQXK", score: 366, date: "22 November 2026", survivors: 14, deepestLevel: 4, ruleSet: "Base game" };
const story = "# The Lamp-Keeper's Count\n\nAldric went in alone, because there was no one left to send.\n\nHe said the *old words* and went **down**.\nThe stair kept going.\n\nThey came out at dawn.";

describe("markdown", () => {
  it("reads title, paragraphs (joining wrapped lines), rules, headings and quotes", () => {
    const b = parseMarkdown(`${story}\n\n---\n\n## About\n\n> a quote`);
    expect(b.map((x) => x.type)).toEqual(["title", "paragraph", "paragraph", "paragraph", "rule", "heading", "quote"]);
    expect(plainText(b)).toContain("went down. The stair kept going."); // the two wrapped source lines are one paragraph
  });
  it("reads emphasis and strong runs, and leaves unbalanced markers alone", () => {
    expect(spans("a *b* **c** d")).toEqual([{ text: "a " }, { text: "b", em: true }, { text: " " }, { text: "c", strong: true }, { text: " d" }]);
    expect(spans("5 * 3 stays")).toEqual([{ text: "5 * 3 stays" }]);
  });
});

describe("post-material", () => {
  it("references the game: player, date, survivors, depth, score, rule set and the replay code", () => {
    const t = postMaterial(facts);
    for (const s of ["The Sorcerer's Cave", "Mark", "22 November 2026", "14 members", "level 4", "**366**", "Base game", "**WQXK**"]) expect(t).toContain(s);
  });
  it("omits the replay line without a code, says 'member' for one survivor, and strips formatting from the name", () => {
    const t = postMaterial({ ...facts, gameCode: null, survivors: 1, playerName: "*Evil* # name" });
    expect(t).not.toContain("game code");
    expect(t).toContain("1 member alive");
    expect(t).toContain("Evil  name");
  });
  it("is appended after the story, so editing it updates old stories without a rewrite", () => {
    const full = fullStoryMarkdown(story, facts);
    expect(full.indexOf("They came out at dawn.")).toBeLessThan(full.indexOf("About this story"));
    expect(story).not.toContain("About this story"); // the stored story never holds it
  });
});

describe("storyPdf", () => {
  it("builds a real PDF from the full markdown, paginated with a footer", async () => {
    const long = "# A Long Tale\n\n" + Array(40).fill("The party went on down the long stair, and the lantern burned low, and nobody said what they were thinking.").join(" ").repeat(6);
    const pdf = await buildStoryPdf(fullStoryMarkdown(long, facts));
    const bytes = new Uint8Array(pdf.output());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.pages).toBeGreaterThan(2);
    expect(pdf.filename).toBe("a-long-tale.pdf");
  });
  it("names the file from the title, with a fallback", () => {
    expect(pdfFilename("The Lamp-Keeper's Count")).toBe("the-lamp-keeper-s-count.pdf");
    expect(pdfFilename("")).toBe("short-story.pdf");
  });
});

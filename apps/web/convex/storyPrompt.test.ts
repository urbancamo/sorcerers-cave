import { describe, it, expect } from "vitest";
import { WRITER_SYSTEM, EDITOR_SYSTEM, WORD_RANGE, storyProblems, estimateCostUsd, writerUserMessage, DEFAULT_MODEL } from "./storyPrompt";

const para = (n: number) => Array(n).fill("The lantern burned low and they went on down the long stair together").join(" ") + ".";
const good = `# The Count\n\n${para(30)}\n\n${para(30)}\n\n${para(30)}\n\n${para(30)}`;

describe("story prompt", () => {
  it("defaults exist and are non-empty", () => {
    for (const s of [WRITER_SYSTEM, EDITOR_SYSTEM]) expect(s.length).toBeGreaterThan(200);
    expect(DEFAULT_MODEL).toMatch(/^claude-/);
  });
  it("asks the writer for one continuous narrative, joined between events, with no scene breaks", () => {
    expect(WRITER_SYSTEM).toMatch(/ONE CONTINUOUS NARRATIVE/);
    expect(WRITER_SYSTEM).toMatch(/Join the events/);
    expect(WRITER_SYSTEM).toMatch(/scene-break lines/);
    expect(writerUserMessage("x")).toMatch(/not a scene for each item/);
  });
  it("makes the editor check continuity and strip breaks", () => {
    expect(EDITOR_SYSTEM).toMatch(/continuous narrative/);
    expect(EDITOR_SYSTEM).toMatch(/connecting passage/);
  });
});

describe("storyProblems", () => {
  it("accepts a continuous story of the right length", () => {
    const words = good.split(/\s+/).length;
    expect(words).toBeGreaterThan(WORD_RANGE.min);
    expect(storyProblems(good)).toEqual([]);
  });
  it("rejects scene-break lines, headings, lists and a missing title", () => {
    expect(storyProblems(good.replace("\n\n" + para(30) + "\n\n" + para(30), "\n\n---\n\n" + para(30)), { min: 1, max: 9999 })).toContain("scene-break line");
    expect(storyProblems(`# T\n\n## Part two\n\n${para(3)}`, { min: 1, max: 9999 })).toContain("headings or lists in the body");
    expect(storyProblems(`# T\n\n- one\n- two`, { min: 1, max: 9999 })).toContain("headings or lists in the body");
    expect(storyProblems(para(5), { min: 1, max: 9999 })).toContain("missing title line");
  });
  it("rejects game-speak and out-of-range lengths", () => {
    expect(storyProblems(`# T\n\nHe rolled a six on level 4 and scored points.`, { min: 1, max: 9999 }).filter((p) => p.startsWith("game-speak")).length).toBeGreaterThanOrEqual(3);
    expect(storyProblems(`# T\n\nToo short.`)).toEqual([expect.stringMatching(/too short/)]);
    expect(storyProblems(`# T\n\n${para(2000)}`)).toEqual([expect.stringMatching(/too long/)]);
  });
});

describe("estimateCostUsd", () => {
  it("prices tokens per million, and falls back to the default model for an unknown one", () => {
    expect(estimateCostUsd("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBe(18);
    expect(estimateCostUsd("nonesuch", 1_000_000, 0)).toBe(3);
  });
});

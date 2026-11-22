import { describe, it, expect } from "vitest";
import { writeStory, parseEditorReply, splitStory, defaultPrompt, UNSUPPORTED_MARKER, type ModelCall } from "./storyWriter";

const para = Array(30).fill("The lantern burned low and they went on down the long stair together").join(" ") + ".";
export const STORY = `# The Count\n\n${[para, para, para, para].join("\n\n")}`; // about 1,560 words
const reply = (story: string, unsupported: string[] = []) => `${story}\n${UNSUPPORTED_MARKER}\n${unsupported.length ? unsupported.join("\n") : "none"}`;

/** A model that answers from a script, recording what it was asked. */
function script(answers: (string | Error)[]) {
  const seen: { system: string; user: string; model: string }[] = [];
  const call: ModelCall = async (a) => {
    seen.push({ system: a.system, user: a.user, model: a.model });
    const next = answers.shift();
    if (next === undefined) throw new Error("script exhausted");
    if (next instanceof Error) throw next;
    return { text: next, inputTokens: 1000, outputTokens: 2000 };
  };
  return { call, seen };
}
const prompt = defaultPrompt();

describe("writeStory", () => {
  it("writes then checks, and returns the checked story with title, word count and two priced runs", async () => {
    const { call, seen } = script(["a draft", reply(STORY)]);
    const r = await writeStory(call, prompt, "THE DIGEST");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.title).toBe("The Count");
    expect(r.words).toBeGreaterThan(1400);
    expect(r.runs.map((x) => [x.pass, x.status])).toEqual([["write", "ok"], ["check", "ok"]]);
    expect(r.runs[0]!.costUsd).toBeCloseTo((1000 * 3 + 2000 * 15) / 1e6, 8);
    expect(seen[0]!.system).toBe(prompt.writer);
    expect(seen[0]!.user).toContain("THE DIGEST");
    expect(seen[1]!.system).toBe(prompt.editor);
    expect(seen[1]!.user).toContain("a draft"); // the editor sees the draft and the record
    expect(seen[1]!.user).toContain("THE DIGEST");
  });

  it("gives unsupported facts one more check, and succeeds when that clears them", async () => {
    const { call, seen } = script(["draft", reply(STORY, ["a third dragon"]), reply(STORY)]);
    const r = await writeStory(call, prompt, "D");
    expect(r.ok).toBe(true);
    expect(r.runs).toHaveLength(3);
    expect(seen[2]!.user).toContain("a third dragon");
  });

  it("fails, and marks the run rejected, when unsupported facts remain after the retry", async () => {
    const { call } = script(["draft", reply(STORY, ["x"]), reply(STORY, ["a third dragon"])]);
    const r = await writeStory(call, prompt, "D");
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.reason).toMatch(/unsupported facts remain: a third dragon/);
    expect(r.runs[2]).toMatchObject({ status: "rejected" });
  });

  it("fails on an editor reply with no marker line, or with no title", async () => {
    expect(await writeStory(script(["draft", "Here is your story: ..."]).call, prompt, "D")).toMatchObject({ ok: false, reason: "editor reply was not in the expected format" });
    expect(await writeStory(script(["draft", `no title here\n${UNSUPPORTED_MARKER}\nnone`]).call, prompt, "D")).toMatchObject({ ok: false, reason: "editor reply was not in the expected format" });
  });

  it("fails the deterministic guard: a scene break, game-speak, or the wrong length", async () => {
    const withBreak = STORY.replace("\n\n" + para + "\n\n" + para, "\n\n---\n\n" + para);
    expect(await writeStory(script(["d", reply(withBreak)]).call, prompt, "D")).toMatchObject({ ok: false, reason: expect.stringMatching(/scene-break line/) });
    expect(await writeStory(script(["d", reply(STORY + "\n\nHe rolled a six.")]).call, prompt, "D")).toMatchObject({ ok: false, reason: expect.stringMatching(/game-speak/) });
    expect(await writeStory(script(["d", reply("# T\n\nToo short.")]).call, prompt, "D")).toMatchObject({ ok: false, reason: expect.stringMatching(/too short/) });
  });

  it("an admin-edited word range is honoured", async () => {
    const r = await writeStory(script(["d", reply("# T\n\nA short tale.")]).call, { ...prompt, minWords: 1, maxWords: 50 }, "D");
    expect(r.ok).toBe(true);
  });

  it("records an API error as an error run with no tokens, and stops", async () => {
    const r = await writeStory(script([new Error("API 529: overloaded")]).call, prompt, "D");
    expect(r).toMatchObject({ ok: false, reason: "write failed: API 529: overloaded" });
    expect(r.runs).toEqual([expect.objectContaining({ pass: "write", status: "error", inputTokens: 0, costUsd: 0 })]);
    const r2 = await writeStory(script(["draft", new Error("boom")]).call, prompt, "D");
    expect(r2).toMatchObject({ ok: false, reason: "check failed: boom" });
    expect(r2.runs).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("parseEditorReply reads the story, the marker, and the listed facts (bullets and 'none' tolerated)", () => {
    expect(parseEditorReply("")).toBeNull();
    expect(parseEditorReply("# T\n\nbody")).toBeNull(); // no marker: probably cut off
    expect(parseEditorReply(`# T\n\nA "quoted" line\nand another.\n${UNSUPPORTED_MARKER}\nnone`)).toEqual({ story: '# T\n\nA "quoted" line\nand another.', unsupported: [] });
    expect(parseEditorReply(`# T\n\nb\n${UNSUPPORTED_MARKER}\n- a third dragon\n2. a wrong count\n`)).toEqual({ story: "# T\n\nb", unsupported: ["a third dragon", "a wrong count"] });
  });
  it("splitStory reads the title and counts only the body", () => {
    expect(splitStory("# Hello there\n\none two three")).toEqual({ title: "Hello there", words: 3 });
  });
});

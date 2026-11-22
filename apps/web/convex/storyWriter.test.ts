import { describe, it, expect } from "vitest";
import { writeStory, parseEditorReply, splitStory, defaultPrompt, type ModelCall } from "./storyWriter";

const para = Array(30).fill("The lantern burned low and they went on down the long stair together").join(" ") + ".";
export const STORY = `# The Count\n\n${[para, para, para, para].join("\n\n")}`; // about 1,560 words
const reply = (story: string, unsupported: string[] = []) => JSON.stringify({ story, unsupported });

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

  it("fails on an editor reply that is not JSON", async () => {
    const { call } = script(["draft", "Here is your story: ..."]);
    const r = await writeStory(call, prompt, "D");
    expect(r).toMatchObject({ ok: false, reason: "editor reply was not valid JSON" });
  });

  it("tolerates a code fence around the JSON", async () => {
    const { call } = script(["draft", "```json\n" + reply(STORY) + "\n```"]);
    expect((await writeStory(call, prompt, "D")).ok).toBe(true);
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
  it("parseEditorReply rejects missing or empty stories and ignores non-string unsupported entries", () => {
    expect(parseEditorReply("{}")).toBeNull();
    expect(parseEditorReply(`{"story":"  "}`)).toBeNull();
    expect(parseEditorReply(`{"story":"s","unsupported":["a",1,"",null]}`)).toEqual({ story: "s", unsupported: ["a"] });
  });
  it("splitStory reads the title and counts only the body", () => {
    expect(splitStory("# Hello there\n\none two three")).toEqual({ title: "Hello there", words: 3 });
  });
});

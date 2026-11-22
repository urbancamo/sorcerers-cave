import { describe, it, expect } from "vitest";
import { EDITOR_SYSTEM, FACT_CHECK_SYSTEM, PLANNER_SYSTEM, STORY_VOICES, pickVoice } from "./storyPrompt";
import { writeStory, parseEditedStory, parseFactCheck, splitStory, defaultPrompt, UNSUPPORTED_MARKER, type ModelCall } from "./storyWriter";

const para = Array(30).fill("The lantern burned low and they went on down the long stair together").join(" ") + ".";
export const STORY = `# The Count\n\n${[para, para, para, para].join("\n\n")}`; // about 1,560 words

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
/** The five calls of a clean run: plan, write, fact-check (clean), line edit, fact-check (clean). */
const clean = (edited = STORY) => ["a plan", "a draft", "none", edited, "none"];

describe("writeStory", () => {
  it("plans, writes, fact-checks, edits, fact-checks again, and returns the story with five priced runs", async () => {
    const { call, seen } = script(clean());
    const r = await writeStory(call, prompt, "THE DIGEST");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.title).toBe("The Count");
    expect(r.words).toBeGreaterThan(1400);
    expect(r.runs.map((x) => [x.pass, x.status])).toEqual([["plan", "ok"], ["write", "ok"], ["check", "ok"], ["edit", "ok"], ["check", "ok"]]);
    expect(r.runs[0]!.costUsd).toBeCloseTo((1000 * 3 + 2000 * 15) / 1e6, 8);
    expect(seen.map((s) => s.system)).toEqual([PLANNER_SYSTEM, prompt.writer, FACT_CHECK_SYSTEM, prompt.editor, FACT_CHECK_SYSTEM]);
    expect(seen[1]!.user).toContain("a plan"); // the writer drafts from the plan
    expect(seen[2]!.user).toContain("a draft"); // the fact-checker reads the draft against the record
    expect(seen[2]!.user).toContain("THE DIGEST");
    expect(seen[3]!.user).toContain("a draft"); // the line editor edits the draft
    expect(seen[4]!.user).toContain("# The Count"); // and the FINAL text is checked, not the draft
  });

  it("hands the fact problems to the line editor, and succeeds when the edit clears them", async () => {
    const { call, seen } = script(["a plan", "a draft", "A third dragon is killed; the record has two", STORY, "none"]);
    const r = await writeStory(call, prompt, "D");
    expect(r.ok).toBe(true);
    expect(seen[3]!.user).toContain("FACT PROBLEMS");
    expect(seen[3]!.user).toContain("A third dragon is killed");
  });

  it("gives problems left after the first edit one more edit, then fails and marks the run rejected when they remain", async () => {
    const { call, seen } = script(["a plan", "d", "x problem", STORY, "a third dragon", STORY, "a third dragon still"]);
    const r = await writeStory(call, prompt, "D");
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.reason).toMatch(/unsupported facts remain: a third dragon still/);
    expect(r.runs.map((x) => x.pass)).toEqual(["plan", "write", "check", "edit", "check", "edit", "check"]);
    expect(r.runs.at(-1)).toMatchObject({ status: "rejected" });
    expect(seen[5]!.user).toContain("a third dragon"); // told what the first edit left
  });

  it("succeeds on the second edit when the first left a problem", async () => {
    const { call } = script(["a plan", "d", "x problem", STORY, "a third dragon", STORY, "none"]);
    expect((await writeStory(call, prompt, "D")).ok).toBe(true);
  });

  it("fails on a line-editor reply with no title, and on an empty fact-check reply", async () => {
    expect(await writeStory(script(["a plan", "draft", "none", "Here is your story: ..."]).call, prompt, "D")).toMatchObject({ ok: false, reason: "editor reply was not in the expected format" });
    expect(await writeStory(script(["a plan", "draft", "   "]).call, prompt, "D")).toMatchObject({ ok: false, reason: "fact-check reply was empty" });
  });

  it("fails the deterministic guard: a scene break, game-speak, or the wrong length", async () => {
    const withBreak = STORY.replace("\n\n" + para + "\n\n" + para, "\n\n---\n\n" + para);
    expect(await writeStory(script(clean(withBreak)).call, prompt, "D")).toMatchObject({ ok: false, reason: expect.stringMatching(/scene-break line/) });
    expect(await writeStory(script(clean(STORY + "\n\nHe rolled a six.")).call, prompt, "D")).toMatchObject({ ok: false, reason: expect.stringMatching(/game-speak/) });
    expect(await writeStory(script(clean("# T\n\nToo short.")).call, prompt, "D")).toMatchObject({ ok: false, reason: expect.stringMatching(/too short/) });
  });

  it("an admin-edited word range is honoured", async () => {
    const r = await writeStory(script(clean("# T\n\nA short tale.")).call, { ...prompt, minWords: 1, maxWords: 50 }, "D");
    expect(r.ok).toBe(true);
  });

  it("records an API error as an error run with no tokens, and stops", async () => {
    const r = await writeStory(script(["a plan", new Error("API 529: overloaded")]).call, prompt, "D");
    expect(r).toMatchObject({ ok: false, reason: "write failed: API 529: overloaded" });
    expect(r.runs.at(-1)).toMatchObject({ pass: "write", status: "error", inputTokens: 0, costUsd: 0 });
    const r2 = await writeStory(script(["a plan", "draft", new Error("boom")]).call, prompt, "D");
    expect(r2).toMatchObject({ ok: false, reason: "check failed: boom" });
    const r3 = await writeStory(script(["a plan", "draft", "none", new Error("boom")]).call, prompt, "D");
    expect(r3).toMatchObject({ ok: false, reason: "edit failed: boom" });
  });
});

describe("helpers", () => {
  it("parseFactCheck reads one problem per line (bullets tolerated), or 'none', and rejects an empty reply", () => {
    expect(parseFactCheck("")).toBeNull();
    expect(parseFactCheck("none")).toEqual([]);
    expect(parseFactCheck("None.")).toEqual([]);
    expect(parseFactCheck("- a third dragon\n2. a wrong count\n")).toEqual(["a third dragon", "a wrong count"]);
  });
  it("parseEditedStory needs a title, and tolerates an old-format reply by cutting at its marker", () => {
    expect(parseEditedStory("no title")).toBeNull();
    expect(parseEditedStory("# T\n\nbody")).toBe("# T\n\nbody");
    expect(parseEditedStory(`# T\n\nbody\n${UNSUPPORTED_MARKER}\nnone`)).toBe("# T\n\nbody");
  });
  it("splitStory reads the title and counts only the body", () => {
    expect(splitStory("# Hello there\n\none two three")).toEqual({ title: "Hello there", words: 3 });
  });
  it("the line editor is told it may cut but never invent, and the fact-checker never to rewrite", () => {
    expect(EDITOR_SYSTEM).toMatch(/NEVER INVENT/);
    expect(FACT_CHECK_SYSTEM).toMatch(/Do not rewrite/);
  });
});

describe("voice and plan", () => {
  it("picks the same voice for the same game every time, and spreads games across the voices", () => {
    expect(pickVoice("k97abc").id).toBe(pickVoice("k97abc").id);
    const used = new Set(Array.from({ length: 200 }, (_, i) => pickVoice(`game-${i}`).id));
    expect(used.size).toBe(STORY_VOICES.length);
  });

  it("tells the planner, the writer and the line editor the same voice, gives the writer the plan, and keeps the plan from the checkers", async () => {
    const voice = pickVoice("k97abc");
    const { call, seen } = script(["THE BEAT SHEET", "a draft", "none", STORY, "none"]);
    expect((await writeStory(call, prompt, "THE DIGEST", Date.now, "k97abc")).ok).toBe(true);
    for (const i of [0, 1, 3]) expect(seen[i]!.user).toContain(voice.instruction);
    expect(seen[1]!.user).toContain("THE BEAT SHEET");
    for (const i of [2, 3, 4]) expect(seen[i]!.user).not.toContain("THE BEAT SHEET"); // checked against the record, not the plan
  });

  it("still writes the story, without a plan, when the planning call fails", async () => {
    const { call, seen } = script([new Error("API 529: overloaded"), "a draft", "none", STORY, "none"]);
    const r = await writeStory(call, prompt, "D", Date.now, "k97abc");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.runs.map((x) => [x.pass, x.status])).toEqual([["plan", "error"], ["write", "ok"], ["check", "ok"], ["edit", "ok"], ["check", "ok"]]);
    expect(seen[1]!.user).not.toContain("THE PLAN");
  });
});

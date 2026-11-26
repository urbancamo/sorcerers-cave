import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const overview = {
  counts: { pending: 1, ready: 3, failed: 1 }, successRate: 60, avgWords: 1500,
  runs: { total: 10, ok: 8, failed: 2, costUsd: 0.9, inputTokens: 1, outputTokens: 1, avgDurationMs: 42000, avgCostPerStoryUsd: 0.18, byPass: { plan: 0.1, write: 0.3, edit: 0.2, check: 0.1 } },
  spend: { todayUsd: 0.45, monthUsd: 0.9 },
  perDay: [{ day: "2026-11-21", calls: 2, ok: 2, cents: 18 }, { day: "2026-11-22", calls: 4, ok: 3, cents: 45 }],
  byVersion: [{ version: 0, count: 2, costUsd: 0.3 }, { version: 1, count: 1, costUsd: 0.2 }],
  failureReasons: [{ reason: "Unsupported facts", count: 1 }],
  settings: { paused: false, dailyCapUsd: 2, monthlyCapUsd: null }, activeVersion: 1, windowDays: 30,
};
const defaults = {
  writer: "DEFAULT WRITER", editor: "DEFAULT EDITOR", model: "claude-sonnet-5-5", minWords: 1400, maxWords: 1900,
  planner: "DEFAULT PLANNER", factCheck: "DEFAULT FACT CHECK", voices: "solo: A voice.", bible: "## header\nDEFAULT BIBLE", characters: "## header\nDEFAULT CHARACTERS",
};
const v1 = { ...defaults, writer: "V1 WRITER", version: 1, note: "first", createdAt: 1 };
const preview = { label: "Stories written with an older prompt than version 1", count: 2, truncated: false, perStoryUsd: 0.18, estimatedUsd: 0.36, remainingTodayUsd: 1.55, exceedsDailyCap: false, paused: false };
let jobs: unknown[];
const READY = { _id: "st1", highScoreId: "hs1", status: "ready", title: "The Last One", words: 1491, promptVersion: 0, attempts: 1, error: null, rejectedAt: null, updatedAt: 1 };
let recent: { runs: unknown[]; stories: unknown[] } = { runs: [], stories: [READY] };

const update = vi.fn(), save = vi.fn(), start = vi.fn(), stop = vi.fn(), tryIt = vi.fn(), jobStoriesQuery = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (ref: string, args: unknown) => {
    if (args === "skip") return undefined;
    return ({
      "s.overview": overview,
      "s.prompts": { activeVersion: 1, defaults, models: ["claude-sonnet-5-5", "claude-opus-5-5"], versions: [v1] },
      "s.recent": recent,
      "s.preview": preview, "s.jobs": jobs, "s.text": null,
    } as Record<string, unknown>)[ref];
  },
  useMutation: (ref: string) => ({ "s.update": update, "s.save": save, "s.start": start, "s.stop": stop } as Record<string, unknown>)[ref],
  useAction: () => tryIt,
  useConvex: () => ({ query: jobStoriesQuery }),
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: { storyAdmin: { overview: "s.overview", prompts: "s.prompts", recent: "s.recent", rewritePreview: "s.preview", jobs: "s.jobs", storyText: "s.text", updateSettings: "s.update", savePrompt: "s.save", startRewrite: "s.start", stopJob: "s.stop", jobStories: "s.jobStories", tryPrompt: "s.try" } },
}));

import { StoriesTab } from "./StoriesTab";

beforeEach(() => { [update, save, start, stop, tryIt, jobStoriesQuery].forEach((f) => f.mockReset()); jobs = []; recent = { runs: [], stories: [READY] }; });
const open = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("Stories overview", () => {
  it("shows counts, spend against the cap and the success rate", () => {
    render(<StoriesTab canEdit />);
    expect(screen.getByText("Spend today").parentElement).toHaveTextContent("$0.45");
    expect(screen.getByText("Spend today").parentElement).toHaveTextContent("of $2.00 cap");
    expect(screen.getByText("Success rate").parentElement).toHaveTextContent("60%");
    expect(screen.getAllByText("Stories")[0]!.parentElement).toHaveTextContent("3 ready, 1 pending, 1 failed");
  });

  it("pauses generation and saves caps (an empty box clears a cap)", async () => {
    update.mockResolvedValue({});
    render(<StoriesTab canEdit />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ paused: true }));
    fireEvent.change(screen.getByLabelText("Daily cap (US $)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Monthly cap (US $)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save caps" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ dailyCapUsd: 0, monthlyCapUsd: 20 }));
  });

  it("a viewer without SYSTEM sees the controls disabled", () => {
    render(<StoriesTab canEdit={false} />);
    expect(screen.getByLabelText("Daily cap (US $)")).toBeDisabled();
    expect(screen.getByText(/Changing these needs the System role/)).toBeInTheDocument();
  });
});

describe("Prompt editor", () => {
  it("loads the active version, notes what changed, and saves a new version", async () => {
    save.mockResolvedValue(2);
    render(<StoriesTab canEdit />);
    open("Prompt");
    const writer = screen.getByRole("textbox", { name: /Writer prompt/ });
    expect(writer).toHaveValue("V1 WRITER");
    expect(screen.getByRole("button", { name: "Save as a new version" })).toBeDisabled();
    fireEvent.change(writer, { target: { value: "V2 WRITER" } });
    expect(screen.getByText(/Changed from version 1: writer prompt/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Note for this version/), { target: { value: "shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as a new version" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...defaults, disabled: [], writer: "V2 WRITER", note: "shorter" }));
    expect(await screen.findByText(/Saved as version 2/)).toBeInTheDocument();
  });

  it("edits the planner, fact-check, voices and bible too, and saves them with the version", async () => {
    save.mockResolvedValue(2);
    render(<StoriesTab canEdit />);
    open("Prompt");
    expect(screen.getByRole("textbox", { name: /Planner prompt/ })).toHaveValue("DEFAULT PLANNER");
    expect(screen.getByRole("textbox", { name: /Fact-check prompt/ })).toHaveValue("DEFAULT FACT CHECK");
    expect(screen.getByRole("textbox", { name: "Voices" })).toHaveValue("solo: A voice.");
    expect(screen.getByRole("textbox", { name: /Story bible/ })).toHaveValue("## header\nDEFAULT BIBLE");
    fireEvent.change(screen.getByRole("textbox", { name: /Planner prompt/ }), { target: { value: "NEW PLANNER" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Story bible/ }), { target: { value: "## header\nNEW BIBLE" } });
    expect(screen.getByRole("textbox", { name: /Story characters/ })).toHaveValue("## header\nDEFAULT CHARACTERS");
    fireEvent.change(screen.getByRole("textbox", { name: /Story characters/ }), { target: { value: "## header\nNEW CHARACTERS" } });
    expect(screen.getByText(/Changed from version 1: planner prompt, story bible, story characters/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as a new version" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...defaults, disabled: [], writer: "V1 WRITER", planner: "NEW PLANNER", bible: "## header\nNEW BIBLE", characters: "## header\nNEW CHARACTERS", note: undefined }));
  });

  it("shows the new fields read-only without the Stories role", () => {
    render(<StoriesTab canEdit={false} />);
    open("Prompt");
    expect(screen.getByRole("textbox", { name: /Story bible/ })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: /Story characters/ })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: /Planner prompt/ })).toHaveAttribute("readonly");
  });

  it("switches a prompt part off and on, explains what that does, and saves which parts are off", async () => {
    save.mockResolvedValue(2);
    render(<StoriesTab canEdit />);
    open("Prompt");
    expect(screen.queryByRole("switch", { name: /Writer prompt/ })).toBeNull(); // the writer is always on
    const factCheck = screen.getByRole("switch", { name: "3. Fact-check prompt: on" });
    expect(factCheck).toHaveAttribute("aria-checked", "true");
    fireEvent.click(factCheck);
    fireEvent.click(screen.getByRole("switch", { name: "Voices: on" }));
    expect(screen.getByRole("switch", { name: "3. Fact-check prompt: off" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/no story is ever rejected for its facts/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Fact-check prompt/ })).toHaveValue("DEFAULT FACT CHECK"); // the text is kept
    expect(screen.getByText(/Changed from version 1: which parts are on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save as a new version" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ disabled: ["factCheck", "voices"] })));
  });

  it("a part switched back on is no longer a change, and the switches cannot be used without the Stories role", () => {
    const { unmount } = render(<StoriesTab canEdit />);
    open("Prompt");
    fireEvent.click(screen.getByRole("switch", { name: "1. Planner prompt: on" }));
    fireEvent.click(screen.getByRole("switch", { name: "1. Planner prompt: off" }));
    expect(screen.getByText(/No changes from version 1/)).toBeInTheDocument();
    unmount();
    render(<StoriesTab canEdit={false} />);
    open("Prompt");
    expect(screen.getByRole("switch", { name: "1. Planner prompt: on" })).toBeDisabled();
  });

  it("can load the source defaults into the editor", () => {
    render(<StoriesTab canEdit />);
    open("Prompt");
    fireEvent.change(screen.getByLabelText("Load a version"), { target: { value: "defaults" } });
    expect(screen.getByRole("textbox", { name: /Writer prompt/ })).toHaveValue("DEFAULT WRITER");
  });

  it("a failed trial offers its rejected text as a download", async () => {
    tryIt.mockResolvedValue({ ok: false, reason: "unsupported facts remain: no dragon", costUsd: 0.1, text: "# Trial\n\nA dragon." });
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    render(<StoriesTab canEdit />);
    open("Prompt");
    fireEvent.change(screen.getByLabelText("Game to write from"), { target: { value: "hs1" } });
    fireEvent.click(screen.getByRole("button", { name: "Write a trial story" }));
    fireEvent.click(await screen.findByRole("button", { name: "Download rejected text" }));
    expect(await created[0]!.text()).toContain("# Trial\n\nA dragon.");
  });

  it("tries the unsaved prompt on a chosen story and shows the result without saving", async () => {
    tryIt.mockResolvedValue({ ok: true, title: "Trial Tale", text: "# Trial Tale\n\nOnce there was a cave.", words: 1500, costUsd: 0.1 });
    render(<StoriesTab canEdit />);
    open("Prompt");
    fireEvent.change(screen.getByRole("textbox", { name: /Writer prompt/ }), { target: { value: "TRY THIS" } });
    fireEvent.change(screen.getByLabelText("Game to write from"), { target: { value: "hs1" } });
    fireEvent.click(screen.getByRole("button", { name: "Write a trial story" }));
    expect(await screen.findByText("Once there was a cave.")).toBeInTheDocument();
    expect(tryIt).toHaveBeenCalledWith(expect.objectContaining({ highScoreId: "hs1", writer: "TRY THIS" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("is read-only without SYSTEM", () => {
    render(<StoriesTab canEdit={false} />);
    open("Prompt");
    expect(screen.getByRole("textbox", { name: /Writer prompt/ })).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save as a new version" })).toBeNull();
  });
});

describe("Rewrites", () => {
  it("shows the count and cost, and starts only after the word is typed", async () => {
    start.mockResolvedValue("job1");
    render(<StoriesTab canEdit />);
    open("Rewrites");
    expect(screen.getByRole("status")).toHaveTextContent("2 stories");
    expect(screen.getByRole("status")).toHaveTextContent("$0.36");
    const go = screen.getByRole("button", { name: "Start rewrite" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type REWRITE/), { target: { value: "rewrite" } });
    expect(go).toBeDisabled(); // case matters
    fireEvent.change(screen.getByLabelText(/Type REWRITE/), { target: { value: "REWRITE" } });
    fireEvent.click(go);
    await waitFor(() => expect(start).toHaveBeenCalledWith({ scope: { kind: "older" }, expected: 2 }));
  });

  it("shows jobs with progress and can stop a running one; no start while one runs", () => {
    jobs = [{ _id: "j1", scope: "Every story", total: 5, done: 2, failed: 1, status: "running", reason: null, createdAt: Date.now(), updatedAt: Date.now() }];
    render(<StoriesTab canEdit />);
    open("Rewrites");
    const row = within(screen.getByRole("table")).getByText("Every story").closest("tr")!;
    expect(within(row).getByText("running")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledWith({ jobId: "j1" });
    fireEvent.change(screen.getByLabelText(/Type REWRITE/), { target: { value: "REWRITE" } });
    expect(screen.getByRole("button", { name: "Start rewrite" })).toBeDisabled();
  });

  it("offers PDF and Markdown downloads only on a finished rewrite that wrote stories", async () => {
    const now = Date.now();
    jobs = [
      { _id: "j1", scope: "Every story", total: 5, done: 5, failed: 0, status: "done", reason: null, createdAt: now, updatedAt: now },
      { _id: "j2", scope: "Failed stories", total: 3, done: 0, failed: 3, status: "done", reason: null, createdAt: now, updatedAt: now },
      { _id: "j3", scope: "One game", total: 1, done: 0, failed: 0, status: "running", reason: null, createdAt: now, updatedAt: now },
    ];
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    jobStoriesQuery.mockResolvedValue([{ title: "A", text: "# A\n\nOne.", updatedAt: 1 }, { title: "B", text: "# B\n\nTwo.", updatedAt: 2 }]);
    render(<StoriesTab canEdit />);
    open("Rewrites");
    const rowOf = (scope: string) => within(screen.getByRole("table")).getByText(scope).closest("tr")!;
    expect(within(rowOf("Failed stories")).queryByRole("button", { name: "PDF" })).toBeNull();
    expect(within(rowOf("One game")).queryByRole("button", { name: "Markdown" })).toBeNull();
    expect(within(rowOf("Every story")).getByRole("button", { name: "PDF" })).toBeInTheDocument();
    fireEvent.click(within(rowOf("Every story")).getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(jobStoriesQuery).toHaveBeenCalledWith("s.jobStories", { jobId: "j1" });
    expect(await created[0]!.text()).toBe("# A\n\nOne.\n\n---\n\n# B\n\nTwo.\n");
  });

  it("keeps Start rewrite disabled for a single game until the word is typed", () => {
    render(<StoriesTab canEdit />);
    open("Rewrites");
    fireEvent.click(screen.getByLabelText(/One game/));
    fireEvent.change(screen.getByLabelText(/Game code/), { target: { value: "UPTR" } });
    expect(screen.getByRole("button", { name: "Start rewrite" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type REWRITE/), { target: { value: "REWRITE" } });
    expect(screen.getByRole("button", { name: "Start rewrite" })).toBeEnabled();
  });

  it("offers no rewrite form without SYSTEM", () => {
    render(<StoriesTab canEdit={false} />);
    open("Rewrites");
    expect(screen.queryByRole("button", { name: "Start rewrite" })).toBeNull();
  });
});

describe("Runs", () => {
  const WHY = "unsupported facts remain: " + Array.from({ length: 8 }, (_, i) => `problem ${i}: the party never met that creature`).join("; ");

  it("shows a failure's whole reason, for a story and for a model call", () => {
    recent = {
      stories: [{ ...READY, _id: "st2", status: "failed", title: null, words: null, error: WHY, rejectedAt: 5 }],
      runs: [{ _id: "r1", createdAt: 1, pass: "check", trigger: "save", promptVersion: 1, model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0.01, durationMs: 100, status: "rejected", reason: WHY }],
    };
    render(<StoriesTab canEdit />);
    open("Runs");
    expect(screen.getAllByText((t) => t.includes("problem 7: the party never met that creature"))).toHaveLength(2);
  });

  it("downloads the last rejected text as a Markdown file with its reason, and offers it only where one is kept", async () => {
    recent = { runs: [], stories: [READY, { ...READY, _id: "st2", status: "failed", title: null, error: WHY, rejectedAt: Date.UTC(2026, 10, 26, 9, 30) }] };
    jobStoriesQuery.mockResolvedValue({ rejectedText: "# Rejected\n\nA dragon was slain.", rejectedReason: WHY, rejectedAt: Date.UTC(2026, 10, 26, 9, 30) });
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    render(<StoriesTab canEdit={false} />); // viewing is enough: it is the operator's own record
    open("Runs");
    const buttons = screen.getAllByRole("button", { name: "Rejected text" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(created).toHaveLength(1));
    expect(jobStoriesQuery).toHaveBeenCalledWith("s.text", { storyId: "st2" });
    const md = await created[0]!.text();
    expect(md).toContain("problem 7: the party never met that creature");
    expect(md).toContain("# Rejected\n\nA dragon was slain.");
  });

  it("says so when the story no longer has rejected text", async () => {
    recent = { runs: [], stories: [{ ...READY, rejectedAt: 5 }] };
    jobStoriesQuery.mockResolvedValue({ rejectedText: null, rejectedReason: null, rejectedAt: null });
    render(<StoriesTab canEdit />);
    open("Runs");
    fireEvent.click(screen.getByRole("button", { name: "Rejected text" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no rejected text");
  });
});

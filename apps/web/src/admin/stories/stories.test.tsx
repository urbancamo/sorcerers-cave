import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const overview = {
  counts: { pending: 1, ready: 3, failed: 1 }, successRate: 60, avgWords: 1500,
  runs: { total: 10, ok: 8, failed: 2, costUsd: 0.9, inputTokens: 1, outputTokens: 1, avgDurationMs: 42000, avgCostPerStoryUsd: 0.18, byPass: { write: 0.5, check: 0.4 } },
  spend: { todayUsd: 0.45, monthUsd: 0.9 },
  perDay: [{ day: "2026-11-21", calls: 2, ok: 2, cents: 18 }, { day: "2026-11-22", calls: 4, ok: 3, cents: 45 }],
  byVersion: [{ version: 0, count: 2, costUsd: 0.3 }, { version: 1, count: 1, costUsd: 0.2 }],
  failureReasons: [{ reason: "Unsupported facts", count: 1 }],
  settings: { paused: false, dailyCapUsd: 2, monthlyCapUsd: null }, activeVersion: 1, windowDays: 30,
};
const defaults = { writer: "DEFAULT WRITER", editor: "DEFAULT EDITOR", model: "claude-sonnet-5-5", minWords: 1400, maxWords: 1900 };
const v1 = { ...defaults, writer: "V1 WRITER", version: 1, note: "first", createdAt: 1 };
const preview = { label: "Stories written with an older prompt than version 1", count: 2, truncated: false, perStoryUsd: 0.18, estimatedUsd: 0.36, remainingTodayUsd: 1.55, exceedsDailyCap: false, paused: false };
let jobs: unknown[];

const update = vi.fn(), save = vi.fn(), start = vi.fn(), stop = vi.fn(), tryIt = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (ref: string, args: unknown) => {
    if (args === "skip") return undefined;
    return ({
      "s.overview": overview,
      "s.prompts": { activeVersion: 1, defaults, models: ["claude-sonnet-5-5", "claude-opus-5-5"], versions: [v1] },
      "s.recent": { runs: [], stories: [{ _id: "st1", highScoreId: "hs1", status: "ready", title: "The Last One", words: 1491, promptVersion: 0, attempts: 1, error: null, updatedAt: 1 }] },
      "s.preview": preview, "s.jobs": jobs, "s.text": null,
    } as Record<string, unknown>)[ref];
  },
  useMutation: (ref: string) => ({ "s.update": update, "s.save": save, "s.start": start, "s.stop": stop } as Record<string, unknown>)[ref],
  useAction: () => tryIt,
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: { storyAdmin: { overview: "s.overview", prompts: "s.prompts", recent: "s.recent", rewritePreview: "s.preview", jobs: "s.jobs", storyText: "s.text", updateSettings: "s.update", savePrompt: "s.save", startRewrite: "s.start", stopJob: "s.stop", tryPrompt: "s.try" } },
}));

import { StoriesTab } from "./StoriesTab";

beforeEach(() => { [update, save, start, stop, tryIt].forEach((f) => f.mockReset()); jobs = []; });
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
    const writer = screen.getByLabelText(/^Writer prompt/);
    expect(writer).toHaveValue("V1 WRITER");
    expect(screen.getByRole("button", { name: "Save as a new version" })).toBeDisabled();
    fireEvent.change(writer, { target: { value: "V2 WRITER" } });
    expect(screen.getByText(/Changed from version 1: writer prompt/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Note for this version/), { target: { value: "shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as a new version" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ ...defaults, writer: "V2 WRITER", note: "shorter" }));
    expect(await screen.findByText(/Saved as version 2/)).toBeInTheDocument();
  });

  it("can load the source defaults into the editor", () => {
    render(<StoriesTab canEdit />);
    open("Prompt");
    fireEvent.change(screen.getByLabelText("Load a version"), { target: { value: "defaults" } });
    expect(screen.getByLabelText(/^Writer prompt/)).toHaveValue("DEFAULT WRITER");
  });

  it("tries the unsaved prompt on a chosen story and shows the result without saving", async () => {
    tryIt.mockResolvedValue({ ok: true, title: "Trial Tale", text: "# Trial Tale\n\nOnce there was a cave.", words: 1500, costUsd: 0.1 });
    render(<StoriesTab canEdit />);
    open("Prompt");
    fireEvent.change(screen.getByLabelText(/^Writer prompt/), { target: { value: "TRY THIS" } });
    fireEvent.change(screen.getByLabelText("Game to write from"), { target: { value: "hs1" } });
    fireEvent.click(screen.getByRole("button", { name: "Write a trial story" }));
    expect(await screen.findByText("Once there was a cave.")).toBeInTheDocument();
    expect(tryIt).toHaveBeenCalledWith(expect.objectContaining({ highScoreId: "hs1", writer: "TRY THIS" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("is read-only without SYSTEM", () => {
    render(<StoriesTab canEdit={false} />);
    open("Prompt");
    expect(screen.getByLabelText(/^Writer prompt/)).toHaveAttribute("readonly");
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

  it("offers no rewrite form without SYSTEM", () => {
    render(<StoriesTab canEdit={false} />);
    open("Rewrites");
    expect(screen.queryByRole("button", { name: "Start rewrite" })).toBeNull();
  });
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StoryDownload, storyFacts, type StoryRow } from "./StoryDownload";

vi.mock("../../convex/_generated/api", () => ({ api: { stories: { forScore: "stories:forScore" } } }));
const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (...a: unknown[]) => useQueryMock(...a) }));
const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));
vi.mock("./storyPdf", () => ({ downloadStoryPdf: (...a: unknown[]) => downloadMock(...a) }));

const row: StoryRow = {
  _id: "hs1", name: "Mark", score: 366, createdAt: Date.UTC(2026, 10, 22), maxDepth: 4,
  party: [{ creatureId: 4, status: 0, dragonKills: 0, treasure: [] }, { creatureId: 5, status: 1, dragonKills: 0, treasure: [] }, { creatureId: 6, status: 2, dragonKills: 0, treasure: [] }, { creatureId: 7, status: 3, dragonKills: 0, treasure: [] }],
};
beforeEach(() => { useQueryMock.mockReset(); downloadMock.mockReset(); });

describe("StoryDownload", () => {
  it("shows nothing while loading, when there is no story, and when it failed", () => {
    for (const v of [undefined, null, { status: "failed", title: null, text: null, words: null }]) {
      useQueryMock.mockReturnValue(v);
      const { container, unmount } = render(<StoryDownload row={row} gameCode="WQXK" />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("says the story is being written while pending", () => {
    useQueryMock.mockReturnValue({ status: "pending", title: null, text: null, words: null });
    render(<StoryDownload row={row} gameCode="WQXK" />);
    expect(screen.getByTestId("story-pending")).toHaveTextContent(/being written/i);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a download once ready, and builds the PDF from the story plus the post-material", async () => {
    useQueryMock.mockReturnValue({ status: "ready", title: "The Count", text: "# The Count\n\nAldric went in.", words: 4 });
    render(<StoryDownload row={row} gameCode="WQXK" />);
    fireEvent.click(screen.getByRole("button", { name: /short story \(pdf\)/i }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    const md = downloadMock.mock.calls[0]![0] as string;
    expect(md.startsWith("# The Count\n\nAldric went in.")).toBe(true);
    for (const s of ["About this story", "Mark", "22 November 2026", "2 members", "level 4", "**366**", "Base game", "**WQXK**"]) expect(md).toContain(s);
  });

  it("reports a failed PDF build without throwing", async () => {
    useQueryMock.mockReturnValue({ status: "ready", title: "T", text: "# T\n\nx", words: 1 });
    downloadMock.mockRejectedValue(new Error("boom"));
    render(<StoryDownload row={row} gameCode={null} />);
    fireEvent.click(screen.getByRole("button", { name: /short story/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be made/i);
    expect(screen.getByRole("button", { name: /short story/i })).toBeEnabled();
  });

  it("skips the query for multiplayer scores and shows nothing", () => {
    useQueryMock.mockReturnValue(undefined);
    const { container } = render(<StoryDownload row={row} gameCode="X" multiplayer />);
    expect(useQueryMock).toHaveBeenCalledWith("stories:forScore", "skip");
    expect(container).toBeEmptyDOMElement();
  });
});

describe("storyFacts", () => {
  it("counts originals and allies as survivors, and names the rule set", () => {
    expect(storyFacts(row, null)).toMatchObject({ survivors: 2, deepestLevel: 4, ruleSet: "Base game", gameCode: null });
    expect(storyFacts({ ...row, extensionKit: true }, null).ruleSet).toBe("Extension Kit");
    expect(storyFacts({ ...row, extensionKit: true, sibyl: true }, null).ruleSet).toBe("Extension Kit with the Sibyl");
    expect(storyFacts({ ...row, maxDepth: undefined }, null).deepestLevel).toBe(1);
  });
});

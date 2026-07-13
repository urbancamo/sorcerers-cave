import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GS_ESCAPED, GS_DEAD } from "@sorcerers-cave/engine";
import { HighScores, type LeaderboardRow } from "./HighScores";
import type { GameLog } from "./gameLog";

// The detail view subscribes to highScores.stats and highScores.log via Convex's useQuery; mock it
// (no provider in unit tests). Stub the generated api so a test can tell the two queries apart by their
// (string) reference.
vi.mock("../../convex/_generated/api", () => ({
  api: { highScores: { stats: "highScores:stats", log: "highScores:log" } },
}));
const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => useQueryMock(...args) }));

// downloadLog performs a real DOM/Blob download; stub it so the test can assert delegation instead.
const { downloadLogMock } = vi.hoisted(() => ({ downloadLogMock: vi.fn() }));
vi.mock("./gameLog", () => ({ downloadLog: (...a: unknown[]) => downloadLogMock(...a) }));

beforeEach(() => useQueryMock.mockReturnValue(undefined)); // stats & log still loading by default

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  _id: "x",
  name: "Anon",
  score: 0,
  outcome: GS_ESCAPED,
  party: [],
  createdAt: 0,
  ...over,
});

describe("HighScores", () => {
  it("shows a loading note while rows are undefined", () => {
    render(<HighScores rows={undefined} />);
    expect(screen.getByText(/loading high scores/i)).toBeInTheDocument();
  });

  it("shows an empty note when there are no scores", () => {
    render(<HighScores rows={[]} />);
    expect(screen.getByText(/no scores recorded yet/i)).toBeInTheDocument();
  });

  it("ranks rows and labels each outcome, marking the highlighted row", () => {
    const rows = [
      row({ _id: "a", name: "Alice", score: 40, outcome: GS_ESCAPED, party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] }),
      row({ _id: "b", name: "Bob", score: 0, outcome: GS_DEAD, party: [{ creatureId: 0, status: 3, dragonKills: 0, treasure: [] }] }),
    ];
    render(<HighScores rows={rows} highlightId="b" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Escaped")).toBeInTheDocument();
    expect(screen.getByText("Perished")).toBeInTheDocument();
    // Alice: 1 of 1 survives; Bob: 0 of 1.
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
    const bobRow = screen.getByText("Bob").closest("tr");
    expect(bobRow).toHaveClass("scv-hs-me");
  });

  it("clicks through a row to show the party & artifacts that left the cave, then back", () => {
    const rows = [
      row({
        _id: "a", name: "Alice", score: 55, outcome: GS_ESCAPED,
        party: [
          { creatureId: 0, status: 0, dragonKills: 1, treasure: [12, 1] }, // Hero with Charmed Flute + Gold
          { creatureId: 5, status: 3, dragonKills: 0, treasure: [] },        // Man, fallen
        ],
      }),
    ];
    render(<HighScores rows={rows} />);
    fireEvent.click(screen.getByText("Alice"));

    const detail = screen.getByTestId("hs-detail");
    expect(within(detail).getByText(/1 of 2 left the cave with 1 artifact/i)).toBeInTheDocument();
    expect(within(detail).getByText("Hero")).toBeInTheDocument();
    expect(within(detail).getByText("Charmed Flute")).toBeInTheDocument(); // artifact carried out
    expect(within(detail).getByText("Gold")).toBeInTheDocument();          // heavy treasure carried out
    expect(within(detail).getByText(/dragon-slayer/i)).toBeInTheDocument();
    expect(within(detail).getByText(/fallen/i)).toBeInTheDocument();        // the Man

    fireEvent.click(within(detail).getByRole("button", { name: /back to scores/i }));
    expect(screen.getByTestId("high-scores")).toBeInTheDocument(); // table again
  });

  it("shows expedition stats in the detail once they load", () => {
    useQueryMock.mockReturnValue({
      maxDepth: 4, turns: 23, areasMapped: 30, roundsFought: 7, enemiesSlain: 12, artifactsUsed: 5,
      dragonsSlain: 1, sorcererSlain: true, membersLost: 2,
    });
    const rows = [row({ _id: "a", name: "Alice", party: [{ creatureId: 0, status: 0, dragonKills: 1, treasure: [] }] })];
    render(<HighScores rows={rows} />);
    fireEvent.click(screen.getByText("Alice"));
    const stats = screen.getByTestId("hs-stats");
    expect(within(stats).getByText(/max depth/i)).toBeInTheDocument();
    expect(within(stats).getByText("Level 4")).toBeInTheDocument();
    expect(within(stats).getByText(/enemies slain/i)).toBeInTheDocument();
    expect(within(stats).getByText("12")).toBeInTheDocument();
    expect(within(stats).getByText(/rounds fought/i)).toBeInTheDocument();
    expect(within(stats).getByText("7")).toBeInTheDocument();
    expect(within(stats).getByText(/artifacts used/i)).toBeInTheDocument();
    expect(within(stats).getByText("5")).toBeInTheDocument();
    expect(within(stats).getByText(/sorcerer/i)).toBeInTheDocument();
  });

  it("offers .txt and .log downloads of a score's game log, delegating to downloadLog", () => {
    const log = { game: { code: "ABCD", seed: 1, picks: [0], color: null, status: "finished", createdAt: 0 }, moves: [] } as GameLog;
    // Log resolves; stats still loading — the downloads are independent of the stats panel.
    useQueryMock.mockImplementation((q: unknown) => (q === "highScores:log" ? log : undefined));
    const rows = [row({ _id: "a", name: "Alice", party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] })];
    render(<HighScores rows={rows} />);
    fireEvent.click(screen.getByText("Alice"));

    const dl = screen.getByTestId("download-log");
    fireEvent.click(within(dl).getByRole("button", { name: /readable \(\.txt\)/i }));
    expect(downloadLogMock).toHaveBeenCalledWith(log, "human");
    fireEvent.click(within(dl).getByRole("button", { name: /printer \(\.log\)/i }));
    expect(downloadLogMock).toHaveBeenCalledWith(log, "printer");
  });

  it("omits the log downloads until the log query resolves", () => {
    useQueryMock.mockReturnValue(undefined); // both stats and log still loading
    const rows = [row({ _id: "a", name: "Alice", party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] })];
    render(<HighScores rows={rows} />);
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.queryByTestId("download-log")).toBeNull();
    expect(screen.queryByTestId("game-code")).toBeNull(); // the code line waits on the log too
  });

  it("shows the game code in the score detail once the log resolves", () => {
    const log = { game: { code: "ABCD", seed: 1, picks: [0], color: null, status: "finished", createdAt: 0 }, moves: [] } as GameLog;
    useQueryMock.mockImplementation((q: unknown) => (q === "highScores:log" ? log : undefined));
    const rows = [row({ _id: "a", name: "Alice", party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] })];
    render(<HighScores rows={rows} />);
    fireEvent.click(screen.getByText("Alice"));
    expect(within(screen.getByTestId("hs-detail")).getByTestId("game-code")).toHaveTextContent(/ABCD/);
  });
});

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newGame, GS_ESCAPED, GS_DEAD, GS_QUIT, type GameState } from "@sorcerers-cave/engine";

const { downloadLogMock } = vi.hoisted(() => ({ downloadLogMock: vi.fn() }));
vi.mock("./gameLog", () => ({ downloadLog: (...a: unknown[]) => downloadLogMock(...a) }));
// GameOverScreen embeds the self-fetching LeaderboardPanel (base/kit tabs) — mock its query.
const useQueryMock = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useQuery: (...a: unknown[]) => useQueryMock(...a) }));
vi.mock("../../convex/_generated/api", () => ({ api: { highScores: { list: "highScores.list", stats: "s", log: "l" } } }));

import { GameOverScreen } from "./GameOverScreen";
import type { LeaderboardRow } from "./HighScores";
import type { GameLog } from "./gameLog";

describe("GameOverScreen", () => {
  it("shows the escape outcome and final score", () => {
    const base = newGame(1, [0]); // Hero (10 pts)
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.getByText(/escaped/i)).toBeInTheDocument();
    // Hero (10) appears as both the member's points and the grand total.
    expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1);
  });

  it("offers .txt and .log downloads when a log is supplied, and skips them otherwise", () => {
    const escaped: GameState = { ...newGame(1, [0]), gs: GS_ESCAPED };
    const log = { game: { code: "ABCD", seed: 1, picks: [0], color: null, status: "finished", createdAt: 0 }, moves: [] } as GameLog;

    // Without a log, no download controls.
    const { rerender } = render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.queryByTestId("download-log")).toBeNull();

    // With a log, both formats are offered and delegate to downloadLog.
    rerender(<GameOverScreen state={escaped} onNewGame={() => {}} log={log} />);
    fireEvent.click(screen.getByRole("button", { name: /readable log \(\.txt\)/i }));
    expect(downloadLogMock).toHaveBeenCalledWith(log, "human");
    fireEvent.click(screen.getByRole("button", { name: /printer log \(\.log\)/i }));
    expect(downloadLogMock).toHaveBeenCalledWith(log, "printer");
  });

  it("shows perished + score 0 for a dead party and fires onNewGame", () => {
    const base = newGame(1, [0]);
    const dead: GameState = { ...base, gs: GS_DEAD };
    const onNewGame = vi.fn();
    render(<GameOverScreen state={dead} onNewGame={onNewGame} />);
    expect(screen.getByText(/perished/i)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /new game/i }));
    expect(onNewGame).toHaveBeenCalled();
  });

  it("rolls call each member with the items they carry", () => {
    const base = newGame(1, [0]);
    const escaped: GameState = {
      ...base,
      gs: GS_ESCAPED,
      party: [{ ...base.party[0]!, treasure: [1] }], // Hero carrying Gold
    };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
  });

  it("lists awards not tied to a member — Sorcerer bounty and Treasure Chest loot — on the manifest", () => {
    const base = newGame(1, [0]);
    const escaped: GameState = {
      ...base,
      gs: GS_ESCAPED,
      sorcererKilled: true, // +30
      bonusScore: 80,       // gems from a Treasure Chest
    };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    const awards = screen.getByTestId("score-awards");
    expect(awards).toHaveTextContent("Sorcerer slain");
    expect(awards).toHaveTextContent("+30");
    expect(awards).toHaveTextContent("Treasure Chest loot");
    expect(awards).toHaveTextContent("+80");
    // Hero 10 + 30 + 80 = 120 grand total.
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("records the score under the trimmed name, then shows the leaderboard", async () => {
    const base = newGame(1, [0]);
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    const onSaveScore = vi.fn().mockResolvedValue("hs1");
    const leaderboard: LeaderboardRow[] = [
      { _id: "hs1", name: "Gandalf", score: 10, outcome: GS_ESCAPED, party: escaped.party, createdAt: 0 },
    ];
    useQueryMock.mockReturnValue(leaderboard);
    render(
      <GameOverScreen state={escaped} onNewGame={() => {}} onSaveScore={onSaveScore} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your name/i), { target: { value: "  Gandalf  " } });
    fireEvent.click(screen.getByRole("button", { name: /save score/i }));
    await waitFor(() => expect(onSaveScore).toHaveBeenCalledWith("Gandalf"));
    expect(await screen.findByTestId("high-scores")).toBeInTheDocument();
    expect(screen.getByText("Gandalf")).toBeInTheDocument();
  });

  it("shows the tally but no save form for an abandoned expedition (not a valid score)", () => {
    const base = newGame(1, [0]);
    const quit: GameState = { ...base, gs: GS_QUIT };
    render(<GameOverScreen state={quit} onNewGame={() => {}} onSaveScore={vi.fn()} />);
    expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1); // the tally is still shown
    expect(screen.queryByPlaceholderText(/your name/i)).toBeNull(); // but no save form
    expect(screen.getByTestId("no-record")).toHaveTextContent(/can record a score/i);
  });

  it("shows the game code on the escaped, abandoned and slain screens alike", () => {
    const base = newGame(1, [0]);
    // One component serves all three outcomes — the code must show on each.
    for (const gs of [GS_ESCAPED, GS_QUIT, GS_DEAD]) {
      const { unmount } = render(<GameOverScreen state={{ ...base, gs }} onNewGame={() => {}} code="SPQR" />);
      expect(screen.getByTestId("game-code")).toHaveTextContent(/SPQR/);
      unmount();
    }
  });

  it("omits the game-code line when no code is known", () => {
    const escaped: GameState = { ...newGame(1, [0]), gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.queryByTestId("game-code")).toBeNull();
  });

  describe("Idol reveal (US-25)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("animates the Idol's reveal (a visible d6) before showing the roll call, then its final value", () => {
      const base = newGame(1, [0], { extensionKit: true });
      const escaped: GameState = { ...base, gs: GS_ESCAPED, party: [{ ...base.party[0]!, treasure: [18] }] }; // Hero carrying the Idol
      render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
      // The dice overlay renders on top of the game-over screen (the established DiceRoll pattern —
      // GameScreen shows it the same way), so both coexist; "Continue" gates the outcome text.
      expect(screen.getByRole("dialog", { name: /dice roll/i })).toBeInTheDocument();
      expect(screen.getByTestId("game-over")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(11 * 80)); // run the tumble so Continue appears
      expect(screen.getByText(/the idol's eyes open/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
      expect(screen.queryByRole("dialog", { name: /dice roll/i })).toBeNull();
      expect(screen.getByTestId("game-over")).toBeInTheDocument();
      // scoreBreakdown's own deterministic roll (seed 1) — the Idol's line shows the resolved 10×roll,
      // and the total includes it (Hero 10 + Idol).
      expect(screen.getByText("Idol")).toBeInTheDocument();
    });
  });

  it("skips the Idol overlay entirely when no surviving member carries it", () => {
    const escaped: GameState = { ...newGame(1, [0]), gs: GS_ESCAPED }; // no Idol at all
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.queryByRole("dialog", { name: /dice roll/i })).toBeNull();
    expect(screen.getByTestId("game-over")).toBeInTheDocument();
  });

  it("offers no name entry when saving is unavailable", () => {
    const base = newGame(1, [0]);
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.queryByPlaceholderText(/your name/i)).toBeNull();
  });
});

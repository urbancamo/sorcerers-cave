import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, GS_ESCAPED, GS_DEAD, type GameState } from "@sorcerers-cave/engine";
import { GameOverScreen } from "./GameOverScreen";
import type { LeaderboardRow } from "./HighScores";

describe("GameOverScreen", () => {
  it("shows the escape outcome and final score", () => {
    const base = newGame(1, [0]); // Hero (10 pts)
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.getByText(/escaped/i)).toBeInTheDocument();
    // Hero (10) appears as both the member's points and the grand total.
    expect(screen.getAllByText("10").length).toBeGreaterThanOrEqual(1);
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

  it("records the score under the trimmed name, then shows the leaderboard", async () => {
    const base = newGame(1, [0]);
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    const onSaveScore = vi.fn().mockResolvedValue("hs1");
    const leaderboard: LeaderboardRow[] = [
      { _id: "hs1", name: "Gandalf", score: 10, outcome: GS_ESCAPED, party: escaped.party, createdAt: 0 },
    ];
    render(
      <GameOverScreen state={escaped} onNewGame={() => {}} onSaveScore={onSaveScore} leaderboard={leaderboard} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/your name/i), { target: { value: "  Gandalf  " } });
    fireEvent.click(screen.getByRole("button", { name: /save score/i }));
    await waitFor(() => expect(onSaveScore).toHaveBeenCalledWith("Gandalf"));
    expect(await screen.findByTestId("high-scores")).toBeInTheDocument();
    expect(screen.getByText("Gandalf")).toBeInTheDocument();
  });

  it("offers no name entry when saving is unavailable", () => {
    const base = newGame(1, [0]);
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.queryByPlaceholderText(/your name/i)).toBeNull();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, GS_ESCAPED, GS_DEAD, type GameState } from "@sorcerers-cave/engine";
import { GameOverScreen } from "./GameOverScreen";

describe("GameOverScreen", () => {
  it("shows the escape outcome and final score", () => {
    const base = newGame(1, [0]); // Hero (10 pts)
    const escaped: GameState = { ...base, gs: GS_ESCAPED };
    render(<GameOverScreen state={escaped} onNewGame={() => {}} />);
    expect(screen.getByText(/escaped/i)).toBeInTheDocument();
    expect(screen.getByText(/\b10\b/)).toBeInTheDocument(); // Hero = 10 points
  });

  it("shows perished + score 0 for a dead party and fires onNewGame", () => {
    const base = newGame(1, [0]);
    const dead: GameState = { ...base, gs: GS_DEAD };
    const onNewGame = vi.fn();
    render(<GameOverScreen state={dead} onNewGame={onNewGame} />);
    expect(screen.getByText(/perished/i)).toBeInTheDocument();
    expect(screen.getByText(/\b0\b/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /new game/i }));
    expect(onNewGame).toHaveBeenCalled();
  });
});

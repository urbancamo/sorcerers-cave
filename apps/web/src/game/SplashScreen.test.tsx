import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SplashScreen } from "./SplashScreen";

describe("SplashScreen", () => {
  it("shows the title, the quote, and the new-game options", () => {
    render(<SplashScreen onStartSolitaire={() => {}} />);
    expect(screen.getByRole("heading", { name: /the sorcerer.s cave/i })).toBeInTheDocument();
    expect(screen.getByText(/descent to the underworld is easy/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start solitaire game/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /start multiplayer game/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /join multiplayer game/i })).toBeDisabled();
  });

  it("starts a solitaire game when chosen", () => {
    const onStart = vi.fn();
    render(<SplashScreen onStartSolitaire={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /start solitaire game/i }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("credits the authors and links the repository", () => {
    render(<SplashScreen onStartSolitaire={() => {}} />);
    expect(screen.getByText(/written by mark wickens/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sorcerers-cave/i })).toHaveAttribute(
      "href",
      "https://github.com/urbancamo/sorcerers-cave",
    );
  });
});

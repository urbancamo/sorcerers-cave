import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("resumes a saved game by an upper-cased four-letter code", async () => {
    const onResume = vi.fn().mockResolvedValue(true);
    render(<SplashScreen onStartSolitaire={() => {}} onResume={onResume} />);
    const input = screen.getByLabelText(/four-letter game code/i);
    fireEvent.change(input, { target: { value: "abcd" } });
    expect((input as HTMLInputElement).value).toBe("ABCD"); // auto-uppercased
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    await waitFor(() => expect(onResume).toHaveBeenCalledWith("ABCD"));
  });

  it("shows an error when the code matches no game", async () => {
    const onResume = vi.fn().mockResolvedValue(false);
    render(<SplashScreen onStartSolitaire={() => {}} onResume={onResume} />);
    fireEvent.change(screen.getByLabelText(/four-letter game code/i), { target: { value: "ZZZZ" } });
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(await screen.findByText(/no game found with that code/i)).toBeInTheDocument();
  });

  it("disables Resume until four letters are entered", () => {
    render(<SplashScreen onStartSolitaire={() => {}} onResume={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /^resume$/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/four-letter game code/i), { target: { value: "AB" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/four-letter game code/i), { target: { value: "ABCD" } });
    expect(btn).toBeEnabled();
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

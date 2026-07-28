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

  it("enables the multiplayer buttons only when their handlers are provided", () => {
    const onStartMp = vi.fn(); const onJoinMp = vi.fn();
    render(<SplashScreen onStartSolitaire={() => {}} onStartMultiplayer={onStartMp} onJoinMultiplayer={onJoinMp} />);
    const startMp = screen.getByRole("button", { name: /start multiplayer game/i });
    const joinMp = screen.getByRole("button", { name: /join multiplayer game/i });
    expect(startMp).toBeEnabled();
    expect(joinMp).toBeEnabled();
    fireEvent.click(startMp);
    fireEvent.click(joinMp);
    expect(onStartMp).toHaveBeenCalledOnce();
    expect(onJoinMp).toHaveBeenCalledOnce();
  });

  // Replay-by-code entry (spec §RB-3): a box visually parallel to "Resume a game".
  it("offers a replay-by-code entry", async () => {
    const onReplay = vi.fn().mockResolvedValue(null); // null = replay opened
    render(<SplashScreen onStartSolitaire={() => {}} onReplay={onReplay} />);
    const input = screen.getByLabelText(/four-letter replay code/i);
    fireEvent.change(input, { target: { value: "wxyz" } });
    expect((input as HTMLInputElement).value).toBe("WXYZ"); // auto-uppercased like Resume
    fireEvent.click(screen.getByRole("button", { name: /^replay$/i }));
    await waitFor(() => expect(onReplay).toHaveBeenCalledWith("WXYZ"));
  });

  it("rejects a non 4-letter replay code", async () => {
    const onReplay = vi.fn();
    render(<SplashScreen onStartSolitaire={() => {}} onReplay={onReplay} />);
    const btn = screen.getByRole("button", { name: /^replay$/i });
    expect(btn).toBeDisabled(); // nothing entered yet
    fireEvent.change(screen.getByLabelText(/four-letter replay code/i), { target: { value: "A1" } });
    expect(btn).toBeDisabled();
    // Validation happens before the backend is ever called.
    expect(onReplay).not.toHaveBeenCalled();
  });

  it("unreplayable code shows explanation, not viewer", async () => {
    // The parent resolves an explanatory message for a not-found / pre-logging / multi game —
    // the splash surfaces it instead of opening the viewer (RB-1-5 / RB-1-6 / RB-3-3).
    const onReplay = vi.fn().mockResolvedValue("This game predates full logging and cannot be replayed.");
    render(<SplashScreen onStartSolitaire={() => {}} onReplay={onReplay} />);
    fireEvent.change(screen.getByLabelText(/four-letter replay code/i), { target: { value: "OLDG" } });
    fireEvent.click(screen.getByRole("button", { name: /^replay$/i }));
    expect(await screen.findByText(/predates full logging/i)).toBeInTheDocument();
  });

  it("credits the authors and links the repository", () => {
    render(<SplashScreen onStartSolitaire={() => {}} />);
    expect(screen.getByText(/written by mark wickens/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sorcerers-cave/i })).toHaveAttribute(
      "href",
      "https://github.com/urbancamo/sorcerers-cave",
    );
  });

  it("lists 'Replay a game' below the multiplayer entries (start-panel order)", () => {
    render(<SplashScreen onStartSolitaire={() => {}} />);
    const join = screen.getByRole("button", { name: "Join Multiplayer Game" });
    const replay = screen.getByTestId("replay");
    // compareDocumentPosition: FOLLOWING (4) means `replay` comes after `join` in the DOM.
    expect(join.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The modal subscribes to game.log via Convex's useQuery; mock it (no provider in unit tests).
const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (...a: unknown[]) => useQueryMock(...a) }));
// Isolate the component from the DOM download machinery — assert it delegates to downloadLog.
const { downloadLogMock } = vi.hoisted(() => ({ downloadLogMock: vi.fn() }));
vi.mock("./gameLog", () => ({ downloadLog: (...a: unknown[]) => downloadLogMock(...a) }));

import { GameLogModal } from "./GameLogModal";
import type { Id } from "../../convex/_generated/dataModel";

const ID = "game123" as Id<"games">;
const sampleLog = {
  game: { code: "ABCD", seed: 7, picks: [0], color: "green", status: "active", createdAt: 0 },
  moves: [{ seq: 0, action: { type: "move", dir: 1 }, events: [] }],
};

beforeEach(() => { useQueryMock.mockReset(); downloadLogMock.mockReset(); });

describe("GameLogModal", () => {
  it("shows a loading note while the log query is pending", () => {
    useQueryMock.mockReturnValue(undefined);
    render(<GameLogModal gameId={ID} onClose={() => {}} />);
    expect(screen.getByText(/loading the log/i)).toBeInTheDocument();
  });

  it("shows an unavailable note when the query returns null (not owner / unknown)", () => {
    useQueryMock.mockReturnValue(null);
    render(<GameLogModal gameId={ID} onClose={() => {}} />);
    expect(screen.getByText(/no log is available/i)).toBeInTheDocument();
  });

  it("offers both downloads and delegates each to downloadLog", () => {
    useQueryMock.mockReturnValue(sampleLog);
    render(<GameLogModal gameId={ID} onClose={() => {}} />);
    expect(screen.getByText(/1 move recorded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("log-dl-human"));
    expect(downloadLogMock).toHaveBeenCalledWith(sampleLog, "human");
    fireEvent.click(screen.getByTestId("log-dl-machine"));
    expect(downloadLogMock).toHaveBeenCalledWith(sampleLog, "machine");
  });

  it("notes when a game predates full logging (no seed)", () => {
    useQueryMock.mockReturnValue({ ...sampleLog, game: { ...sampleLog.game, seed: null, picks: null } });
    render(<GameLogModal gameId={ID} onClose={() => {}} />);
    expect(screen.getByText(/predates full logging/i)).toBeInTheDocument();
  });

  it("closes via the Close button", () => {
    useQueryMock.mockReturnValue(sampleLog);
    const onClose = vi.fn();
    render(<GameLogModal gameId={ID} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

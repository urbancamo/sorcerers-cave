import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { newGame } from "@sorcerers-cave/engine";
import { SpectateView } from "./SpectateView";
import type { Id } from "../../convex/_generated/dataModel";

// The 3D canvas can't boot in jsdom — stub it; this test is about the follow/ended flow.
vi.mock("../view/CaveCanvas", () => ({ CaveCanvas: () => <div data-testid="canvas" /> }));
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ tiles: [{ tileId: "t", exits: "NESW" }], cards: [] }),
}));
vi.mock("../view/engineAdapter", () => ({
  createCaveAdapter: () => ({ sync: () => {}, get areas() { return []; } }),
}));

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (...a: unknown[]) => useQueryMock(...a) }));
beforeEach(() => useQueryMock.mockReset());

const view = (status: string) => ({
  state: newGame(1, [0]),
  seat: 1, name: "Red Talons", color: "red",
  parties: [
    { seat: 0, name: "Green Wyrms", color: "green", status: "wiped", partyArea: 0, level: 1 },
    { seat: 1, name: "Red Talons", color: "red", status, partyArea: 0, level: 1 },
  ],
});

const gameId = "g1" as Id<"games">;

describe("SpectateView — the followed party finishing (I-15/I-17 viewer feedback)", () => {
  it("announces the quit and returns to standings when the followed party abandons mid-watch", async () => {
    const onBack = vi.fn();
    useQueryMock.mockReturnValue(view("exploring"));
    const { rerender } = render(<SpectateView gameId={gameId} seat={1} onBack={onBack} />);
    await screen.findByText(/following/i); // art + adapter resolved
    expect(screen.queryByTestId("spectate-ended")).toBeNull();

    // The followed party quits while we watch.
    useQueryMock.mockReturnValue(view("quit"));
    rerender(<SpectateView gameId={gameId} seat={1} onBack={onBack} />);

    const modal = await screen.findByTestId("spectate-ended");
    expect(modal.textContent).toMatch(/Red Talons abandoned the expedition/i);
    fireEvent.click(within(modal).getByRole("button", { name: /back to standings/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("does NOT pop the modal when following a party that had already finished", async () => {
    const onBack = vi.fn();
    useQueryMock.mockReturnValue(view("left")); // studying an escaped party's final position
    render(<SpectateView gameId={gameId} seat={1} onBack={onBack} />);
    await screen.findByText(/following/i);
    expect(screen.queryByTestId("spectate-ended")).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});

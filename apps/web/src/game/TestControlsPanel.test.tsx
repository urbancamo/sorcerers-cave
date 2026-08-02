import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, SPECIAL_WHIRLPOOL, DIR_N, type GameState } from "@sorcerers-cave/engine";
import { TestControlsPanel } from "./TestControlsPanel";

const testState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0], undefined, true), ...over });

describe("TestControlsPanel", () => {
  it("renders nothing when state.testMode is not true", () => {
    render(<TestControlsPanel state={newGame(1, [0])} dispatch={() => {}} />);
    expect(screen.queryByTestId("test-controls")).toBeNull();
  });

  it("queues testPlaceArea with the chosen direction and special", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_WHIRLPOOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL });
  });

  it("shows the currently armed area override", () => {
    const s = testState({ testNextArea: { dir: DIR_N, special: SPECIAL_WHIRLPOOL } });
    render(<TestControlsPanel state={s} dispatch={() => {}} />);
    expect(screen.getByTestId("test-controls")).toHaveTextContent(/whirlpool/i);
  });

  it("adds a creature to the chamber picker and queues testSetChamber with it", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/add a creature/i), { target: { value: "10" } }); // Dragon
    fireEvent.click(screen.getByRole("button", { name: /queue next chamber/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testSetChamber", strangers: [10], treasures: [], hazards: [] });
  });

  it("queues testForceReaction with the clicked outcome", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /^hostile$/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceReaction", outcome: "hostile" });
    fireEvent.click(screen.getByRole("button", { name: /^friendly$/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testForceReaction", outcome: "friendly" });
  });

  it("dispatches testClearOverrides from the clear button", () => {
    const dispatch = vi.fn();
    const s = testState({ testNextReaction: "hostile" });
    render(<TestControlsPanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testClearOverrides" });
  });
});

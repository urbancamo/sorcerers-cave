import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  newGame, SPECIAL_WHIRLPOOL, SPECIAL_DEEP_POOL, DIR_N,
  CREATURES, TREASURES, HAZARD_NAMES, ALL_CREATURES, ALL_TREASURES, ALL_HAZARD_NAMES,
  type GameState,
} from "@sorcerers-cave/engine";
import { TestControlsPanel } from "./TestControlsPanel";

const testState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0], undefined, true), ...over });
const kitOnState = (over: Partial<GameState> = {}): GameState =>
  ({ ...newGame(1, [0], { extensionKit: true }, true), ...over });

describe("TestControlsPanel", () => {
  it("renders nothing when state.testMode is not true", () => {
    render(<TestControlsPanel state={newGame(1, [0])} dispatch={() => {}} />);
    expect(screen.queryByTestId("test-controls")).toBeNull();
  });

  it("queues testPlaceArea with the chosen direction and special (kit-on game)", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={kitOnState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_WHIRLPOOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: SPECIAL_WHIRLPOOL });
  });

  it("queues testPlaceArea with a base special on a kit-off game", () => {
    const dispatch = vi.fn();
    render(<TestControlsPanel state={testState()} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText(/next area — direction/i), { target: { value: String(DIR_N) } });
    fireEvent.change(screen.getByLabelText(/next area — special/i), { target: { value: String(SPECIAL_DEEP_POOL) } });
    fireEvent.click(screen.getByRole("button", { name: /queue next area/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "testPlaceArea", dir: DIR_N, special: SPECIAL_DEEP_POOL });
  });

  // Kit gating (SC-Test-6, review fix): the picker shouldn't even offer content the engine would
  // reject — a kit-off game's option lists exclude every kit-only special/creature/treasure/hazard.
  it("omits kit-only specials/creatures/treasures/hazards from the pickers on a kit-off game", () => {
    render(<TestControlsPanel state={testState()} dispatch={() => {}} />);
    const specialSelect = screen.getByLabelText(/next area — special/i);
    expect(specialSelect.querySelector(`option[value="${SPECIAL_WHIRLPOOL}"]`)).toBeNull();
    const creatureSelect = screen.getByLabelText(/add a creature/i);
    expect(creatureSelect.querySelectorAll("option")).toHaveLength(CREATURES.length + 1); // +1 placeholder
    const treasureSelect = screen.getByLabelText(/add a treasure/i);
    expect(treasureSelect.querySelectorAll("option")).toHaveLength(TREASURES.length + 1);
    const hazardSelect = screen.getByLabelText(/add a hazard/i);
    expect(hazardSelect.querySelectorAll("option")).toHaveLength(HAZARD_NAMES.length + 1);
  });

  it("offers every kit-only special/creature/treasure/hazard on a kit-on game", () => {
    render(<TestControlsPanel state={kitOnState()} dispatch={() => {}} />);
    const specialSelect = screen.getByLabelText(/next area — special/i);
    expect(specialSelect.querySelector(`option[value="${SPECIAL_WHIRLPOOL}"]`)).not.toBeNull();
    const creatureSelect = screen.getByLabelText(/add a creature/i);
    expect(creatureSelect.querySelectorAll("option")).toHaveLength(ALL_CREATURES.length + 1);
    const treasureSelect = screen.getByLabelText(/add a treasure/i);
    expect(treasureSelect.querySelectorAll("option")).toHaveLength(ALL_TREASURES.length + 1);
    const hazardSelect = screen.getByLabelText(/add a hazard/i);
    expect(hazardSelect.querySelectorAll("option")).toHaveLength(ALL_HAZARD_NAMES.length + 1);
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

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, type GameState } from "@sorcerers-cave/engine";
import { EncounterPanel } from "./EncounterPanel";

function encounterState(): GameState {
  // Force an encounter: a Man+Woman party facing a lone Man stranger.
  return { ...newGame(1, [5, 6]), phase: "encounter", strangers: [5] };
}

describe("EncounterPanel", () => {
  it("renders nothing in the explore phase", () => {
    const { container } = render(<EncounterPanel state={newGame(1, [5, 6])} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers encounter actions and dispatches the chosen one", () => {
    const dispatch = vi.fn();
    render(<EncounterPanel state={encounterState()} dispatch={dispatch} />);
    expect(screen.getByRole("button", { name: /test reaction/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /attack/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "attack" });
  });

  it("offers pickup actions", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /leave/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "leaveTreasure" });
  });

  it("renders nothing in the fight phase (the FightSurface owns it)", () => {
    const s: GameState = { ...newGame(1, [0]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3] };
    const { container } = render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

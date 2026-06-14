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

  it("shows a dice-roll overlay when a reaction event comes back", async () => {
    const dispatch = vi.fn().mockResolvedValue({
      events: [
        { type: "reaction", outcome: "friendly", roll: 6 },
        { type: "strangersJoined", count: 1 },
      ],
    });
    render(<EncounterPanel state={encounterState()} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /test reaction/i }));
    // The die appears immediately once the action resolves (before the tumble settles).
    expect(await screen.findByTestId("die")).toBeInTheDocument();
    expect(await screen.findByText(/join your party/i, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("shows both rolls side by side after a combat round", async () => {
    const dispatch = vi.fn().mockResolvedValue({
      events: [
        {
          type: "combatRoll",
          party: "Man",
          enemy: "Dwarf",
          partyRoll: 6,
          enemyRoll: 1,
          partyTotal: 9,
          enemyTotal: 2,
          result: "partyWon",
        },
        { type: "strangerKilled", creatureId: 7 },
        { type: "fightWon" },
      ],
    });
    const fight: GameState = {
      ...newGame(1, [5, 6]),
      phase: "fight",
      strangers: [7],
      fight: { surprise: 0, round: 1, focus: 0 },
    };
    render(<EncounterPanel state={fight} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /fight on/i }));
    const dice = await screen.findAllByTestId("die");
    expect(dice).toHaveLength(2);
    expect(await screen.findByText("Man")).toBeInTheDocument();
    expect(await screen.findByText("Dwarf")).toBeInTheDocument();
    expect(await screen.findByText(/foes have fallen/i, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("offers pickup actions", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /leave/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "leaveTreasure" });
  });
});

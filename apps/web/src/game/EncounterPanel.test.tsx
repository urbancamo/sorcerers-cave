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

  it("lists a treasure once with a member dropdown (Leave in chamber default)", () => {
    const dispatch = vi.fn();
    const pickup: GameState = { ...newGame(1, [5, 6]), phase: "pickup", treasures: [1] }; // Gold
    render(<EncounterPanel state={pickup} dispatch={dispatch} />);
    const select = screen.getByLabelText(/assign gold/i) as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe("Leave in chamber"); // first option leaves it
    fireEvent.change(select, { target: { value: "0" } });            // give to the first eligible member
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "takeTreasure", ti: 0 }));
  });

  it("words the Lost Ruby as wresting it from the guardian statue, not a free pickup", () => {
    const pickup: GameState = { ...newGame(1, [0]), phase: "pickup", treasures: [11] }; // Lost Ruby (guarded)
    render(<EncounterPanel state={pickup} dispatch={() => {}} />);
    const select = screen.getByLabelText(/wrest lost ruby/i) as HTMLSelectElement;
    const opts = [...select.options].map((o) => o.textContent ?? "");
    expect(opts.some((t) => /wrests it from the statue/i.test(t))).toBe(true);
    expect(opts.some((t) => /^give to/i.test(t))).toBe(false); // never the plain "Give to" wording
  });

  it("lists an artefact once with a target dropdown", () => {
    const dispatch = vi.fn();
    const s: GameState = { ...newGame(1, [5, 6]), phase: "encounter", strangers: [3] }; // vs a Troll
    s.party[0]!.treasure.push(5); // the Man carries Lotus Dust
    render(<EncounterPanel state={s} dispatch={dispatch} />);
    const select = screen.getByLabelText(/use lotus dust/i);
    fireEvent.change(select, { target: { value: "0" } }); // apply to the only stranger
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "useArtifact", artifact: 5 }));
  });

  it("renders nothing in the fight phase (the FightSurface owns it)", () => {
    const s: GameState = { ...newGame(1, [0]), phase: "fight", fight: { surprise: 0, round: 1, focus: 0 }, strangers: [3] };
    const { container } = render(<EncounterPanel state={s} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

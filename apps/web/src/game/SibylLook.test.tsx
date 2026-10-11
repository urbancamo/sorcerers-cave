import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, legalActions, packCoord, type GameState, type GameAction } from "@sorcerers-cave/engine";
import { SibylLook, describeTile } from "./SibylLook";

const stateWithSibyl = (): GameState => {
  const s = newGame(1, [0], { sibyl: true });
  s.hasSibyl = true;
  s.largePack = [(3 << 7) | 31]; // Viper Pit, NESW chamber
  s.largeIdx = 0;
  s.areas.push({ card: 5, coord: packCoord(1, 50, 51), faceUp: false, visited: true, contents: [], flags: 0, indiffCount: 0 }); // N + S tunnel, face-down
  return s;
};
const looks = (s: GameState) => legalActions(s).filter((a): a is Extract<GameAction, { type: "examineArea" }> => a.type === "examineArea");

describe("describeTile", () => {
  it("names a tunnel by its exits, a chamber, and a special", () => {
    expect(describeTile(5)).toBe("Tunnel — north, south");
    expect(describeTile(31)).toBe("Chamber — north, east, south, west");
    expect(describeTile((3 << 7) | 31)).toBe("Viper Pit — north, east, south, west");
    expect(describeTile(32)).toBe("Tunnel — stairs up");
  });
});

describe("SibylLook", () => {
  it("renders nothing when there is nothing to look at", () => {
    const { container } = render(<SibylLook state={stateWithSibyl()} actions={[]} dispatch={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dispatches the pack look and then shows what the top of the pack is", () => {
    const dispatch = vi.fn();
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /top of the pack/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "examineArea" });
    expect(screen.getByTestId("sibyl-readout")).toHaveTextContent("Viper Pit — north, east, south, west");
  });

  it("dispatches a tile look from the selector and shows that tile", () => {
    const dispatch = vi.fn();
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={dispatch} />);
    const picker = screen.getByRole("combobox", { name: /face-down tile/i }) as HTMLSelectElement;
    // Each option names where the tile is on the map (level and x,y), so it can be matched to what is on screen.
    expect(Array.from(picker.options).map((o) => o.textContent)).toContain("Level 1 (50, 51)");
    fireEvent.change(picker, { target: { value: "1" } });
    expect(dispatch).toHaveBeenCalledWith({ type: "examineArea", area: 1 });
    expect(screen.getByTestId("sibyl-readout")).toHaveTextContent("Tunnel — north, south");
  });

  it("shows nothing before a look has been taken", () => {
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={() => {}} />);
    expect(screen.queryByTestId("sibyl-readout")).toBeNull();
  });
});

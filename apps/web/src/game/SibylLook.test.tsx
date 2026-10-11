import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { newGame, legalActions, packCoord, type GameState, type GameAction } from "@sorcerers-cave/engine";
import { SibylLook, describeTile } from "./SibylLook";

// Tile art for the fading card: a tunnel (N+S) and the Viper Pit chamber, as the manifest would supply them.
vi.mock("../data/useManifestCards", () => ({
  useManifestArt: () => ({
    cards: [],
    tiles: [
      { tileId: "t-ns", file: "/ns.png", exits: "NS", type: "tunnel", stairUp: false, stairDown: false, special: null },
      { tileId: "t-pit", file: "/pit.png", exits: "NESW", type: "chamber", stairUp: false, stairDown: false, special: "viper-pit" },
    ],
  }),
}));

beforeEach(() => { try { sessionStorage.clear(); } catch { /* storage unavailable: the intro simply shows */ } });

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

describe("SibylLook — the fading card", () => {
  it("shows the tile art for the top of the pack as a see-through overlay that removes itself when the fade ends", () => {
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={() => {}} />);
    expect(screen.queryByTestId("sibyl-peek")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /top of the pack/i }));
    const peek = screen.getByTestId("sibyl-peek");
    expect(peek.querySelector("img")).toHaveAttribute("src", "/pit.png");
    // jsdom has no AnimationEvent, so React listens for the prefixed name there; real browsers fire "animationend".
    fireEvent(peek, new Event("webkitAnimationEnd", { bubbles: true }));
    expect(screen.queryByTestId("sibyl-peek")).toBeNull();
  });

  it("shows a face-down tile's art too", () => {
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={() => {}} />);
    fireEvent.change(screen.getByRole("combobox", { name: /face-down tile/i }), { target: { value: "1" } });
    expect(screen.getByTestId("sibyl-peek").querySelector("img")).toHaveAttribute("src", "/ns.png");
  });

  it("a second look replaces the card (it restarts the fade rather than stacking)", () => {
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /top of the pack/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /face-down tile/i }), { target: { value: "1" } });
    expect(screen.getAllByTestId("sibyl-peek")).toHaveLength(1);
    expect(screen.getByTestId("sibyl-peek").querySelector("img")).toHaveAttribute("src", "/ns.png");
  });
});

describe("SibylLook — the introduction is said once", () => {
  it("opens the first look with the Sibyl's line and does not repeat it", () => {
    const s = stateWithSibyl();
    render(<SibylLook state={s} actions={looks(s)} dispatch={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /top of the pack/i }));
    expect(screen.getByTestId("sibyl-readout")).toHaveTextContent("The Sibyl shows you what lies hidden.");
    fireEvent.click(screen.getByRole("button", { name: /top of the pack/i }));
    expect(screen.getByTestId("sibyl-readout")).not.toHaveTextContent("The Sibyl shows you what lies hidden.");
    expect(screen.getByTestId("sibyl-readout")).toHaveTextContent("Viper Pit");
  });
});

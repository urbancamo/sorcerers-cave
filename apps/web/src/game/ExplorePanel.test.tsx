import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, packCoord, DIR_W, SPECIAL_DEEP_POOL, type GameState } from "@sorcerers-cave/engine";
import { ExplorePanel } from "./ExplorePanel";

describe("ExplorePanel", () => {
  it("renders nothing when no chest/artifact actions are available", () => {
    render(<ExplorePanel state={newGame(1, [0])} dispatch={() => {}} />);
    expect(screen.queryByTestId("explore-panel")).toBeNull();
  });

  it("renders nothing outside the explore phase", () => {
    const s: GameState = { ...newGame(1, [0]), phase: "encounter" };
    s.party[0]!.treasure.push(14); // even with a chest, not while encountering
    render(<ExplorePanel state={s} dispatch={() => {}} />);
    expect(screen.queryByTestId("explore-panel")).toBeNull();
  });

  it("offers 'Attack the guardians' when traversing a pacified chamber, and dispatches attack", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]); // Hero
    const s: GameState = { ...base, phase: "explore", pacifiedAreas: [base.partyArea] };
    s.areas[base.partyArea]!.contents = [100 + 6, 200 + 1]; // a parked guard + the treasure it guards
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /attack the guardians/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "attack" });
  });

  it("offers 'Reclaim the sunk treasure' when parked at a Deep Pool doorway with a Giant and sunk treasure there (bug fix 2026-08-02), and dispatches reclaimTreasure", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]); // Hero — swapped out below for a Giant
    const DEEP_POOL_CARD = (SPECIAL_DEEP_POOL << 7) | 31; // NESW + chamber
    const s: GameState = {
      ...base,
      phase: "explore",
      party: [{ creatureId: 12, status: 0, dragonKills: 0, treasure: [] }], // a Giant
      areas: [
        { card: DEEP_POOL_CARD, coord: packCoord(1, 50, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, sunkTreasure: [{ at: DIR_W, items: [1] }] },
        { card: 2, coord: packCoord(1, 49, 50), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0 },
      ],
      partyArea: 0,
      prev: 1, // entered from the west neighbour — sub-location is the WEST doorway
    };
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /reclaim the sunk treasure/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "reclaimTreasure" });
  });

  it("offers the Chasm's descend button with a blocking confirm before dispatching (US-02)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]);
    const s: GameState = { ...base, areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (6 << 7) } : a)) };
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Descend the chasm" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/cannot return this way/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "descendChasm" });
  });

  it("is headed with the chamber's name, and with Actions elsewhere", () => {
    const base = newGame(1, [0]);
    const chasm: GameState = { ...base, areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (6 << 7) } : a)) };
    const { unmount } = render(<ExplorePanel state={chasm} dispatch={() => {}} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("The Chasm");
    unmount();
    const guarded: GameState = { ...base, pacifiedAreas: [base.partyArea] };
    guarded.areas[base.partyArea]!.contents = [100 + 6, 200 + 1];
    render(<ExplorePanel state={guarded} dispatch={() => {}} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Actions");
  });

  it("offers the Well's draw button with a blocking confirm before dispatching (US-07)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]);
    const s: GameState = { ...base, areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (11 << 7) } : a)) };
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw from the well" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "drawFromWell" });
  });

  it("offers the Crypt's enter button with a blocking confirm before dispatching (US-08)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0]);
    const s: GameState = { ...base, cryptCoord: base.areas[base.partyArea]!.coord };
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter the crypt" }));
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/trap here cannot be avoided/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "enterCrypt" });
  });

  it("offers the Bell Rope as a member-picker dropdown, then a confirm (US-03)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [5, 6]); // Man + Woman
    const s: GameState = { ...base, areas: base.areas.map((a, i) => (i === 0 ? { ...a, card: 16 | (7 << 7) } : a)) };
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText("Bell Rope"), { target: { value: "1" } });
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/pull the bell rope with woman/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "pullBellRope", mi: 1 });
  });

  // Treasure nobody can carry is explained on its own card (shell/FloorTreasureActions), not by an information-only bar here.
  it("shows no bar for a treasure nobody can carry when there is no action to take", () => {
    const s = newGame(1, [5, 6]); // Man (50) + Woman (25) vs the 100 kg chest on the floor
    s.areas[s.partyArea]!.contents = [200 + 14];
    render(<ExplorePanel state={s} dispatch={() => {}} />);
    expect(screen.queryByTestId("explore-panel")).toBeNull();
  });
});

describe("ExplorePanel — the Sibyl's look (SC-SIB-8)", () => {
  it("no longer offers the look here: it is on her card", () => {
    const s = newGame(1, [0], { sibyl: true });
    s.largePack = [31]; s.largeIdx = 0;
    render(<ExplorePanel state={{ ...s, hasSibyl: true }} dispatch={() => {}} />);
    expect(screen.queryByRole("button", { name: /top of the pack/i })).toBeNull();
    expect(screen.queryByTestId("explore-panel")).toBeNull();
  });

  it("offers a confirmed 'Stay' while the Apprentice is on watch after the Sorcerer's death (revised combat), and dispatches stay", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [5]);
    const s: GameState = {
      ...base, phase: "explore", variants: { combatRevision: true, extensionKit: true }, apprenticeWatch: base.partyArea,
      party: [...base.party, { creatureId: 14, status: 1, dragonKills: 0, treasure: [] }],
    };
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    expect(screen.getByText(/apprentice is watching/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stay/i }));
    expect(dispatch).not.toHaveBeenCalled();              // a second tap confirms: staying turns her on the party
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "stay" });
  });
});

describe("ExplorePanel — artifact use lives on the item's card", () => {
  it("offers no artifact use or chest opening of its own", () => {
    const s = newGame(1, [4]); // a Priest can command the carpet
    s.party[0]!.treasure.push(4, 14); // Magic Carpet and Treasure Chest
    render(<ExplorePanel state={s} dispatch={() => {}} />);
    expect(screen.queryByLabelText(/use magic carpet/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /open the treasure chest/i })).toBeNull();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, type GameState } from "@sorcerers-cave/engine";
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

  it("offers to open a carried Treasure Chest and dispatches openChest", () => {
    const dispatch = vi.fn();
    const s = newGame(1, [0]); // Hero
    s.party[0]!.treasure.push(14); // carries the Treasure Chest
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /open the treasure chest/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "openChest" });
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

  it("condenses the Magic Carpet's directions into a single dropdown", () => {
    const dispatch = vi.fn();
    const s = newGame(1, [4]); // a Priest can command the carpet
    s.party[0]!.treasure.push(4); // Magic Carpet (many directions on level 1)
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    const select = screen.getByLabelText(/use magic carpet/i);
    fireEvent.change(select, { target: { value: "0" } });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "useArtifact", artifact: 4 }));
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

  it("offers the Elixir as a drinker-picker dropdown, then the verbatim confirm (US-19)", () => {
    const dispatch = vi.fn();
    const s = newGame(1, [0]); // Hero
    s.party[0]!.treasure.push(15); // carries the Elixir
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.change(screen.getByLabelText("Elixir"), { target: { value: "0" } });
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent(/1: death\. 2–3: nothing\. 4–6: \+2 strength, forever\./);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 15, target: 0 });
  });

  it("names Holy Water's four-pool targets correctly in the explore phase (US-20)", () => {
    const dispatch = vi.fn();
    const base = newGame(1, [0], { extensionKit: true });
    // A single legal target (the Witch statue) collapses to a one-click button (§"one option → a
    // one-click button") — its label must still decode the WAKE offset (HW_STATUE_BASE+i) to the
    // statue's own name, not a raw party-index lookup.
    const s: GameState = { ...base, party: [{ ...base.party[0]!, treasure: [16] }], statues: [18] }; // Witch statue
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /holy water.*witch/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "useArtifact", artifact: 16, target: 1000 }));
  });

  it("offers a named artifact use and dispatches it with its target", () => {
    const dispatch = vi.fn();
    const s = newGame(1, [6, 5]); // Woman + Man
    s.party[0]!.treasure.push(6); // Woman carries Healing Balm
    s.party[1]!.status = 3; // Man has fallen
    render(<ExplorePanel state={s} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /healing balm — revive man/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "useArtifact", artifact: 6, target: 1 });
  });
});

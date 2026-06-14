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

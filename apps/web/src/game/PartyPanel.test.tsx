import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { newGame, type GameState } from "@sorcerers-cave/engine";
import { PartyPanel } from "./PartyPanel";

// Card art isn't available in jsdom; resolve Gold (treasure id 1) to a stub file so the
// hover-preview test has an image to show. Other cards fall back to their name placeholder.
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ cards: [] }),
  resolveCard: (cat: string, id: number) => (cat === "treasure" && id === 1 ? { file: "/gold.png" } : null),
  resolveCardVariant: (cat: string, id: number) => (cat === "creature" ? { file: `/c${id}.png` } : null),
}));

function partyState(): GameState {
  const s = newGame(1, [5, 7]); // Man (carry 50) + Dwarf (carry 25) — cost 3+1 ≤ 6 budget
  s.party[0]!.treasure.push(1); // Man carries Gold (id 1, 25kg — fits the Dwarf exactly)
  return s;
}

describe("PartyPanel", () => {
  it("moves a carried treasure to another member", () => {
    const dispatch = vi.fn();
    render(<PartyPanel state={partyState()} dispatch={dispatch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^gold$/i })); // select Man's Gold
    fireEvent.click(screen.getByRole("button", { name: /move here/i })); // give it to the Ogre
    expect(dispatch).toHaveBeenCalledWith({ type: "moveTreasure", from: 0, to: 1, idx: 0 });
  });

  it("drops a carried treasure into the chamber", () => {
    const dispatch = vi.fn();
    render(<PartyPanel state={partyState()} dispatch={dispatch} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^gold$/i }));
    fireEvent.click(screen.getByRole("button", { name: /drop into chamber/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "dropTreasure", mi: 0, idx: 0 });
  });

  it("shows a large floating preview while an item is hovered, and hides it on leave", () => {
    render(<PartyPanel state={partyState()} dispatch={() => {}} onClose={() => {}} />);
    const gold = screen.getByRole("button", { name: /^gold$/i });
    expect(document.querySelector(".scv-pp-preview")).toBeNull();
    fireEvent.mouseEnter(gold);
    const preview = document.querySelector(".scv-pp-preview img");
    expect(preview).not.toBeNull();
    expect(preview!.getAttribute("src")).toBe("/gold.png");
    fireEvent.mouseLeave(gold);
    expect(document.querySelector(".scv-pp-preview")).toBeNull();
  });

  it("lists living members first but keeps original indices for treasure actions", () => {
    const dispatch = vi.fn();
    const s = newGame(1, [5, 6]); // Man (idx 0) + Woman (idx 1)
    s.party[0]!.status = 2; // Man turned to stone
    s.party[1]!.treasure.push(1); // living Woman carries Gold
    render(<PartyPanel state={s} dispatch={dispatch} onClose={() => {}} />);
    // Living Woman renders before the petrified Man.
    const names = [...document.querySelectorAll(".scv-pp-name")].map((n) => n.textContent);
    expect(names[0]).toMatch(/woman/i);
    // Dropping Woman's Gold still dispatches with her ORIGINAL party index (1), not display position.
    fireEvent.click(screen.getByRole("button", { name: /^gold$/i }));
    fireEvent.click(screen.getByRole("button", { name: /drop into chamber/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "dropTreasure", mi: 1, idx: 0 });
  });

  it("is view-only during a fight", () => {
    const s = partyState();
    s.phase = "fight";
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/redistributed during a fight/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^gold$/i })).toBeDisabled();
  });
});

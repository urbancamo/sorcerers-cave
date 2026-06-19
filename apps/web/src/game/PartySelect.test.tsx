import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PartySelect } from "./PartySelect";

// Give every creature card a stub art file so the cards are zoomable in tests.
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ cards: [] }),
  resolveCard: (_cat: string, id: number) => ({ file: `/c${id}.png` }),
}));

describe("PartySelect", () => {
  it("zooms a card when its art is clicked, and closes again", async () => {
    render(<PartySelect onConfirm={() => {}} />);
    const art = await screen.findByRole("button", { name: /zoom the woman card/i });
    fireEvent.click(art);
    expect(screen.getByTestId("card-zoom")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("card-zoom")); // click anywhere closes
    expect(screen.queryByTestId("card-zoom")).toBeNull();
  });

  it("confirms a budget-valid party and reports the picks", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} />);
    // add one Woman (cost 2) — within the budget of 6
    fireEvent.click(screen.getByRole("button", { name: /add Woman/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([6], "yellow"); // default party colour
  });

  it("selects a party colour and reports it on confirm", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /add Woman/i }));
    fireEvent.click(screen.getByRole("button", { name: /party colour blue/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([6], "blue");
  });

  it("disables Confirm when nothing is picked and when over budget", () => {
    render(<PartySelect onConfirm={() => {}} />);
    const confirm = screen.getByRole("button", { name: /^Enter the cave/i });
    expect(confirm).toBeDisabled(); // empty party is invalid
    // a Hero (cost 6) is valid; a second pick over budget disables again
    fireEvent.click(screen.getByRole("button", { name: /add Hero/i }));
    expect(confirm).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /add Woman/i })); // 6+2 = 8 > 6
    expect(confirm).toBeDisabled();
  });
});

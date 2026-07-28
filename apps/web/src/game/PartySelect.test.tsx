import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PartySelect } from "./PartySelect";

/** The `.scv-card-cost` text ("cost N · n/avail") for the named creature's card — scoped so it
 *  can't collide with another creature that happens to share the same cost/stock numbers. */
const costOf = (name: RegExp) => within(screen.getByText(name, { selector: ".scv-card-nm" }).closest(".scv-card")!);

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

  it("without kitToggle, shows no Extension kit switch and reports no variants on confirm (byte-identity)", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} />);
    expect(screen.queryByRole("checkbox", { name: /extension kit/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add Hero/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([0], "yellow"); // no trailing variants arg — byte-identical call shape
  });
});

describe("PartySelect — extension kit toggle (SC-EXT-29, design US-01/§1.3)", () => {
  it("shows the switch + caption when kitToggle is set, off by default (base roster only)", () => {
    render(<PartySelect onConfirm={() => {}} kitToggle />);
    const toggle = screen.getByRole("checkbox", { name: /extension kit/i });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/adds 30 area tiles and 30 cards to the decks/i)).toBeInTheDocument();
    // Kit starters are not offered yet.
    expect(screen.queryByRole("button", { name: /add witch/i })).toBeNull();
    // Base Ogre shows its base cost.
    expect(costOf(/^Ogre$/).getByText(/cost 5 · 0\/3/)).toBeInTheDocument();
  });

  it("turning the kit on extends the roster with the five kit starters at official costs/stock", () => {
    render(<PartySelect onConfirm={() => {}} kitToggle />);
    fireEvent.click(screen.getByRole("checkbox", { name: /extension kit/i }));
    expect(screen.getByRole("button", { name: /add witch/i })).toBeInTheDocument();
    expect(costOf(/^Witch$/).getByText(/cost 5 · 0\/3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add scholar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add thief/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add lion/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add wolf/i })).toBeInTheDocument();
    // Apprentice/Demon never selectable, even kit-on.
    expect(screen.queryByRole("button", { name: /add apprentice/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add demon/i })).toBeNull();
  });

  it("kit-on revises Ogre 5→4 and Troll 4→3, and raises Woman/Dwarf stock to 4", () => {
    render(<PartySelect onConfirm={() => {}} kitToggle />);
    fireEvent.click(screen.getByRole("checkbox", { name: /extension kit/i }));
    expect(costOf(/^Ogre$/).getByText(/cost 4 · 0\/3/)).toBeInTheDocument();
    expect(costOf(/^Troll$/).getByText(/cost 3 · 0\/3/)).toBeInTheDocument();
    expect(costOf(/^Woman$/).getByText(/cost 2 · 0\/4/)).toBeInTheDocument();
    expect(costOf(/^Dwarf$/).getByText(/cost 1 · 0\/4/)).toBeInTheDocument();
  });

  it("confirms a kit-on party and reports variants: { extensionKit: true }", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} kitToggle />);
    fireEvent.click(screen.getByRole("checkbox", { name: /extension kit/i }));
    fireEvent.click(screen.getByRole("button", { name: /add witch/i })); // cost 5
    fireEvent.click(screen.getByRole("button", { name: /add wolf/i }));  // cost 1 -> 6 total
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([18, 20], "yellow", { extensionKit: true });
  });

  it("toggling the kit back off drops any kit-only picks and reverts costs (byte-identity kit-off)", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} kitToggle />);
    const toggle = screen.getByRole("checkbox", { name: /extension kit/i });
    fireEvent.click(toggle); // on
    fireEvent.click(screen.getByRole("button", { name: /add witch/i }));
    fireEvent.click(toggle); // off again
    expect(screen.queryByRole("button", { name: /add witch/i })).toBeNull();
    expect(costOf(/^Ogre$/).getByText(/cost 5 · 0\/3/)).toBeInTheDocument(); // back to base cost
    fireEvent.click(screen.getByRole("button", { name: /add hero/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([0], "yellow"); // no trailing variants arg — byte-identical call shape
  });

  it("labels the confirm button 'Enter the cave' with no pick count (MSW, 2026-07-28)", () => {
    render(<PartySelect onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: "Enter the cave" })).toBeInTheDocument();
  });

  it("offers a Back option when a handler is provided, and none otherwise", () => {
    const onBack = vi.fn();
    const { rerender } = render(<PartySelect onConfirm={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender(<PartySelect onConfirm={() => {}} />); // the MP draft passes no handler
    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
  });
});

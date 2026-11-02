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
  it("does not dim the Magic Shield when borne by an eligible member (Man, US-23)", () => {
    const s = partyState(); // Man (idx 0) + Dwarf (idx 1)
    s.party[0]!.treasure.push(20); // Man carries and bears the Shield
    s.party[0]!.borne = [20];
    render(<PartyPanel state={s} onClose={() => {}} />);
    const live = screen.getByRole("img", { name: /magic shield \(borne\)$/i });
    expect(live.className).not.toContain("inert");
  });

  it("marks the Shield inert when borne by a Dwarf (not Man/Woman/Hero/W-Hero)", () => {
    const s = partyState(); // Man (idx 0) + Dwarf (idx 1)
    s.party[1]!.treasure.push(20); // the Dwarf carries and bears the Shield
    s.party[1]!.borne = [20];
    render(<PartyPanel state={s} onClose={() => {}} />);
    const inert = screen.getByRole("img", { name: /magic shield \(borne\) \(inert\)/i });
    expect(inert.className).toContain("inert");
    expect(inert.title).toMatch(/inert — needs a man, woman, hero, or w-hero/i);
  });

  it("shows a large floating preview while an item is hovered, and hides it on leave", () => {
    render(<PartyPanel state={partyState()} onClose={() => {}} />);
    const gold = screen.getByRole("img", { name: /^gold$/i });
    expect(document.querySelector(".scv-pp-preview")).toBeNull();
    fireEvent.mouseEnter(gold);
    const preview = document.querySelector(".scv-pp-preview img");
    expect(preview).not.toBeNull();
    expect(preview!.getAttribute("src")).toBe("/gold.png");
    fireEvent.mouseLeave(gold);
    expect(document.querySelector(".scv-pp-preview")).toBeNull();
  });

  it("lists living members first", () => {
    const s = newGame(1, [5, 6]); // Man (idx 0) + Woman (idx 1)
    s.party[0]!.status = 2; // Man turned to stone
    render(<PartyPanel state={s} onClose={() => {}} />);
    const names = [...document.querySelectorAll(".scv-pp-name")].map((n) => n.textContent);
    expect(names[0]).toMatch(/woman/i); // the living Woman renders before the petrified Man
  });

  it("shows a befriended member with the same 'ally' badge as the roster", () => {
    const s = newGame(1, [5, 7]);
    s.party[1]!.status = 1; // Dwarf befriended → ally
    render(<PartyPanel state={s} onClose={() => {}} />);
    const badge = document.querySelector(".scv-pp-badge.ally");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("ally");
  });

  it("shows an inverted Dragon card for each dragon slain single-handed", () => {
    const s = newGame(1, [0]); // a lone Hero
    s.party[0]!.dragonKills = 2;
    render(<PartyPanel state={s} onClose={() => {}} />);
    const trophies = document.querySelectorAll(".scv-pp-item.dragon-slain");
    expect(trophies).toHaveLength(2);
    expect(trophies[0]!.getAttribute("title")).toMatch(/dragon-slayer/i);
  });

  it("shows the Elixir's permanent bonus on the member, and no 'empty-handed' beside it", () => {
    const s = newGame(1, [0]); // a lone Hero, empty-handed
    s.party[0]!.fsBonus = 2;
    render(<PartyPanel state={s} onClose={() => {}} />);
    const chip = document.querySelector(".scv-pp-item.award-fs");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe("+2");
    expect(chip!.getAttribute("title")).toMatch(/elixir.*\+2 fighting strength/i);
    expect(screen.queryByText("empty-handed")).toBeNull();
  });

  it("still says empty-handed when a member has neither items nor awards", () => {
    render(<PartyPanel state={newGame(1, [0])} onClose={() => {}} />);
    expect(screen.getByText("empty-handed")).toBeInTheDocument();
    expect(document.querySelector(".scv-pp-item.award-fs")).toBeNull();
  });

  it("only shows: there is no control to move, wield or drop treasure", () => {
    render(<PartyPanel state={partyState()} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /move here|drop here|bear|stow/i })).toBeNull();
    expect(screen.getByText(/open the item from the Inventory/i)).toBeInTheDocument();
  });

  it("renders a kit party member and their carried kit treasure without crashing (SC-EXT-29)", () => {
    // Witch (18) + Wolf (20) — only legal kit-on. Before the ALL_CREATURES/ALL_TREASURES fix this
    // panel crashed the instant a kit-on party was opened (CREATURES[18] is undefined).
    const s = newGame(1, [18, 20], { extensionKit: true });
    s.party[0]!.treasure.push(16); // Holy Water (kit artifact, id 16)
    render(<PartyPanel state={s} onClose={() => {}} />);
    expect(screen.getByText("Witch")).toBeInTheDocument();
    expect(screen.getByText("Wolf")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^holy water$/i })).toBeInTheDocument();
  });

  it("shows a static '10×?' glyph on a carried Idol, never a resolved point value mid-game (SC-EXT-29/US-25)", () => {
    const s = newGame(1, [18, 20], { extensionKit: true });
    s.party[0]!.treasure.push(18); // Idol (heavy treasure, id 18)
    render(<PartyPanel state={s} onClose={() => {}} />);
    expect(screen.getByText("10×?")).toBeInTheDocument();
  });
});

describe("PartyPanel — sizing up the party", () => {
  it("shows each member's printed strength and magic, and a total for those able to fight", () => {
    const s = newGame(1, [4, 7]); // Priest (FS 2, MP 2) + Dwarf (FS 1)
    render(<PartyPanel state={s} onClose={() => {}} />);
    expect(screen.getByText(/^strength 1$/)).toBeInTheDocument();
    expect(screen.getByText(/^strength 2 · magic 2$/)).toBeInTheDocument();
    expect(screen.getByTestId("pp-total")).toHaveTextContent(/2 members able to fight · printed strength 3 · magic 2/);
  });

  it("leaves a petrified member out of the total", () => {
    const s = newGame(1, [4, 7]);
    s.party[0]!.status = 2; // the Priest, so the magic drops out too
    render(<PartyPanel state={s} onClose={() => {}} />);
    expect(screen.getByTestId("pp-total")).toHaveTextContent(/1 member able to fight · printed strength 1/);
    expect(screen.getByTestId("pp-total")).not.toHaveTextContent(/magic/);
  });
});

describe("PartyPanel — the Sibyl (SC-SIB-5)", () => {
  it("notes the Sibyl travelling with the party, and shows nothing without her", () => {
    const s = partyState();
    const { rerender } = render(<PartyPanel state={s} onClose={() => {}} />);
    expect(screen.queryByTestId("pp-sibyl")).toBeNull();
    rerender(<PartyPanel state={{ ...s, hasSibyl: true }} onClose={() => {}} />);
    expect(screen.getByTestId("pp-sibyl")).toHaveTextContent(/sibyl/i);
  });
});

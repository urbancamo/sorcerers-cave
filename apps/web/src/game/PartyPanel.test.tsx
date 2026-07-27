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
  it("offers Bear for a borneable item, Stow once borne, and neither for plain treasure", () => {
    const dispatch = vi.fn();
    const s = partyState();
    s.party[0]!.treasure.push(3); // Magic Sword — borneable
    const { rerender } = render(<PartyPanel state={s} dispatch={dispatch} onClose={() => {}} />);

    // Plain Gold: no bear/stow control.
    fireEvent.click(screen.getByRole("button", { name: /^gold$/i }));
    expect(screen.queryByRole("button", { name: /bear \(wield\)/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // The Sword offers Bear; dispatch carries the setBorne action.
    fireEvent.click(screen.getByRole("button", { name: /^magic sword$/i }));
    fireEvent.click(screen.getByRole("button", { name: /bear \(wield\)/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setBorne", mi: 0, idx: 1, borne: true });

    // Once borne it is marked and offers Stow instead.
    const borneState = structuredClone(s);
    borneState.party[0]!.borne = [3];
    rerender(<PartyPanel state={borneState} dispatch={dispatch} onClose={() => {}} />);
    const sword = screen.getByRole("button", { name: /magic sword \(borne\)/i });
    expect(sword.className).toContain("borne");
    fireEvent.click(sword);
    fireEvent.click(screen.getByRole("button", { name: /stow \(carry\)/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setBorne", mi: 0, idx: 1, borne: false });
  });

  it("does not dim the Magic Shield when borne by an eligible member (Man, US-23)", () => {
    const s = partyState(); // Man (idx 0) + Dwarf (idx 1)
    s.party[0]!.treasure.push(20); // Man carries and bears the Shield
    s.party[0]!.borne = [20];
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    const live = screen.getByRole("button", { name: /magic shield \(borne\)$/i });
    expect(live.className).not.toContain("inert");
  });

  it("marks the Shield inert when borne by a Dwarf (not Man/Woman/Hero/W-Hero)", () => {
    const s = partyState(); // Man (idx 0) + Dwarf (idx 1)
    s.party[1]!.treasure.push(20); // the Dwarf carries and bears the Shield
    s.party[1]!.borne = [20];
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    const inert = screen.getByRole("button", { name: /magic shield \(borne\) \(inert\)/i });
    expect(inert.className).toContain("inert");
    expect(inert.title).toMatch(/inert — needs a man, woman, hero, or w-hero/i);
  });

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

  it("shows a befriended member with the same 'ally' badge as the roster", () => {
    const s = newGame(1, [5, 7]);
    s.party[1]!.status = 1; // Dwarf befriended → ally
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    const badge = document.querySelector(".scv-pp-badge.ally");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("ally");
  });

  it("shows an inverted Dragon card for each dragon slain single-handed", () => {
    const s = newGame(1, [0]); // a lone Hero
    s.party[0]!.dragonKills = 2;
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    const trophies = document.querySelectorAll(".scv-pp-item.dragon-slain");
    expect(trophies).toHaveLength(2);
    expect(trophies[0]!.getAttribute("title")).toMatch(/dragon-slayer/i);
  });

  it("is view-only during a fight", () => {
    const s = partyState();
    s.phase = "fight";
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/redistributed during a fight/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^gold$/i })).toBeDisabled();
  });

  it("renders a kit party member and their carried kit treasure without crashing (SC-EXT-29)", () => {
    // Witch (18) + Wolf (20) — only legal kit-on. Before the ALL_CREATURES/ALL_TREASURES fix this
    // panel crashed the instant a kit-on party was opened (CREATURES[18] is undefined).
    const s = newGame(1, [18, 20], { extensionKit: true });
    s.party[0]!.treasure.push(16); // Holy Water (kit artifact, id 16)
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Witch")).toBeInTheDocument();
    expect(screen.getByText("Wolf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^holy water$/i })).toBeInTheDocument();
  });

  it("shows a static '10×?' glyph on a carried Idol, never a resolved point value mid-game (SC-EXT-29/US-25)", () => {
    const s = newGame(1, [18, 20], { extensionKit: true });
    s.party[0]!.treasure.push(18); // Idol (heavy treasure, id 18)
    render(<PartyPanel state={s} dispatch={() => {}} onClose={() => {}} />);
    expect(screen.getByText("10×?")).toBeInTheDocument();
  });
});

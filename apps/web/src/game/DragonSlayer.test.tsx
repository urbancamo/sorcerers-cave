import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { CardArt } from "../data/manifest";
import { DragonSlayer } from "./DragonSlayer";
import type { DragonSlayerView } from "./dragonSlayerView";

const first: DragonSlayerView = {
  title: "Dragon-slayer!",
  headline: "Your Giant has felled a dragon single-handed!",
  detail: "The dragon's card is turned and kept with its slayer — +1 fighting strength, for ever after.",
  kills: 1,
};
const dragonArt: CardArt = { category: "creature", entityId: 10, cardId: "dragon-1", name: "Dragon", file: "/assets/cards/dragon.png" };

describe("DragonSlayer", () => {
  it("shows the rousing text and the dragon card, and Continue dismisses it", () => {
    const onContinue = vi.fn();
    render(<DragonSlayer view={first} cards={[dragonArt]} onContinue={onContinue} />);
    expect(screen.getByRole("dialog", { name: /dragon-slayer/i })).toBeInTheDocument();
    expect(screen.getByText("Dragon-slayer!")).toBeInTheDocument();
    expect(screen.getByText(first.headline)).toBeInTheDocument();
    expect(screen.getByText(/\+1 fighting strength/)).toBeInTheDocument();
    expect(screen.getByAltText("Dragon")).toHaveAttribute("src", "/assets/cards/dragon.png");
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("flips the card (the animation hook) and still renders without card art", () => {
    render(<DragonSlayer view={first} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByTestId("slayer-dragon")).toHaveClass("scv-slayer-flip");
    expect(screen.getByText("Dragon")).toBeInTheDocument(); // blank-card fallback names the dragon
  });

  it("shows a running tally chip only for a repeat kill", () => {
    const { rerender } = render(<DragonSlayer view={first} cards={[]} onContinue={vi.fn()} />);
    expect(screen.queryByTestId("slayer-tally")).toBeNull();
    rerender(<DragonSlayer view={{ ...first, kills: 3 }} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByTestId("slayer-tally")).toHaveTextContent("×3");
  });
});

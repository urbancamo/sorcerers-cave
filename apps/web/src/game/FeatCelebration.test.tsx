import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { CardArt } from "../data/manifest";
import { FeatCelebration } from "./FeatCelebration";
import type { FeatView } from "./feats";

const dragon: FeatView = {
  id: "dragon-slain", title: "Dragon-slayer!", motion: "flip",
  headline: "Your Giant has felled a dragon single-handed!",
  detail: "The dragon's card is turned and kept with its slayer — +1 fighting strength, for ever after.",
  card: { category: "creature", entityId: 10, name: "Dragon" },
};
const ruby: FeatView = {
  id: "ruby-wrested", title: "The Lost Ruby!", motion: "rise",
  headline: "You wrest the Lost Ruby from the guardian statue!", detail: "A jewel of great price — +20 points.",
  card: { category: "treasure", entityId: 11, name: "Lost Ruby" },
};
const art = (category: CardArt["category"], entityId: number, file: string): CardArt =>
  ({ category, entityId, cardId: `${category}-${entityId}`, name: "x", file });

describe("FeatCelebration", () => {
  it("shows the wording and the card the feat names, and Continue dismisses it", () => {
    const onContinue = vi.fn();
    render(<FeatCelebration view={dragon} cards={[art("creature", 10, "/assets/dragon.png"), art("treasure", 10, "/assets/wrong.png")]} onContinue={onContinue} />);
    expect(screen.getByRole("dialog", { name: /celebration/i })).toBeInTheDocument();
    expect(screen.getByText("Dragon-slayer!")).toBeInTheDocument();
    expect(screen.getByText(dragon.headline)).toBeInTheDocument();
    expect(screen.getByText(/\+1 fighting strength/)).toBeInTheDocument();
    expect(screen.getByAltText("Dragon")).toHaveAttribute("src", "/assets/dragon.png"); // creature 10, not treasure 10
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("looks the card up by the feat's own category (a treasure feat shows the treasure card)", () => {
    render(<FeatCelebration view={ruby} cards={[art("creature", 11, "/assets/sorcerer.png"), art("treasure", 11, "/assets/ruby.png")]} onContinue={vi.fn()} />);
    expect(screen.getByAltText("Lost Ruby")).toHaveAttribute("src", "/assets/ruby.png");
  });

  it("uses the feat's motion: flip for a trophy, rise for a prize", () => {
    const { rerender } = render(<FeatCelebration view={dragon} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByTestId("feat-card")).toHaveClass("scv-feat-flip");
    rerender(<FeatCelebration view={ruby} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByTestId("feat-card")).toHaveClass("scv-feat-rise");
  });

  it("still renders without card art, naming the card", () => {
    render(<FeatCelebration view={ruby} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByText("Lost Ruby")).toBeInTheDocument();
  });

  it("shows a running tally chip only when the feat has one", () => {
    const { rerender } = render(<FeatCelebration view={dragon} cards={[]} onContinue={vi.fn()} />);
    expect(screen.queryByTestId("feat-tally")).toBeNull();
    rerender(<FeatCelebration view={{ ...dragon, tally: 3 }} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByTestId("feat-tally")).toHaveTextContent("×3");
  });
});

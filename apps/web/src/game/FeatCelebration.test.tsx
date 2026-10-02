import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// The grand variant mounts a particle canvas; jsdom has no 2D context, so stub one (and the frame loop).
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const sorcerer: FeatView = {
  id: "sorcerer-slain", title: "The Sorcerer falls!", motion: "fall", badge: "+30",
  headline: "You have vanquished the master of the cave!", detail: "A feat few adventurers ever achieve — (+30 to your final score)",
  aside: "The Sorcerer's curses die with him — every curse upon your party is lifted.",
  card: { category: "creature", entityId: 11, name: "The Sorcerer" },
};

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

  it("shows a chip on the card only when the feat has a badge", () => {
    const { rerender } = render(<FeatCelebration view={dragon} cards={[]} onContinue={vi.fn()} />);
    expect(screen.queryByTestId("feat-badge")).toBeNull();
    rerender(<FeatCelebration view={{ ...dragon, badge: "×3" }} cards={[]} onContinue={vi.fn()} />);
    expect(screen.getByTestId("feat-badge")).toHaveTextContent("×3");
  });
  describe("the grand finale (fall)", () => {
    it("adds the rays, the flash and a particle canvas that the ordinary feats do not have", () => {
      const { container, rerender } = render(<FeatCelebration view={sorcerer} cards={[]} onContinue={vi.fn()} />);
      expect(screen.getByTestId("feat-card")).toHaveClass("scv-feat-fall");
      expect(screen.getByTestId("feat-celebration").querySelector(".scv-feat-panel")).toHaveClass("scv-feat-grand");
      expect(container.querySelector(".scv-feat-rays")).not.toBeNull();
      expect(container.querySelector(".scv-feat-flash")).not.toBeNull();
      expect(container.querySelector("canvas")).not.toBeNull();
      rerender(<FeatCelebration view={dragon} cards={[]} onContinue={vi.fn()} />);
      expect(container.querySelector(".scv-feat-rays")).toBeNull();
      expect(container.querySelector(".scv-feat-flash")).toBeNull();
      expect(container.querySelector("canvas")).toBeNull();
    });

    it("lights the title letter by letter yet keeps it readable as one title", () => {
      const { container } = render(<FeatCelebration view={sorcerer} cards={[]} onContinue={vi.fn()} />);
      expect(screen.getByLabelText("The Sorcerer falls!")).toBeInTheDocument();
      expect(container.querySelectorAll(".scv-feat-letter").length).toBe("The Sorcerer falls!".length);
      expect(container.querySelector(".scv-feat-letter")!.getAttribute("aria-hidden")).toBe("true");
    });

    it("shows the +30 chip and the curse line after the detail", () => {
      render(<FeatCelebration view={sorcerer} cards={[]} onContinue={vi.fn()} />);
      expect(screen.getByTestId("feat-badge")).toHaveTextContent("+30");
      expect(screen.getByText(sorcerer.aside!)).toBeInTheDocument();
    });

    it("keeps Continue available at once, so the long sequence never traps the player", () => {
      const onContinue = vi.fn();
      render(<FeatCelebration view={sorcerer} cards={[]} onContinue={onContinue} />);
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
      expect(onContinue).toHaveBeenCalledOnce();
    });

    it("drops the particles under reduced motion but keeps the wording", () => {
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
      const { container } = render(<FeatCelebration view={sorcerer} cards={[]} onContinue={vi.fn()} />);
      expect(container.querySelector("canvas")).toBeNull();
      expect(screen.getByText(sorcerer.headline)).toBeInTheDocument();
    });
  });
});

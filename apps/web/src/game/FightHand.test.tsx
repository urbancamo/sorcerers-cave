import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FightHand } from "./FightHand";

const cards = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} data-testid={`c${i}`} className="scv-fc" />);

describe("FightHand", () => {
  it.each([2, 8, 20])("lays %i cards out in one row of slots, with no wrapping or scroll container", (n) => {
    render(<FightHand testId="hand">{cards(n)}</FightHand>);
    const hand = screen.getByTestId("hand");
    expect(hand.children).toHaveLength(n);
    expect(hand.classList.contains("scv-hand")).toBe(true);
    // every card is inside its own slot, in hand order
    expect([...hand.children].every((slot, i) => slot.contains(screen.getByTestId(`c${i}`)))).toBe(true);
  });

  it("gives the last card its full width and every other card the same stride", () => {
    render(<FightHand testId="hand">{cards(4)}</FightHand>);
    const slots = [...screen.getByTestId("hand").children] as HTMLElement[];
    const widths = slots.map((s) => parseFloat(s.style.width));
    expect(widths.slice(0, -1).every((w) => w === widths[0])).toBe(true);
    expect(widths[3]).toBe(116);   // the last slot is one card wide; with no width measured (jsdom) the others take the natural stride
    expect(widths[0]).toBe(126);
  });

  it("stacks each card above the one to its left, so the right-hand card overlaps its neighbour", () => {
    render(<FightHand testId="hand">{cards(3)}</FightHand>);
    const z = ([...screen.getByTestId("hand").children] as HTMLElement[]).map((s) => Number(s.style.zIndex));
    expect(z).toEqual([...z].sort((a, b) => a - b));
  });
});

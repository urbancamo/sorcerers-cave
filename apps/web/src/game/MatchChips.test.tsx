import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MatchChip } from "@sorcerers-cave/engine";
import { MatchChips } from "./MatchChips";

const chip = (label: string, value: number, side: MatchChip["side"] = "party", roll = false): MatchChip => ({ label, value, side, roll });

describe("MatchChips", () => {
  it("shows a side's chips with signed values, telling strength from die chips", () => {
    render(<MatchChips side="party" testId="p" chips={[chip("Magic Sword · Man", 1), chip("Magic Shield · Wizard", -3), chip("The Ring", 1, "party", true), chip("Ogre note", 5, "strangers")]} />);
    const row = screen.getByTestId("p");
    expect(row).toHaveTextContent("Magic Sword · Man +1");
    expect(row).toHaveTextContent("Magic Shield · Wizard −3");
    expect(screen.getByText("The Ring +1")).toHaveAttribute("title", "applied to the die roll");
    expect(screen.getByText("Magic Sword · Man +1")).toHaveAttribute("title", "included in the strength");
    expect(row).not.toHaveTextContent("Ogre note");              // the strangers' chips belong under the strangers
  });

  it("puts the match-wide notes (the Eye) on the party's side only, without a number", () => {
    const chips = [chip("Eye of God — magic & artefacts nullified", 0, "both")];
    const { rerender } = render(<MatchChips side="party" testId="p" chips={chips} />);
    expect(screen.getByTestId("p")).toHaveTextContent("Eye of God — magic & artefacts nullified");
    expect(screen.getByTestId("p")).not.toHaveTextContent("+0");
    rerender(<MatchChips side="strangers" testId="p" chips={chips} />);
    expect(screen.queryByTestId("p")).toBeNull();
  });

  it("folds chips past four into '+N more', which expands and folds again", () => {
    const six = Array.from({ length: 6 }, (_, i) => chip(`Chip ${i}`, 1));
    render(<MatchChips side="party" testId="p" chips={six} />);
    expect(screen.queryByText(/Chip 4/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getByText(/Chip 5/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "fewer" }));
    expect(screen.queryByText(/Chip 4/)).toBeNull();
  });

  it("draws nothing when a side has no chips", () => {
    const { container } = render(<MatchChips side="strangers" chips={[chip("Only the party", 1)]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

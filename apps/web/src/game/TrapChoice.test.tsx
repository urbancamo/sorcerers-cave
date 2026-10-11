import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TrapChoice } from "./TrapChoice";

describe("TrapChoice", () => {
  it("is a dialog offering exactly the two choices", () => {
    render(<TrapChoice dispatch={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: /a trap/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Guided past the trap", "Fall through the trap"]);
  });

  it("'Guided past the trap' dispatches avoidTrap", () => {
    const dispatch = vi.fn();
    render(<TrapChoice dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /guided past the trap/i }));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "avoidTrap" });
  });

  it("'Fall through the trap' dispatches fallThroughTrap", () => {
    const dispatch = vi.fn();
    render(<TrapChoice dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: /fall through the trap/i }));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "fallThroughTrap" });
  });

  it("says what each choice means, including the surprise and the one-way drop", () => {
    render(<TrapChoice dispatch={vi.fn()} />);
    expect(screen.getByText(/dwarf/i)).toBeInTheDocument();
    expect(screen.getByText(/surprise/i)).toBeInTheDocument();
    // The area below may hold no strangers at all, so the surprise is conditional on there being some.
    expect(screen.getByText(/if there are strangers below/i)).toBeInTheDocument();
    expect(screen.queryByText(/the strangers below will/i)).toBeNull();
    expect(screen.getByText(/cannot return/i)).toBeInTheDocument();
  });
});

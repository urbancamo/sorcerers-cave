import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PartySelect } from "./PartySelect";

describe("PartySelect", () => {
  it("confirms a budget-valid party and reports the picks", () => {
    const onConfirm = vi.fn();
    render(<PartySelect onConfirm={onConfirm} />);
    // add one Woman (cost 2) — within the budget of 6
    fireEvent.click(screen.getByRole("button", { name: /add Woman/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Enter the cave/i }));
    expect(onConfirm).toHaveBeenCalledWith([6]);
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

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RestartTestModal } from "./RestartTestModal";

describe("RestartTestModal", () => {
  it("offers the three choices and calls the matching handler", () => {
    const [same, fresh, cancel] = [vi.fn(), vi.fn(), vi.fn()];
    render(<RestartTestModal onSameParty={same} onNewParty={fresh} onCancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Restart with Same Party" }));
    fireEvent.click(screen.getByRole("button", { name: "Select New Party" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect([same, fresh, cancel].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

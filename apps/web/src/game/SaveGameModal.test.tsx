import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SaveGameModal } from "./SaveGameModal";

describe("SaveGameModal", () => {
  it("shows the four-letter code and returns to the menu on dismiss", () => {
    const onClose = vi.fn();
    render(<SaveGameModal code="WXYZ" onClose={onClose} />);
    expect(screen.getByTestId("save-code")).toHaveTextContent("WXYZ");
    fireEvent.click(screen.getByRole("button", { name: /back to menu/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

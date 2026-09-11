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

  it("does not show replay/debug-bundle buttons unless their handlers are supplied", () => {
    render(<SaveGameModal code="WXYZ" onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /view replay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy debug bundle/i })).toBeNull();
  });

  it("calls onViewReplay when its button is clicked", () => {
    const onViewReplay = vi.fn();
    render(<SaveGameModal code="WXYZ" onClose={() => {}} onViewReplay={onViewReplay} />);
    fireEvent.click(screen.getByRole("button", { name: /view replay/i }));
    expect(onViewReplay).toHaveBeenCalledOnce();
  });

  it("copies the debug bundle and shows a confirmation on click", async () => {
    const onCopyDebugBundle = vi.fn().mockResolvedValue(undefined);
    render(<SaveGameModal code="WXYZ" onClose={() => {}} onCopyDebugBundle={onCopyDebugBundle} />);
    fireEvent.click(screen.getByRole("button", { name: /copy debug bundle/i }));
    expect(onCopyDebugBundle).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: /copied/i })).toBeTruthy();
  });

  it("overrides heading, message, and the close button's label (2026-09-11 restore flow)", () => {
    const onClose = vi.fn();
    render(
      <SaveGameModal
        code="WXYZ"
        onClose={onClose}
        heading="Scenario restored"
        message="New code for this forked scenario:"
        closeLabel="Continue playing"
      />,
    );
    expect(screen.getByText("Scenario restored")).toBeTruthy();
    expect(screen.getByText("New code for this forked scenario:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue playing/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

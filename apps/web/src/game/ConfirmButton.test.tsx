import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmButton, ConfirmPicker } from "./ConfirmButton";

describe("ConfirmButton", () => {
  it("shows the plain label first, then a confirm prompt before acting", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Descend the chasm" confirmText="You cannot return this way." onConfirm={onConfirm} />);
    expect(screen.getByRole("button", { name: "Descend the chasm" })).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-prompt")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Descend the chasm" }));
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent("You cannot return this way.");
    expect(onConfirm).not.toHaveBeenCalled(); // the first tap only reveals the confirm — it never acts alone
  });

  it("only calls onConfirm after the second tap", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Draw from the well" confirmText="Draw 1 card." onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw from the well" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels back to the plain label without acting", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Enter the crypt" confirmText="A trap here cannot be avoided." onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter the crypt" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enter the crypt" })).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-prompt")).toBeNull();
  });
});

describe("ConfirmPicker", () => {
  const options = [{ label: "Hero", value: 0 }, { label: "Man", value: 1 }];

  it("shows a dropdown first, then a confirm prompt naming the picked option", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmPicker
        rowLabel="Bell Rope"
        placeholder="Pull the bell rope…"
        options={options}
        confirmText={(v) => `Pull it with ${options[v]!.label}?`}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByTestId("confirm-prompt")).toBeNull();
    fireEvent.change(screen.getByLabelText("Bell Rope"), { target: { value: "1" } });
    expect(screen.getByTestId("confirm-prompt")).toHaveTextContent("Pull it with Man?");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the picked value only after Confirm, and resets on Cancel", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmPicker
        rowLabel="Bell Rope"
        placeholder="Pull the bell rope…"
        options={options}
        confirmText={(v) => `Pull it with ${options[v]!.label}?`}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText("Bell Rope"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(0);

    fireEvent.change(screen.getByLabelText("Bell Rope"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1); // the cancelled pick never confirmed
    expect(screen.getByLabelText("Bell Rope")).toBeInTheDocument(); // back to the dropdown
  });
});

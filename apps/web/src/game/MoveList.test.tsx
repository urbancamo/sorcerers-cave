import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MoveList } from "./MoveList";
import type { Move } from "../view/ports";

describe("MoveList", () => {
  const moves: Move[] = [
    { dir: "N", kind: "undrawn", target: { level: 1, col: 50, row: 49 } },
    { dir: "D", kind: "stair", target: { level: 2, col: 50, row: 50 } },
  ];
  it("renders a button per move and fires onMove with the dir", () => {
    const onMove = vi.fn();
    render(<MoveList moves={moves} onMove={onMove} />);
    expect(screen.getByRole("button", { name: /N/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /D/ }));
    expect(onMove).toHaveBeenCalledWith("D");
  });
  it("shows a hint when there are no moves", () => {
    render(<MoveList moves={[]} onMove={() => {}} />);
    expect(screen.getByText(/no moves/i)).toBeInTheDocument();
  });
});

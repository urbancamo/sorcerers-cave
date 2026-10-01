import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { GameEvent } from "@sorcerers-cave/engine";
import { DeadEndSwapBadge, announceDeadEndSwaps } from "./DeadEndSwapBadge";

const swap = (removed: number, drawn: number) => ({ type: "deadEndCardSwapped", removed, drawn }) as GameEvent;

describe("DeadEndSwapBadge", () => {
  afterEach(() => vi.useRealTimers());

  it("renders nothing until a swap is announced", () => {
    render(<DeadEndSwapBadge />);
    expect(screen.queryByTestId("dead-end-swap-badge")).toBeNull();
  });

  it("ignores events that contain no swap", () => {
    render(<DeadEndSwapBadge />);
    act(() => announceDeadEndSwaps([{ type: "deadEnd", dir: 0 } as GameEvent]));
    expect(screen.queryByTestId("dead-end-swap-badge")).toBeNull();
  });

  it("shows one row per swap and stays until dismissed", () => {
    vi.useFakeTimers();
    render(<DeadEndSwapBadge />);
    act(() => announceDeadEndSwaps([swap(31, 175), swap(175, 40)]));
    expect(screen.getByTestId("dead-end-swap-badge").textContent).toMatch(/card swapped ×2/i);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId("dead-end-swap-badge")).toBeTruthy(); // sticky: no auto-hide
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("dead-end-swap-badge")).toBeNull();
  });

  it("a later swap replaces the one on screen", () => {
    render(<DeadEndSwapBadge />);
    act(() => announceDeadEndSwaps([swap(31, 175)]));
    act(() => announceDeadEndSwaps([swap(10, 20), swap(20, 30)]));
    expect(screen.getByTestId("dead-end-swap-badge").textContent).toMatch(/×2/);
  });
});

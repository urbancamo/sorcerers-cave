import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { GameEvent } from "@sorcerers-cave/engine";
import { DeadEndSwapBadge, announceDeadEndSwaps } from "./DeadEndSwapBadge";

const swap = (removed: number, drawn: number, reason?: "deadEnd" | "sealed") =>
  ({ type: "deadEndCardSwapped", removed, drawn, ...(reason ? { reason } : {}) }) as GameEvent;
const nvx = () => ({ type: "deadEndNoViableExits" }) as GameEvent;

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

  it("labels a dead-end rescue and a sealing-card swap differently; a missing reason means dead end", () => {
    render(<DeadEndSwapBadge />);
    act(() => announceDeadEndSwaps([swap(31, 175, "sealed"), swap(10, 20, "deadEnd"), swap(5, 6)]));
    const rows = screen.getByTestId("dead-end-swap-badge").textContent ?? "";
    expect(rows.match(/Sealing card:/g)).toHaveLength(1);
    expect(rows.match(/Dead end:/g)).toHaveLength(2);
    expect(rows).toMatch(/back in pack → drew/);
  });

  it("shows the no-viable-exits warning, alone or with swaps", () => {
    render(<DeadEndSwapBadge />);
    act(() => announceDeadEndSwaps([nvx()]));
    let text = screen.getByTestId("dead-end-swap-badge").textContent ?? "";
    expect(text).toMatch(/no viable exits/i);
    expect(text).not.toMatch(/card swapped/i);
    act(() => announceDeadEndSwaps([swap(1, 2, "deadEnd"), nvx()]));
    text = screen.getByTestId("dead-end-swap-badge").textContent ?? "";
    expect(text).toMatch(/card swapped/i);
    expect(text).toMatch(/can no longer explore/i);
  });
});

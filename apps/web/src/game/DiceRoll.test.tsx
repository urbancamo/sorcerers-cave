import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DiceRoll } from "./DiceRoll";

describe("DiceRoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tumbles, settles a single die, then reveals the outcome and Continue", () => {
    const onContinue = vi.fn();
    render(
      <DiceRoll title="Reaction roll" lanes={[{ enemy: { value: 4 } }]} message="Friendly!" tone="good" onContinue={onContinue} />,
    );

    // Mid-tumble: die is showing but the outcome/Continue are gated behind the settle.
    expect(screen.getByTestId("die")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();

    // Run the full tumble (11 ticks × 80ms).
    act(() => vi.advanceTimersByTime(11 * 80));

    expect(screen.getByTestId("die")).toHaveTextContent("4");
    expect(screen.getByText("Friendly!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows party and enemy dice side by side for a combat lane", () => {
    render(
      <DiceRoll
        title="Combat round"
        lanes={[
          { party: { name: "Man", value: 5, total: 8, outcome: "win" }, enemy: { name: "Goblin", value: 2, total: 4, outcome: "lose" } },
        ]}
        message="Victory — the foes have fallen!"
        tone="good"
        onContinue={() => {}}
      />,
    );
    act(() => vi.advanceTimersByTime(11 * 80));

    const dice = screen.getAllByTestId("die");
    expect(dice).toHaveLength(2);
    expect(dice[0]).toHaveTextContent("2"); // foe on the left (matches the matchup panel)
    expect(dice[1]).toHaveTextContent("5"); // party on the right
    expect(screen.getByText("Man")).toBeInTheDocument();
    expect(screen.getByText("Goblin")).toBeInTheDocument();
    expect(screen.getByText("vs")).toBeInTheDocument();
  });
});

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

  it("puts the party on the left when asked (the revised fight dialog)", () => {
    render(
      <DiceRoll
        title="Combat round"
        lanes={[{ party: { name: "Man", value: 5 }, enemy: { name: "Goblin", value: 2 } }]}
        tone="good"
        partyLeft
        onContinue={() => {}}
      />,
    );
    act(() => vi.advanceTimersByTime(11 * 80));
    const dice = screen.getAllByTestId("die");
    expect(dice[0]).toHaveTextContent("5");
    expect(dice[1]).toHaveTextContent("2");
  });

  describe("when the roll has stakes", () => {
    const props = { title: "The Whirlpool", lanes: [{ enemy: { value: 2 } }], message: "Dragged under!", tone: "bad" as const, stakes: "On a 1 or 2 the whirlpool drags the party down." };

    it("waits for the player's Roll the dice click before anything tumbles or is revealed", () => {
      render(<DiceRoll {...props} autoRoll={false} onContinue={() => {}} />);
      expect(screen.getByText(/drags the party down/)).toBeInTheDocument();
      expect(screen.getByTestId("die")).toHaveTextContent("?");
      expect(screen.getByTestId("die")).toHaveClass("waiting");   // still: the tumble animation is for after the click
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByTestId("die")).toHaveTextContent("?");           // nothing happens by itself
      expect(screen.queryByText("Dragged under!")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /roll the dice/i }));
      act(() => vi.advanceTimersByTime(11 * 80));
      expect(screen.getByTestId("die")).toHaveTextContent("2");
      expect(screen.getByTestId("die")).not.toHaveClass("waiting");
      expect(screen.getByText("Dragged under!")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /roll the dice/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
    });

    it("rolls at once, with no button, when the player has chosen to auto-roll", () => {
      render(<DiceRoll {...props} autoRoll onContinue={() => {}} />);
      expect(screen.queryByRole("button", { name: /roll the dice/i })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(11 * 80));
      expect(screen.getByTestId("die")).toHaveTextContent("2");
    });

    it("one click throws every die of a many-member roll together", () => {
      const lanes = [{ enemy: { name: "Hero", value: 1 } }, { enemy: { name: "Dwarf", value: 5 } }];
      render(<DiceRoll {...props} lanes={lanes} autoRoll={false} onContinue={() => {}} />);
      expect(screen.getAllByTestId("die").map((d) => d.textContent)).toEqual(["?", "?"]);
      fireEvent.click(screen.getByRole("button", { name: /roll the dice/i }));
      act(() => vi.advanceTimersByTime(11 * 80));
      expect(screen.getAllByTestId("die").map((d) => d.textContent)).toEqual(["1", "5"]);
    });
  });
});

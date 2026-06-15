import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GS_ESCAPED, GS_DEAD } from "@sorcerers-cave/engine";
import { HighScores, type LeaderboardRow } from "./HighScores";

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  _id: "x",
  name: "Anon",
  score: 0,
  outcome: GS_ESCAPED,
  party: [],
  createdAt: 0,
  ...over,
});

describe("HighScores", () => {
  it("shows a loading note while rows are undefined", () => {
    render(<HighScores rows={undefined} />);
    expect(screen.getByText(/loading high scores/i)).toBeInTheDocument();
  });

  it("shows an empty note when there are no scores", () => {
    render(<HighScores rows={[]} />);
    expect(screen.getByText(/no scores recorded yet/i)).toBeInTheDocument();
  });

  it("ranks rows and labels each outcome, marking the highlighted row", () => {
    const rows = [
      row({ _id: "a", name: "Alice", score: 40, outcome: GS_ESCAPED, party: [{ creatureId: 0, status: 0, dragonKills: 0, treasure: [] }] }),
      row({ _id: "b", name: "Bob", score: 0, outcome: GS_DEAD, party: [{ creatureId: 0, status: 3, dragonKills: 0, treasure: [] }] }),
    ];
    render(<HighScores rows={rows} highlightId="b" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Escaped")).toBeInTheDocument();
    expect(screen.getByText("Perished")).toBeInTheDocument();
    // Alice: 1 of 1 survives; Bob: 0 of 1.
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
    const bobRow = screen.getByText("Bob").closest("tr");
    expect(bobRow).toHaveClass("scv-hs-me");
  });

  it("clicks through a row to show the party & artifacts that left the cave, then back", () => {
    const rows = [
      row({
        _id: "a", name: "Alice", score: 55, outcome: GS_ESCAPED,
        party: [
          { creatureId: 0, status: 0, dragonKills: 1, treasure: [12, 1] }, // Hero with Charmed Flute + Gold
          { creatureId: 5, status: 3, dragonKills: 0, treasure: [] },        // Man, fallen
        ],
      }),
    ];
    render(<HighScores rows={rows} />);
    fireEvent.click(screen.getByText("Alice"));

    const detail = screen.getByTestId("hs-detail");
    expect(within(detail).getByText(/1 of 2 left the cave with 1 artifact/i)).toBeInTheDocument();
    expect(within(detail).getByText("Hero")).toBeInTheDocument();
    expect(within(detail).getByText("Charmed Flute")).toBeInTheDocument(); // artifact carried out
    expect(within(detail).getByText("Gold")).toBeInTheDocument();          // heavy treasure carried out
    expect(within(detail).getByText(/dragon-slayer/i)).toBeInTheDocument();
    expect(within(detail).getByText(/fallen/i)).toBeInTheDocument();        // the Man

    fireEvent.click(within(detail).getByRole("button", { name: /back to scores/i }));
    expect(screen.getByTestId("high-scores")).toBeInTheDocument(); // table again
  });
});

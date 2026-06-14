import { render, screen } from "@testing-library/react";
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
});

import { render, screen, fireEvent, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Scoreboard, type ScoreboardParty } from "./Scoreboard";

const parties: ScoreboardParty[] = [
  { seat: 0, name: "Alpha", color: "green", status: "exploring", members: [0], score: 60, depth: 2, turns: 12, kills: 3 },
  { seat: 1, name: "Beta", color: "blue", status: "left", members: [5], score: 142, depth: 1, turns: 22, kills: 9 },
];

test("ranks by score descending and highlights your row", () => {
  render(<Scoreboard parties={parties} youSeat={0} />);
  const rows = screen.getAllByTestId("sb-row");
  expect(within(rows[0]!).getByText("Beta")).toBeTruthy(); // 142 first
  expect(within(rows[1]!).getByText(/Alpha/)).toBeTruthy(); // 60 second
  expect(rows[1]!.className).toContain("me"); // seat 0 highlighted
});

test("shows live stats for in-maze parties and an outcome for finished ones", () => {
  render(<Scoreboard parties={parties} youSeat={0} />);
  expect(screen.getByText("Escaped")).toBeTruthy(); // Beta (status "left")
  expect(screen.getByText("In maze")).toBeTruthy(); // Alpha (status "exploring")
});

test("fires footer + row callbacks", () => {
  const onQuit = vi.fn(), onRowClick = vi.fn();
  render(<Scoreboard parties={parties} youSeat={0} onQuit={onQuit} onRowClick={onRowClick} />);
  fireEvent.click(screen.getByRole("button", { name: /quit to menu/i }));
  expect(onQuit).toHaveBeenCalled();
  fireEvent.click(screen.getAllByTestId("sb-row")[0]!);
  expect(onRowClick).toHaveBeenCalledWith(1); // Beta's seat
});

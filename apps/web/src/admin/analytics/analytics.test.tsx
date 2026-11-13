import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Summary = {
  totals: { games: number; solo: number; multi: number; escaped: number; dead: number; quit: number; meanEscapedScore: number | null };
  window: ReturnType<typeof windowOf>;
  windowSize: number;
};
const windowOf = () => ({
  n: 4,
  outcomes: { solo: { escaped: 2, dead: 1, quit: 0 }, multi: { escaped: 0, dead: 0, quit: 1 } },
  escapedScore: { mean: 150, median: 140, max: 210, meanTurns: 61 },
  scoreHistogram: [{ from: 100, to: 150, count: 1 }, { from: 200, to: 250, count: 1 }],
  perDay: [{ day: "2026-11-12", escaped: 1, dead: 1, quit: 0 }, { day: "2026-11-13", escaped: 1, dead: 0, quit: 1 }],
  deepest: [{ level: 1, count: 1 }, { level: 3, count: 3 }],
  dragonKills: [{ kills: 0, count: 4 }],
  membersLost: [{ lost: 0, count: 3 }, { lost: 2, count: 1 }],
  creatures: [{ id: 0, count: 3 }, { id: 7, count: 2 }],
  variants: { base: 3, extensionKit: 1, sibyl: 0 },
});

let summary: Summary | undefined;
let live: unknown[] | undefined;
let history: { results: unknown[]; status: string; loadMore: () => void };
const query = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (ref: string) => (ref === "a.summary" ? summary : ref === "a.live" ? live : undefined),
  usePaginatedQuery: (_ref: string, args: unknown) => { query(args); return history; },
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("../../../convex/_generated/api", () => ({ api: { analytics: { summary: "a.summary", history: "a.history", liveGames: "a.live" }, game: { replayByCode: "g.replay" } } }));
vi.mock("../../game/ReplayView", () => ({ ReplayView: () => <div>replay</div> }));
vi.mock("../../game/goldenGame", () => ({ goldenBundle: vi.fn() }));

import { AnalyticsTab } from "./AnalyticsTab";

beforeEach(() => {
  summary = { totals: { games: 4, solo: 3, multi: 1, escaped: 2, dead: 1, quit: 1, meanEscapedScore: 150 }, window: windowOf(), windowSize: 1000 };
  live = [];
  history = { results: [], status: "Exhausted", loadMore: vi.fn() };
  query.mockReset();
});

describe("Overview", () => {
  it("shows the headline tiles from the totals", () => {
    render(<AnalyticsTab />);
    expect(screen.getByText("Escape rate").parentElement).toHaveTextContent("50%");
    expect(screen.getByText("Death rate").parentElement).toHaveTextContent("25%");
    expect(screen.getByText("Games played").parentElement).toHaveTextContent("3 solo, 1 multiplayer parties");
    expect(screen.getByText("Median escaped score").parentElement).toHaveTextContent("140");
  });

  it("draws every chart and gives each a table view of its figures", () => {
    render(<AnalyticsTab />);
    for (const t of ["How games end", "Games per day", "Escaped scores", "Deepest level reached", "Dragons slain", "Members lost", "Starting parties", "Rules in play"]) {
      expect(screen.getByRole("img", { name: t })).toBeInTheDocument();
    }
    const parties = screen.getByRole("img", { name: "Starting parties" }).closest("figure")!;
    expect(within(parties).getAllByText("Hero").length).toBeGreaterThan(0); // creature ids become names
    expect(within(parties).getAllByText("Dwarf").length).toBeGreaterThan(0);
  });

  it("a stacked chart has a legend naming each outcome", () => {
    render(<AnalyticsTab />);
    const fig = screen.getByRole("img", { name: "How games end" }).closest("figure")!;
    for (const o of ["Escaped", "Died", "Quit"]) expect(within(fig).getAllByText(o).length).toBeGreaterThan(0);
  });

  it("a mark's hover tooltip carries its figure", () => {
    render(<AnalyticsTab />);
    const svg = screen.getByRole("img", { name: "Deepest level reached" });
    const hit = [...svg.querySelectorAll("rect")].find((r) => r.getAttribute("fill") === "transparent")!;
    fireEvent.mouseMove(hit, { clientX: 20, clientY: 20 });
    expect(screen.getByRole("status")).toHaveTextContent("Level 1: 1");
    fireEvent.mouseLeave(hit);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says so when nothing has been recorded", () => {
    summary = { totals: { games: 0, solo: 0, multi: 0, escaped: 0, dead: 0, quit: 0, meanEscapedScore: null }, window: { ...windowOf(), n: 0 }, windowSize: 1000 };
    render(<AnalyticsTab />);
    expect(screen.getByText(/no finished games recorded yet/i)).toBeInTheDocument();
  });
});

describe("Live games", () => {
  const open = () => { render(<AnalyticsTab />); fireEvent.click(screen.getByRole("tab", { name: "Live games" })); };
  it("explains an empty list", () => {
    open();
    expect(screen.getByText(/no games in progress/i)).toBeInTheDocument();
  });
  it("lists games with test games flagged", () => {
    live = [
      { id: "1", code: "LIVE", mode: "solo", lobby: null, testMode: false, turn: 9, level: 3, partySize: 3, score: 85, area: "Tunnel NE", activity: "Combat", parties: null, extensionKit: true, createdAt: 0, updatedAt: Date.now() },
      { id: "2", code: "TEST", mode: "solo", lobby: null, testMode: true, turn: 1, level: 1, partySize: 1, score: 20, area: "Gateway", activity: "Exploring", parties: null, extensionKit: false, createdAt: 0, updatedAt: Date.now() },
      { id: "3", code: "MULT", mode: "multi", lobby: "started", testMode: false, turn: 12, level: null, partySize: null, score: null, area: null, activity: null, parties: 2, extensionKit: false, createdAt: 0, updatedAt: Date.now() },
    ];
    open();
    const rows = within(screen.getByTestId("live-games")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("LIVE");
    expect(rows[0]).toHaveTextContent("Extension kit");
    expect(rows[0]).toHaveTextContent("85");
    expect(rows[0]).toHaveTextContent("Tunnel NE");
    expect(rows[0]).toHaveTextContent("Combat");
    expect(rows[1]).toHaveTextContent("Exploring");
    expect(rows[1]).toHaveTextContent("test");
    expect(rows[2]).toHaveTextContent("2 parties");
  });
});

describe("History", () => {
  const stat = (over: Record<string, unknown> = {}) => ({
    _id: "s1", gameId: "g1", seat: 0, mode: "solo", outcome: "escaped", score: 120, turn: 44, deepestLevel: 3, areas: 12, dragonKills: 0, membersLost: 0,
    partySize: 2, picks: [0, 7], extensionKit: false, sibyl: false, finishedAt: Date.now(), code: "ABCD", ...over,
  });
  const open = () => { render(<AnalyticsTab />); fireEvent.click(screen.getByRole("tab", { name: "History" })); };

  it("lists finished games with the starting party named and the outcome in words", () => {
    history = { results: [stat(), stat({ _id: "s2", outcome: "dead", score: 0, code: null, mode: "multi", seat: 1, picks: undefined })], status: "Exhausted", loadMore: vi.fn() };
    open();
    const rows = within(screen.getByTestId("history")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Hero, Dwarf");
    expect(rows[0]).toHaveTextContent("Escaped");
    expect(rows[1]).toHaveTextContent("Multi, seat 2");
    expect(rows[1]).toHaveTextContent("2 at the end");
    expect(within(rows[0]!).getByRole("button", { name: "Replay" })).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("button", { name: "Replay" })).toBeNull(); // no code, or not solo
  });

  it("sorts by any column, toggling direction on a second click", () => {
    history = { results: [stat({ _id: "a", score: 50, code: "BBBB" }), stat({ _id: "b", score: 200, code: "AAAA" }), stat({ _id: "c", score: 120, code: "CCCC" })], status: "Exhausted", loadMore: vi.fn() };
    open();
    const codes = () => within(screen.getByTestId("history")).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1]!.textContent);
    fireEvent.click(screen.getByRole("button", { name: /^Score/ }));
    expect(codes()).toEqual(["AAAA", "CCCC", "BBBB"]); // numbers start biggest-first
    fireEvent.click(screen.getByRole("button", { name: /^Score/ }));
    expect(codes()).toEqual(["BBBB", "CCCC", "AAAA"]);
    fireEvent.click(screen.getByRole("button", { name: /^Code/ }));
    expect(codes()).toEqual(["AAAA", "BBBB", "CCCC"]); // text starts A to Z
    expect(screen.getByRole("columnheader", { name: /^Code/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("the outcome filter narrows the query", () => {
    open();
    expect(query).toHaveBeenLastCalledWith({});
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "dead" } });
    expect(query).toHaveBeenLastCalledWith({ outcome: "dead" });
  });

  it("offers Load more only while there is more", () => {
    history = { results: [stat()], status: "CanLoadMore", loadMore: vi.fn() };
    open();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(history.loadMore).toHaveBeenCalledWith(25);
  });

  it("says so when there are none", () => {
    open();
    expect(screen.getByText(/no finished games recorded yet/i)).toBeInTheDocument();
  });
});

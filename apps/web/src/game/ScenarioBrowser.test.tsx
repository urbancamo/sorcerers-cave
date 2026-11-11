import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScenarioBrowserModal } from "./ScenarioBrowser";
import { SplashScreen } from "./SplashScreen";
import { scenarioSummaries } from "./goldenGame";

describe("scenario summaries", () => {
  // STALE since 2026-11-10: the Eye of God, the Scroll and the Talisman became human-only, and 26 of these 75 pinned games were found with an
  // inhuman holding one, so they no longer replay legally. Re-run the overnight search (packages/engine scripts/overnight-search.sh), pin the
  // results, regenerate the bundle, and un-skip this.
  it.skip.each(["B", "K", "S"])("%s: 25 games, best first, each summarised from its replay", async (prefix) => {
    const rows = await scenarioSummaries(prefix);
    expect(rows).toHaveLength(25);
    expect(rows.map((r) => r.code)).toEqual(Array.from({ length: 25 }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`));
    const scores = rows.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const r of rows) {
      expect(r.alive).toBeGreaterThan(0);
      expect(r.alive).toBeLessThanOrEqual(r.total);
      expect(r.draft.length).toBeGreaterThan(0);
    }
  });
  // STALE since 2026-11-11 (the rules of 20261110): K001 no longer replays to 499. Un-skip after the re-pin.
  it.skip("K001 is the top Extension Kit game (499 under the V2 rules)", async () => {
    expect((await scenarioSummaries("K"))[0]).toMatchObject({ code: "K001", score: 499 });
  });
});

describe("ScenarioBrowserModal", () => {
  // STALE since 2026-11-11, see above: the table shows K001's replayed score.
  it.skip("lists the 25 games of the chosen rule set, and switches between the three", async () => {
    render(<ScenarioBrowserModal onClose={() => {}} />);
    const table = await screen.findByTestId("scenario-table");
    expect(within(table).getAllByRole("row")).toHaveLength(26); // header + 25
    expect(within(table).getByText("B001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /extension kit/i }));
    await waitFor(() => expect(within(screen.getByTestId("scenario-table")).getByText("K001")).toBeInTheDocument());
    expect(within(screen.getByTestId("scenario-table")).getByText("499")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /sibyl/i }));
    await waitFor(() => expect(within(screen.getByTestId("scenario-table")).getByText("S001")).toBeInTheDocument());
  });

  it("opens the picked game in the replay viewer, or shows why it could not", async () => {
    const onOpen = vi.fn().mockResolvedValue("nope");
    render(<ScenarioBrowserModal onClose={() => {}} onOpen={onOpen} />);
    fireEvent.click(await screen.findByText("B003"));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("B003"));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});

describe("the splash screen's Scenarios button", () => {
  it("appears only in Test Mode, next to Replay, and opens the browser", async () => {
    const { unmount } = render(<SplashScreen onStartSolitaire={() => {}} />);
    expect(screen.queryByTestId("scenario-browser")).toBeNull();
    unmount();
    render(<SplashScreen onStartSolitaire={() => {}} onStartTestGame={() => {}} />);
    fireEvent.click(screen.getByTestId("scenario-browser"));
    expect(await screen.findByTestId("scenario-table")).toBeInTheDocument();
  });
});

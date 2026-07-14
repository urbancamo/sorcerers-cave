import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { replay, type GameState } from "@sorcerers-cave/engine";
import { ReplayView, type ReplayBundle } from "./ReplayView";

// The 3D canvas can't boot in jsdom — stub it, exposing markers of the state it was asked to
// render so the tests can tell WHICH frame is on screen (RB-4-1 / RB-5-2).
vi.mock("../view/CaveCanvas", () => ({
  CaveCanvas: ({ state }: { state: GameState }) => (
    <div data-testid="canvas" data-turn={state.turn} data-gs={state.gs} data-area={state.partyArea} />
  ),
}));
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ tiles: [{ tileId: "t", exits: "NESW" }], cards: [] }),
}));
const { createCaveAdapterMock, syncMock } = vi.hoisted(() => {
  const syncMock = vi.fn();
  // Accept (and ignore) the real adapter arguments so mock.calls[i] is indexable under tsc.
  return { syncMock, createCaveAdapterMock: vi.fn((..._args: unknown[]) => ({ sync: syncMock, get areas() { return []; } })) };
});
vi.mock("../view/engineAdapter", () => ({ createCaveAdapter: createCaveAdapterMock }));
beforeEach(() => { createCaveAdapterMock.mockClear(); syncMock.mockClear(); });

// A real two-move solo game, rebuilt by the REAL engine replay (RB-2-1: no bespoke re-derivation).
const SEED = 7, PICKS = [0];
const ACTIONS = [{ type: "move", dir: 1 }, { type: "quit" }] as const;
const frames = replay(SEED, PICKS, ACTIONS as unknown as Parameters<typeof replay>[2]);
const bundle: ReplayBundle = {
  replayable: true,
  game: { code: "ABCD", seed: SEED, picks: PICKS, color: null, status: "finished", createdAt: 0 },
  moves: frames.slice(1).map((f) => ({ seq: f.seq - 1, action: f.action!, events: f.events })),
};

const renderView = async (onExit = vi.fn()) => {
  render(<ReplayView bundle={bundle} onExit={onExit} />);
  await screen.findByTestId("canvas"); // manifest resolved, adapter bound
  return onExit;
};
const canvas = () => screen.getByTestId("canvas");

describe("ReplayView — transport over ReplayFrames (§RB-4)", () => {
  it("renders frame i on step", async () => {
    await renderView();
    // Frame 0: the untouched initial deal.
    expect(canvas().dataset.turn).toBe(String(frames[0]!.state.turn));
    expect(screen.getByText(/move 0 \/ 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(canvas().dataset.turn).toBe(String(frames[1]!.state.turn));
    expect(screen.getByText(/move 1 \/ 2/i)).toBeInTheDocument();
    // Stepping is O(1) indexing into the precomputed frames — the canvas now shows frame 1's state.
    expect(syncMock).toHaveBeenCalledWith(frames[1]!.state);
  });

  it("scrubber jumps to the chosen frame", async () => {
    await renderView();
    fireEvent.change(screen.getByRole("slider", { name: /replay position/i }), { target: { value: "2" } });
    expect(screen.getByText(/move 2 \/ 2/i)).toBeInTheDocument();
    expect(canvas().dataset.gs).toBe(String(frames[2]!.state.gs)); // the quit frame
  });

  it("prev at 0 and next at end are no-ops", async () => {
    await renderView();
    // At frame 0 both backward controls are disabled.
    expect(screen.getByRole("button", { name: /first/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /last/i }));
    expect(screen.getByText(/move 2 \/ 2/i)).toBeInTheDocument();
    // …and at the last frame both forward controls are disabled.
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /last/i })).toBeDisabled();
  });

  it("labels the current move and its events", async () => {
    await renderView();
    expect(screen.getByText(/initial deal/i)).toBeInTheDocument(); // frame 0 reads as the deal
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/move north/i)).toBeInTheDocument();       // actionLabel
    expect(screen.getByText(/moved to area/i)).toBeInTheDocument();    // describeEvent
  });

  it("shows no live-action controls in replay", async () => {
    const onExit = await renderView();
    expect(screen.getByText(/viewing only/i)).toBeInTheDocument(); // the "Replay — viewing only" banner
    // The adapter is bound read-only, so the cave view offers no moves or exits.
    const opts = createCaveAdapterMock.mock.calls[0]![2] as { canAct?: () => boolean };
    expect(opts.canAct?.()).toBe(false);
    // No live-play affordances — only the transport.
    expect(screen.queryByRole("button", { name: /attack|test|withdraw|save|quit the game/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /exit replay/i }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});

describe("ReplayView — auto-play (§RB-4-6)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const renderWithTimers = async () => {
    render(<ReplayView bundle={bundle} onExit={vi.fn()} />);
    // findBy* would need real timers; flush the manifest promise under fake ones instead.
    await act(async () => { await Promise.resolve(); });
    return screen.getByTestId("canvas");
  };

  it("play animates forward at one second per frame and stops at the end", async () => {
    await renderWithTimers();
    fireEvent.click(screen.getByRole("button", { name: /play replay/i }));
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByText(/move 0 \/ 2/i)).toBeInTheDocument(); // not yet — full second per frame
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/move 1 \/ 2/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/move 2 \/ 2/i)).toBeInTheDocument();
    // At the last frame playback ends by itself: Play is offered again, and time changes nothing.
    expect(screen.getByRole("button", { name: /play replay/i })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/move 2 \/ 2/i)).toBeInTheDocument();
  });

  it("stop halts playback where it is", async () => {
    await renderWithTimers();
    fireEvent.click(screen.getByRole("button", { name: /play replay/i }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/move 1 \/ 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop playback/i }));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/move 1 \/ 2/i)).toBeInTheDocument(); // did not creep forward
  });
});

describe("ReplayView — rendering through the existing cave view (§RB-5)", () => {
  it("mounts the cave view for a frame", async () => {
    await renderView();
    // The frame is drawn by the SAME adapter + canvas as live play — bound to frame 0's state.
    expect(createCaveAdapterMock).toHaveBeenCalledOnce();
    expect(createCaveAdapterMock.mock.calls[0]![0]).toEqual(frames[0]!.state);
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
  });

  it("stepping back restores the earlier frame's view", async () => {
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(canvas().dataset.turn).toBe(String(frames[1]!.state.turn));
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    // Backward is the same O(1) index step — the earlier frame's exact state, no residue.
    expect(canvas().dataset.turn).toBe(String(frames[0]!.state.turn));
    expect(syncMock).toHaveBeenLastCalledWith(frames[0]!.state);
    expect(screen.getByText(/initial deal/i)).toBeInTheDocument();
  });
});

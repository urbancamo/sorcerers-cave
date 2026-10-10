import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newGame, packCoord, type GameState, type PlacedArea } from "@sorcerers-cave/engine";
import type { TileArt, CardArt } from "../data/manifest";
import { SorcererTerms } from "./SorcererTerms";
import { TeleportEffect, TELEPORT_PEAK_MS, TELEPORT_END_MS } from "./TeleportEffect";

const tile: TileArt = { tileId: "t1", file: "/tiles/t1.png", exits: "NESW", type: "chamber", stairUp: false, stairDown: false, special: null };
const art = { tiles: [tile], cards: [] as CardArt[] };
const area = (level: number, x: number, y: number, over: Partial<PlacedArea> = {}): PlacedArea =>
  ({ card: 31, coord: packCoord(level, x, y), faceUp: true, visited: true, contents: [], flags: 0, indiffCount: 0, ...over });

function terms(over: Partial<GameState> = {}): GameState {
  return { ...newGame(1, [0]), phase: "sorcerer", partyArea: 0, level: 1, treasures: [1, 2], areas: [area(1, 50, 50), area(1, 52, 49), area(2, 50, 50)], ...over };
}

describe("SorcererTerms", () => {
  it("offers to slay him or spare him, and slaying dispatches at once", () => {
    const dispatch = vi.fn();
    render(<SorcererTerms state={terms()} art={art} dispatch={dispatch} onTeleport={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: /sorcerer's terms/i })).toBeInTheDocument();
    expect(screen.getByText(/30-point bounty/)).toBeInTheDocument();
    expect(screen.getByText(/2 treasures/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /slay the sorcerer/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "slaySorcerer" });
  });

  it("sparing hands the choice to the 3D view: every allowed area is offered, nothing is sent until one is chosen", () => {
    const dispatch = vi.fn(), onTeleport = vi.fn(), setPicker = vi.fn();
    render(<SorcererTerms state={terms()} art={art} dispatch={dispatch} onTeleport={onTeleport} setPicker={setPicker} />);
    expect(setPicker).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /spare him/i }));
    expect(screen.getByTestId("teleport-picker")).toBeInTheDocument();
    const opts = setPicker.mock.calls.at(-1)![0];
    expect(opts.destinations).toEqual([
      { idx: 1, col: 52, row: 49, level: 1 },
      { idx: 2, col: 50, row: 50, level: 2 },
    ]); // not the party's own area (0)
    expect(screen.getByRole("button", { name: /choose a destination/i })).toBeDisabled();
    act(() => opts.onPick(2)); // the player clicks the level-2 tile in the cave
    fireEvent.click(screen.getByRole("button", { name: /teleport to chamber on level 2/i }));
    expect(onTeleport).toHaveBeenCalledWith(2);
    expect(dispatch).not.toHaveBeenCalled(); // the effect plays first; GameScreen dispatches at its peak
  });

  it("removes the picker from the 3D view when it goes back or unmounts", () => {
    const setPicker = vi.fn();
    const { unmount } = render(<SorcererTerms state={terms()} art={art} dispatch={vi.fn()} onTeleport={vi.fn()} setPicker={setPicker} />);
    fireEvent.click(screen.getByRole("button", { name: /spare him/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(setPicker).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: /spare him/i }));
    unmount();
    expect(setPicker).toHaveBeenLastCalledWith(null);
  });

  it("Back returns to the terms", () => {
    render(<SorcererTerms state={terms()} art={art} dispatch={vi.fn()} onTeleport={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /spare him/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("button", { name: /slay the sorcerer/i })).toBeInTheDocument();
  });

  it("cannot spare him when there is nowhere to go", () => {
    render(<SorcererTerms state={terms({ areas: [area(1, 50, 50)] })} art={art} dispatch={vi.fn()} onTeleport={vi.fn()} />);
    expect(screen.getByRole("button", { name: /spare him/i })).toBeDisabled();
  });

  it("does not mention treasure when there is none", () => {
    render(<SorcererTerms state={terms({ treasures: [] })} art={art} dispatch={vi.fn()} onTeleport={vi.fn()} />);
    expect(screen.queryByText(/treasure/)).toBeNull();
  });
});

describe("TeleportEffect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("fires the move at the flash and finishes when it has played out", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
    const onPeak = vi.fn(), onDone = vi.fn();
    render(<TeleportEffect onPeak={onPeak} onDone={onDone} />);
    expect(screen.getByTestId("teleport-effect")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(TELEPORT_PEAK_MS - 1); });
    expect(onPeak).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onPeak).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(TELEPORT_END_MS); });
    expect(onDone).toHaveBeenCalledOnce();
    expect(onPeak).toHaveBeenCalledOnce();
  });

  it("is a short fade under reduced motion, with the same two callbacks", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
    const onPeak = vi.fn(), onDone = vi.fn();
    render(<TeleportEffect onPeak={onPeak} onDone={onDone} />);
    expect(screen.getByTestId("teleport-effect")).toHaveClass("reduced");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onPeak).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does not fire either callback if it is unmounted early", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
    const onPeak = vi.fn(), onDone = vi.fn();
    const { unmount } = render(<TeleportEffect onPeak={onPeak} onDone={onDone} />);
    unmount();
    act(() => { vi.advanceTimersByTime(TELEPORT_END_MS + 100); });
    expect(onPeak).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

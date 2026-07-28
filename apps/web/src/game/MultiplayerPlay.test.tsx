import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { newGame } from "@sorcerers-cave/engine";
import { MultiplayerPlay } from "./MultiplayerPlay";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Presentation-hold parity (SC-EXT-29 MP web parity, plan Task 7): MP's own dispatch path has the
 * exact subscription-vs-mutation race solo's useDispatchWithRolls/fightGate close (see
 * useDispatchWithRolls.ts's header comment) — the query subscription can push `phase: "fight"`
 * before the mutation that caused it has resolved its own reaction roll. These tests exercise the
 * real wiring end-to-end rather than re-testing the (already-covered) gate/hook logic in isolation.
 */

// The 3D canvas/adapter can't run in jsdom — stub them, as SpectateView.test.tsx does.
vi.mock("../view/CaveCanvas", () => ({ CaveCanvas: () => <div data-testid="canvas" /> }));
vi.mock("../view/engineAdapter", () => ({ createCaveAdapter: () => ({ sync: () => {} }) }));
vi.mock("../data/manifest", () => ({
  loadManifest: () => Promise.resolve({ tiles: [{ tileId: "t", exits: "NESW" }], cards: [] }),
}));
// FightSurface's own internals are exhaustively covered elsewhere — stub it to a marker so these
// tests assert purely on WHEN it mounts, not its contents.
vi.mock("./FightSurface", () => ({ FightSurface: () => <div data-testid="fight-surface" /> }));

const { useQueryMock, actMutMock } = vi.hoisted(() => ({ useQueryMock: vi.fn(), actMutMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (...a: unknown[]) => useQueryMock(...a),
  useMutation: () => actMutMock,
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const gameId = "g1" as Id<"games">;

function baseView(over: Record<string, unknown> = {}) {
  const state = { ...newGame(1, [5, 6]), phase: "encounter", strangers: [5] }; // Man+Woman vs a Man
  return {
    state,
    youSeat: 0,
    concurrent: false,
    gamePhase: "playing",
    currentSeat: 0,
    yourTurn: true,
    parties: [
      { seat: 0, name: "Alpha", color: "green", status: "exploring", zombie: false, partyArea: state.partyArea, level: 1 },
      { seat: 1, name: "Beta", color: "blue", status: "exploring", zombie: false, partyArea: state.partyArea, level: 1 },
    ],
    distantFights: 0,
    variants: null,
    hereSeats: [],
    areaMask: { pvpLegal: false, fightInProgress: false, reason: null },
    session: null,
    yourUnion: null,
    detachmentsHere: [],
    pvp: null,
    youKnowDoors: [],
    ...over,
  };
}

describe("MultiplayerPlay — presentation-hold parity (hook-level reuse of useDispatchWithRolls/showFightSurface)", () => {
  it("holds the fight surface until the reaction roll presents (subscription-vs-mutation race)", async () => {
    useQueryMock.mockReset();
    actMutMock.mockReset();
    const d = deferred<{ events: unknown[] }>();
    actMutMock.mockReturnValue(d.promise);
    let currentView = baseView();
    useQueryMock.mockImplementation((ref: unknown) => (getFunctionName(ref as never) === "multiplayer:messages" ? [] : currentView));

    const { rerender } = render(<MultiplayerPlay gameId={gameId} onExit={() => {}} />);
    await screen.findByRole("button", { name: /test reaction/i }); // art + adapter resolved, encounter up

    fireEvent.click(screen.getByRole("button", { name: /test reaction/i }));
    expect(actMutMock).toHaveBeenCalledWith({ gameId, action: { type: "test" } });

    // The query subscription pushes the new state (phase: fight) BEFORE the mutation's own promise
    // resolves — the exact race fightGate.ts guards against.
    currentView = baseView({ state: { ...currentView.state, phase: "fight" } });
    rerender(<MultiplayerPlay gameId={gameId} onExit={() => {}} />);
    expect(screen.queryByTestId("fight-surface")).toBeNull(); // deferred — the roll hasn't arrived yet

    await act(async () => {
      d.resolve({ events: [{ type: "reaction", outcome: "hostile", roll: 2 }] });
    });

    expect(await screen.findByTestId("fight-surface")).toBeInTheDocument();
    expect(screen.getByText(/reaction roll/i)).toBeInTheDocument(); // the dice overlay that explains it
  });

  it("shows the fight surface immediately when no dispatch is in flight (e.g. a resumed mid-fight game)", async () => {
    useQueryMock.mockReset();
    actMutMock.mockReset();
    const view = baseView({ state: { ...baseView().state, phase: "fight" } });
    useQueryMock.mockImplementation((ref: unknown) => (getFunctionName(ref as never) === "multiplayer:messages" ? [] : view));

    render(<MultiplayerPlay gameId={gameId} onExit={() => {}} />);
    expect(await screen.findByTestId("fight-surface")).toBeInTheDocument();
  });
});

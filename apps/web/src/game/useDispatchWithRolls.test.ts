// The dice overlay must present before (or together with) the outcome it explains — never after.
// state arrives via the Convex query subscription while the roll view derives from the mutation's
// resolved events: two independent websocket arrivals. `pending` bridges the race — it is true
// from dispatch until the roll view is committed, and GameScreen gates FightSurface's mount on it
// so a hostile reaction's fight screen cannot appear ahead of its reaction roll.
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { GameAction, GameEvent } from "@sorcerers-cave/engine";
import { useDispatchWithRolls } from "./useDispatchWithRolls";

type Res = { state?: unknown; events?: GameEvent[] } | null;

const reactionEvents: GameEvent[] = [
  { type: "reaction", roll: 2, outcome: "hostile" } as GameEvent,
];

function deferred() {
  let resolve!: (r: Res) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Res>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useDispatchWithRolls", () => {
  it("holds `pending` from dispatch until the roll view is committed, then shows the roll", async () => {
    const d = deferred();
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise));
    expect(result.current.pending).toBe(false);

    let done!: Promise<Res>;
    act(() => { done = result.current.dispatchWithRolls({ type: "test" } as GameAction); });
    // In flight: pending guards the outcome surfaces; no roll yet.
    expect(result.current.pending).toBe(true);
    expect(result.current.roll).toBeNull();

    await act(async () => { d.resolve({ state: {}, events: reactionEvents }); await done; });
    // Resolution commits the roll and clears pending in the same commit —
    // the overlay mounts no later than anything it gates.
    expect(result.current.pending).toBe(false);
    expect(result.current.roll).not.toBeNull();
    expect(result.current.roll!.title).toBe("Reaction roll");
  });

  it("clears `pending` when the events carry no roll, surfacing notices instead", async () => {
    const d = deferred();
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise));
    act(() => { void result.current.dispatchWithRolls({ type: "proceed" } as GameAction); });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      d.resolve({ state: {}, events: [{ type: "dragonsLulled" } as GameEvent] });
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.roll).toBeNull();
    expect(result.current.notices).not.toBeNull();
  });

  it("clears `pending` when the dispatch rejects (no permanent gate)", async () => {
    const d = deferred();
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise));
    let done!: Promise<Res>;
    act(() => { done = result.current.dispatchWithRolls({ type: "test" } as GameAction).catch(() => null); });
    expect(result.current.pending).toBe(true);

    await act(async () => { d.reject(new Error("network")); await done; });
    expect(result.current.pending).toBe(false);
    expect(result.current.roll).toBeNull();
  });
});

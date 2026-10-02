// The dice overlay must present before (or together with) the outcome it explains — never after.
// state arrives via the Convex query subscription while the roll view derives from the mutation's
// resolved events: two independent websocket arrivals. `pending` bridges the race — it is true
// from dispatch until the roll view is committed, and GameScreen gates FightSurface's mount on it
// so a hostile reaction's fight screen cannot appear ahead of its reaction roll.
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { GameAction, GameEvent } from "@sorcerers-cave/engine";
import { useDispatchWithRolls } from "./useDispatchWithRolls";

type Res = { state?: unknown; events?: GameEvent[]; midState?: unknown } | null;

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

  it("holds the pre-action snapshot until the roll is dismissed (background must not jump)", async () => {
    const d = deferred();
    const snapshot = { marker: "pre-action" };
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise, () => snapshot));
    expect(result.current.holding).toBe(false);
    expect(result.current.heldState).toBeNull();

    let done!: Promise<Res>;
    act(() => { done = result.current.dispatchWithRolls({ type: "test" } as GameAction); });
    // From dispatch: hold starts with the captured snapshot (before any subscription push can land).
    expect(result.current.holding).toBe(true);
    expect(result.current.heldState).toBe(snapshot);

    await act(async () => { d.resolve({ state: {}, events: reactionEvents }); await done; });
    // Roll is up: STILL holding — the outcome stays hidden until the player continues.
    expect(result.current.roll).not.toBeNull();
    expect(result.current.holding).toBe(true);
    expect(result.current.heldState).toBe(snapshot);

    act(() => { result.current.clearRoll(); });
    // Continue: release — the live state may now present.
    expect(result.current.holding).toBe(false);
    expect(result.current.heldState).toBeNull();
  });

  it("releases the hold immediately when the events carry no roll", async () => {
    const d = deferred();
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise, () => ({ s: 1 })));
    act(() => { void result.current.dispatchWithRolls({ type: "proceed" } as GameAction); });
    expect(result.current.holding).toBe(true);
    await act(async () => { d.resolve({ state: {}, events: [] }); });
    expect(result.current.holding).toBe(false);
    expect(result.current.heldState).toBeNull();
  });

  it("releases the hold when the dispatch rejects", async () => {
    const d = deferred();
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise, () => ({ s: 1 })));
    let done!: Promise<Res>;
    act(() => { done = result.current.dispatchWithRolls({ type: "test" } as GameAction).catch(() => null); });
    expect(result.current.holding).toBe(true);
    await act(async () => { d.reject(new Error("network")); await done; });
    expect(result.current.holding).toBe(false);
  });

  it("a notice-only outcome holds until the notices are closed", async () => {
    const d = deferred();
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise, () => ({ s: 1 })));
    act(() => { void result.current.dispatchWithRolls({ type: "proceed" } as GameAction); });
    await act(async () => {
      d.resolve({ state: {}, events: [{ type: "dragonsLulled" } as GameEvent] });
    });
    // Notices are up: the outcome stays hidden behind the modal until it closes.
    expect(result.current.notices).not.toBeNull();
    expect(result.current.holding).toBe(true);
    act(() => { result.current.clearNotices(); });
    expect(result.current.holding).toBe(false);
    expect(result.current.heldState).toBeNull();
  });

  it("holdMove presents a mid-action snapshot until roll AND notices are both dismissed", () => {
    const { result } = renderHook(() => useDispatchWithRolls(() => Promise.resolve(null), () => ({ marker: "pre" })));
    const mid = { marker: "entered-chamber" };
    act(() => {
      result.current.holdMove(mid, { title: "Trap!", lanes: [], message: "", tone: "bad" }, [{ text: "Mutiny!", tone: "bad" } as never]);
    });
    expect(result.current.holding).toBe(true);
    expect(result.current.heldState).toBe(mid);
    act(() => { result.current.clearRoll(); });
    // The notice is still up — keep holding the entered-chamber backdrop.
    expect(result.current.holding).toBe(true);
    act(() => { result.current.clearNotices(); });
    expect(result.current.holding).toBe(false);
    expect(result.current.heldState).toBeNull();
  });

  it("holdMove without a snapshot just shows the roll/notices (no hold)", () => {
    const { result } = renderHook(() => useDispatchWithRolls(() => Promise.resolve(null)));
    act(() => {
      result.current.holdMove(null, { title: "Roll", lanes: [], message: "", tone: "neutral" }, []);
    });
    expect(result.current.roll).not.toBeNull();
    expect(result.current.holding).toBe(false);
  });

  it("prefers the result's midState over the pre-action snapshot for the held backdrop", async () => {
    const d = deferred();
    const pre = { marker: "pre-action" };
    const { result } = renderHook(() => useDispatchWithRolls(() => d.promise, () => pre));
    act(() => { void result.current.dispatchWithRolls({ type: "drawFromWell" } as GameAction); });
    expect(result.current.heldState).toBe(pre);
    const mid = { marker: "drawn-contents-visible" };
    await act(async () => {
      d.resolve({ state: {}, events: reactionEvents, midState: mid });
    });
    // The engine's own snapshot (entered room, contents laid out) beats the pre-action guess.
    expect(result.current.heldState).toBe(mid);
    expect(result.current.holding).toBe(true);
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

// A notable feat (dragon kill, the Sorcerer, the Ruby, the Elixir) is celebrated in its own overlay,
// AFTER the fight result has been dismissed (never on top of it, never instead of it).
describe("useDispatchWithRolls — feat celebrations", () => {
  const combat = (): GameEvent[] => [
    { type: "combatRoll", party: "Giant", enemy: "Dragon", partyRoll: 4, enemyRoll: 2, partyTotal: 11, enemyTotal: 8, result: "partyWon" } as GameEvent,
    { type: "strangerKilled", creatureId: 10 } as GameEvent,
    { type: "dragonSlain", creatureId: 12, kills: 1 } as GameEvent,
  ];

  it("waits behind the fight result and appears once it is dismissed", async () => {
    const { result } = renderHook(() => useDispatchWithRolls(async () => ({ state: {}, events: combat() })));
    await act(async () => { await result.current.dispatchWithRolls({ type: "resolveRound" } as GameAction); });
    expect(result.current.roll).not.toBeNull();
    expect(result.current.celebration).toBeNull(); // the result comes first
    act(() => result.current.clearRoll());
    expect(result.current.celebration?.headline).toBe("Your Giant has felled a dragon single-handed!");
    act(() => result.current.clearCelebration());
    expect(result.current.celebration).toBeNull();
  });

  it("shows several slayers one after another", async () => {
    const events: GameEvent[] = [
      { type: "dragonSlain", creatureId: 12, kills: 1 } as GameEvent,
      { type: "dragonSlain", creatureId: 0, kills: 2 } as GameEvent,
    ];
    const { result } = renderHook(() => useDispatchWithRolls(async () => ({ state: {}, events })));
    await act(async () => { await result.current.dispatchWithRolls({ type: "resolveRound" } as GameAction); });
    expect(result.current.celebration?.headline).toBe("Your Giant has felled a dragon single-handed!");
    act(() => result.current.clearCelebration());
    expect(result.current.celebration?.tally).toBe(2);
    act(() => result.current.clearCelebration());
    expect(result.current.celebration).toBeNull();
  });

  it("is absent when nothing was achieved, and a later dispatch replaces an unread queue", async () => {
    let events: GameEvent[] = reactionEvents;
    const { result } = renderHook(() => useDispatchWithRolls(async () => ({ state: {}, events })));
    await act(async () => { await result.current.dispatchWithRolls({ type: "test" } as GameAction); });
    act(() => result.current.clearRoll());
    expect(result.current.celebration).toBeNull();
    events = [{ type: "dragonSlain", creatureId: 12, kills: 1 } as GameEvent];
    await act(async () => { await result.current.dispatchWithRolls({ type: "resolveRound" } as GameAction); });
    expect(result.current.celebration).not.toBeNull();
    events = reactionEvents;
    await act(async () => { await result.current.dispatchWithRolls({ type: "test" } as GameAction); });
    act(() => result.current.clearRoll());
    expect(result.current.celebration).toBeNull(); // stale queue dropped, not shown on the next action
  });
  it("celebrates the other feats too, in event order, behind the statue's dice overlay", async () => {
    const events: GameEvent[] = [
      { type: "combatRoll", party: "Hero", enemy: "Statue", partyRoll: 5, enemyRoll: 1, partyTotal: 10, enemyTotal: 9, result: "partyWon" } as GameEvent,
      { type: "rubyTaken" } as GameEvent,
      { type: "sorcererSlain" } as GameEvent,
    ];
    const { result } = renderHook(() => useDispatchWithRolls(async () => ({ state: {}, events })));
    await act(async () => { await result.current.dispatchWithRolls({ type: "takeTreasure" } as GameAction); });
    expect(result.current.celebration).toBeNull(); // the roll comes first
    act(() => result.current.clearRoll());
    expect(result.current.celebration?.id).toBe("ruby-wrested");
    act(() => result.current.clearCelebration());
    expect(result.current.celebration?.id).toBe("sorcerer-slain");
  });
});

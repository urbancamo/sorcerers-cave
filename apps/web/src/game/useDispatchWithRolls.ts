// Dispatch an action and surface its outcome as a DiceRoll overlay (or notices).
//
// Why `pending`/`holding` exist: the authoritative state arrives via the Convex query
// subscription while the roll view derives from the mutation's resolved events — two independent
// websocket arrivals with no ordering guarantee. Without a bridge, a hostile reaction's outcome
// (fight screen, joined strangers, spilled loot…) can render BEFORE its die roll presents.
// `pending` is true from dispatch until the events are processed. `holding`/`heldState` go
// further: the pre-action state is captured at dispatch (before the server can possibly push)
// and stays the PRESENTED state until the roll's Continue — the background must not change
// until the die roll has completed. Actions whose events carry no roll release immediately.
import { useCallback, useState } from "react";
import type { GameAction, GameEvent } from "@sorcerers-cave/engine";
import { rollFromEvents, type RollView } from "./rollView";
import { eventNotices, type Notice } from "./eventNotices";

type DispatchResult = { state?: unknown; events?: GameEvent[]; midState?: unknown } | null;

export function useDispatchWithRolls<S = unknown>(
  dispatch: (action: GameAction) => Promise<DispatchResult>,
  getSnapshot?: () => S,
) {
  const [roll, setRoll] = useState<RollView | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [pending, setPending] = useState(false);
  const [heldState, setHeldState] = useState<S | null>(null);

  const dispatchWithRolls = useCallback(
    async (action: GameAction) => {
      setPending(true);
      // Capture BEFORE the mutation leaves: no subscription push can beat this commit.
      if (getSnapshot) setHeldState(getSnapshot());
      try {
        const res = await dispatch(action);
        const events = res?.events ?? [];
        // The engine's own pre-relocation snapshot (SC-4-43) beats the pre-action guess: it shows
        // the entered room WITH its drawn contents, exactly where the events happened.
        if (res?.midState != null) setHeldState(res.midState as S);
        const view = rollFromEvents(events);
        const ns = eventNotices(events);
        // A dice view (reaction / chest / combat) already summarises the outcome; otherwise
        // surface any silent-event notices (artifact effects, lulled dragons, …). The hold
        // persists while either is up; with neither there is nothing to wait for — release.
        if (view) setRoll(view);
        if (!view && ns.length) setNotices(ns);
        if (!view && !ns.length) setHeldState(null);
        return res;
      } catch (e) {
        setHeldState(null);
        throw e;
      } finally {
        // Same handler tick as setRoll: React commits the overlay and the un-gating together,
        // so gated surfaces can never appear ahead of the roll that explains them.
        setPending(false);
      }
    },
    [dispatch, getSnapshot],
  );

  // Dismissals release the presentation hold only once NOTHING remains on top of it: a Trap
  // move can carry both a dice view and notices; the backdrop stays until both are gone.
  const clearRoll = useCallback(() => {
    setRoll(null);
    setNotices((ns) => { if (ns === null) setHeldState(null); return ns; });
  }, []);
  const clearNotices = useCallback(() => {
    setNotices(null);
    setRoll((r) => { if (r === null) setHeldState(null); return r; });
  }, []);

  // Canvas-initiated moves surface their outcome here: hold the engine's mid-action snapshot
  // (entered room, contents laid out) while the dice/notices for it present. A null snapshot
  // (no relocation interrupted the move) shows them without freezing anything.
  const holdMove = useCallback((mid: S | null, view: RollView | null, ns: Notice[]) => {
    if (mid != null && (view !== null || ns.length > 0)) setHeldState(mid);
    if (view) setRoll(view);
    if (ns.length) setNotices(ns);
  }, []);

  // The background stays frozen while a roll-producing dispatch is in flight or a held
  // outcome (roll/notices) is still presenting.
  const holding = pending || heldState !== null;
  return { roll, setRoll, notices, pending, holding, heldState, dispatchWithRolls, holdMove, clearRoll, clearNotices };
}

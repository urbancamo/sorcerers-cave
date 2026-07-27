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

type DispatchResult = { state?: unknown; events?: GameEvent[] } | null;

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
        const view = rollFromEvents(events);
        // A dice view (reaction / chest / combat) already summarises the outcome; otherwise
        // surface any silent-event notices (artifact effects, lulled dragons, …) and release
        // the hold at once — there is no roll to wait for.
        if (view) setRoll(view);
        else {
          setHeldState(null);
          const ns = eventNotices(events);
          if (ns.length) setNotices(ns);
        }
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

  // Continue on the dice overlay: dismiss the roll AND release the presentation hold.
  const clearRoll = useCallback(() => { setRoll(null); setHeldState(null); }, []);
  const clearNotices = useCallback(() => setNotices(null), []);
  // The background stays frozen while a roll-producing dispatch is in flight or its roll shows.
  const holding = pending || roll !== null;
  return { roll, setRoll, notices, pending, holding, heldState, dispatchWithRolls, clearRoll, clearNotices };
}

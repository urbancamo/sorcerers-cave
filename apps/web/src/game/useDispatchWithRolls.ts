// Dispatch an action and surface its outcome as a DiceRoll overlay (or notices).
//
// Why `pending` exists: the authoritative state arrives via the Convex query subscription while
// the roll view derives from the mutation's resolved events — two independent websocket arrivals
// with no ordering guarantee. Without a bridge, a hostile reaction's state (phase = "fight") can
// render the fight screen BEFORE the reaction-roll overlay is set, showing the result ahead of
// the die roll. `pending` is true from dispatch until the events are processed; GameScreen gates
// FightSurface's mount on it, so the overlay commits no later than the surfaces it explains.
import { useCallback, useState } from "react";
import type { GameAction, GameEvent } from "@sorcerers-cave/engine";
import { rollFromEvents, type RollView } from "./rollView";
import { eventNotices, type Notice } from "./eventNotices";

type DispatchResult = { state?: unknown; events?: GameEvent[] } | null;

export function useDispatchWithRolls(dispatch: (action: GameAction) => Promise<DispatchResult>) {
  const [roll, setRoll] = useState<RollView | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [pending, setPending] = useState(false);

  const dispatchWithRolls = useCallback(
    async (action: GameAction) => {
      setPending(true);
      try {
        const res = await dispatch(action);
        const events = res?.events ?? [];
        const view = rollFromEvents(events);
        // A dice view (reaction / chest / combat) already summarises the outcome; otherwise
        // surface any silent-event notices (artifact effects, lulled dragons, …).
        if (view) setRoll(view);
        else {
          const ns = eventNotices(events);
          if (ns.length) setNotices(ns);
        }
        return res;
      } finally {
        // Same handler tick as setRoll: React commits the overlay and the un-gating together,
        // so gated surfaces can never appear ahead of the roll that explains them.
        setPending(false);
      }
    },
    [dispatch],
  );

  const clearRoll = useCallback(() => setRoll(null), []);
  const clearNotices = useCallback(() => setNotices(null), []);
  return { roll, setRoll, notices, pending, dispatchWithRolls, clearRoll, clearNotices };
}

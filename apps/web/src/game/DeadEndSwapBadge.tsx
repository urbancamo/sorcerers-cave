import { useEffect, useState } from "react";
import type { GameEvent } from "@sorcerers-cave/engine";
import { describeTile } from "./gameLog";

type Swap = { removed: number; drawn: number };
type Listener = (swaps: Swap[]) => void;

const listeners = new Set<Listener>();

/** Announce any Dead End rule swaps from a resolved move to the Test Mode badge. Deliberately NOT
 *  routed through eventNotices/setNotices: a React state update in GameScreen at the instant the
 *  mutation resolves races the optimistic move animation (see eventNotices.ts, deadEndCardSwapped).
 *  Here only the badge's own state changes, so GameScreen never re-renders. */
export function announceDeadEndSwaps(events: GameEvent[]): void {
  const swaps: Swap[] = [];
  for (const e of events) if (e.type === "deadEndCardSwapped") swaps.push({ removed: e.removed, drawn: e.drawn });
  if (swaps.length) listeners.forEach((l) => l(swaps));
}

/** Test Mode only: a sticky badge shown when the Dead End rule reshuffles a card and redraws. It stays
 *  until dismissed (so it can't be missed); a later swap replaces it. */
export function DeadEndSwapBadge() {
  const [swaps, setSwaps] = useState<Swap[] | null>(null);

  useEffect(() => {
    listeners.add(setSwaps);
    return () => { listeners.delete(setSwaps); };
  }, []);

  if (!swaps) return null;
  return (
    <div className="scv-swapbadge" role="status" data-testid="dead-end-swap-badge">
      <button type="button" className="scv-swapbadge-close" aria-label="Dismiss" onClick={() => setSwaps(null)}>×</button>
      <div className="scv-swapbadge-title">Dead end rescued — card swapped{swaps.length > 1 ? ` ×${swaps.length}` : ""}</div>
      {swaps.map((s, i) => (
        <div key={i} className="scv-swapbadge-row">
          {describeTile(s.removed)} → {describeTile(s.drawn)}
        </div>
      ))}
    </div>
  );
}

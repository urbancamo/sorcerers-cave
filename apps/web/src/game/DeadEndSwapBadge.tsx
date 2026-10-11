import { useEffect, useState } from "react";
import type { GameEvent } from "@sorcerers-cave/engine";
import { describeTile } from "./gameLog";

type Swap = { removed: number; drawn: number; reason: "deadEnd" | "sealed" };
type Report = { swaps: Swap[]; noViableExits: boolean };
type Listener = (report: Report) => void;

const listeners = new Set<Listener>();

/** Announce any Dead End rule outcomes from a resolved move to the Test Mode badge: card swaps (with
 *  their reason) and the "no viable exits" warning. Deliberately NOT routed through
 *  eventNotices/setNotices: a React state update in GameScreen at the instant the mutation resolves
 *  races the optimistic move animation (see eventNotices.ts, deadEndCardSwapped). Here only the
 *  badge's own state changes, so GameScreen never re-renders. */
export function announceDeadEndSwaps(events: GameEvent[]): void {
  const swaps: Swap[] = [];
  let noViableExits = false;
  for (const e of events) {
    if (e.type === "deadEndCardSwapped") swaps.push({ removed: e.removed, drawn: e.drawn, reason: e.reason ?? "deadEnd" });
    else if (e.type === "deadEndNoViableExits") noViableExits = true;
  }
  if (swaps.length || noViableExits) listeners.forEach((l) => l({ swaps, noViableExits }));
}

/** Test Mode only: a sticky badge shown when the Dead End rule reshuffles a card and redraws, or finds
 *  the party has no viable exits left. It stays until dismissed (so it can't be missed); a later
 *  report replaces it. */
export function DeadEndSwapBadge() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    listeners.add(setReport);
    return () => { listeners.delete(setReport); };
  }, []);

  if (!report) return null;
  const { swaps, noViableExits } = report;
  const title = swaps.length
    ? `Dead end rule — card swapped${swaps.length > 1 ? ` ×${swaps.length}` : ""}`
    : "Dead end rule — no viable exits";
  return (
    <div className="scv-swapbadge" role="status" data-testid="dead-end-swap-badge">
      <button type="button" className="scv-swapbadge-close" aria-label="Dismiss" onClick={() => setReport(null)}>×</button>
      <div className="scv-swapbadge-title">{title}</div>
      {swaps.map((s, i) => (
        <div key={i} className="scv-swapbadge-row">
          {s.reason === "sealed" ? "Sealing card" : "Dead end"}: {describeTile(s.removed)} back in pack → drew {describeTile(s.drawn)}
        </div>
      ))}
      {noViableExits && (
        <div className="scv-swapbadge-row scv-swapbadge-warn">
          No viable exits remain — the party can no longer explore
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { MatchChip } from "@sorcerers-cave/engine";

const SHOWN = 4;   // past this many on one side, the rest fold into a "+N more" chip

/** The chips under one side of a match: what its strength total is made of, and what is added to its die (Peter's 2026-10-21
 *  impressions, R4). The engine itemises (`matchModifiers`); this only draws. The match-wide notes (the Eye, a standoff) ride on the party's side. */
export function MatchChips({ chips, side, testId }: { chips: MatchChip[]; side: "party" | "strangers"; testId?: string }) {
  const [all, setAll] = useState(false);
  const mine = chips.filter((c) => c.side === side || (side === "party" && c.side === "both"));
  if (mine.length === 0) return null;
  const shown = all ? mine : mine.slice(0, SHOWN), hidden = mine.length - shown.length;
  return (
    <div className="scv-match-mods" data-testid={testId}>
      {shown.map((c, k) => (
        <span key={k} className={`scv-mod scv-mod-${side === "party" ? "party" : "enemy"}${c.roll ? " is-roll" : ""}`}
              title={c.roll ? "applied to the die roll" : c.value !== 0 ? "included in the strength" : undefined}>
          {c.label}{c.value !== 0 ? ` ${c.value > 0 ? "+" : "−"}${Math.abs(c.value)}` : ""}
        </span>
      ))}
      {hidden > 0 && <button type="button" className="scv-mod scv-mod-more" onClick={() => setAll(true)}>+{hidden} more</button>}
      {all && mine.length > SHOWN && <button type="button" className="scv-mod scv-mod-more" onClick={() => setAll(false)}>fewer</button>}
    </div>
  );
}

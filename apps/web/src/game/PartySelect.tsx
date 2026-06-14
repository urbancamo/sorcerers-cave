import { useState } from "react";
import { CREATURES, STARTING_STOCK, PARTY_BUDGET, validatePicks } from "@sorcerers-cave/engine";

const SELECTABLE = CREATURES.filter((c) => c.cost !== null); // ids 0–7

export function PartySelect({ onConfirm }: { onConfirm: (picks: number[]) => void }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const picks = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(Number(id)) as number[]);
  const total = picks.reduce((s, id) => s + (CREATURES[id]!.cost ?? 0), 0);
  const valid = validatePicks(picks);

  const set = (id: number, delta: number) =>
    setCounts((c) => {
      const next = Math.max(0, Math.min(STARTING_STOCK[id] ?? 0, (c[id] ?? 0) + delta));
      return { ...c, [id]: next };
    });

  return (
    <section className="scv-panel">
      <h2 className="scv-hd">Choose your party</h2>
      <p className={"scv-budget" + (total > PARTY_BUDGET ? " over" : "")}>
        Budget <b>{total}</b> / {PARTY_BUDGET}
      </p>
      <ul className="scv-list">
        {SELECTABLE.map((c) => {
          const n = counts[c.id] ?? 0;
          const stock = STARTING_STOCK[c.id] ?? 0;
          return (
            <li key={c.id} className="scv-row">
              <span className="nm">{c.name}</span>
              <span className="cost">cost {c.cost}</span>
              <button className="scv-step" aria-label={`remove ${c.name}`} disabled={n === 0} onClick={() => set(c.id, -1)}>−</button>
              <span className="scv-qty">{n}</span>
              <button className="scv-step" aria-label={`add ${c.name}`} disabled={n >= stock} onClick={() => set(c.id, +1)}>+</button>
              <span className="scv-stock">/ {stock}</span>
            </li>
          );
        })}
      </ul>
      <button className="scv-primary" disabled={!valid} onClick={() => onConfirm(picks)}>
        Enter the cave ({picks.length})
      </button>
    </section>
  );
}

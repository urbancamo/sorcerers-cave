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
    <div className="flex flex-col items-center gap-4 text-stone-100">
      <h2 className="text-xl font-semibold">Choose your party</h2>
      <p className="text-stone-400">Budget {total}/{PARTY_BUDGET}</p>
      <ul className="flex flex-col gap-2">
        {SELECTABLE.map((c) => (
          <li key={c.id} className="flex items-center gap-3">
            <span className="w-24">{c.name}</span>
            <span className="w-16 text-stone-400">cost {c.cost}</span>
            <button className="rounded bg-stone-700 px-2" aria-label={`remove ${c.name}`} onClick={() => set(c.id, -1)}>−</button>
            <span className="w-6 text-center">{counts[c.id] ?? 0}</span>
            <button className="rounded bg-stone-700 px-2" aria-label={`add ${c.name}`} onClick={() => set(c.id, +1)}>+</button>
            <span className="text-stone-500 text-xs">/ {STARTING_STOCK[c.id]}</span>
          </li>
        ))}
      </ul>
      <button
        className="rounded bg-amber-700 px-4 py-2 font-semibold disabled:opacity-40"
        disabled={!valid}
        onClick={() => onConfirm(picks)}
      >
        Enter the cave ({picks.length})
      </button>
    </div>
  );
}

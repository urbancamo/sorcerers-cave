import { useEffect, useState } from "react";
import { CREATURES, STARTING_STOCK, PARTY_BUDGET, validatePicks } from "@sorcerers-cave/engine";
import { loadManifest, resolveCard } from "../data/manifest";

const SELECTABLE = CREATURES.filter((c) => c.cost !== null); // ids 0–7

export function PartySelect({ onConfirm }: { onConfirm: (picks: number[]) => void }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [cardFile, setCardFile] = useState<Record<number, string>>({});

  // Card art is a progressive enhancement: if the manifest can't be fetched
  // (e.g. under test), the cards fall back to a name placeholder.
  useEffect(() => {
    let alive = true;
    loadManifest()
      .then(({ cards }) => {
        if (!alive) return;
        const map: Record<number, string> = {};
        for (const c of SELECTABLE) {
          const art = resolveCard("creature", c.id, cards);
          if (art) map[c.id] = art.file;
        }
        setCardFile(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const picks = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(Number(id)) as number[]);
  const total = picks.reduce((s, id) => s + (CREATURES[id]!.cost ?? 0), 0);
  const valid = validatePicks(picks);

  const set = (id: number, delta: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(STARTING_STOCK[id] ?? 0, (c[id] ?? 0) + delta)) }));

  return (
    <section className="scv-panel scv-party">
      <h2 className="scv-hd">Choose your party</h2>
      <p className={"scv-budget" + (total > PARTY_BUDGET ? " over" : "")}>
        Budget <b>{total}</b> / {PARTY_BUDGET}
      </p>
      <div className="scv-cards">
        {SELECTABLE.map((c) => {
          const n = counts[c.id] ?? 0;
          const stock = STARTING_STOCK[c.id] ?? 0;
          const file = cardFile[c.id];
          return (
            <div key={c.id} className={"scv-card" + (n > 0 ? " sel" : "")}>
              <div className="scv-card-art">
                {file ? <img src={file} alt={c.name} /> : <span className="ph">{c.name}</span>}
              </div>
              <div className="scv-card-nm">{c.name}</div>
              <div className="scv-card-cost">cost {c.cost} · {n}/{stock}</div>
              <div className="scv-card-step">
                <button className="scv-step" aria-label={`remove ${c.name}`} disabled={n === 0} onClick={() => set(c.id, -1)}>−</button>
                <span className="scv-qty">{n}</span>
                <button className="scv-step" aria-label={`add ${c.name}`} disabled={n >= stock} onClick={() => set(c.id, +1)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="scv-primary" disabled={!valid} onClick={() => onConfirm(picks)}>
        Enter the cave ({picks.length})
      </button>
    </section>
  );
}

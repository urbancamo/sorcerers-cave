import type { InventoryRow } from '../inventory';

const GLYPH = { green: '●', yellow: '◐', gray: '○' } as const;

/** The party's items from the item's point of view: what it is, who carries it, and whether it can be used now (colour plus a text tag). */
export function InventoryPanel({ rows, selected, onSelect, onManage }: {
  rows: InventoryRow[];
  selected: { mi: number; idx: number } | null;
  onSelect: (row: InventoryRow) => void;
  onManage?: () => void;
}) {
  return (
    <aside className="scv-slot scv-slot-left scv-inventory" aria-label="Inventory">
      <h2 className="scv-slot-hd">Inventory <span>{rows.length} items</span></h2>
      {rows.length === 0 && <p className="scv-inv-empty">The party carries nothing.</p>}
      <ul className="scv-inv-list">
        {rows.map((r) => (
          <li key={`${r.mi}:${r.idx}`}>
            <button type="button" className={`scv-inv-row st-${r.color}` + (selected?.mi === r.mi && selected.idx === r.idx ? ' sel' : '')}
                    onClick={() => onSelect(r)}>
              <span className="scv-inv-glyph" aria-hidden="true">{GLYPH[r.color]}</span>
              <span className="scv-inv-main">
                <span className="scv-inv-name">{r.name}</span>
                <span className="scv-inv-sub">carried by {r.carrier}{r.weight > 0 ? ` · ${r.weight} kg` : ''}</span>
              </span>
              <span className="scv-inv-tag">{r.tag}</span>
            </button>
          </li>
        ))}
      </ul>
      {onManage && <button type="button" className="scv-inv-manage" onClick={onManage}>Move or drop treasure…</button>}
    </aside>
  );
}

import { useEffect, useState, type CSSProperties } from "react";
import {
  CREATURES, KIT_CREATURES, PARTY_BUDGET, validatePicks, selectionCost, startingStock,
} from "@sorcerers-cave/engine";
import { loadManifest, resolveCard } from "../data/manifest";
import { PARTY_COLORS, PARTY_COLOR_HEX, DEFAULT_PARTY_COLOR, type PartyColor } from "./partyColors";

const BASE_SELECTABLE = CREATURES.filter((c) => c.cost !== null); // ids 0–7
// Extension kit (SC-EXT-29, design US-01/§1.3): the five kit starters (Lion/Scholar/Witch/Thief/
// Wolf) — Apprentice/Demon carry `cost: null` in KIT_CREATURES so they're naturally excluded here,
// same as the base filter above.
const KIT_SELECTABLE = KIT_CREATURES.filter((c) => c.cost !== null);

/**
 * Party-builder used both for solitaire (default stock = `startingStock(variants)`, colour chosen
 * here) and the multiplayer draft (stock = the shared pack's remaining counts, colour locked to the
 * seat's choice).
 *
 * `kitToggle` (solo only — the MP draft never passes it) shows the "Extension kit" switch: on, the
 * roster gains the five kit starters, Ogre/Troll show their kit-on costs (4/3), and Woman/Dwarf stock
 * rises to 4 — all via the variant-aware `selectionCost`/`startingStock` helpers (SC-EXT-29). Off (the
 * default) is byte-identical to the kit's absence (SC-EXT-1).
 */
export function PartySelect({
  onConfirm,
  stock,
  lockedColor,
  title = "Choose your party",
  confirmLabel = (n) => `Enter the cave (${n})`,
  kitToggle = false,
}: {
  onConfirm: (picks: number[], color: PartyColor, variants?: { extensionKit: boolean }) => void;
  stock?: Readonly<Record<number, number>>;
  lockedColor?: PartyColor;
  title?: string;
  confirmLabel?: (count: number) => string;
  kitToggle?: boolean;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [kit, setKit] = useState(false);
  const [color, setColor] = useState<PartyColor>(lockedColor ?? DEFAULT_PARTY_COLOR);
  const [cardFile, setCardFile] = useState<Record<number, string>>({});
  // Click a card to read its printed attributes full-size (a dismissable lightbox).
  const [zoom, setZoom] = useState<{ file: string; name: string } | null>(null);

  const kitOn = kitToggle && kit;
  const variants = kitOn ? { extensionKit: true } : undefined;
  const SELECTABLE = kitOn ? [...BASE_SELECTABLE, ...KIT_SELECTABLE] : BASE_SELECTABLE;
  const effectiveStock = stock ?? startingStock(variants);

  // Esc closes the zoom.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  // Card art is a progressive enhancement: if the manifest can't be fetched
  // (e.g. under test), the cards fall back to a name placeholder. Re-runs when the kit toggle
  // changes the roster so the newly-shown kit cards get their art too.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitOn]);

  // Toggling the kit resets any picks — kit-only creatures can't survive a switch to kit-off, and
  // starting the count fresh avoids surprising the player with a budget that silently changed meaning.
  const toggleKit = () => { setKit((k) => !k); setCounts({}); };

  const picks = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(Number(id)) as number[]);
  const total = picks.reduce((s, id) => s + (selectionCost(id, variants) ?? 0), 0);
  const valid = validatePicks(picks, variants) && picks.every((id) => (counts[id] ?? 0) <= (effectiveStock[id] ?? 0));

  const set = (id: number, delta: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(effectiveStock[id] ?? 0, (c[id] ?? 0) + delta)) }));

  return (
    <section className="scv-panel scv-party">
      <h2 className="scv-hd">{title}</h2>
      <p className={"scv-budget" + (total > PARTY_BUDGET ? " over" : "")}>
        Budget <b>{total}</b> / {PARTY_BUDGET}
      </p>
      {kitToggle && (
        <label className="scv-kit-toggle">
          <input type="checkbox" checked={kit} onChange={toggleKit} />
          Extension kit
          <span className="scv-muted">Adds 30 area tiles and 30 cards to the decks.</span>
        </label>
      )}
      <div className="scv-cards">
        {SELECTABLE.map((c) => {
          const n = counts[c.id] ?? 0;
          const avail = effectiveStock[c.id] ?? 0;
          const file = cardFile[c.id];
          const cost = selectionCost(c.id, variants);
          return (
            <div key={c.id} className={"scv-card" + (n > 0 ? " sel" : "") + (avail === 0 ? " gone" : "")}>
              <div
                className="scv-card-art"
                role={file ? "button" : undefined}
                tabIndex={file ? 0 : undefined}
                title={file ? `View the ${c.name} card` : undefined}
                aria-label={file ? `Zoom the ${c.name} card` : undefined}
                onClick={() => file && setZoom({ file, name: c.name })}
                onKeyDown={(e) => { if (file && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setZoom({ file, name: c.name }); } }}
              >
                {file ? <img src={file} alt={c.name} /> : <span className="ph">{c.name}</span>}
              </div>
              <div className="scv-card-nm">{c.name}</div>
              <div className="scv-card-cost">cost {cost} · {n}/{avail}</div>
              <div className="scv-card-step">
                <button className="scv-step" aria-label={`remove ${c.name}`} disabled={n === 0} onClick={() => set(c.id, -1)}>−</button>
                <span className="scv-qty">{n}</span>
                <button className="scv-step" aria-label={`add ${c.name}`} disabled={n >= avail} onClick={() => set(c.id, +1)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      {!lockedColor && (
        <div className="scv-colors">
          <span className="scv-colors-label">Party colour</span>
          <div className="scv-colors-row">
            {PARTY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={"scv-swatch" + (color === c ? " sel" : "")}
                style={{ "--swatch": PARTY_COLOR_HEX[c] } as CSSProperties}
                aria-label={`party colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      )}
      <button
        className="scv-primary"
        disabled={!valid}
        // Kit-off calls `onConfirm` with exactly the pre-kit two-argument shape (no trailing
        // `undefined`) — byte-identical call signature (SC-EXT-1) for every existing caller.
        onClick={() => (variants ? onConfirm(picks, lockedColor ?? color, variants) : onConfirm(picks, lockedColor ?? color))}
      >
        {confirmLabel(picks.length)}
      </button>

      {zoom && (
        <div className="scv-card-zoom" role="dialog" aria-label={zoom.name} data-testid="card-zoom"
             onClick={() => setZoom(null)}>
          <img src={zoom.file} alt={zoom.name} />
          <span className="scv-card-zoom-cap">{zoom.name} — click anywhere or press Esc to close</span>
        </div>
      )}
    </section>
  );
}

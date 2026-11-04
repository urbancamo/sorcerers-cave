import { useEffect, useState, type CSSProperties } from "react";
import {
  CREATURES, KIT_CREATURES, PARTY_BUDGET, validatePicks, selectionCost, startingStock,
} from "@sorcerers-cave/engine";
import { loadManifest, resolveCard } from "../data/manifest";
import { CardPanel } from "./shell/CardPanel";
import { HelpButton } from "../manual/HelpButton";
import { briefForCard } from "../manual";
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
  onBack,
  stock,
  lockedColor,
  title = "Choose your party",
  confirmLabel = () => "Enter the cave", // no pick count (MSW, 2026-07-28)
  kitToggle = false,
  sibylToggle = false,
  variants: fixedVariants,
  testMode = false,
}: {
  onConfirm: (picks: number[], color: PartyColor, variants?: { extensionKit?: boolean; sibyl?: boolean }) => void;
  /** Solo only: return to the title screen without starting. The MP draft passes no handler —
   *  leaving a lobby is its own flow — so no Back is rendered there. */
  onBack?: () => void;
  stock?: Readonly<Record<number, number>>;
  lockedColor?: PartyColor;
  title?: string;
  confirmLabel?: (count: number) => string;
  kitToggle?: boolean;
  /** Solo only: shows the "Sibyl" switch (adds the optional Sibyl card; scores go in their own table). */
  sibylToggle?: boolean;
  /** MP draft only (never combined with `kitToggle`): the game's kit flag is already fixed by the
   *  lobby, so render the kit-on/off roster directly — no interactive switch. */
  variants?: { extensionKit: boolean };
  /** Test Mode only (docs/requirements/test-mode/2026-09-13-test-mode-party-selection.md): lifts
   *  the budget and per-creature stock ceilings so a scripted scenario can seat any party. */
  testMode?: boolean;
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [kit, setKit] = useState(false);
  const [color, setColor] = useState<PartyColor>(lockedColor ?? DEFAULT_PARTY_COLOR);
  const [cardFile, setCardFile] = useState<Record<number, string>>({});
  // Click a card to read about it in the card panel, as in the game, rather than enlarging the picture.
  const [viewed, setViewed] = useState<number | null>(null);

  const [sibyl, setSibyl] = useState(false);
  const kitOn = fixedVariants ? fixedVariants.extensionKit : (kitToggle && kit);
  const sibylOn = sibylToggle && sibyl;
  // Only the chosen flags are present, so a variant-free game keeps the old 2-argument call shape.
  const variants = kitOn || sibylOn
    ? { ...(kitOn ? { extensionKit: true } : {}), ...(sibylOn ? { sibyl: true } : {}) }
    : undefined;
  const SELECTABLE = kitOn ? [...BASE_SELECTABLE, ...KIT_SELECTABLE] : BASE_SELECTABLE;
  const effectiveStock = stock ?? startingStock(variants);
  // A kit-only creature can't stay on show once the kit is switched off.
  const viewedCreature = SELECTABLE.find((c) => c.id === viewed);

  // Esc closes the card panel.
  useEffect(() => {
    if (viewed === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setViewed(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewed]);

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

  // Switching the kit keeps the picks the player has made: only those that cannot exist in the new roster (kit-only creatures when
  // the kit goes off) are dropped, and the rest are held to the new stock. Costs may change (Ogre 5 -> 4), which the budget line shows.
  const toggleKit = () => {
    const nextKit = !kit;
    const nextVariants = { ...(nextKit ? { extensionKit: true } : {}), ...(sibylOn ? { sibyl: true } : {}) };
    const nextStock = stock ?? startingStock(Object.keys(nextVariants).length ? nextVariants : undefined);
    const nextIds = new Set((nextKit ? [...BASE_SELECTABLE, ...KIT_SELECTABLE] : BASE_SELECTABLE).map((c) => c.id));
    setKit(nextKit);
    setCounts((c) => Object.fromEntries(
      Object.entries(c).flatMap(([id, n]) => {
        const kept = nextIds.has(Number(id)) ? Math.min(n, testMode ? Infinity : (nextStock[Number(id)] ?? 0)) : 0;
        return kept > 0 ? [[id, kept]] : [];
      }),
    ));
  };

  // Test Mode has no stock ceiling — every creature is available in unlimited supply.
  const cap = (id: number) => (testMode ? Infinity : (effectiveStock[id] ?? 0));

  const picks = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(Number(id)) as number[]);
  const total = picks.reduce((s, id) => s + (selectionCost(id, variants) ?? 0), 0);
  const valid = validatePicks(picks, variants, testMode);

  const set = (id: number, delta: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(cap(id), (c[id] ?? 0) + delta)) }));

  return (
    <div className="scv-party-row">
    <section className="scv-panel scv-party">
      {onBack && <button className="scv-hs-back" onClick={onBack}>← Back</button>}
      <h2 className="scv-hd">{title} <HelpButton topics={lockedColor ? ["mp-draft", "party-budget"] : ["party-budget"]} label="Help with choosing a party" /></h2>
      {!testMode && (
        <p className={"scv-budget" + (total > PARTY_BUDGET ? " over" : "")}>
          Budget <b>{total}</b> / {PARTY_BUDGET}
        </p>
      )}
      {kitToggle && (
        <div className="scv-kit-row">
          <label className="scv-kit-toggle">
            <input type="checkbox" checked={kit} onChange={toggleKit} />
            Extension kit
            <span className="scv-muted">Adds 30 area tiles and 30 cards to the decks.</span>
          </label>
          <HelpButton topics={["kit-overview"]} label="Help with the Extension kit" />
        </div>
      )}
      {sibylToggle && (
        <div className="scv-kit-row">
          <label className="scv-kit-toggle">
            <input type="checkbox" checked={sibyl} onChange={() => setSibyl((s) => !s)} />
            Sibyl
            <span className="scv-muted">Adds the optional Sibyl card. Scores go in their own table.</span>
          </label>
          <HelpButton topics={["sibyl-overview"]} label="Help with the Sibyl" />
        </div>
      )}
      <div className="scv-cards">
        {SELECTABLE.map((c) => {
          const n = counts[c.id] ?? 0;
          const avail = cap(c.id);
          const file = cardFile[c.id];
          const cost = selectionCost(c.id, variants);
          return (
            <div key={c.id} className={"scv-card" + (n > 0 ? " sel" : "") + (avail === 0 ? " gone" : "")}>
              <div
                className="scv-card-art"
                role="button"
                tabIndex={0}
                title={briefForCard("creature", c.name) ? `${c.name} — ${briefForCard("creature", c.name)}` : `Read about the ${c.name}`}
                aria-label={`Show the ${c.name} card`}
                aria-pressed={viewed === c.id}
                onClick={() => setViewed(viewed === c.id ? null : c.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewed(viewed === c.id ? null : c.id); } }}
              >
                {file ? <img src={file} alt={c.name} /> : <span className="ph">{c.name}</span>}
              </div>
              <div className="scv-card-nm">{c.name}</div>
              <div className="scv-card-cost">cost {cost} · {n}/{Number.isFinite(avail) ? avail : "∞"}</div>
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

    </section>
    {viewedCreature && (
      <CardPanel
        selected={{ kind: 'recruit', id: viewedCreature.id, name: viewedCreature.name, file: cardFile[viewedCreature.id] ?? null, cost: selectionCost(viewedCreature.id, variants), points: viewedCreature.points }}
        onItem={() => {}} onMember={() => {}} onClose={() => setViewed(null)} />
    )}
    </div>
  );
}

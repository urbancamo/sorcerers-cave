import { useEffect, useState } from "react";
import {
  CREATURES, TREASURES, carriedWeight, canCarry,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import { loadManifest, resolveCard, resolveCardVariant, type CardArt } from "../data/manifest";

// Status badges mirror the in-cave roster (see view/cave3d.js renderRoster): a befriended member
// shows the same green "ally" pill, a petrified one the grey "stone" pill, so the detailed party
// view and the summary roster read identically.
const STATUS_BADGE: Record<number, { label: string; cls: string }> = {
  1: { label: "ally", cls: "ally" },
  2: { label: "stone", cls: "stone" },
  3: { label: "fallen", cls: "fallen" },
};

/** Expanded party view: each member as their card, what they carry as cards, a carry-weight
 *  bar, and (outside combat) controls to move treasure between members or drop it. */
export function PartyPanel({
  state,
  dispatch,
  onClose,
}: {
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const [cards, setCards] = useState<CardArt[]>([]);
  const [sel, setSel] = useState<{ mi: number; idx: number } | null>(null);
  // Hovered/focused item shown as a large floating preview (fixed to the viewport so it
  // can't be clipped by, or clash with, the panel edge).
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadManifest().then(({ cards }) => { if (alive) setCards(cards); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const canManage = state.phase !== "fight" && state.phase !== "gameOver";
  const party = state.party;
  // Display order: living members (status 0/1) first, then petrified/fallen — but keep each
  // member's ORIGINAL party index (`mi`), since treasure actions are index-based.
  const isAlive = (status: number) => status === 0 || status === 1;
  const ordered = party
    .map((m, mi) => ({ m, mi }))
    .sort((a, b) => Number(isAlive(b.m.status)) - Number(isAlive(a.m.status)));
  const selTid = sel ? party[sel.mi]?.treasure[sel.idx] : undefined;

  const move = (to: number) => { if (sel) { dispatch({ type: "moveTreasure", from: sel.mi, to, idx: sel.idx }); setSel(null); } };
  const drop = () => { if (sel) { dispatch({ type: "dropTreasure", mi: sel.mi, idx: sel.idx }); setSel(null); } };
  const imgOf = (cat: "creature" | "treasure", id: number) => resolveCard(cat, id, cards)?.file ?? null;
  // Each member's copy-index among same-creature members (by original party order) → its own card art,
  // so two Men in the party show different illustrations rather than both showing the first Man card.
  const copyIdx = new Map<number, number>(); // original index -> nth copy of that creatureId
  const tally = new Map<number, number>();
  party.forEach((m, i) => { const k = tally.get(m.creatureId) ?? 0; copyIdx.set(i, k); tally.set(m.creatureId, k + 1); });
  const creatureImgOf = (creatureId: number, mi: number) =>
    resolveCardVariant("creature", creatureId, copyIdx.get(mi) ?? 0, cards)?.file ?? null;

  return (
    <div className="scv-pp-overlay" role="dialog" aria-label="party" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scv-pp">
        <div className="scv-pp-hd">
          <h2>Party</h2>
          <button className="scv-pp-close" onClick={onClose} aria-label="close">×</button>
        </div>

        {sel && selTid !== undefined && canManage && (
          <div className="scv-pp-bar">
            <span>Move <b>{TREASURES[selTid]?.name}</b> to a member, or</span>
            <button className="scv-pp-act" onClick={drop}>Drop into chamber</button>
            <button className="scv-pp-act ghost" onClick={() => setSel(null)}>Cancel</button>
          </div>
        )}

        <div className="scv-pp-members">
          {ordered.map(({ m, mi }) => {
            const c = CREATURES[m.creatureId]!;
            const load = carriedWeight(m), cap = c.carry;
            const pct = cap > 0 ? Math.min(100, Math.round((load / cap) * 100)) : 0;
            const living = m.status === 0 || m.status === 1;
            const isTarget = !!sel && canManage && sel.mi !== mi && living && selTid !== undefined && canCarry(m, selTid);
            const cimg = creatureImgOf(m.creatureId, mi);
            return (
              <div key={mi} className={"scv-pp-member" + (m.status === 3 ? " fallen" : "") + (isTarget ? " target" : "")}>
                <div className="scv-pp-card">
                  {cimg ? <img src={cimg} alt={c.name} /> : <span className="ph">{c.name}</span>}
                </div>
                <div className="scv-pp-name">
                  {c.name}
                  {STATUS_BADGE[m.status] && (
                    <span className={"scv-pp-badge " + STATUS_BADGE[m.status]!.cls}>{STATUS_BADGE[m.status]!.label}</span>
                  )}
                </div>
                <div className="scv-pp-cap">
                  <div className="scv-pp-cap-bar"><i style={{ width: pct + "%" }} /></div>
                  <span className="scv-pp-cap-tx">{cap > 0 ? `${load} / ${cap} kg` : "no capacity"}</span>
                </div>
                <div className="scv-pp-items">
                  {m.treasure.length === 0 && <span className="scv-pp-empty">empty-handed</span>}
                  {m.treasure.map((tid, idx) => {
                    const t = TREASURES[tid]!;
                    const timg = imgOf("treasure", tid);
                    const selected = sel?.mi === mi && sel?.idx === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={"scv-pp-item" + (t.kind === "artifact" ? " art" : "") + (selected ? " sel" : "")}
                        disabled={!canManage}
                        aria-label={t.name}
                        title={t.name + (t.kind === "artifact" ? " · artifact" : ` · ${t.weight}kg`)}
                        onClick={() => setSel(selected ? null : { mi, idx })}
                        onMouseEnter={() => setPreview(timg)}
                        onMouseLeave={() => setPreview((p) => (p === timg ? null : p))}
                        onFocus={() => setPreview(timg)}
                        onBlur={() => setPreview((p) => (p === timg ? null : p))}
                      >
                        {timg ? <img src={timg} alt={t.name} /> : <span className="ph">{t.name[0]}</span>}
                      </button>
                    );
                  })}
                </div>
                {isTarget && <button className="scv-pp-give" onClick={() => move(mi)}>Move here</button>}
              </div>
            );
          })}
        </div>

        {!canManage && <p className="scv-pp-note">Treasure can’t be redistributed during a fight.</p>}
      </div>

      {preview && (
        <div className="scv-pp-preview" aria-hidden="true">
          <img src={preview} alt="" />
        </div>
      )}
    </div>
  );
}

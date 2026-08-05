import { useEffect, useState } from "react";
import {
  ALL_CREATURES, ALL_TREASURES, carriedWeight, canCarry, BORNEABLE, isBorne,
  type GameState, type GameAction,
} from "@sorcerers-cave/engine";
import { memberLabels } from "./memberLabels";
import { loadManifest, resolveCard, resolveCardVariant, type CardArt } from "../data/manifest";

// Status badges mirror the in-cave roster (see view/cave3d.js renderRoster): a befriended member
// shows the same green "ally" pill, a petrified one the grey "stone" pill, so the detailed party
// view and the summary roster read identically.
const STATUS_BADGE: Record<number, { label: string; cls: string }> = {
  1: { label: "ally", cls: "ally" },
  2: { label: "stone", cls: "stone" },
  3: { label: "fallen", cls: "fallen" },
};

// Extension kit (SC-EXT-23/29, design US-25): the Idol (treasure 18) carries no fixed value — its
// worth is a d6 rolled only at `scoreBreakdown` (score.ts), which must NEVER run mid-game (it would
// leak the roll and, being re-derived from the live `state.seed`, appear to "change" every action).
// The party panel shows a static "10×?" placeholder instead — carry/transfer/drop all work exactly
// like any other heavy treasure; only the value stays a mystery until the game-over reveal.
const T_IDOL = 18;

// Extension kit (SC-EXT-27, design US-23/Resolved-15): the Magic Shield is holdable by ANY member
// (BORNEABLE, loot.ts) but its ward is only ACTIVE for an eligible bearer — Hero/W-Hero/Man/Woman.
// The party-row icon renders dimmed ("inert") when borne by anyone else, so the ward's true state
// is visible at a glance rather than silently doing nothing.
const T_MAGIC_SHIELD = 20;
const SHIELD_ELIGIBLE = new Set([0, 1, 5, 6]); // Hero, W-Hero, Man, Woman

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
  // Party-wide "#N" labels so duplicate classes (e.g. two Priests) read the same here as in the dropdowns.
  const labels = memberLabels(party);

  return (
    <div className="scv-pp-overlay" role="dialog" aria-label="party" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scv-pp">
        <div className="scv-pp-hd">
          <h2>Party</h2>
          <button className="scv-pp-close" onClick={onClose} aria-label="close">×</button>
        </div>

        {sel && selTid !== undefined && canManage && (
          <div className="scv-pp-bar">
            <span>Move <b>{ALL_TREASURES[selTid]?.name}</b> to a member, or</span>
            {/* Bear vs stow (Sword/Staff/Ring only): a BORNE item is wielded/worn — it is petrified or
                lost WITH its holder; a carried item spills to the floor when the holder falls (§④a). */}
            {BORNEABLE.includes(selTid) && isAlive(party[sel.mi]!.status) && (
              isBorne(party[sel.mi]!, selTid)
                ? <button className="scv-pp-act" onClick={() => { dispatch({ type: "setBorne", mi: sel.mi, idx: sel.idx, borne: false }); setSel(null); }}>Stow (carry)</button>
                : <button className="scv-pp-act" onClick={() => { dispatch({ type: "setBorne", mi: sel.mi, idx: sel.idx, borne: true }); setSel(null); }}>Bear (wield)</button>
            )}
            {/* Bug fix 2026-08-05: "Drop into chamber" was wrong whenever the party stood
                anywhere else — a tunnel, the Gateway, or one of the four Precise-Locations
                specials (where a drop actually sinks into a sub-location, not a chamber floor
                at all). "Drop here" is correct regardless of tile type. */}
            <button className="scv-pp-act" onClick={drop}>Drop here</button>
            <button className="scv-pp-act ghost" onClick={() => setSel(null)}>Cancel</button>
          </div>
        )}

        <div className="scv-pp-members">
          {ordered.map(({ m, mi }) => {
            const c = ALL_CREATURES[m.creatureId]!;
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
                  {labels[mi] ?? c.name}
                  {STATUS_BADGE[m.status] && (
                    <span className={"scv-pp-badge " + STATUS_BADGE[m.status]!.cls}>{STATUS_BADGE[m.status]!.label}</span>
                  )}
                </div>
                <div className="scv-pp-cap">
                  <div className="scv-pp-cap-bar"><i style={{ width: pct + "%" }} /></div>
                  <span className="scv-pp-cap-tx">{cap > 0 ? `${load} / ${cap} kg` : "no capacity"}</span>
                </div>
                <div className="scv-pp-items">
                  {m.treasure.length === 0 && m.dragonKills === 0 && <span className="scv-pp-empty">empty-handed</span>}
                  {m.treasure.map((tid, idx) => {
                    const t = ALL_TREASURES[tid]!;
                    const timg = imgOf("treasure", tid);
                    const selected = sel?.mi === mi && sel?.idx === idx;
                    const borne = isBorne(m, tid);
                    const isIdol = tid === T_IDOL;
                    // Inert = borne, but the current holder can't make the ward do anything (US-23).
                    const shieldInert = tid === T_MAGIC_SHIELD && borne && !SHIELD_ELIGIBLE.has(m.creatureId);
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={"scv-pp-item" + (t.kind === "artifact" ? " art" : "") + (selected ? " sel" : "") + (borne ? " borne" : "") + (shieldInert ? " inert" : "")}
                        disabled={!canManage}
                        aria-label={t.name + (borne ? " (borne)" : "") + (shieldInert ? " (inert)" : "")}
                        title={t.name + (t.kind === "artifact" ? " · artifact" : ` · ${t.weight}kg`) + (borne ? " · borne (wielded — stays with the body if the holder falls)" : "") + (isIdol ? " · value revealed at game's end" : "") + (shieldInert ? " · inert — needs a Man, Woman, Hero, or W-Hero to bear it" : "")}
                        onClick={() => setSel(selected ? null : { mi, idx })}
                        onMouseEnter={() => setPreview(timg)}
                        onMouseLeave={() => setPreview((p) => (p === timg ? null : p))}
                        onFocus={() => setPreview(timg)}
                        onBlur={() => setPreview((p) => (p === timg ? null : p))}
                      >
                        {timg ? <img src={timg} alt={t.name} /> : <span className="ph">{t.name[0]}</span>}
                        {/* Extension kit (SC-EXT-23/29, US-25): a static mystery-value glyph — NEVER
                            scoreBreakdown mid-game (that would leak/appear to "change" the roll). */}
                        {isIdol && <span className="scv-pp-idol-glyph">10×?</span>}
                      </button>
                    );
                  })}
                  {/* Dragon-slayer: one inverted Dragon card per dragon felled single-handed, shown
                      alongside the loot (mirrors the boxed game's upside-down dragon card). +1 FS each. */}
                  {Array.from({ length: m.dragonKills }).map((_, k) => {
                    const dimg = imgOf("creature", 10); // the Dragon card
                    return (
                      <span
                        key={`dragon-${k}`}
                        className="scv-pp-item dragon-slain"
                        title="Dragon-slayer — +1 fighting strength"
                        onMouseEnter={() => setPreview(dimg)}
                        onMouseLeave={() => setPreview((p) => (p === dimg ? null : p))}
                      >
                        {dimg ? <img src={dimg} alt="Dragon slain" /> : <span className="ph">🐉</span>}
                      </span>
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
